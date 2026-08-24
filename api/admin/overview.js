/**
 * Headline counts for the admin landing page.
 *
 * Head-only COUNT queries, so nothing is transferred but the number. Run
 * server-side for the same reason as the other admin routes: under RLS a
 * browser count sees only the caller's own rows, which produces a plausible
 * small number rather than an error — the worst kind of wrong.
 */
import { requireAdmin, applyAdminCors } from '../lib/adminAuth.js';

async function countOf(admin, table, apply) {
  try {
    let q = admin.from(table).select('*', { count: 'exact', head: true });
    if (apply) q = apply(q);
    const { count, error } = await q;
    if (error) {
      console.warn(`overview count ${table}:`, error.message);
      return null;
    }
    return count ?? 0;
  } catch (e) {
    console.warn(`overview count ${table} threw:`, e?.message || e);
    return null;
  }
}

export default async function handler(req, res) {
  if (applyAdminCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const ctx = await requireAdmin(req, res);
  if (!ctx) return;
  const { admin } = ctx;

  try {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const [users, conversations, messagesToday, connectors, notesOpen] = await Promise.all([
      countOf(admin, 'profiles'),
      countOf(admin, 'conversations'),
      countOf(admin, 'messages', (q) => q.gte('created_at', startOfDay.toISOString())),
      countOf(admin, 'connectors', (q) => q.eq('status', 'connected')),
      countOf(admin, 'notes', (q) => q.eq('status', 'open')),
    ]);

    return res.status(200).json({
      generated_at: new Date().toISOString(),
      users,
      conversations,
      messagesToday,
      connectors,
      notesOpen,
    });
  } catch (err) {
    console.error('admin overview error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to load stats' });
  }
}
