/**
 * Token spend for the admin dashboard.
 *
 * Reads the token_usage rows written by the chat/title/suggestions endpoints
 * and rolls them up three ways: overall, per day, and per user. Costs are
 * derived here rather than stored, so a price change re-prices history instead
 * of leaving stale numbers in the table.
 *
 * There is no backfill — figures start at the deploy that added instrumentation.
 */
import { requireAdmin, applyAdminCors } from '../lib/adminAuth.js';
import { estimateCostUsd, pricingFor } from '../lib/tokenUsage.js';

const DEFAULT_WINDOW_DAYS = 30;
const MAX_WINDOW_DAYS = 365;
const ROW_CAP = 100_000;
const PAGE = 1000;

const COMPONENTS = ['system_prompt', 'user_context', 'tools', 'history', 'tool_results', 'assistant'];

function emptyDays(days) {
  const out = [];
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    out.push({
      date: new Date(d.getTime() - i * 86_400_000).toISOString().slice(0, 10),
      turns: 0, input_tokens: 0, cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0, output_tokens: 0, total_tokens: 0, cost_usd: 0,
    });
  }
  return out;
}

function emptyTotals() {
  return {
    turns: 0,
    input_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    cost_usd: 0,
    tool_calls: 0,
    rounds: 0,
    web_search_requests: 0,
  };
}

function addRow(acc, row, cost) {
  acc.turns += 1;
  acc.input_tokens += Number(row.input_tokens) || 0;
  acc.cache_read_input_tokens += Number(row.cache_read_input_tokens) || 0;
  acc.cache_creation_input_tokens += Number(row.cache_creation_input_tokens) || 0;
  acc.output_tokens += Number(row.output_tokens) || 0;
  acc.tool_calls += Number(row.tool_calls) || 0;
  acc.web_search_requests += Number(row.web_search_requests) || 0;
  acc.rounds += Number(row.rounds) || 0;
  acc.total_tokens =
    acc.input_tokens + acc.cache_read_input_tokens + acc.cache_creation_input_tokens + acc.output_tokens;
  acc.cost_usd += cost;
}

function round(acc) {
  return { ...acc, cost_usd: +acc.cost_usd.toFixed(4) };
}

/** Pull the window's usage rows, paging past PostgREST's 1000-row default. */
async function fetchUsage(admin, sinceIso) {
  const out = [];
  for (let from = 0; from < ROW_CAP; from += PAGE) {
    const { data, error } = await admin
      .from('token_usage')
      .select(
        'user_id,conversation_id,endpoint,model,input_tokens,output_tokens,' +
          'cache_read_input_tokens,cache_creation_input_tokens,rounds,tool_calls,web_search_requests,' +
          'duration_ms,peak_context_tokens,context_window,context_breakdown,created_at',
      )
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) {
      // The table not existing yet is the expected state before the migration
      // is run, and should read as "no data", not as a broken dashboard.
      const missing = /relation .*token_usage.* does not exist|schema cache/i.test(error.message || '');
      return { rows: out, missing: missing && out.length === 0, error: missing ? null : error.message };
    }
    if (!data?.length) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return { rows: out, missing: false, error: null };
}

