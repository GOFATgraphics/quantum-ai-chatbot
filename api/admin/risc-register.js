/**
 * One-off admin action: register (or re-register) this app's RISC receiver
 * endpoint with Google, and optionally send a test verification event.
 * Not meant to be called by the app itself — trigger it manually once
 * api/security-events.js is deployed and live, then again only if you
 * change which event types you want.
 *
 * Protected the same way api/cron/notes-reminders.js is: a shared secret
 * sent as "Authorization: Bearer $CRON_SECRET".
 *
 * Usage (from your own terminal, after deploying):
 *   curl -X POST https://<your-app>/api/admin/risc-register \
 *     -H "Authorization: Bearer $CRON_SECRET"
 *
 *   curl -X POST "https://<your-app>/api/admin/risc-register?action=verify" \
 *     -H "Authorization: Bearer $CRON_SECRET"
 */
import { getRiscBearerToken } from '../lib/riscAuth.js';

const EVENTS_REQUESTED = [
  'https://schemas.openid.net/secevent/risc/event-type/sessions-revoked',
  'https://schemas.openid.net/secevent/oauth/event-type/tokens-revoked',
  'https://schemas.openid.net/secevent/oauth/event-type/token-revoked',
  'https://schemas.openid.net/secevent/risc/event-type/account-disabled',
  'https://schemas.openid.net/secevent/risc/event-type/account-enabled',
  'https://schemas.openid.net/secevent/risc/event-type/account-credential-change-required',
  'https://schemas.openid.net/secevent/risc/event-type/verification',
];

export default async function handler(req, res) {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.authorization || '';
  if (!expected || auth !== `Bearer ${expected}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const action = req.query?.action || 'register';

  try {
    const bearer = await getRiscBearerToken();

    if (action === 'verify') {
      const r = await fetch('https://risc.googleapis.com/v1beta/stream:verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
        body: JSON.stringify({ state: `Quantumy test @ ${new Date().toISOString()}` }),
      });
      const text = await r.text();
      return res.status(r.status).send(text || (r.ok ? 'Verification token requested.' : 'Failed.'));
    }

    if (action === 'status') {
      const r = await fetch('https://risc.googleapis.com/v1beta/stream', {
        headers: { Authorization: `Bearer ${bearer}` },
      });
      const text = await r.text();
      return res.status(r.status).send(text);
    }

    // action === 'register' (default)
    const appUrl = process.env.APP_URL;
    if (!appUrl) return res.status(500).json({ error: 'Missing APP_URL env var' });
    const receiverUrl = `${appUrl.replace(/\/$/, '')}/api/security-events`;

    const r = await fetch('https://risc.googleapis.com/v1beta/stream:update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
      body: JSON.stringify({
        delivery: {
          delivery_method: 'https://schemas.openid.net/secevent/risc/delivery-method/push',
          url: receiverUrl,
        },
        events_requested: EVENTS_REQUESTED,
      }),
    });
    const text = await r.text();
    if (!r.ok) return res.status(r.status).send(text);
    return res.status(200).json({ ok: true, receiverUrl, response: text ? JSON.parse(text) : null });
  } catch (err) {
    console.error('RISC admin action failed:', err?.message || err);
    return res.status(500).json({ error: err?.message || 'Internal error' });
  }
}
