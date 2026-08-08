import {
  PROVIDER_SCOPES,
  getGoogleConfig,
  exchangeCode,
  getGoogleEmail,
} from '../lib/google.js';
import { getAdminClient } from '../lib/supabaseAdmin.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');

  const { clientId, clientSecret, appUrl } = getGoogleConfig();
  const redirectUri = `${appUrl}/api/connectors/google-callback`;
  const home = appUrl || '/';

  try {
    const code = req.query?.code;
    const stateRaw = req.query?.state;
    const oauthError = req.query?.error;

    if (oauthError) {
      return res.redirect(`${home}?connector_error=${encodeURIComponent(oauthError)}`);
    }
    if (!code || !stateRaw) {
      return res.redirect(`${home}?connector_error=missing_code`);
    }

    let state;
    try {
      state = JSON.parse(Buffer.from(stateRaw.toString(), 'base64url').toString());
    } catch {
      return res.redirect(`${home}?connector_error=invalid_state`);
    }

    const { userId, provider } = state;
    if (!userId || !PROVIDER_SCOPES[provider]) {
      return res.redirect(`${home}?connector_error=invalid_state`);
    }

    const tokens = await exchangeCode({
      clientId,
      clientSecret,
      code: code.toString(),
      redirectUri,
    });

    const accountEmail = await getGoogleEmail(tokens.access_token);
    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    const admin = getAdminClient();
    const row = {
      user_id: userId,
      provider,
      account_email: accountEmail,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || null,
      token_expires_at: expiresAt,
      scopes: PROVIDER_SCOPES[provider],
      status: 'connected',
      updated_at: new Date().toISOString(),
    };

    // Keep existing refresh_token if Google didn't return a new one
    const { data: existing } = await admin
      .from('connectors')
      .select('refresh_token')
      .eq('user_id', userId)
      .eq('provider', provider)
      .maybeSingle();

    if (!row.refresh_token && existing?.refresh_token) {
      row.refresh_token = existing.refresh_token;
    }

    const { error } = await admin.from('connectors').upsert(row, {
      onConflict: 'user_id,provider',
    });

    if (error) {
      console.error('upsert connector error:', error);
      return res.redirect(`${home}?connector_error=save_failed`);
    }

    return res.redirect(`${home}?connected=${provider}`);
  } catch (err) {
    console.error('google-callback error:', err);
    return res.redirect(`${home}?connector_error=${encodeURIComponent(err.message || 'callback_failed')}`);
  }
}
