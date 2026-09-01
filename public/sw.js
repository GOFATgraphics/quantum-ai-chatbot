/* Quantumy AI service worker
 *
 * Strategy:
 * - Never cache API / Supabase
 * - Cache-first for hashed build assets: the filename carries the version, so
 *   a cached copy can never be stale and there is nothing to revalidate
 * - Stale-while-revalidate for the HTML shell: served from cache instantly,
 *   checked against the network every time, and the page is told when it
 *   changed so it can pick up the new build
 * - Cache-first for other static assets (fonts, images)
 * - Supports postMessage: { type: 'SKIP_WAITING' | 'CLEAR_CACHE' | 'GET_VERSION' }
 *
 * Why the shell is not network-first any more.
 *
 * It was, with a three second timeout falling back to cache. That has a bad
 * failure mode: one slow load serves the cached HTML, the cached HTML names
 * the old hashed asset files, and those are cache-first — so the whole old
 * app is served from cache, and stays served from cache. Nothing in that loop
 * ever touches the network again for anything that would reveal a new build.
 * A deploy could then simply never arrive on that device.
 *
 * Serving the cached shell and revalidating behind it fixes both halves at
 * once: the page paints immediately rather than waiting on the network, and
 * the check for a new build happens on every single load instead of only when
 * sw.js itself happens to change.
 */
const CACHE = 'quantumy-v12'
const VERSION = '12'

self.addEventListener('install', (event) => {
  // Activate as soon as installed — don't wait for old tabs to close
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      await self.clients.claim()
      // Tell open tabs a new SW is in control
      const clients = await self.clients.matchAll({ type: 'window' })
      for (const client of clients) {
        client.postMessage({ type: 'SW_ACTIVATED', version: VERSION, cache: CACHE })
      }
    })()
  )
})

/** Only cache successful same-origin responses */
function canCache(request, response) {
  if (!response || !response.ok) return false
  if (response.type === 'opaque') return false
  try {
    const url = new URL(request.url)
    if (url.origin !== self.location.origin) return false
  } catch {
    return false
  }
  return true
}

async function notifyClients(message) {
  const clients = await self.clients.matchAll({ type: 'window' })
  for (const client of clients) client.postMessage(message)
}

/**
 * Serve the app shell from cache and check the network behind it.
 *
 * The revalidation is not optional and is not raced against a timer: it runs
 * on every load, and when the HTML that comes back differs from the copy that
 * was served, open pages are told. That message is what makes a deploy reach a
 * device that is already running an older build — without it, the only trigger
 * is sw.js changing, which a deploy need not do.
 *
 * The comparison is on the body text. index.html carries the hashed script and
 * stylesheet names, so any real build changes it, and a rebuild that produces
 * identical output correctly says nothing.
 */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(request)

  const revalidate = (async () => {
    const response = await fetch(request)
    if (!canCache(request, response)) return response
    if (cached) {
      const [before, after] = await Promise.all([cached.clone().text(), response.clone().text()])
      if (before !== after) {
        await cache.put(request, response.clone())
        await notifyClients({ type: 'SHELL_UPDATED', version: VERSION })
        return response
      }
    }
    await cache.put(request, response.clone())
    return response
  })()

  if (cached) {
    // Failures here are expected offline and must not surface as an unhandled
    // rejection; the page already has its answer.
    revalidate.catch(() => {})
    return cached
  }
  return revalidate
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (canCache(request, response)) {
    cache.put(request, response.clone()).catch(() => {})
  }
  return response
}

/**
 * Build output under /assets/ is content-hashed by Vite: the filename changes
 * whenever the contents do. A cached copy therefore cannot be stale, so going
 * to the network for it on every load is pure cost — roughly a megabyte of
 * JavaScript re-requested before anything renders.
 */
function isHashedAsset(url) {
  return url.pathname.startsWith('/assets/')
}

/** Unhashed and must stay current: the HTML that points at the hashed assets. */
function isAppShell(request, url) {
  if (request.mode === 'navigate') return true
  if (url.pathname === '/' || url.pathname === '/index.html') return true
  const p = url.pathname
  return p.endsWith('.html') || p.endsWith('.webmanifest') || p.endsWith('.json')
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  let url
  try {
    url = new URL(request.url)
  } catch {
    return
  }

  // Only same-origin
  if (url.origin !== self.location.origin) return

  // Never intercept API / backend
  if (url.pathname.startsWith('/api/') || url.pathname.includes('supabase')) {
    return
  }

  // Hashed assets first: they are the bulk of the bytes and never change.
  if (isHashedAsset(url)) {
    event.respondWith(cacheFirst(request))
    return
  }

  if (isAppShell(request, url)) {
    event.respondWith(staleWhileRevalidate(request))
    return
  }

  // Fonts / misc static — cache-first is fine
  event.respondWith(cacheFirst(request))
})

// Debug + control channel from the page
self.addEventListener('message', (event) => {
  const data = event.data
  if (!data || typeof data !== 'object') return

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting()
    return
  }

  if (data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      (async () => {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k)))
        if (event.source) {
          event.source.postMessage({ type: 'CACHE_CLEARED', version: VERSION })
        }
      })()
    )
    return
  }

  if (data.type === 'GET_VERSION') {
    if (event.source) {
      event.source.postMessage({ type: 'SW_VERSION', version: VERSION, cache: CACHE })
    }
  }
})
