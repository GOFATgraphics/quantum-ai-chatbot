import { getUserFromAuthHeader, getAdminClient } from '../lib/supabaseAdmin.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const user = await getUserFromAuthHeader(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const provider = body?.provider;
    if (!provider) return res.status(400).json({ error: 'provider required' });

    const admin = getAdminClient();
    const { error } = await admin
      .from('connectors')
      .delete()
      .eq('user_id', user.id)
      .eq('provider', provider);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('disconnect error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
