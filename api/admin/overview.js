/**
 * The admin landing page.
 *
 * This used to return five counts. Counts alone answer almost nothing: 140
 * conversations is not a fact anyone acts on, and the two questions actually
 * worth opening a dashboard for - what is this costing, and who is using it -
 * were on a different page entirely.
 *
 * So it answers those here, in one request. Splitting it across five would
 * make the page wait on the slowest of them and show a torn half-loaded state
 * in the meantime.
 *
 * Everything runs server-side with the service role for the same reason as
 * the other admin routes: under RLS a browser-side count sees only the
 * caller's own rows and returns a plausible small number rather than an error,
 * which is the worst kind of wrong.
 */
import { requireAdmin, applyAdminCors } from '../lib/adminAuth.js';
import { estimateCostUsd } from '../lib/tokenUsage.js';

const WINDOW_DAYS = 30;
const PAGE = 1000;
const MAX_PAGES = 30;

const dayKey = (iso) => String(iso || '').slice(0, 10);

/** A count that reports null instead of throwing when a table is not there yet. */
async function countOf(admin, table, apply) {
  try {
    let q = admin.from(table).select('*', { count: 'exact', head: true });
    if (apply) q = apply(q);
    const { count, error } = await q;
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

/**
 * Page through a table, because PostgREST stops at 1000 rows without saying
 * so - a silent truncation would show a real number that is simply too small.
 */
async function fetchAll(admin, table, columns, apply) {
  const out = [];
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      let q = admin.from(table).select(columns);
      if (apply) q = apply(q);
      const { data, error } = await q.range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) return { rows: out, ok: out.length > 0 };
      if (!data?.length) break;
      out.push(...data);
      if (data.length < PAGE) break;
    }
    return { rows: out, ok: true };
  } catch {
    return { rows: out, ok: false };
  }
}

/** The window's days, oldest first, so a quiet day is a gap in the chart rather than a missing column. */
function emptyDays(days) {
  const out = [];
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    out.push({ date: new Date(d.getTime() - i * 86_400_000).toISOString().slice(0, 10), messages: 0, turns: 0, cost_usd: 0 });
  }
  return out;
}

