import type { Server as HTTPServer } from 'http'
import { Server as SocketIOServer } from 'socket.io'
import type { Socket } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import { createClient } from 'redis'
import { gameManager, EngineError } from './gameManager'
import { resolveUserFromCookieHeader } from './session'
import { GamePhase, type ActionType, type GameEvent, type GameState, type RuleConfig, type TileSuit } from '../../shared/types/game'
import type { User } from '../types/database'

let io: SocketIOServer | null = null

interface SocketData {
  user: User | null
  gameId: string | null
  revealAll: boolean
}

type Ack = (response: { ok: boolean; error?: string; code?: string; data?: unknown }) => void

function errorPayload(error: unknown) {
  if (error instanceof EngineError) return { ok: false as const, error: error.message, code: error.code }
  const message = error instanceof Error ? error.message : 'Unexpected error'
  return { ok: false as const, error: message, code: 'error' }
}

async function emitStateToRoom(state: GameState, events: GameEvent[]) {
  if (!io) return
  const sockets = await io.in(state.gameId).fetchSockets()
  for (const remote of sockets) {
    const data = remote.data as SocketData
    const user = data.user
    const view = gameManager.viewFor(state, user?.userId ?? null, {
      isAdmin: !!user?.isAdmin,
      revealAll: data.revealAll,
      events
    })
    remote.emit('game:state', view)
  }
}

