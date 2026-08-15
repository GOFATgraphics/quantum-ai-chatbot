/**
 * Google Cross-Account Protection (RISC) receiver. Google POSTs a signed
 * "security event token" (a JWT, sent as the raw request body, not JSON)
 * whenever something happens to a user's Google account that this app
 * should react to (their Google sessions were revoked, their account was
 * disabled for hijacking, etc). We verify the signature against Google's
 * published keys, then act: for anything meaning "this Google account is
 * compromised," we kill that user's Supabase sessions so they have to sign
 * in again.
 *
 * Must return HTTP 202 on any token we successfully parsed and handled
 * (even if we chose to take no action), and 400 only for a token that
 * fails validation. See https://developers.google.com/identity/protect/risc
 */
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { getAdminClient } from './lib/supabaseAdmin.js';

const SESSIONS_REVOKED = 'https://schemas.openid.net/secevent/risc/event-type/sessions-revoked';
const TOKENS_REVOKED = 'https://schemas.openid.net/secevent/oauth/event-type/tokens-revoked';
const TOKEN_REVOKED = 'https://schemas.openid.net/secevent/oauth/event-type/token-revoked';
const ACCOUNT_DISABLED = 'https://schemas.openid.net/secevent/risc/event-type/account-disabled';
const ACCOUNT_ENABLED = 'https://schemas.openid.net/secevent/risc/event-type/account-enabled';
const CREDENTIAL_CHANGE_REQUIRED = 'https://schemas.openid.net/secevent/risc/event-type/account-credential-change-required';
const VERIFICATION = 'https://schemas.openid.net/secevent/risc/event-type/verification';

let cachedDiscovery = null;
let cachedDiscoveryAt = 0;
const DISCOVERY_TTL_MS = 60 * 60 * 1000;

let cachedJwks = null;
let cachedJwksUri = null;

async function getDiscovery() {
  const now = Date.now();
  if (cachedDiscovery && now - cachedDiscoveryAt < DISCOVERY_TTL_MS) return cachedDiscovery;
  const res = await fetch('https://accounts.google.com/.well-known/risc-configuration');
  if (!res.ok) throw new Error(`RISC discovery fetch failed: ${res.status}`);
  cachedDiscovery = await res.json();
  cachedDiscoveryAt = now;
  return cachedDiscovery;
}

async function getVerifier() {
  const discovery = await getDiscovery();
  if (!cachedJwks || cachedJwksUri !== discovery.jwks_uri) {
    cachedJwks = createRemoteJWKSet(new URL(discovery.jwks_uri));
    cachedJwksUri = discovery.jwks_uri;
  }
  return { jwks: cachedJwks, issuer: discovery.issuer };
}

async function getRawBody(req) {
  if (typeof req.body === 'string' && req.body) return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  let token;
  try {
    token = (await getRawBody(req)).trim();
  } catch {
    return res.status(400).json({ error: 'Could not read request body' });
  }
  if (!token) return res.status(400).json({ error: 'Empty body' });

  const audiences = (process.env.RISC_AUDIENCE_CLIENT_IDS || process.env.GOOGLE_CLIENT_ID || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (audiences.length === 0) {
    console.error('RISC receiver misconfigured: no audience client ID set (RISC_AUDIENCE_CLIENT_IDS or GOOGLE_CLIENT_ID)');
    return res.status(500).end();
  }

  let payload;
  try {
    const { jwks, issuer } = await getVerifier();
    const verified = await jwtVerify(token, jwks, { issuer, audience: audiences });
    payload = verified.payload;
    // Security event tokens represent historical events and are not expected
    // to carry (or be checked against) an expiry, per Google's spec.
  } catch (err) {
    console.error('RISC token verification failed:', err?.message || err);
    return res.status(400).json({ error: 'Invalid security event token' });
  }

  const jti = payload.jti;
  if (!jti || typeof jti !== 'string') {
    return res.status(400).json({ error: 'Missing jti' });
  }

  const admin = getAdminClient();

  const { data: existing } = await admin.from('risc_events').select('jti').eq('jti', jti).maybeSingle();
  if (existing) {
    // Google redelivers events it believes weren't received; already handled.
    return res.status(202).end();
  }

  const events = payload.events && typeof payload.events === 'object' ? payload.events : {};
  const eventTypes = Object.keys(events);
  let resolvedUserId = null;

  for (const eventType of eventTypes) {
    const detail = events[eventType] || {};
    const sub = detail?.subject?.sub;
    let userId = null;
    if (sub) {
      try {
        const { data: uid } = await admin.rpc('find_user_id_by_provider_sub', { p_sub: sub, p_provider: 'google' });
        userId = uid || null;
      } catch (lookupErr) {
        console.error('RISC: user lookup failed:', lookupErr?.message || lookupErr);
      }
    }
    if (userId) resolvedUserId = userId;

    try {
      switch (eventType) {
        case SESSIONS_REVOKED:
        case TOKENS_REVOKED:
          if (userId) await admin.rpc('revoke_user_sessions', { p_user_id: userId });
          break;
        case ACCOUNT_DISABLED:
          if (userId) await admin.rpc('revoke_user_sessions', { p_user_id: userId });
          console.warn(`RISC: account-disabled for user ${userId || '(unresolved)'}, reason=${detail?.reason || 'unspecified'}`);
          break;
        case TOKEN_REVOKED:
          // About one specific OAuth token (e.g. a connector refresh token),
          // not the sign-in session. Not auto-matched to a stored connector
          // token yet; logged in risc_events below for manual follow-up.
          break;
        case ACCOUNT_ENABLED:
        case CREDENTIAL_CHANGE_REQUIRED:
        case VERIFICATION:
          // No automated action for these; logged below for visibility.
          break;
        default:
          console.warn('RISC: unrecognized event type', eventType);
      }
    } catch (actionErr) {
      console.error(`RISC: failed to act on ${eventType}:`, actionErr?.message || actionErr);
    }
  }

  await admin.from('risc_events').insert({
    jti,
    event_type: eventTypes.join(',') || 'unknown',
    user_id: resolvedUserId,
    raw: payload,
  });

  return res.status(202).end();
}
