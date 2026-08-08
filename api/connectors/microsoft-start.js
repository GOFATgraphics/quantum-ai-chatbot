import { MS_PROVIDER_SCOPES, getMicrosoftConfig, buildMicrosoftAuthUrl } from '../lib/microsoft.js';
import { getUserFromAuthHeader } from '../lib/supabaseAdmin.js';

export default async function handler(req, res) {
  try {
    const user = await getUserFromAuthHeader(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const provider = (req.query?.provider || 'outlook').toString();
    if (!MS_PROVIDER_SCOPES[provider]) {
      return res.status(400).json({ error: `Unknown Microsoft provider: ${provider}` });
    }

    const { clientId, appUrl, tenant } = getMicrosoftConfig();
    if (!clientId || !appUrl) {
      return res.status(500).json({
        error: 'Microsoft connector is not configured. Add MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET (and APP_URL) in Vercel env.',
      });
    }

    const redirectUri = `${appUrl}/api/connectors/microsoft-callback`;
    const state = Buffer.from(
      JSON.stringify({ userId: user.id, provider, t: Date.now() })
    ).toString('base64url');

    const url = buildMicrosoftAuthUrl({
      clientId,
      redirectUri,
      scopes: MS_PROVIDER_SCOPES[provider],
      state,
      tenant,
    });

    return res.status(200).json({ url });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Failed to start Microsoft OAuth' });
  }
}
