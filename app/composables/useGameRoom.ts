import { io, type Socket } from 'socket.io-client'
import {
  ActionType,
  GamePhase,
  type GameEvent,
  type GameView,
  type PlayerView,
  type RuleConfig,
  type TileSuit
} from '~/types/game'

export interface ChatMessage {
  id: number
  kind: 'message' | 'emote' | 'system'
  userId: string | null
  name: string
  text: string
  at: number
}

type Ack = { ok: boolean; error?: string; code?: string; data?: any }

export type RoomView = GameView & { events?: GameEvent[] }

interface PollResponse {
  success: boolean
  data: {
    gameId: string
    code: string
    spectator: boolean
    eventSeq: number
    serverTime: number
    unchanged: boolean
    view?: RoomView
  }
}

/** Poll cadence for the serverless transport. */
const POLL_VISIBLE_MS = 1000
const POLL_HIDDEN_MS = 2500
const POLL_RETRY_MS = 3000

/** Turn a $fetch error into the same shape the socket acks use. */
function httpAck(error: any): Ack {
  const body = error?.data
  return {
    ok: false,
    error: body?.message ?? error?.statusMessage ?? error?.message ?? 'Request failed',
    code: body?.data?.code ?? (error?.statusCode === 401 ? 'unauthenticated' : 'error')
  }
}

/**
 * One connection per room page. The server sends a fully masked view after every change; the
 * client never mutates game state locally, it only renders views and animates the events
 * that arrive with them.
 *
 * Two transports with the same API (picked by runtimeConfig.public.realtime):
 *  - socket: Socket.IO push from a long-running server.
 *  - poll:   HTTP polling every ~second, for serverless hosts such as Vercel.
 */
