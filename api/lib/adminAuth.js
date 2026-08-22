/**
 * Admin-only request guard.
 *
 * The admin dashboard needs to read across every user's rows, which the
 * browser's Supabase session cannot do: RLS on notes/conversations/messages is
 * scoped to auth.uid() = user_id, and there are no is_admin policies. Rather
 * than widening RLS (which would expose those rows to any client holding an
 * admin JWT), privileged reads run server-side with the service-role key and
 * are gated here.
 *
 * Returns the caller's profile when they are a verified admin, or null.
 * The service-role client is never handed out unless that check passes.
 */
import { getAdminClient, getUserFromAuthHeader } from './supabaseAdmin.js';

export async function requireAdmin(req, res) {
  const user = await getUserFromAuthHeader(req);
  if (!user) {
    res.status(401).json({ error: 'Sign in required' });
    return null;
  }

  const admin = getAdminClient();
  const { data: profile, error } = await admin
    .from('profiles')
    .select('id, email, is_admin')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    console.error('requireAdmin profile lookup failed:', error.message);
    res.status(500).json({ error: 'Could not verify admin access' });
    return null;
  }
  if (!profile?.is_admin) {
    res.status(403).json({ error: 'Admin access required' });
    return null;
  }

  return { user, profile, admin };
}

/** Standard CORS/preflight handling shared by the admin endpoints. */
export function applyAdminCors(req, res, methods = 'GET, OPTIONS') {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }
  return false;
}
