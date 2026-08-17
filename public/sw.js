/* Quantumy AI service worker
 *
 * Strategy:
 * - Never cache API / Supabase
 * - Network-first for app shell (HTML, JS, CSS, SVG, manifest)
 * - Cache-first only for other static assets (fonts, images)
 * - Bump CACHE on every deploy that must reach users immediately
 * - Supports postMessage: { type: 'SKIP_WAITING' | 'CLEAR_CACHE' | 'GET_VERSION' }
 */
const CACHE = 'quantumy-v10'
const VERSION = '10'

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

async function networkFirst(request) {
  const cache = await caches.open(CACHE)
  try {
    const response = await fetch(request)
    if (canCache(request, response)) {
      cache.put(request, response.clone()).catch(() => {})
    }
    return response
  } catch (err) {
    const cached = await cache.match(request)
    if (cached) return cached
    throw err
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

function isAppShell(request, url) {
  if (request.mode === 'navigate') return true
  if (url.pathname === '/' || url.pathname === '/index.html') return true
  const p = url.pathname
  return (
    p.endsWith('.js') ||
    p.endsWith('.css') ||
    p.endsWith('.html') ||
    p.endsWith('.svg') ||
    p.endsWith('.webmanifest') ||
    p.endsWith('.json')
  )
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