export default async function handler(req, res) {
  if (applyAdminCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const ctx = await requireAdmin(req, res);
  if (!ctx) return;
  const { admin } = ctx;

  try {
    const now = Date.now();
    const since = new Date(now - WINDOW_DAYS * 86_400_000).toISOString();
    const sevenDaysAgo = now - 7 * 86_400_000;
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const [
      profilesRes, usageRes, messagesRes, connectorsRes, notesRes,
      conversations, messagesTotal, memories, projects, mcpServers,
    ] = await Promise.all([
      fetchAll(admin, 'profiles', 'id,email,preferred_name,is_admin,created_at'),
      fetchAll(admin, 'token_usage',
        'user_id,endpoint,model,input_tokens,output_tokens,cache_read_input_tokens,' +
        'cache_creation_input_tokens,rounds,tool_calls,web_search_requests,created_at',
        (q) => q.gte('created_at', since)),
      fetchAll(admin, 'messages', 'role,created_at', (q) => q.gte('created_at', since)),
      fetchAll(admin, 'connectors', 'provider,status', (q) => q.eq('status', 'connected')),
      fetchAll(admin, 'notes', 'status,due_date'),
      countOf(admin, 'conversations'),
      countOf(admin, 'messages'),
      countOf(admin, 'user_memory'),
      countOf(admin, 'projects'),
      countOf(admin, 'mcp_servers', (q) => q.eq('enabled', true)),
    ]);

    const profiles = profilesRes.rows;
    const usage = usageRes.rows;
    const profileById = new Map(profiles.map((p) => [p.id, p]));

    // --- spend -------------------------------------------------------------
    const byDay = emptyDays(WINDOW_DAYS);
    const dayIndex = new Map(byDay.map((d, i) => [d.date, i]));
    const byUser = new Map();
    const byModel = new Map();
    const byEndpoint = new Map();

    let cost = 0, last7 = 0, prev7 = 0, turns = 0, output = 0;
    let freshInput = 0, cacheRead = 0, cacheWrite = 0, toolCalls = 0, searches = 0;

    for (const row of usage) {
      const c = estimateCostUsd(row);
      const at = new Date(row.created_at).getTime();
      cost += c;
      turns += 1;
      output += Number(row.output_tokens) || 0;
      freshInput += Number(row.input_tokens) || 0;
      cacheRead += Number(row.cache_read_input_tokens) || 0;
      cacheWrite += Number(row.cache_creation_input_tokens) || 0;
      toolCalls += Number(row.tool_calls) || 0;
      searches += Number(row.web_search_requests) || 0;

      // Two adjacent weeks, so the headline can say which way it is moving
      // rather than just how big it is.
      if (at >= sevenDaysAgo) last7 += c;
      else if (at >= sevenDaysAgo - 7 * 86_400_000) prev7 += c;

      const di = dayIndex.get(dayKey(row.created_at));
      if (di !== undefined) {
        byDay[di].turns += 1;
        byDay[di].cost_usd += c;
      }

      if (row.user_id) {
        const u = byUser.get(row.user_id) || { cost_usd: 0, turns: 0, last_used: null };
        u.cost_usd += c;
        u.turns += 1;
        if (!u.last_used || row.created_at > u.last_used) u.last_used = row.created_at;
        byUser.set(row.user_id, u);
      }
      const model = row.model || 'unknown';
      byModel.set(model, (byModel.get(model) || 0) + c);
      const ep = row.endpoint || 'chat';
      byEndpoint.set(ep, (byEndpoint.get(ep) || 0) + c);
    }

    // --- activity ----------------------------------------------------------
    let messagesToday = 0;
    const todayKey = startOfDay.toISOString().slice(0, 10);
    for (const m of messagesRes.rows) {
      const key = dayKey(m.created_at);
      const di = dayIndex.get(key);
      if (di !== undefined) byDay[di].messages += 1;
      if (key === todayKey) messagesToday += 1;
    }

    // --- people ------------------------------------------------------------
    // Active means they actually spent tokens, not that a row exists: a
    // signed-up account that never sent a message is not a user of anything.
    let active7 = 0, active30 = 0;
    for (const [, u] of byUser) {
      active30 += 1;
      if (new Date(u.last_used).getTime() >= sevenDaysAgo) active7 += 1;
    }
    const newUsers = profiles.filter((p) => new Date(p.created_at).getTime() >= now - WINDOW_DAYS * 86_400_000).length;

    const topUsers = [...byUser.entries()]
      .map(([id, u]) => {
        const p = profileById.get(id);
        return {
          id,
          name: p?.preferred_name || null,
          email: p?.email || null,
          is_admin: !!p?.is_admin,
          cost_usd: +u.cost_usd.toFixed(4),
          turns: u.turns,
          last_used: u.last_used,
          share_pct: cost > 0 ? +((u.cost_usd / cost) * 100).toFixed(1) : 0,
        };
      })
      .sort((a, b) => b.cost_usd - a.cost_usd)
      .slice(0, 6);

    // --- connectors --------------------------------------------------------
    const connectorCounts = new Map();
    for (const c of connectorsRes.rows) {
      connectorCounts.set(c.provider, (connectorCounts.get(c.provider) || 0) + 1);
    }

    // --- notes -------------------------------------------------------------
    const notes = notesRes.rows;
    const notesOpen = notes.filter((n) => n.status === 'open').length;
    const notesOverdue = notes.filter(
      (n) => n.status === 'open' && n.due_date && new Date(n.due_date).getTime() < now,
    ).length;

    const billedInput = freshInput + cacheRead + cacheWrite;
    const sortedPairs = (m) =>
      [...m.entries()].map(([key, v]) => ({ key, cost_usd: +v.toFixed(4) })).sort((a, b) => b.cost_usd - a.cost_usd);

    return res.status(200).json({
      generated_at: new Date().toISOString(),
      window_days: WINDOW_DAYS,
      usage_installed: usageRes.ok || usage.length > 0,

      counts: {
        users: profiles.length,
        admins: profiles.filter((p) => p.is_admin).length,
        new_users: newUsers,
        conversations,
        messages: messagesTotal,
        messages_today: messagesToday,
        notes_open: notesOpen,
        notes_overdue: notesOverdue,
        memories,
        projects,
        connectors: connectorsRes.rows.length,
        mcp_servers: mcpServers,
      },

      spend: {
        total_usd: +cost.toFixed(4),
        last_7d_usd: +last7.toFixed(4),
        prev_7d_usd: +prev7.toFixed(4),
        // Null rather than 0 when there is no previous week to compare with,
        // so the UI can stay quiet instead of claiming a 0% change.
        change_pct: prev7 > 0 ? +(((last7 - prev7) / prev7) * 100).toFixed(1) : null,
        turns,
        output_tokens: output,
        billed_input_tokens: billedInput,
        cache_hit_rate: billedInput > 0 ? +((cacheRead / billedInput) * 100).toFixed(1) : 0,
        avg_cost_per_turn: turns > 0 ? +(cost / turns).toFixed(4) : 0,
        tool_calls: toolCalls,
        web_searches: searches,
      },

      activity: byDay.map((d) => ({ ...d, cost_usd: +d.cost_usd.toFixed(4) })),

      people: {
        active_7d: active7,
        active_30d: active30,
        // Everyone with an account who has not spent a token this window.
        dormant: Math.max(0, profiles.length - active30),
        top: topUsers,
      },

      connectors: [...connectorCounts.entries()]
        .map(([provider, count]) => ({ provider, count }))
        .sort((a, b) => b.count - a.count),

      by_model: sortedPairs(byModel),
      by_endpoint: sortedPairs(byEndpoint),
    });
  } catch (err) {
    console.error('admin overview error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to load stats' });
  }
}
