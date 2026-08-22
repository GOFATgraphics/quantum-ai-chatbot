/**
 * Detailed product analytics for the admin dashboard.
 *
 * Exact totals come from head-only COUNT queries (cheap at any size). Anything
 * time-sliced is derived from a bounded window of (created_at, user_id) rows so
 * one request can't try to pull the whole messages table into memory.
 */
import { requireAdmin, applyAdminCors } from '../lib/adminAuth.js';

const WINDOW_DAYS = 30;
const ROW_CAP = 50_000;

function dayKey(iso) {
  return String(iso || '').slice(0, 10);
}

function emptyDays(days) {
  const out = [];
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(d.getTime() - i * 86_400_000);
    out.push({ date: day.toISOString().slice(0, 10), count: 0 });
  }
  return out;
}

function bucketByDay(rows, days) {
  const series = emptyDays(days);
  const index = new Map(series.map((s, i) => [s.date, i]));
  for (const r of rows) {
    const i = index.get(dayKey(r.created_at));
    if (i !== undefined) series[i].count += 1;
  }
  return series;
}

async function countOf(admin, table, apply) {
  let q = admin.from(table).select('*', { count: 'exact', head: true });
  if (apply) q = apply(q);
  const { count, error } = await q;
  if (error) {
    console.warn(`analytics count ${table}:`, error.message);
    return null;
  }
  return count ?? 0;
}

