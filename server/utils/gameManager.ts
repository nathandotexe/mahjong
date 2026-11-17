/**
 * Game orchestrator: serialises mutations per game, persists with optimistic concurrency,
 * applies engine deadlines and hands per-player views to whatever transport is in use.
 *
 * Two runtime modes (see realtimeMode.ts):
 *  - socket: one long-running process. Live games are cached in memory, timers fire on their
 *            own and every change is pushed to Socket.IO rooms.
 *  - poll:   stateless serverless functions (Vercel). Nothing in memory is trusted: every
 *            command reloads from the database, conflicting writes are retried, and expired
 *            timers / presence changes are applied lazily by `refresh()` when a client polls.
 */
import {
  ActionType,
  GameEndReason,
  GamePhase,
  type GameEvent,
  type GameState,
  type GameView,
  type RuleConfig
} from '../../shared/types/game'
import * as engine from '../engine/engine'
import { EngineError, createContext, type ActionPayload, type SeatUser } from '../engine/engine'
import { buildView, maskEvents } from '../engine/view'
import { normalizeRoomCode } from '../engine/codes'
import {
  PersistConflictError,
  deleteGameState,
  loadGameByCode,
  loadGameState,
  loadGamesForUser,
  loadWaitingGameStates,
  saveGameState
} from './gamePersistence'
import { MatchHistoryService } from '../services/matchHistoryService'
import { isStateless } from './realtimeMode'

export type Broadcaster = (state: GameState, events: GameEvent[]) => void | Promise<void>

const DISCONNECT_GRACE_MS = 45_000
const WAITING_UNSEAT_MS = 90_000
const EMPTY_ROOM_TTL_MS = 10 * 60_000
/** Poll mode: how often a polling player's `lastSeenAt` is written back. */
const PRESENCE_WRITE_MS = 15_000
const RECENT_EVENTS_KEPT = 60
const MUTATE_ATTEMPTS = 4
const CHAT_MIN_GAP_MS = 600
/** Poll mode: at most this many expired deadlines are applied in one request. */
const MAX_TICKS_PER_REFRESH = 8

export interface ActorContext {
  userId: string
  isAdmin?: boolean
  /** Admin only: act on behalf of another seat. */
  asPlayerId?: string
}

function isNoop(error: unknown): boolean {
  return error instanceof EngineError && error.code === 'noop'
}

function deadlineDue(state: GameState, now: number): boolean {
  if (state.phase === GamePhase.WAITING || state.phase === GamePhase.ENDED) return false
  const deadline = engine.nextDeadline(state)
  return deadline !== null && now >= deadline
}

/** Poll mode: has this seated (non-bot) player stopped polling? */
function presenceStale(state: GameState, now: number): boolean {
  return state.players.some(p => {
    if (p.isBot) return false
    const away = now - p.lastSeenAt
    if (state.phase === GamePhase.WAITING) return away > WAITING_UNSEAT_MS || (p.connected && away > DISCONNECT_GRACE_MS)
    return p.connected && away > DISCONNECT_GRACE_MS
  })
}

function idleFor(state: GameState, now: number): number {
  const humans = state.players.filter(p => !p.isBot)
  return now - Math.max(state.lastActionTime, ...humans.map(p => p.lastSeenAt))
}

class GameManager {
  private games = new Map<string, GameState>()
  private queues = new Map<string, Promise<unknown>>()
  private timers = new Map<string, NodeJS.Timeout>()
  private graceTimers = new Map<string, NodeJS.Timeout>()
  private broadcaster: Broadcaster | null = null
  private sweeper: NodeJS.Timeout | null = null

  private get stateless() {
    return isStateless()
  }

  setBroadcaster(fn: Broadcaster | null) {
    this.broadcaster = fn
    if (!this.sweeper && !this.stateless) {
      this.sweeper = setInterval(() => this.sweepEmptyRooms().catch(() => {}), 60_000)
      this.sweeper.unref?.()
    }
  }

  // ---------- loading ----------

