import { initializeSocketIO } from '../utils/socket'
import { isStateless } from '../utils/realtimeMode'
import type { Server as HTTPServer } from 'http'

let initialized = false

/**
 * Attach Socket.IO to the Node HTTP server on the first request. Skipped in polling mode
 * (serverless hosts like Vercel have no long-lived server to attach to).
 */
export default defineNitroPlugin((nitroApp) => {
  if (isStateless()) {
    console.log('📡 Realtime: HTTP polling mode (no Socket.IO server)')
    return
  }

  nitroApp.hooks.hook('request', (event) => {
    if (initialized) return

    // Get HTTP server from the request
    const req = event.node.req
    const socket = req.socket as any

    // Access the HTTP server
    if (socket && socket.server) {
      const server = socket.server as HTTPServer
      initializeSocketIO(server)
      initialized = true
      console.log('✅ Socket.IO initialized from Nitro plugin')
    }
  })
})