export async function initializeSocketIO(server: HTTPServer) {
  if (io) return io

  io = new SocketIOServer(server, {
    cors: { origin: (_origin, callback) => callback(null, true), methods: ['GET', 'POST'], credentials: true },
    transports: ['websocket', 'polling']
  })

  // Redis adapter for horizontal scaling (optional).
  const redisUrl = process.env.REDIS_URL
  if (redisUrl) {
    try {
      const pubClient = createClient({ url: redisUrl })
      const subClient = pubClient.duplicate()
      pubClient.on('error', () => {})
      subClient.on('error', () => {})
      await Promise.all([pubClient.connect(), subClient.connect()])
      io.adapter(createAdapter(pubClient, subClient))
      console.log('✅ Socket.IO Redis adapter connected')
    } catch {
      console.warn('⚠️  Redis not reachable, running Socket.IO in single-server mode')
    }
  }

  gameManager.setBroadcaster(emitStateToRoom)

  // Resolve the session user once per connection from the cookie header.
  io.use(async (socket, next) => {
    try {
      const user = await resolveUserFromCookieHeader(socket.handshake.headers.cookie)
      const data = socket.data as SocketData
      data.user = user
      data.gameId = null
      data.revealAll = false
      next()
    } catch (error) {
      next(error as Error)
    }
  })

  io.on('connection', (socket: Socket) => {
    const data = socket.data as SocketData

    const requireUser = (ack?: Ack): User | null => {
      if (!data.user) {
        ack?.({ ok: false, error: 'Please sign in first', code: 'unauthenticated' })
        return null
      }
      return data.user
    }

    const sendView = async (gameId: string) => {
      const state = await gameManager.getGame(gameId)
      if (!state) return null
      const view = gameManager.viewFor(state, data.user?.userId ?? null, { isAdmin: !!data.user?.isAdmin, revealAll: data.revealAll })
      socket.emit('game:state', view)
      return view
    }

    socket.on('room:join', async (payload: { code?: string; gameId?: string }, ack?: Ack) => {
      try {
        const user = requireUser(ack)
        if (!user) return
        let state = payload?.gameId ? await gameManager.getGame(payload.gameId) : null
        if (!state && payload?.code) state = await gameManager.getGameByCode(payload.code)
        if (!state) {
          ack?.({ ok: false, error: 'Room not found', code: 'game_not_found' })
          return
        }
        const seated = state.players.some(p => p.userId === user.userId)
        if (!seated && state.phase === GamePhase.WAITING) {
          await gameManager.join(state.gameId, { userId: user.userId, name: user.name, avatar: user.avatar ?? null })
        }
        if (data.gameId && data.gameId !== state.gameId) {
          await socket.leave(data.gameId)
        }
        await socket.join(state.gameId)
        data.gameId = state.gameId
        const nowSeated = (await gameManager.getGame(state.gameId))?.players.some(p => p.userId === user.userId)
        if (nowSeated) await gameManager.setConnected(state.gameId, user.userId, true)
        const view = await sendView(state.gameId)
        ack?.({ ok: true, data: { gameId: state.gameId, code: state.code, spectator: !nowSeated, view } })
      } catch (error) {
        ack?.(errorPayload(error))
      }
    })

    socket.on('game:sync', async (_payload: unknown, ack?: Ack) => {
      if (!data.gameId) return ack?.({ ok: false, error: 'Not in a room', code: 'no_room' })
      const view = await sendView(data.gameId)
      ack?.({ ok: !!view, data: view })
    })

    socket.on('game:action', async (payload: { type: ActionType; tileId?: string; tileIds?: string[]; suit?: TileSuit; asPlayerId?: string }, ack?: Ack) => {
      try {
        const user = requireUser(ack)
        if (!user || !data.gameId) return ack?.({ ok: false, error: 'Not in a room', code: 'no_room' })
        await gameManager.act(
          data.gameId,
          { userId: user.userId, isAdmin: !!user.isAdmin, asPlayerId: user.isAdmin ? payload.asPlayerId : undefined },
          payload.type,
          { tileId: payload.tileId, tileIds: payload.tileIds, suit: payload.suit }
        )
        ack?.({ ok: true })
      } catch (error) {
        ack?.(errorPayload(error))
      }
    })

    socket.on('room:start', async (_payload: unknown, ack?: Ack) => {
      try {
        const user = requireUser(ack)
        if (!user || !data.gameId) return ack?.({ ok: false, error: 'Not in a room', code: 'no_room' })
        await gameManager.startHand(data.gameId, { userId: user.userId, isAdmin: !!user.isAdmin })
        ack?.({ ok: true })
      } catch (error) {
        ack?.(errorPayload(error))
      }
    })

    socket.on('room:rules', async (payload: Partial<RuleConfig>, ack?: Ack) => {
      try {
        const user = requireUser(ack)
        if (!user || !data.gameId) return ack?.({ ok: false, error: 'Not in a room', code: 'no_room' })
        await gameManager.updateRules(data.gameId, { userId: user.userId, isAdmin: !!user.isAdmin }, payload ?? {})
        ack?.({ ok: true })
      } catch (error) {
        ack?.(errorPayload(error))
      }
    })

    socket.on('room:add-bot', async (_payload: unknown, ack?: Ack) => {
      try {
        const user = requireUser(ack)
        if (!user || !data.gameId) return ack?.({ ok: false, error: 'Not in a room', code: 'no_room' })
        await gameManager.addBot(data.gameId, { userId: user.userId, isAdmin: !!user.isAdmin })
        ack?.({ ok: true })
      } catch (error) {
        ack?.(errorPayload(error))
      }
    })

    socket.on('room:kick', async (payload: { playerId: string }, ack?: Ack) => {
      try {
        const user = requireUser(ack)
        if (!user || !data.gameId) return ack?.({ ok: false, error: 'Not in a room', code: 'no_room' })
        await gameManager.kick(data.gameId, { userId: user.userId, isAdmin: !!user.isAdmin }, payload.playerId)
        ack?.({ ok: true })
      } catch (error) {
        ack?.(errorPayload(error))
      }
    })

    socket.on('room:leave', async (_payload: unknown, ack?: Ack) => {
      try {
        const gameId = data.gameId
        const user = data.user
        if (gameId && user) {
          await gameManager.leave(gameId, user.userId).catch(() => {})
          await socket.leave(gameId)
        }
        data.gameId = null
        ack?.({ ok: true })
      } catch (error) {
        ack?.(errorPayload(error))
      }
    })

    socket.on('admin:reveal', async (payload: { on: boolean }, ack?: Ack) => {
      if (!data.user?.isAdmin) return ack?.({ ok: false, error: 'Admin privileges required', code: 'forbidden' })
      data.revealAll = !!payload?.on
      if (data.gameId) await sendView(data.gameId)
      ack?.({ ok: true })
    })

    // Chat travels as a `chat` game event, delivered with the next state broadcast.
    const relayChat = (kind: 'message' | 'emote', text: string) => {
      const user = data.user
      if (!user || !data.gameId) return
      gameManager.chat(data.gameId, { userId: user.userId, name: user.name }, kind, text).catch(error => {
        console.error('[chat] failed:', error)
      })
    }

    socket.on('chat:message', (payload: { text: string }) => relayChat('message', String(payload?.text ?? '')))
    socket.on('chat:emote', (payload: { emote: string }) => relayChat('emote', String(payload?.emote ?? '')))

    socket.on('disconnect', async () => {
      try {
        if (data.gameId && data.user) {
          // Only mark away if this user has no other socket left in the room.
          const sockets = await io!.in(data.gameId).fetchSockets()
          const stillHere = sockets.some(s => (s.data as SocketData).user?.userId === data.user!.userId && s.id !== socket.id)
          if (!stillHere) await gameManager.setConnected(data.gameId, data.user.userId, false)
        }
      } catch (error) {
        console.error('Error on disconnect:', error)
      }
    })
  })

  console.log('🚀 Socket.IO initialized')
  return io
}

export function getIO(): SocketIOServer | null {
  return io
}

export function emitToRoom(roomId: string, event: string, data: unknown) {
  io?.to(roomId).emit(event, data)
}
