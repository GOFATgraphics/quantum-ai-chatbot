import {
  MS_PROVIDER_SCOPES,
  getMicrosoftConfig,
  exchangeMicrosoftCode,
  getMicrosoftEmail,
} from '../lib/microsoft.js';
import { getAdminClient } from '../lib/supabaseAdmin.js';

export default async function handler(req, res) {
  const home = (process.env.APP_URL || '').replace(/\/$/, '') || '/';
  try {
    const code = req.query?.code;
    const stateRaw = req.query?.state;
    const err = req.query?.error;
    if (err) return res.redirect(`${home}?connector_error=${encodeURIComponent(String(err))}`);
    if (!code || !stateRaw) return res.redirect(`${home}?connector_error=missing_code`);

    let state;
    try {
      state = JSON.parse(Buffer.from(String(stateRaw), 'base64url').toString('utf8'));
    } catch {
      return res.redirect(`${home}?connector_error=bad_state`);
    }
    const { userId, provider } = state;
    if (!userId || !MS_PROVIDER_SCOPES[provider]) {
      return res.redirect(`${home}?connector_error=invalid_state`);
    }

    const { clientId, clientSecret, appUrl, tenant } = getMicrosoftConfig();
    const redirectUri = `${appUrl}/api/connectors/microsoft-callback`;
    const tokens = await exchangeMicrosoftCode({
      clientId,
      clientSecret,
      code: String(code),
      redirectUri,
      tenant,
    });

    const email = await getMicrosoftEmail(tokens.access_token);
    const admin = getAdminClient();
    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    await admin.from('connectors').upsert(
      {
        user_id: userId,
        provider,
        account_email: email,
        status: 'connected',
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || null,
        token_expires_at: expiresAt,
        scopes: MS_PROVIDER_SCOPES[provider],
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,provider' }
    );

    return res.redirect(`${home}?connected=${provider}`);
  } catch (e) {
    return res.redirect(`${home}?connector_error=${encodeURIComponent(e.message || 'ms_callback')}`);
  }
}
