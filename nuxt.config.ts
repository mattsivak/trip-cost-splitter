import { defineNuxtConfig } from 'nuxt/config'

export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  css: ['~/assets/main.css'],

  // Trips live as one JSON file each. TRIPS_DIR moves that directory; it is
  // the only thing that needs to survive a redeploy.
  nitro: {
    storage: {
      trips: { driver: 'fs', base: process.env.TRIPS_DIR || './.data/trips' },
    },
  },

  runtimeConfig: {
    // Server-only. Absent means the app falls back to keyless OSRM.
    mapyApiKey: process.env.MAPY_API_KEY ?? '',
  },

  typescript: {
    strict: true,
    // Type checking runs as its own `npm run typecheck` step so the dev server
    // stays fast and CI still fails on a type error.
    typeCheck: false,
  },

  app: {
    head: {
      title: 'Trip Cost Splitter',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        {
          name: 'description',
          content: 'Split fuel and trip costs fairly across everyone who rode along.',
        },
        { name: 'color-scheme', content: 'light dark' },
        // The bar above an installed window is painted from these, so they
        // track the page colour rather than the accent.
        {
          name: 'theme-color',
          content: '#eae7df',
          media: '(prefers-color-scheme: light)',
        },
        {
          name: 'theme-color',
          content: '#191a17',
          media: '(prefers-color-scheme: dark)',
        },
        // iOS reads none of the manifest: standalone mode, the home screen
        // name and the status bar are all still set here.
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-title', content: 'Trip Split' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
      ],
      link: [
        { rel: 'manifest', href: '/manifest.webmanifest' },
        { rel: 'icon', href: '/icons/icon.svg', type: 'image/svg+xml' },
        { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png', sizes: '180x180' },
      ],
      script: [
        {
          // Applies a stored theme choice before the first paint. Without this
          // the page renders in the system theme and then flips, which is
          // worse than having no toggle at all.
          innerHTML:
            "try{var t=localStorage.getItem('trip-cost-splitter:theme');" +
            "if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}",
          tagPosition: 'head',
        },
      ],
    },
  },
})
