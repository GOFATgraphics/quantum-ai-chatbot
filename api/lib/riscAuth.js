/**
 * Signs a short-lived bearer token for calling Google's RISC management API
 * (stream:update / stream:verify / stream/status:update), using the RISC
 * service account's own key rather than a network OAuth round trip.
 * https://developers.google.com/identity/protect/guides/rispec/register-receiver
 */
import { SignJWT, importPKCS8 } from 'jose';

const RISC_AUDIENCE = 'https://risc.googleapis.com/google.identity.risc.v1beta.RiscManagementService';

function normalizePrivateKey(raw) {
  let key = String(raw || '').trim();
  // Dashboard UIs sometimes preserve literal wrapping quotes when a value is
  // pasted from a snippet that included them (e.g. a .env-style example).
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1).trim();
  }
  // Env vars commonly store PEM keys with literal "\n" instead of real newlines.
  return key.includes('\\n') ? key.replace(/\\n/g, '\n') : key;
}

export async function getRiscBearerToken() {
  const email = process.env.GOOGLE_RISC_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_RISC_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!email || !rawKey) {
    throw new Error('Missing GOOGLE_RISC_SERVICE_ACCOUNT_EMAIL or GOOGLE_RISC_SERVICE_ACCOUNT_PRIVATE_KEY');
  }
  const privateKey = await importPKCS8(normalizePrivateKey(rawKey), 'RS256');
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(email)
    .setSubject(email)
    .setAudience(RISC_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);
}