  private async load(gameId: string): Promise<GameState | null> {
    if (this.stateless) return loadGameState(gameId)
    const cached = this.games.get(gameId)
    if (cached) return cached
    const stored = await loadGameState(gameId)
    if (stored) {
      this.games.set(gameId, stored)
      this.scheduleTimer(stored)
    }
    return stored
  }

  async getGame(gameId: string): Promise<GameState | null> {
    return this.load(gameId)
  }

  async getGameByCode(rawCode: string): Promise<GameState | null> {
    const code = normalizeRoomCode(rawCode)
    if (this.stateless) return loadGameByCode(code)
    for (const game of this.games.values()) {
      if (game.code === code && game.phase !== GamePhase.ENDED) return game
    }
    const stored = await loadGameByCode(code)
    if (!stored) return null
    const cached = this.games.get(stored.gameId)
    if (cached) return cached
    this.games.set(stored.gameId, stored)
    this.scheduleTimer(stored)
    return stored
  }

  async findLiveGameForUser(userId: string): Promise<GameState | null> {
    if (this.stateless) {
      const now = Date.now()
      for (const game of await loadGamesForUser(userId)) {
        if (idleFor(game, now) < EMPTY_ROOM_TTL_MS) return game
        // Abandoned while nobody was polling: close it so it stops showing up.
        await this.mutate(game.gameId, (state, ctx) => {
          if (state.phase === GamePhase.ENDED || idleFor(state, ctx.now) < EMPTY_ROOM_TTL_MS) throw new EngineError('noop', 'live')
          engine.abortHand(state, GameEndReason.EMPTY_ROOM, ctx)
        }).catch(error => {
          if (!isNoop(error)) console.error('[sweep] abort failed:', error)
        })
      }
      return null
    }
    for (const game of this.games.values()) {
      if (game.phase !== GamePhase.ENDED && game.players.some(p => p.userId === userId)) return game
    }
    const stored = await loadGamesForUser(userId)
    const live = stored[0]
    if (!live) return null
    const cached = this.games.get(live.gameId)
    if (cached) return cached
    this.games.set(live.gameId, live)
    return live
  }

  async listWaitingGames() {
    const stored = await loadWaitingGameStates()
    const byId = new Map(stored.map(s => [s.gameId, s]))
    if (!this.stateless) {
      for (const game of this.games.values()) if (game.phase === GamePhase.WAITING) byId.set(game.gameId, game)
    }
    const now = Date.now()
    return Array.from(byId.values())
      // Poll mode has no sweeper: hide rooms whose players all stopped polling.
      .filter(game => !this.stateless || idleFor(game, now) < WAITING_UNSEAT_MS)
      .sort((a, b) => b.lastActionTime - a.lastActionTime)
      .map(game => ({
        gameId: game.gameId,
        code: game.code,
        playerCount: game.players.length,
        players: game.players.map(p => ({ name: p.name, avatar: p.avatar ?? null, isHost: p.isHost })),
        hostName: game.players.find(p => p.isHost)?.name ?? null,
        rules: game.rules,
        createdAt: new Date(game.createdAt).toISOString(),
        updatedAt: new Date(game.lastActionTime).toISOString()
      }))
  }

  // ---------- mutation pipeline ----------

  /**
   * Run `fn` against the latest state with exclusive access (per game, per process), then
   * persist with a version check, reschedule timers and broadcast. If another process saved
   * first, the state is reloaded and `fn` runs again. Engine errors propagate unchanged.
   */
  private async mutate<T>(gameId: string, fn: (state: GameState, ctx: engine.EngineContext) => T): Promise<T> {
    const previous = this.queues.get(gameId) ?? Promise.resolve()
    const run = previous.catch(() => {}).then(async () => {
      for (let attempt = 1; ; attempt++) {
        const state = await this.load(gameId)
        if (!state) throw new EngineError('game_not_found', 'Game not found')
        const ctx = createContext()
        const expectedVersion = state.version
        const snapshot = JSON.stringify(state)
        let result: T
        try {
          result = fn(state, ctx)
        } catch (error) {
          // Roll back any partial mutation so the cached state stays consistent.
          Object.assign(state, JSON.parse(snapshot))
          throw error
        }
        state.version = expectedVersion + 1
        if (ctx.events.length) state.recentEvents = [...(state.recentEvents ?? []), ...ctx.events].slice(-RECENT_EVENTS_KEPT)
        try {
          await saveGameState(state, expectedVersion)
        } catch (error) {
          if (!(error instanceof PersistConflictError)) throw error
          if (!this.stateless) this.games.delete(gameId)
          if (attempt >= MUTATE_ATTEMPTS) {
            throw new EngineError('conflict', 'The table changed while you were acting; please retry')
          }
          continue
        }
        await this.afterMutation(state, ctx.events)
        return result
      }
    })
    this.queues.set(gameId, run)
    run.finally(() => {
      if (this.queues.get(gameId) === run) this.queues.delete(gameId)
    }).catch(() => {})
    return run
  }

