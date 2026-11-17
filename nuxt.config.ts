// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/ui'],
  css: ['~/main.css'],
  runtimeConfig: {
    public: {
      // 'socket' = Socket.IO on a long-running server; 'poll' = HTTP polling for serverless (Vercel).
      // Same rule as server/utils/realtimeMode.ts; override at runtime with NUXT_PUBLIC_REALTIME.
      realtime: process.env.NUXT_PUBLIC_REALTIME || (process.env.VERCEL ? 'poll' : 'socket')
    }
  },
  nitro: {
    experimental: {
      websocket: true
    }
  },
})
