/**
 * Every user's notes, for the admin dashboard.
 *
 * Notes are private user content (RLS normally restricts each row to its
 * owner), so this endpoint is admin-gated and reads with the service role.
 * Supports filtering by user/status/type/search and simple pagination.
 */
import { requireAdmin, applyAdminCors } from '../lib/adminAuth.js';

const PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

export default async function handler(req, res) {
  if (applyAdminCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const ctx = await requireAdmin(req, res);
  if (!ctx) return;
  const { admin } = ctx;

  try {
    const q = req.query || {};
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(q.limit, 10) || PAGE_SIZE));
    const offset = Math.max(0, Number.parseInt(q.offset, 10) || 0);

    let query = admin
      .from('notes')
      .select(
        'id,user_id,note,project,project_id,status,note_type,priority,due_date,tags,trade_ref,created_at,updated_at',
        { count: 'exact' },
      )
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (q.user_id) query = query.eq('user_id', String(q.user_id));
    if (q.status && q.status !== 'all') query = query.eq('status', String(q.status));
    if (q.note_type && q.note_type !== 'all') query = query.eq('note_type', String(q.note_type));
    if (q.priority && q.priority !== 'all') query = query.eq('priority', String(q.priority));
    if (q.search) {
      const safe = String(q.search).replace(/[%,]/g, ' ').trim();
      if (safe) query = query.ilike('note', `%${safe}%`);
    }

    const { data: notes, count, error } = await query;
    if (error) {
      console.error('admin notes query failed:', error.message);
      return res.status(500).json({ error: 'Could not load notes', details: error.message });
    }

    // Attach owner details so the UI can show who each note belongs to.
    const userIds = [...new Set((notes || []).map((n) => n.user_id).filter(Boolean))];
    const owners = {};
    if (userIds.length) {
      const { data: profiles } = await admin
        .from('profiles')
        .select('id,email,preferred_name')
        .in('id', userIds);
      for (const p of profiles || []) {
        owners[p.id] = { email: p.email, name: p.preferred_name };
      }
    }

    return res.status(200).json({
      notes: (notes || []).map((n) => ({ ...n, owner: owners[n.user_id] || null })),
      total: count ?? 0,
      limit,
      offset,
      has_more: (count ?? 0) > offset + (notes?.length || 0),
    });
  } catch (err) {
    console.error('admin notes error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to load notes' });
  }
}