  private async afterMutation(state: GameState, events: GameEvent[]) {
    if (!this.stateless) this.scheduleTimer(state)
    if (events.some(e => e.type === 'hand_ended') && state.phase === GamePhase.ENDED) {
      const summary = state.handHistory[state.handHistory.length - 1]
      if (summary && summary.handNumber === state.handNumber && Object.keys(summary.scores).length > 0) {
        // Awaited: a serverless function may be frozen as soon as the response is sent.
        await MatchHistoryService.recordHand(state, summary).catch(error => console.error('[history] record failed:', error))
      }
    }
    if (this.broadcaster) {
      Promise.resolve(this.broadcaster(state, events)).catch(error => console.error('[broadcast] failed:', error))
    }
  }

  // ---------- timers (socket mode) ----------

  private scheduleTimer(state: GameState) {
    const existing = this.timers.get(state.gameId)
    if (existing) clearTimeout(existing)
    this.timers.delete(state.gameId)
    if (state.phase === GamePhase.ENDED || state.phase === GamePhase.WAITING) return
    const deadline = engine.nextDeadline(state)
    if (deadline === null) return
    const delay = Math.max(0, deadline - Date.now()) + 40
    const timer = setTimeout(() => {
      this.timers.delete(state.gameId)
      this.mutate(state.gameId, (s, ctx) => {
        if (!engine.tick(s, ctx)) throw new EngineError('noop', 'nothing to do')
      }).catch(error => {
        if (isNoop(error)) {
          const current = this.games.get(state.gameId)
          if (current) this.scheduleTimer(current)
          return
        }
        console.error('[timer] tick failed:', error)
      })
    }, delay)
    timer.unref?.()
    this.timers.set(state.gameId, timer)
  }

  // ---------- polling (poll mode) ----------

  /**
   * Poll mode: bring a game up to date before showing it. Marks the polling user present,
   * marks players who stopped polling as away (auto-play) or unseats them in the lobby, and
   * applies every deadline that has expired. Writes only when something actually changed.
   */
  async refresh(gameId: string, userId: string | null): Promise<GameState | null> {
    if (!this.stateless) return this.load(gameId)
    const loaded = await loadGameState(gameId)
    if (!loaded) return null

    const now = Date.now()
    const viewer = userId ? loaded.players.find(p => p.userId === userId) : undefined
    const viewerNeedsWrite = !!viewer && (!viewer.connected || now - viewer.lastSeenAt > PRESENCE_WRITE_MS)
    if (!viewerNeedsWrite && !deadlineDue(loaded, now) && !presenceStale(loaded, now)) return loaded

    let latest: GameState = loaded
    await this.mutate(gameId, (state, ctx) => {
      latest = state
      let changed = false

      const me = userId ? engine.playerByUser(state, userId) : undefined
      if (me && !me.connected) {
        changed = this.markConnected(state, me, ctx) || changed
      } else if (me && ctx.now - me.lastSeenAt > PRESENCE_WRITE_MS) {
        me.lastSeenAt = ctx.now
        changed = true
      }

      for (const player of [...state.players]) {
        if (player.isBot || player.userId === userId) continue
        const away = ctx.now - player.lastSeenAt
        if (state.phase === GamePhase.WAITING && away > WAITING_UNSEAT_MS) {
          engine.unseatPlayer(state, player.id, ctx)
          changed = true
        } else if (player.connected && away > DISCONNECT_GRACE_MS) {
          this.markAway(state, player, ctx)
          changed = true
        }
      }
      if (state.phase === GamePhase.WAITING && state.players.length === 0) {
        engine.abortHand(state, GameEndReason.EMPTY_ROOM, ctx)
        changed = true
      }

      for (let i = 0; i < MAX_TICKS_PER_REFRESH && deadlineDue(state, ctx.now); i++) {
        if (!engine.tick(state, ctx)) break
        changed = true
      }

      if (!changed) throw new EngineError('noop', 'up to date')
    }).catch(error => {
      if (!isNoop(error)) throw error
    })
    return latest
  }

