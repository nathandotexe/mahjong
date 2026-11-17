/**
 * How clients receive live updates.
 *  - `socket`: a long-running Node server pushes views over Socket.IO (local dev, Docker, VPS).
 *  - `poll`:   stateless serverless functions (Vercel). The database is the only source of truth,
 *              clients poll every ~second and expired timers are applied lazily on each poll.
 *
 * Defaults to `poll` on Vercel and `socket` everywhere else; override with NUXT_PUBLIC_REALTIME.
 * nuxt.config.ts uses the same rule so the client and server always agree.
 */
export type RealtimeMode = 'socket' | 'poll'

export function realtimeMode(): RealtimeMode {
  const raw = process.env.NUXT_PUBLIC_REALTIME
  if (raw === 'poll' || raw === 'socket') return raw
  return process.env.VERCEL ? 'poll' : 'socket'
}

export function isStateless(): boolean {
  return realtimeMode() === 'poll'
}
