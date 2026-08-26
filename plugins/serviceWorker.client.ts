/**
 * Registers the service worker, without which no browser will offer to install
 * the app. It waits for load so the worker never competes with the first paint
 * for bandwidth, and it stays quiet on failure: a page that works is not worth
 * interrupting over a cache that did not start.
 */
export default defineNuxtPlugin(() => {
  if (!import.meta.client || !('serviceWorker' in navigator)) return

  // The dev server rebuilds assets under the same URLs, which is exactly what
  // the worker caches; registering there would serve yesterday's build.
  if (import.meta.dev) return

  const register = () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {})
  }

  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register, { once: true })
})
