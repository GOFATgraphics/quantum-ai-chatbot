/**
 * Signed OAuth `state`.
 *
 * The state parameter comes back from Google or Microsoft exactly as it was
 * sent, which makes it the natural place to carry "who started this flow" —
 * and exactly the wrong place to trust without proof. It was a plain base64
 * JSON blob holding a user id, and the callback read that id and wrote the
 * returned tokens against it with the service-role key. Anyone who could
 * guess or obtain another user's id could mint their own state, complete the
 * flow with their own Google account, and have those credentials filed under
 * the victim's account: from then on the victim's assistant reads the
 * attacker's mailbox, and everything it files lands in the attacker's Drive.
 *
 * The state is now signed with a server-side key and rejected unless the
 * signature matches and it is recent, so the callback can only act on a value
 * this server produced.
 */

import { createHmac, timingSafeEqual } from 'crypto';

/**
 * A state is only useful for the length of one consent screen. Ten minutes is
 * generous for a human clicking through Google's dialogs, and short enough
 * that a captured URL is not worth replaying.
 */
const MAX_AGE_MS = 10 * 60 * 1000;

/**
 * The signing key never leaves the server either way. A dedicated secret is
 * preferred, but falling back to the service-role key means this protection
 * is on by default rather than waiting on someone to set another variable —
 * an unset secret would otherwise mean signing with the empty string, which
 * is no protection at all.
 */
function secret() {
  const key = process.env.OAUTH_STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Cannot sign OAuth state: set OAUTH_STATE_SECRET or SUPABASE_SERVICE_ROLE_KEY');
  return key;
}

function sign(body) {
  return createHmac('sha256', secret()).update(body).digest('base64url');
}

/** Compare without leaking, through timing, how much of the signature matched. */
function signatureMatches(expected, actual) {
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  // timingSafeEqual throws on a length mismatch, which is itself an answer,
  // so the lengths are checked first and a wrong length is simply wrong.
  return a.length === b.length && timingSafeEqual(a, b);
}

export function signState(payload) {
  const body = Buffer.from(JSON.stringify({ ...payload, t: Date.now() })).toString('base64url');
  return `${body}.${sign(body)}`;
}

/**
 * Returns the payload, or throws with a reason suitable for a redirect code.
 * Every failure is treated the same by callers: the flow is abandoned.
 */
export function verifyState(raw) {
  const value = String(raw || '');
  const dot = value.lastIndexOf('.');
  if (dot <= 0) throw new Error('unsigned_state');

  const body = value.slice(0, dot);
  if (!signatureMatches(sign(body), value.slice(dot + 1))) throw new Error('bad_signature');

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    throw new Error('invalid_state');
  }

  const age = Date.now() - Number(payload?.t || 0);
  // A negative age means a clock issue or a forged timestamp; neither is a
  // state this server issued moments ago.
  if (!Number.isFinite(age) || age < 0 || age > MAX_AGE_MS) throw new Error('state_expired');

  return payload;
}