  /** Events after `since` (by id) that this viewer may see. */
  eventsSince(state: GameState, since: number | null, viewerUserId: string | null, isAdmin: boolean): GameEvent[] {
    if (since === null) return []
    const events = (state.recentEvents ?? []).filter(e => e.id > since)
    const viewerPlayerId = viewerUserId ? engine.playerByUser(state, viewerUserId)?.id ?? null : null
    return maskEvents(events, viewerPlayerId, isAdmin)
  }

  // ---------- presence helpers ----------

  private markConnected(state: GameState, player: GameState['players'][number], ctx: engine.EngineContext): boolean {
    if (player.connected && !player.autoPlay) return false
    player.connected = true
    player.lastSeenAt = ctx.now
    player.autoPlay = false
    if (state.phase === GamePhase.PLAYING && state.players[state.currentPlayerIndex]?.id === player.id && !state.claimWindow) {
      state.turnDeadline = state.rules.turnSeconds > 0 ? ctx.now + state.rules.turnSeconds * 1000 : null
    }
    ctx.events.push({ id: ++state.eventSeq, at: ctx.now, type: 'player_connected', playerId: player.id, label: player.name })
    return true
  }

  /** Someone has been gone past the grace period: let auto-play take their seat. */
  private markAway(state: GameState, player: GameState['players'][number], ctx: engine.EngineContext) {
    player.connected = false
    ctx.events.push({ id: ++state.eventSeq, at: ctx.now, type: 'player_disconnected', playerId: player.id, label: player.name })
    if (state.phase !== GamePhase.PLAYING && state.phase !== GamePhase.EXCHANGING && state.phase !== GamePhase.CHOOSING_SUIT) return
    player.autoPlay = true
    if (state.players[state.currentPlayerIndex]?.id === player.id && !state.claimWindow) {
      state.turnDeadline = ctx.now + 1200
    }
    // Setup phases keep their shared 30 s timer; it auto-picks for whoever has not chosen.
    if (state.claimWindow) {
      const claim = state.claimWindow.claims.find(c => c.playerId === player.id && c.response === null)
      if (claim) state.claimWindow.deadline = Math.min(state.claimWindow.deadline ?? Infinity, ctx.now + 1200)
    }
  }

  // ---------- public commands ----------

  async createGame(host: SeatUser, rules?: Partial<RuleConfig>): Promise<GameState> {
    const ctx = createContext()
    let state = engine.createGame(host, rules, ctx)
    // Make sure the short code is unique among live rooms.
    for (let attempt = 0; attempt < 5; attempt++) {
      const clash = await loadGameByCode(state.code)
      if (!clash || clash.phase === GamePhase.ENDED) break
      state = engine.createGame(host, rules, ctx)
    }
    state.version = 1
    state.recentEvents = ctx.events.slice(-RECENT_EVENTS_KEPT)
    if (!this.stateless) this.games.set(state.gameId, state)
    await saveGameState(state, 0)
    await this.afterMutation(state, ctx.events)
    return state
  }

  async joinByCode(rawCode: string, user: SeatUser): Promise<GameState> {
    const game = await this.getGameByCode(rawCode)
    if (!game) throw new EngineError('game_not_found', 'No room with that code')
    return this.join(game.gameId, user)
  }

  async join(gameId: string, user: SeatUser): Promise<GameState> {
    let latest: GameState | null = null
    await this.mutate(gameId, (state, ctx) => {
      latest = state
      engine.seatPlayer(state, user, ctx)
    })
    return latest!
  }

