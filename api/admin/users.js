/**
 * All users, for the admin dashboard.
 *
 * The browser cannot read this: RLS scopes profiles to auth.uid() = id, so a
 * direct client query returns exactly one row — the admin's own — which reads
 * as "you are the only user" rather than as an error. Privileged reads have to
 * happen server-side with the service role, gated by requireAdmin.
 */
import { requireAdmin, applyAdminCors } from '../lib/adminAuth.js';

export default async function handler(req, res) {
  if (applyAdminCors(req, res, 'GET, PATCH, OPTIONS')) return;

  const ctx = await requireAdmin(req, res);
  if (!ctx) return;
  const { admin, user } = ctx;

  if (req.method === 'GET') {
    try {
      const { data, error } = await admin
        .from('profiles')
        .select('id, email, preferred_name, is_admin, created_at, updated_at')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return res.status(200).json({ users: data || [] });
    } catch (err) {
      console.error('admin users error:', err);
      return res.status(500).json({ error: err?.message || 'Failed to load users' });
    }
  }

  if (req.method === 'PATCH') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const targetId = String(body?.user_id || '');
      const isAdmin = !!body?.is_admin;
      if (!targetId) return res.status(400).json({ error: 'user_id is required' });

      // Self-demotion is how an account locks itself out of the dashboard it is
      // currently using.
      if (targetId === user.id && !isAdmin) {
        return res.status(400).json({ error: 'You cannot remove your own admin access.' });
      }

      // Nor can the last admin be removed by anyone — that leaves the dashboard
      // permanently unreachable, since granting admin requires being one.
      if (!isAdmin) {
        const { count } = await admin
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('is_admin', true);
        if ((count ?? 0) <= 1) {
          return res.status(400).json({ error: 'This is the last admin account — promote someone else first.' });
        }
      }

      const { error } = await admin
        .from('profiles')
        .update({ is_admin: isAdmin, updated_at: new Date().toISOString() })
        .eq('id', targetId);
      if (error) throw error;
      return res.status(200).json({ ok: true, user_id: targetId, is_admin: isAdmin });
    } catch (err) {
      console.error('admin users patch error:', err);
      return res.status(500).json({ error: err?.message || 'Failed to update user' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
