/*
 * The service worker exists for two reasons: an installed app needs one before
 * a browser will offer to install it, and a phone in a tunnel at a petrol
 * station should still open something.
 *
 * The one rule it must never break: money is never served from the cache.
 * Every /api response goes to the network or fails honestly, because a stale
 * figure that looks live is worse than no figure. Only the shell — the HTML,
 * the hashed build assets, the fonts, the icons — is allowed to be cached.
 */

const VERSION = 'v1'
const SHELL = `shell-${VERSION}`
const ASSETS = `assets-${VERSION}`

// The one page worth having offline: it is what an installed icon opens.
const START_URL = '/'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll([START_URL]))
      // A failed precache must not leave the app without a worker at all.
      .catch(() => {})
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== SHELL && key !== ASSETS).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request

  // Anything that changes state on the server is none of our business.
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  const sameOrigin = url.origin === self.location.origin

  if (sameOrigin && url.pathname.startsWith('/api/')) return

  if (sameOrigin && (url.pathname.startsWith('/_nuxt/') || url.pathname.startsWith('/icons/'))) {
    // Hashed or stable: what is in the cache under this URL is what the server
    // would send back anyway.
    event.respondWith(cacheFirst(request, ASSETS))
    return
  }

  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    event.respondWith(cacheFirst(request, ASSETS))
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request))
    return
  }

  if (sameOrigin && url.pathname === '/manifest.webmanifest') {
    event.respondWith(cacheFirst(request, SHELL))
  }
})

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request)
  if (cached) return cached

  const response = await fetch(request)
  if (response.ok || response.type === 'opaque') {
    const cache = await caches.open(cacheName)
    cache.put(request, response.clone())
  }
  return response
}

async function networkFirst(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(SHELL)
      cache.put(request, response.clone())
    }
    return response
  } catch (error) {
    // Offline: the page as it last looked, or failing that the start page, so
    // the app opens to something it can explain rather than a browser error.
    const cached = (await caches.match(request)) || (await caches.match(START_URL))
    if (cached) return cached
    throw error
  }
}