export default async function handler(req, res) {
  if (applyAdminCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const ctx = await requireAdmin(req, res);
  if (!ctx) return;
  const { admin } = ctx;

  const requested = parseInt(req.query?.days, 10);
  const windowDays = Number.isFinite(requested)
    ? Math.min(MAX_WINDOW_DAYS, Math.max(1, requested))
    : DEFAULT_WINDOW_DAYS;

  try {
    const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();
    const { rows, missing, error } = await fetchUsage(admin, since);

    if (missing) {
      return res.status(200).json({
        generated_at: new Date().toISOString(),
        window_days: windowDays,
        not_installed: true,
        message: 'Run supabase/token-usage.sql, then redeploy. Usage is recorded from that point forward.',
      });
    }
    if (error) return res.status(500).json({ error });

    const profiles = await admin
      .from('profiles')
      .select('id,email,preferred_name,is_admin')
      .then((r) => r.data || []);
    const profileById = new Map(profiles.map((p) => [p.id, p]));

    const totals = emptyTotals();
    const byDay = emptyDays(windowDays);
    const dayIndex = new Map(byDay.map((d, i) => [d.date, i]));
    const byEndpoint = new Map();
    const byModel = new Map();
    const byUser = new Map();
    const byConversation = new Map();

    // Context composition is averaged across turns weighted by nothing — each
    // turn counts once, so one huge outlier cannot define the typical shape.
    const compTotals = Object.fromEntries(COMPONENTS.map((k) => [k, 0]));
    let compSamples = 0;
    let peakSum = 0, peakMax = 0, peakSamples = 0;
    let contextWindow = 200_000;
    let durationSum = 0, durationSamples = 0;

    for (const row of rows) {
      const cost = estimateCostUsd(row);
      addRow(totals, row, cost);

      const day = String(row.created_at || '').slice(0, 10);
      const di = dayIndex.get(day);
      if (di !== undefined) {
        const d = byDay[di];
        d.turns += 1;
        d.input_tokens += Number(row.input_tokens) || 0;
        d.cache_read_input_tokens += Number(row.cache_read_input_tokens) || 0;
        d.cache_creation_input_tokens += Number(row.cache_creation_input_tokens) || 0;
        d.output_tokens += Number(row.output_tokens) || 0;
        d.total_tokens =
          d.input_tokens + d.cache_read_input_tokens + d.cache_creation_input_tokens + d.output_tokens;
        d.cost_usd += cost;
      }

      const ep = row.endpoint || 'chat';
      if (!byEndpoint.has(ep)) byEndpoint.set(ep, emptyTotals());
      addRow(byEndpoint.get(ep), row, cost);

      const model = row.model || 'unknown';
      if (!byModel.has(model)) byModel.set(model, emptyTotals());
      addRow(byModel.get(model), row, cost);

      if (row.user_id) {
        if (!byUser.has(row.user_id)) {
          byUser.set(row.user_id, {
            acc: emptyTotals(),
            comp: Object.fromEntries(COMPONENTS.map((k) => [k, 0])),
            compSamples: 0,
            peakSum: 0,
            peakSamples: 0,
            peakMax: 0,
            last_used: null,
          });
        }
        const u = byUser.get(row.user_id);
        addRow(u.acc, row, cost);
        if (!u.last_used || row.created_at > u.last_used) u.last_used = row.created_at;
        const peak = Number(row.peak_context_tokens) || 0;
        if (peak > 0) {
          u.peakSum += peak;
          u.peakSamples += 1;
          u.peakMax = Math.max(u.peakMax, peak);
        }
        if (row.context_breakdown) {
          for (const k of COMPONENTS) u.comp[k] += Number(row.context_breakdown[k]) || 0;
          u.compSamples += 1;
        }
      }

      if (row.conversation_id) {
        if (!byConversation.has(row.conversation_id)) byConversation.set(row.conversation_id, emptyTotals());
        addRow(byConversation.get(row.conversation_id), row, cost);
      }

      if (row.context_breakdown) {
        for (const k of COMPONENTS) compTotals[k] += Number(row.context_breakdown[k]) || 0;
        compSamples += 1;
      }
      const peak = Number(row.peak_context_tokens) || 0;
      if (peak > 0) {
        peakSum += peak;
        peakMax = Math.max(peakMax, peak);
        peakSamples += 1;
      }
      if (row.context_window) contextWindow = Number(row.context_window) || contextWindow;
      if (row.duration_ms) {
        durationSum += Number(row.duration_ms) || 0;
        durationSamples += 1;
      }
    }

    const avgBreakdown = (comp, samples) =>
      samples > 0
        ? COMPONENTS.map((k) => ({ key: k, tokens: Math.round(comp[k] / samples) }))
        : COMPONENTS.map((k) => ({ key: k, tokens: 0 }));

    const breakdown = avgBreakdown(compTotals, compSamples);
    const avgPeak = peakSamples > 0 ? Math.round(peakSum / peakSamples) : 0;

    // What caching actually saved: those tokens would have been billed as
    // fresh input at full rate had every request missed the cache.
    const price = pricingFor(rows[0]?.model);
    const cacheSavings =
      (totals.cache_read_input_tokens / 1_000_000) * (price.input - price.cacheRead) -
      (totals.cache_creation_input_tokens / 1_000_000) * (price.cacheWrite - price.input);
    const billedInput =
      totals.input_tokens + totals.cache_read_input_tokens + totals.cache_creation_input_tokens;

    const users = [...byUser.entries()]
      .map(([id, u]) => {
        const p = profileById.get(id);
        return {
          id,
          email: p?.email || null,
          name: p?.preferred_name || null,
          is_admin: !!p?.is_admin,
          last_used: u.last_used,
          ...round(u.acc),
          avg_peak_context_tokens: u.peakSamples > 0 ? Math.round(u.peakSum / u.peakSamples) : 0,
          max_peak_context_tokens: u.peakMax,
          avg_cost_per_turn: u.acc.turns > 0 ? +(u.acc.cost_usd / u.acc.turns).toFixed(4) : 0,
          breakdown: avgBreakdown(u.comp, u.compSamples),
        };
      })
      .sort((a, b) => b.cost_usd - a.cost_usd);

    // Rank first, then look up only the winners' titles. Selecting every
    // conversation would silently stop at PostgREST's row cap and make older
    // chats look deleted.
    const ranked = [...byConversation.entries()]
      .sort((a, b) => b[1].cost_usd - a[1].cost_usd)
      .slice(0, 15);
    const convById = new Map();
    if (ranked.length > 0) {
      const { data } = await admin
        .from('conversations')
        .select('id,title,user_id')
        .in('id', ranked.map(([id]) => id));
      for (const c of data || []) convById.set(c.id, c);
    }
    const topConversations = ranked.map(([id, acc]) => {
      const c = convById.get(id);
      const owner = c ? profileById.get(c.user_id) : null;
      return {
        id,
        title: c?.title || 'Untitled',
        user: owner?.preferred_name || owner?.email || null,
        deleted: !c,
        ...round(acc),
      };
    });

    const mapTotals = (m) =>
      Object.fromEntries([...m.entries()].map(([k, v]) => [k, round(v)]));

    return res.status(200).json({
      generated_at: new Date().toISOString(),
      window_days: windowDays,
      truncated: rows.length >= ROW_CAP,
      pricing_note: 'Costs are estimates at Anthropic list price; promotional rates are not applied.',
      totals: round(totals),
      averages: {
        cost_per_turn: totals.turns > 0 ? +(totals.cost_usd / totals.turns).toFixed(4) : 0,
        tokens_per_turn: totals.turns > 0 ? Math.round(totals.total_tokens / totals.turns) : 0,
        output_per_turn: totals.turns > 0 ? Math.round(totals.output_tokens / totals.turns) : 0,
        rounds_per_turn: totals.turns > 0 ? +(totals.rounds / totals.turns).toFixed(2) : 0,
        tool_calls_per_turn: totals.turns > 0 ? +(totals.tool_calls / totals.turns).toFixed(2) : 0,
        duration_ms: durationSamples > 0 ? Math.round(durationSum / durationSamples) : 0,
      },
      cache: {
        // Share of billed input served from cache — the lever with the most
        // headroom, since a cache read costs a tenth of fresh input.
        hit_rate: billedInput > 0 ? +((totals.cache_read_input_tokens / billedInput) * 100).toFixed(1) : 0,
        read_tokens: totals.cache_read_input_tokens,
        write_tokens: totals.cache_creation_input_tokens,
        estimated_savings_usd: +cacheSavings.toFixed(4),
      },
      context: {
        window: contextWindow,
        avg_peak_tokens: avgPeak,
        max_peak_tokens: peakMax,
        avg_fill_pct: contextWindow > 0 ? +((avgPeak / contextWindow) * 100).toFixed(1) : 0,
        max_fill_pct: contextWindow > 0 ? +((peakMax / contextWindow) * 100).toFixed(1) : 0,
        breakdown,
        samples: compSamples,
      },
      by_day: byDay.map((d) => ({ ...d, cost_usd: +d.cost_usd.toFixed(4) })),
      by_endpoint: mapTotals(byEndpoint),
      by_model: mapTotals(byModel),
      users,
      top_conversations: topConversations,
    });
  } catch (err) {
    console.error('admin usage error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to load usage' });
  }
}