  async leave(gameId: string, userId: string): Promise<void> {
    await this.mutate(gameId, (state, ctx) => {
      const player = engine.playerByUser(state, userId)
      if (!player) return
      if (state.phase === GamePhase.WAITING || state.phase === GamePhase.ENDED) {
        engine.unseatPlayer(state, player.id, ctx)
        if (state.players.length === 0) {
          engine.abortHand(state, GameEndReason.EMPTY_ROOM, ctx)
        }
      } else {
        // Mid-hand: the seat stays and is auto-played until they return.
        player.connected = false
        player.autoPlay = true
        player.lastSeenAt = ctx.now
        if (state.players[state.currentPlayerIndex]?.id === player.id && !state.claimWindow) {
          state.turnDeadline = ctx.now + 1200
        }
      }
    })
  }

  async addBot(gameId: string, actor: ActorContext): Promise<void> {
    await this.mutate(gameId, (state, ctx) => {
      this.requireHost(state, actor)
      engine.seatBot(state, ctx)
    })
  }

  async kick(gameId: string, actor: ActorContext, targetPlayerId: string): Promise<void> {
    await this.mutate(gameId, (state, ctx) => {
      this.requireHost(state, actor)
      engine.unseatPlayer(state, targetPlayerId, ctx)
    })
  }

  async updateRules(gameId: string, actor: ActorContext, patch: Partial<RuleConfig>): Promise<void> {
    await this.mutate(gameId, (state, ctx) => {
      this.requireHost(state, actor)
      engine.updateRules(state, patch, ctx)
    })
  }

  async startHand(gameId: string, actor: ActorContext): Promise<void> {
    await this.mutate(gameId, (state, ctx) => {
      this.requireHost(state, actor)
      engine.startHand(state, ctx)
    })
  }

  async act(gameId: string, actor: ActorContext, action: ActionType, payload: ActionPayload = {}): Promise<void> {
    await this.mutate(gameId, (state, ctx) => {
      let playerId: string
      if (actor.asPlayerId && actor.isAdmin) {
        playerId = actor.asPlayerId
      } else {
        const player = engine.playerByUser(state, actor.userId)
        if (!player) throw new EngineError('not_seated', 'You are not seated at this table')
        playerId = player.id
      }
      if (action === ActionType.CHEAT_HU && !actor.isAdmin) {
        throw new EngineError('forbidden', 'Admin privileges required')
      }
      engine.act(state, playerId, action, payload, ctx)
    })
  }

  /** Table chat and emotes travel as `chat` events, so every transport delivers them the same way. */
  async chat(gameId: string, user: { userId: string; name: string }, kind: 'message' | 'emote', rawText: string): Promise<void> {
    const text = String(rawText ?? '').trim().slice(0, kind === 'emote' ? 8 : 200)
    if (!text) return
    await this.mutate(gameId, (state, ctx) => {
      const last = [...(state.recentEvents ?? [])].reverse().find(e => e.type === 'chat' && e.payload?.userId === user.userId)
      if (last && ctx.now - last.at < CHAT_MIN_GAP_MS) throw new EngineError('noop', 'too fast')
      const player = engine.playerByUser(state, user.userId)
      ctx.events.push({
        id: ++state.eventSeq,
        at: ctx.now,
        type: 'chat',
        playerId: player?.id,
        label: user.name,
        payload: { kind, text, userId: user.userId }
      })
    }).catch(error => {
      if (!isNoop(error)) throw error
    })
  }