/** Pull a bounded set of rows, paging past PostgREST's default 1000-row cap. */
async function fetchRows(admin, table, columns, sinceIso) {
  const out = [];
  const page = 1000;
  for (let from = 0; from < ROW_CAP; from += page) {
    let q = admin.from(table).select(columns).order('created_at', { ascending: false });
    if (sinceIso) q = q.gte('created_at', sinceIso);
    const { data, error } = await q.range(from, from + page - 1);
    if (error) {
      console.warn(`analytics fetch ${table}:`, error.message);
      break;
    }
    if (!data?.length) break;
    out.push(...data);
    if (data.length < page) break;
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
    const day1 = new Date(now - 86_400_000).toISOString();
    const day7 = new Date(now - 7 * 86_400_000).toISOString();
    const day30 = since;

    const [
      totalUsers,
      totalConversations,
      totalMessages,
      totalNotes,
      openNotes,
      totalProjects,
      connectedConnectors,
      newUsers7d,
      newUsers30d,
    ] = await Promise.all([
      countOf(admin, 'profiles'),
      countOf(admin, 'conversations'),
      countOf(admin, 'messages'),
      countOf(admin, 'notes'),
      countOf(admin, 'notes', (q) => q.eq('status', 'open')),
      countOf(admin, 'projects'),
      countOf(admin, 'connectors', (q) => q.eq('status', 'connected')),
      countOf(admin, 'profiles', (q) => q.gte('created_at', day7)),
      countOf(admin, 'profiles', (q) => q.gte('created_at', day30)),
    ]);

    // Windowed detail rows
    const [msgRows, convRows, profiles, connectors, notes] = await Promise.all([
      fetchRows(admin, 'messages', 'created_at,role,conversation_id', since),
      fetchRows(admin, 'conversations', 'created_at,user_id', since),
      fetchRows(admin, 'profiles', 'id,email,preferred_name,is_admin,created_at', null),
      fetchRows(admin, 'connectors', 'user_id,provider,status,account_email,updated_at', null),
      fetchRows(admin, 'notes', 'user_id,status,note_type,priority,due_date,created_at', null),
    ]);

    // messages carry no user_id, so map conversation -> owner
    const convOwner = new Map();
    const allConvs = await fetchRows(admin, 'conversations', 'id,user_id,created_at,updated_at', null);
    for (const c of allConvs) convOwner.set(c.id, c.user_id);

    const messagesPerDay = bucketByDay(msgRows, WINDOW_DAYS);
    const conversationsPerDay = bucketByDay(convRows, WINDOW_DAYS);
    const signupsPerDay = bucketByDay(
      profiles.filter((p) => p.created_at && p.created_at >= since),
      WINDOW_DAYS,
    );

    // Active users by window, via message activity attributed through conversations
    const activeSince = (iso) => {
      const set = new Set();
      for (const m of msgRows) {
        if (m.created_at >= iso) {
          const owner = convOwner.get(m.conversation_id);
          if (owner) set.add(owner);
        }
      }
      return set;
    };
    const dau = activeSince(day1);
    const wau = activeSince(day7);
    const mau = activeSince(day30);

    // Hour-of-day distribution (UTC)
    const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }));
    for (const m of msgRows) {
      const h = new Date(m.created_at).getUTCHours();
      if (byHour[h]) byHour[h].count += 1;
    }

    // Per-user rollup
    const notesByUser = new Map();
    for (const n of notes) {
      const cur = notesByUser.get(n.user_id) || { total: 0, open: 0 };
      cur.total += 1;
      if (n.status === 'open') cur.open += 1;
      notesByUser.set(n.user_id, cur);
    }
    const connectorsByUser = new Map();
    for (const c of connectors) {
      if (c.status !== 'connected') continue;
      const cur = connectorsByUser.get(c.user_id) || [];
      cur.push(c.provider);
      connectorsByUser.set(c.user_id, cur);
    }
    const convsByUser = new Map();
    const lastActiveByUser = new Map();
    for (const c of allConvs) {
      convsByUser.set(c.user_id, (convsByUser.get(c.user_id) || 0) + 1);
      const stamp = c.updated_at || c.created_at;
      const prev = lastActiveByUser.get(c.user_id);
      if (stamp && (!prev || stamp > prev)) lastActiveByUser.set(c.user_id, stamp);
    }
    const msgsByUser = new Map();
    for (const m of msgRows) {
      const owner = convOwner.get(m.conversation_id);
      if (!owner) continue;
      msgsByUser.set(owner, (msgsByUser.get(owner) || 0) + 1);
    }

    const users = profiles
      .map((p) => ({
        id: p.id,
        email: p.email,
        name: p.preferred_name,
        is_admin: !!p.is_admin,
        created_at: p.created_at,
        last_active: lastActiveByUser.get(p.id) || null,
        conversations: convsByUser.get(p.id) || 0,
        messages_30d: msgsByUser.get(p.id) || 0,
        notes: notesByUser.get(p.id)?.total || 0,
        notes_open: notesByUser.get(p.id)?.open || 0,
        connectors: connectorsByUser.get(p.id) || [],
      }))
      .sort((a, b) => (b.messages_30d - a.messages_30d) || (b.conversations - a.conversations));

    // Connector adoption
    const providerCounts = {};
    for (const c of connectors) {
      if (c.status !== 'connected') continue;
      providerCounts[c.provider] = (providerCounts[c.provider] || 0) + 1;
    }

    // Notes breakdown
    const notesByStatus = {};
    const notesByType = {};
    const notesByPriority = {};
    let overdueNotes = 0;
    const nowIso = new Date().toISOString();
    for (const n of notes) {
      notesByStatus[n.status || 'unknown'] = (notesByStatus[n.status || 'unknown'] || 0) + 1;
      notesByType[n.note_type || 'unknown'] = (notesByType[n.note_type || 'unknown'] || 0) + 1;
      notesByPriority[n.priority || 'unknown'] = (notesByPriority[n.priority || 'unknown'] || 0) + 1;
      if (n.status === 'open' && n.due_date && n.due_date < nowIso) overdueNotes += 1;
    }

    const userMsgs = msgRows.filter((m) => m.role === 'user').length;
    const assistantMsgs = msgRows.length - userMsgs;

    return res.status(200).json({
      generated_at: new Date().toISOString(),
      window_days: WINDOW_DAYS,
      truncated: msgRows.length >= ROW_CAP,
      totals: {
        users: totalUsers,
        conversations: totalConversations,
        messages: totalMessages,
        notes: totalNotes,
        notes_open: openNotes,
        projects: totalProjects,
        connectors: connectedConnectors,
      },
      growth: {
        new_users_7d: newUsers7d,
        new_users_30d: newUsers30d,
        signups_per_day: signupsPerDay,
      },
      activity: {
        dau: dau.size,
        wau: wau.size,
        mau: mau.size,
        messages_30d: msgRows.length,
        user_messages_30d: userMsgs,
        assistant_messages_30d: assistantMsgs,
        conversations_30d: convRows.length,
        avg_messages_per_conversation:
          convRows.length > 0 ? +(msgRows.length / convRows.length).toFixed(1) : 0,
        avg_messages_per_active_user: mau.size > 0 ? +(msgRows.length / mau.size).toFixed(1) : 0,
        messages_per_day: messagesPerDay,
        conversations_per_day: conversationsPerDay,
        by_hour_utc: byHour,
      },
      connectors: {
        by_provider: providerCounts,
        adoption_rate:
          totalUsers > 0 ? +((connectorsByUser.size / totalUsers) * 100).toFixed(1) : 0,
        users_with_connector: connectorsByUser.size,
      },
      notes: {
        by_status: notesByStatus,
        by_type: notesByType,
        by_priority: notesByPriority,
        overdue: overdueNotes,
      },
      users,
    });
  } catch (err) {
    console.error('admin analytics error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to load analytics' });
  }
}
