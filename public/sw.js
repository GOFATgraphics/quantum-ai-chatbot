/* Quantumy AI service worker
 *
 * Strategy:
 * - Never cache API / Supabase
 * - Cache-first for hashed build assets: the filename carries the version, so
 *   a cached copy can never be stale and there is nothing to revalidate
 * - Network-first, but with a timeout, for HTML and anything unhashed
 * - Cache-first for other static assets (fonts, images)
 * - Bump CACHE on every deploy that must reach users immediately
 * - Supports postMessage: { type: 'SKIP_WAITING' | 'CLEAR_CACHE' | 'GET_VERSION' }
 */
const CACHE = 'quantumy-v11'
const VERSION = '11'

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

/**
 * How long to wait for the network before serving a cached copy.
 *
 * Without this, a request that is merely slow rather than failed blocks the
 * page for as long as the connection takes to give up — the cached copy sits
 * there unused, because the old code only fell back when fetch threw. On a
 * weak mobile connection that is a blank screen for tens of seconds.
 */
const NETWORK_TIMEOUT_MS = 3000

async function networkFirst(request) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(request)

  let timer
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), NETWORK_TIMEOUT_MS)
  })

  try {
    const response = cached
      ? await Promise.race([fetch(request), timeout])
      : await fetch(request)
    if (!response) return cached
    if (canCache(request, response)) {
      cache.put(request, response.clone()).catch(() => {})
    }
    return response
  } catch (err) {
    if (cached) return cached
    throw err
  } finally {
    clearTimeout(timer)
  }
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
    event.respondWith(networkFirst(request))
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
