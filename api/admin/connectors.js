/**
 * Connected accounts across all users.
 *
 * The column list here is deliberate and must stay that way: access_token,
 * refresh_token and token_expires_at are never selected. This route runs with
 * the service role, which bypasses both RLS and the column grants revoked in
 * rls-hardening.sql, so this list is the only thing keeping OAuth credentials
 * off the wire.
 */
import { requireAdmin, applyAdminCors } from '../lib/adminAuth.js';

const LIMIT = 300;

export default async function handler(req, res) {
  if (applyAdminCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const ctx = await requireAdmin(req, res);
  if (!ctx) return;
  const { admin } = ctx;

  try {
    const { data, error } = await admin
      .from('connectors')
      .select('id, user_id, provider, account_email, status, scopes, created_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(LIMIT);
    if (error) throw error;
    const connectors = data || [];

    const ids = [...new Set(connectors.map((c) => c.user_id).filter(Boolean))];
    const owners = {};
    if (ids.length > 0) {
      const { data: profiles } = await admin
        .from('profiles')
        .select('id, email, preferred_name')
        .in('id', ids);
      for (const p of profiles || []) {
        owners[p.id] = { email: p.email, preferred_name: p.preferred_name };
      }
    }

    return res.status(200).json({
      connectors,
      owners,
      truncated: connectors.length >= LIMIT,
    });
  } catch (err) {
    console.error('admin connectors error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to load connectors' });
  }
}