export const useGameRoom = () => {
  const transport: 'socket' | 'poll' = useRuntimeConfig().public.realtime === 'poll' ? 'poll' : 'socket'

  const view = ref<RoomView | null>(null)
  const connected = ref(false)
  const connecting = ref(false)
  const error = ref<string | null>(null)
  const notice = ref<string | null>(null)
  const spectator = ref(false)
  const pendingAction = ref(false)
  const chat = ref<ChatMessage[]>([])
  const unreadChat = ref(0)
  const events = ref<GameEvent[]>([])
  const serverOffset = ref(0)
  const now = ref(Date.now())
  const revealAll = ref(false)

  let socket: Socket | null = null
  let chatSeq = 0
  let clock: ReturnType<typeof setInterval> | null = null
  let noticeTimer: ReturnType<typeof setTimeout> | null = null

  const eventHandlers = new Set<(event: GameEvent, view: RoomView) => void>()
  const onEvent = (handler: (event: GameEvent, view: RoomView) => void) => {
    eventHandlers.add(handler)
    return () => eventHandlers.delete(handler)
  }

  const applyView = (next: RoomView) => {
    if (next.serverTime) serverOffset.value = next.serverTime - Date.now()
    const incoming = next.events ?? []
    view.value = next
    if (incoming.length) {
      events.value = [...events.value.slice(-80), ...incoming]
      for (const event of incoming) {
        if (event.type === 'chat') {
          const payload = (event.payload ?? {}) as { kind?: 'message' | 'emote'; text?: string; userId?: string }
          chat.value = [
            ...chat.value.slice(-150),
            { id: ++chatSeq, kind: payload.kind ?? 'message', userId: payload.userId ?? null, name: event.label ?? '?', text: payload.text ?? '', at: event.at }
          ]
          unreadChat.value++
          continue
        }
        for (const handler of eventHandlers) {
          try {
            handler(event, next)
          } catch (e) {
            console.error('event handler failed', e)
          }
        }
      }
    }
  }

  const flash = (message: string, ms = 2600) => {
    notice.value = message
    if (noticeTimer) clearTimeout(noticeTimer)
    noticeTimer = setTimeout(() => (notice.value = null), ms)
  }

  const startClock = () => {
    if (clock) return
    clock = setInterval(() => {
      now.value = Date.now() + serverOffset.value
    }, 250)
  }

  // ---------- socket transport ----------

  const emitAck = (event: string, payload: unknown): Promise<Ack> =>
    new Promise(resolve => {
      if (!socket) return resolve({ ok: false, error: 'Not connected', code: 'disconnected' })
      let settled = false
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true
          resolve({ ok: false, error: 'The server did not answer in time', code: 'timeout' })
        }
      }, 8000)
      socket.emit(event, payload, (ack: Ack) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(ack ?? { ok: true })
      })
    })

  const connectSocket = (code: string) =>
    new Promise<RoomView | null>(resolve => {
      if (socket) {
        socket.removeAllListeners()
        socket.disconnect()
      }
      connecting.value = true
      error.value = null
      // Start with HTTP long-polling, then upgrade to WebSocket. In `nuxt dev` the dev proxy
      // crashes and restarts on a Socket.IO WebSocket upgrade, so dev stays on polling.
      socket = io({ withCredentials: true, upgrade: !import.meta.dev })

      let settled = false
      let failures = 0
      const finish = (result: RoomView | null) => {
        if (settled) return
        settled = true
        resolve(result)
      }

      // Runs on the first connect and again after every reconnect, so the seat is re-attached.
      const join = async () => {
        const ack = await emitAck('room:join', { code })
        connecting.value = false
        if (!ack.ok) {
          error.value = ack.error ?? 'Could not join the room'
          finish(null)
          return
        }
        error.value = null
        spectator.value = !!ack.data?.spectator
        if (ack.data?.view) applyView(ack.data.view)
        finish(view.value)
      }

      socket.on('connect', () => {
        connected.value = true
        failures = 0
        join()
      })
      socket.on('disconnect', () => {
        connected.value = false
      })
      socket.on('connect_error', err => {
        connected.value = false
        failures++
        // Socket.IO keeps retrying on its own; only give up on the first load after several tries.
        if (!settled && failures >= 5) {
          connecting.value = false
          error.value = `Connection failed: ${err.message}`
          finish(null)
        }
      })
      socket.on('game:state', (next: RoomView) => applyView(next))
      startClock()
    })

  // ---------- polling transport ----------

  let roomId: string | null = null
  let roomCode = ''
  let lastVersion: number | null = null
  let lastEventId: number | null = null
  let pollTimer: ReturnType<typeof setTimeout> | null = null
  let pollFailures = 0
  let polling = false
  let inflight: Promise<void> | null = null

  const pollOnce = async (extra: { join?: boolean } = {}) => {
    const res = await $fetch<PollResponse>('/api/game/poll', {
      method: 'POST',
      body: {
        gameId: roomId ?? undefined,
        code: roomId ? undefined : roomCode,
        since: lastEventId ?? undefined,
        version: lastVersion ?? undefined,
        reveal: revealAll.value || undefined,
        ...extra
      }
    })
    const data = res.data
    roomId = data.gameId
    spectator.value = data.spectator
    serverOffset.value = data.serverTime - Date.now()
    if (!data.unchanged && data.view) {
      lastVersion = data.view.version
      applyView(data.view)
    }
    lastEventId = data.eventSeq
  }

  /** Serialised: concurrent callers queue behind the poll already in flight. */
  const runPoll = (extra?: { join?: boolean }) => {
    const next = (inflight ?? Promise.resolve()).catch(() => {}).then(() => pollOnce(extra))
    inflight = next
    next.finally(() => {
      if (inflight === next) inflight = null
    }).catch(() => {})
    return next
  }

  const pollDelay = () => {
    if (pollFailures > 0) return POLL_RETRY_MS
    return typeof document !== 'undefined' && document.hidden ? POLL_HIDDEN_MS : POLL_VISIBLE_MS
  }

  const pollLoop = async () => {
    pollTimer = null
    if (!polling) return
    try {
      await runPoll()
      pollFailures = 0
      connected.value = true
    } catch {
      pollFailures++
      if (pollFailures >= 2) connected.value = false
    }
    if (polling && !pollTimer) pollTimer = setTimeout(pollLoop, pollDelay())
  }

  const onVisibility = () => {
    if (!polling || document.hidden) return
    if (pollTimer) clearTimeout(pollTimer)
    pollTimer = null
    pollLoop()
  }

  const stopPolling = () => {
    polling = false
    if (pollTimer) clearTimeout(pollTimer)
    pollTimer = null
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility)
  }

  const connectPoll = async (code: string): Promise<RoomView | null> => {
    stopPolling()
    roomId = null
    roomCode = code
    lastVersion = null
    lastEventId = null
    pollFailures = 0
    connecting.value = true
    error.value = null
    try {
      await runPoll({ join: true })
    } catch (e) {
      connecting.value = false
      error.value = httpAck(e).error ?? 'Could not join the room'
      return null
    }
    connecting.value = false
    connected.value = true
    polling = true
    document.addEventListener('visibilitychange', onVisibility)
    pollTimer = setTimeout(pollLoop, pollDelay())
    startClock()
    return view.value
  }

  const HTTP_ROUTES: Record<string, (payload: any) => [string, Record<string, unknown>]> = {
    'game:action': p => ['/api/game/action', { ...p, gameId: roomId }],
    'room:start': () => ['/api/game/start', { gameId: roomId }],
    'room:rules': p => ['/api/game/settings', { gameId: roomId, rules: p }],
    'room:add-bot': () => ['/api/game/bot', { gameId: roomId }],
    'room:kick': p => ['/api/game/kick', { gameId: roomId, playerId: p.playerId }],
    'room:leave': () => ['/api/game/leave', { gameId: roomId }],
    'chat:message': p => ['/api/game/chat', { gameId: roomId, kind: 'message', text: p.text }],
    'chat:emote': p => ['/api/game/chat', { gameId: roomId, kind: 'emote', text: p.emote }]
  }

  /** Send a command over HTTP, then fetch the resulting state right away. */
  const httpSend = async (event: string, payload: unknown): Promise<Ack> => {
    const route = HTTP_ROUTES[event]
    if (!route || !roomId) return { ok: false, error: 'Not connected', code: 'disconnected' }
    const [url, body] = route(payload ?? {})
    try {
      await $fetch(url, { method: 'POST', body })
    } catch (e) {
      return httpAck(e)
    }
    if (event !== 'room:leave') await runPoll().catch(() => {})
    return { ok: true }
  }

  // ---------- shared API ----------

  const send = (event: string, payload: unknown): Promise<Ack> =>
    transport === 'poll' ? httpSend(event, payload) : emitAck(event, payload)

  const connect = (code: string) => (transport === 'poll' ? connectPoll(code) : connectSocket(code))

  const disconnect = () => {
    if (socket) {
      socket.removeAllListeners()
      socket.disconnect()
      socket = null
    }
    stopPolling()
    if (clock) {
      clearInterval(clock)
      clock = null
    }
    connected.value = false
  }

  const leaveRoom = async () => {
    await send('room:leave', {})
    disconnect()
  }

  const act = async (type: ActionType, payload: { tileId?: string; tileIds?: string[]; suit?: TileSuit; asPlayerId?: string } = {}) => {
    if (pendingAction.value) return false
    pendingAction.value = true
    try {
      const ack = await send('game:action', { type, ...payload })
      if (!ack.ok) {
        flash(ack.error ?? 'Action rejected')
        return false
      }
      return true
    } finally {
      pendingAction.value = false
    }
  }

  const startHand = async () => {
    const ack = await send('room:start', {})
    if (!ack.ok) flash(ack.error ?? 'Could not start')
    return ack.ok
  }

  const updateRules = async (patch: Partial<RuleConfig>) => {
    const ack = await send('room:rules', patch)
    if (!ack.ok) flash(ack.error ?? 'Could not update rules')
    return ack.ok
  }

  const addBot = async () => {
    const ack = await send('room:add-bot', {})
    if (!ack.ok) flash(ack.error ?? 'Could not add a bot')
    return ack.ok
  }

  const kick = async (playerId: string) => {
    const ack = await send('room:kick', { playerId })
    if (!ack.ok) flash(ack.error ?? 'Could not remove player')
    return ack.ok
  }

  const sendChat = (text: string) => void send('chat:message', { text })
  const sendEmote = (emote: string) => void send('chat:emote', { emote })
  const markChatRead = () => (unreadChat.value = 0)

  const setRevealAll = async (on: boolean) => {
    if (transport === 'poll') {
      revealAll.value = on
      lastVersion = null // force a full view with the new visibility
      await runPoll().catch(() => {})
      return
    }
    const ack = await emitAck('admin:reveal', { on })
    if (ack.ok) revealAll.value = on
  }

  const sync = async () => {
    if (transport === 'poll') {
      lastVersion = null
      await runPoll().catch(() => {})
      return
    }
    const ack = await emitAck('game:sync', {})
    if (ack.ok && ack.data) applyView(ack.data)
  }

  // ---------- derived ----------
  const me = computed<PlayerView | null>(() => view.value?.players.find(p => p.isSelf) ?? null)
  const phase = computed(() => view.value?.phase ?? GamePhase.WAITING)
  const isHost = computed(() => !!view.value?.isHost)
  const playerCount = computed(() => view.value?.players.length ?? 0)
  const currentPlayer = computed(() => (view.value ? view.value.players[view.value.currentPlayerIndex] ?? null : null))
  const isMyTurn = computed(() => !!me.value && currentPlayer.value?.id === me.value.id && !view.value?.claimWindow)
  const availableActions = computed(() => view.value?.availableActions ?? [])
  const canAct = (action: ActionType) => availableActions.value.includes(action)

  /** Seats relative to the viewer: right = next player, top = across, left = previous. */
  const seats = computed(() => {
    const players = view.value?.players ?? []
    const n = players.length
    const selfPos = me.value?.position ?? 0
    const byOffset = (offset: number) => players.find(p => p.position === (selfPos + offset) % Math.max(n, 1)) ?? null
    if (n <= 1) return { right: null, top: null, left: null }
    if (n === 2) return { right: null, top: byOffset(1), left: null }
    if (n === 3) return { right: byOffset(1), top: null, left: byOffset(2) }
    return { right: byOffset(1), top: byOffset(2), left: byOffset(3) }
  })

  const deadline = computed(() => view.value?.claimWindow?.deadline ?? view.value?.turnDeadline ?? null)
  const secondsLeft = computed(() => {
    if (!deadline.value) return null
    return Math.max(0, Math.ceil((deadline.value - now.value) / 1000))
  })

  const playerName = (playerId: string | null | undefined) => view.value?.players.find(p => p.id === playerId)?.name ?? '?'

  return {
    view,
    me,
    seats,
    phase,
    isHost,
    playerCount,
    currentPlayer,
    isMyTurn,
    availableActions,
    canAct,
    deadline,
    secondsLeft,
    now,
    connected,
    connecting,
    error,
    notice,
    spectator,
    pendingAction,
    chat,
    unreadChat,
    events,
    revealAll,
    onEvent,
    connect,
    disconnect,
    leaveRoom,
    act,
    startHand,
    updateRules,
    addBot,
    kick,
    sendChat,
    sendEmote,
    markChatRead,
    setRevealAll,
    sync,
    flash,
    playerName
  }
}
