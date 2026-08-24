import { defineNuxtConfig } from 'nuxt/config'

export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  css: ['~/assets/main.css'],

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
        { name: 'description', content: 'Split fuel and trip costs fairly across everyone who rode along.' },
        { name: 'color-scheme', content: 'dark light' },
      ],
    },
  },
})