  async setConnected(gameId: string, userId: string, connected: boolean): Promise<void> {
    const key = `${gameId}:${userId}`
    const grace = this.graceTimers.get(key)
    if (grace) {
      clearTimeout(grace)
      this.graceTimers.delete(key)
    }
    await this.mutate(gameId, (state, ctx) => {
      const player = engine.playerByUser(state, userId)
      if (!player) throw new EngineError('noop', 'not seated')
      if (connected) {
        if (!this.markConnected(state, player, ctx)) throw new EngineError('noop', 'unchanged')
        return
      }
      if (!player.connected) throw new EngineError('noop', 'unchanged')
      player.connected = false
      player.lastSeenAt = ctx.now
      ctx.events.push({ id: ++state.eventSeq, at: ctx.now, type: 'player_disconnected', playerId: player.id, label: player.name })
    }).catch(error => {
      if (!isNoop(error)) throw error
    })

    if (!connected) {
      const timer = setTimeout(() => {
        this.graceTimers.delete(key)
        this.afterGrace(gameId, userId).catch(error => console.error('[grace] failed:', error))
      }, DISCONNECT_GRACE_MS)
      timer.unref?.()
      this.graceTimers.set(key, timer)
    }
  }

  private async afterGrace(gameId: string, userId: string) {
    await this.mutate(gameId, (state, ctx) => {
      const player = engine.playerByUser(state, userId)
      if (!player || player.connected) throw new EngineError('noop', 'reconnected')
      if (state.phase === GamePhase.WAITING) {
        if (ctx.now - player.lastSeenAt < WAITING_UNSEAT_MS - DISCONNECT_GRACE_MS) throw new EngineError('noop', 'still within grace')
        engine.unseatPlayer(state, player.id, ctx)
        if (state.players.length === 0) engine.abortHand(state, GameEndReason.EMPTY_ROOM, ctx)
        return
      }
      if (state.phase === GamePhase.ENDED) throw new EngineError('noop', 'ended')
      player.autoPlay = true
      if (state.players[state.currentPlayerIndex]?.id === player.id && !state.claimWindow) {
        state.turnDeadline = ctx.now + 1200
      }
      if (state.claimWindow) {
        const claim = state.claimWindow.claims.find(c => c.playerId === player.id && c.response === null)
        if (claim) state.claimWindow.deadline = Math.min(state.claimWindow.deadline ?? Infinity, ctx.now + 1200)
      }
    }).catch(error => {
      if (!isNoop(error)) throw error
    })
  }

  private async sweepEmptyRooms() {
    const now = Date.now()
    for (const game of Array.from(this.games.values())) {
      const anyoneHere = game.players.some(p => p.connected && !p.isBot)
      if (anyoneHere) continue
      if (now - Math.max(game.lastActionTime, ...game.players.map(p => p.lastSeenAt)) < EMPTY_ROOM_TTL_MS) continue
      try {
        if (game.phase !== GamePhase.ENDED) {
          await this.mutate(game.gameId, (state, ctx) => engine.abortHand(state, GameEndReason.EMPTY_ROOM, ctx))
        }
      } catch (error) {
        console.error('[sweep] abort failed:', error)
      }
      const timer = this.timers.get(game.gameId)
      if (timer) clearTimeout(timer)
      this.timers.delete(game.gameId)
      this.games.delete(game.gameId)
      this.queues.delete(game.gameId)
    }
  }

  async deleteGame(gameId: string): Promise<void> {
    const timer = this.timers.get(gameId)
    if (timer) clearTimeout(timer)
    this.timers.delete(gameId)
    this.games.delete(gameId)
    this.queues.delete(gameId)
    await deleteGameState(gameId)
  }

  // ---------- views ----------

  viewFor(state: GameState, userId: string | null, options: { isAdmin?: boolean; revealAll?: boolean; events?: GameEvent[] } = {}): GameView & { events: GameEvent[] } {
    const view = buildView(state, { userId, isAdmin: options.isAdmin, revealAll: options.revealAll })
    const events = options.events ? maskEvents(options.events, view.viewerPlayerId, !!options.isAdmin) : []
    return { ...view, events }
  }

  private requireHost(state: GameState, actor: ActorContext) {
    if (actor.isAdmin) return
    if (state.hostId !== actor.userId) throw new EngineError('forbidden', 'Only the host can do that')
  }
}

// Singleton persisted across HMR reloads in development.
const globalRef = globalThis as unknown as { __mahjongGameManager?: GameManager }
if (!globalRef.__mahjongGameManager) globalRef.__mahjongGameManager = new GameManager()

export const gameManager = globalRef.__mahjongGameManager
export { EngineError }
