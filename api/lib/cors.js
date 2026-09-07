/**
 * CORS for the API routes.
 *
 * Every handler answered `Access-Control-Allow-Origin: *`, which invited any
 * website on the internet to call these endpoints. It was never as bad as it
 * looks - the routes authenticate on a bearer token the browser does not hand
 * out cross-origin, and `*` cannot carry cookies - so a random page still
 * could not act as the user. But it widens every other mistake: a token that
 * leaks anywhere becomes usable from anywhere, and a stray endpoint that
 * forgets its auth check becomes reachable by everyone rather than nobody.
 *
 * The app calls its own API from its own origin, where CORS never applies, so
 * naming the one origin that is allowed to call from elsewhere costs nothing
 * and closes that door. Preview deployments are unaffected for the same
 * reason: a preview's frontend calls the preview's own API.
 */

/** Falls back to `*` only when APP_URL is unset, so a misconfigured env still works. */
export function allowedOrigin() {
  const appUrl = (process.env.APP_URL || '').trim().replace(/\/$/, '');
  return appUrl || '*';
}

/**
 * Sets the shared CORS headers and answers the preflight.
 * @returns true when the request was a preflight and is now finished.
 */
export function applyCors(req, res, methods = 'POST, OPTIONS') {
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin());
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  // Caches key on the origin rather than serving one origin's answer to another.
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }
  return false;
}
