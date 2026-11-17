/**
 * Pure Sichuan mahjong (Blood Battle / Blood River) state machine.
 *
 * Every function here mutates the given GameState in place and appends GameEvents to the
 * context. There is no IO: persistence, sockets and timers live in the orchestrator
 * (server/utils/gameManager.ts). That keeps the rules unit-testable with a seeded RNG.
 */
import { randomUUID } from 'crypto'
import {
  ActionType,
  GameEndReason,
  GamePhase,
  MeldType,
  PlayerStatus,
  TileSuit,
  ALL_SUITS,
  DEFAULT_RULES,
  type ClaimOption,
  type ClaimWindow,
  type ExchangeDirection,
  type GameEvent,
  type GameState,
  type Meld,
  type Player,
  type RuleConfig,
  type ScoreEvent,
  type ScoreEventType,
  type Tile,
  type WinFlags,
  type WinRecord
} from '../../shared/types/game'
import { createRng, pick, type Rng } from './rng'
import { generateRoomCode } from './codes'
import {
  createDeck,
  findTileById,
  removeTile,
  shuffleTiles,
  sortTiles,
  suggestExchange,
  suggestVoidSuit,
  suitsInHand,
  tileKey,
  tilesEqual,
  countTiles,
  groupTiles,
  tileLabel
} from './tiles'
import { checkWin, listeningKinds } from './hand'
import { calculateFan, bestFanForKind, NO_FLAGS } from './fan'

// ---------- context & errors ----------

export interface EngineContext {
  rng: Rng
  now: number
  events: GameEvent[]
}

export function createContext(options: { rng?: Rng; now?: number } = {}): EngineContext {
  return { rng: options.rng ?? createRng(), now: options.now ?? Date.now(), events: [] }
}

export class EngineError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'EngineError'
  }
}

function fail(code: string, message: string): never {
  throw new EngineError(code, message)
}

const PRIORITY: Record<string, number> = {
  [ActionType.HU]: 3,
  [ActionType.KONG]: 2,
  [ActionType.PENG]: 1,
  [ActionType.PASS]: 0
}

const SETUP_SECONDS = 30
const AUTOPLAY_DELAY_MS = 1200

// ---------- construction ----------

export interface SeatUser {
  userId: string
  name: string
  avatar?: string | null
}

function emptyPlayer(user: SeatUser, position: number, isHost: boolean, now: number): Player {
  return {
    id: randomUUID(),
    userId: user.userId,
    name: user.name,
    avatar: user.avatar ?? null,
    position,
    isHost,
    hand: { concealedTiles: [], exposedMelds: [], discardedTiles: [] },
    status: PlayerStatus.WAITING,
    isDealer: position === 0,
    isTing: false,
    missingSuit: null,
    windScore: 0,
    rainScore: 0,
    wonFan: 0,
    winOrder: null,
    winRound: null,
    winTimestamp: null,
    score: 0,
    sessionScore: 0,
    wins: [],
    handLocked: false,
    lastDrawnTileId: null,
    passedHu: null,
    drawCount: 0,
    exchangeSubmitted: false,
    connected: true,
    lastSeenAt: now,
    autoPlay: false,
    isBot: false
  }
}

const BOT_NAMES = ['Panda Bot', 'Bamboo Bot', 'Hotpot Bot', 'Teahouse Bot']

export function normalizeRules(input: Partial<RuleConfig> | null | undefined): RuleConfig {
  const base = { ...DEFAULT_RULES, ...(input ?? {}) }
  const clampInt = (value: unknown, min: number, max: number, fallback: number) => {
    const n = Number(value)
    if (!Number.isFinite(n)) return fallback
    return Math.min(max, Math.max(min, Math.round(n)))
  }
  const fanCap = [0, 3, 4, 5].includes(Number(base.fanCap)) ? (Number(base.fanCap) as RuleConfig['fanCap']) : DEFAULT_RULES.fanCap
  return {
    preset: base.preset === 'mil' ? 'mil' : 'standard',
    fanCap,
    selfDrawBonus: base.selfDrawBonus === 'base' ? 'base' : 'fan',
    exchangeThree: !!base.exchangeThree,
    bloodRiver: !!base.bloodRiver,
    passedHuRule: !!base.passedHuRule,
    kongTransfer: !!base.kongTransfer,
    flowerPigPenalty: base.flowerPigPenalty === 'flat48' ? 'flat48' : 'cap',
    turnSeconds: base.turnSeconds === 0 ? 0 : clampInt(base.turnSeconds, 5, 120, DEFAULT_RULES.turnSeconds),
    claimSeconds: base.claimSeconds === 0 ? 0 : clampInt(base.claimSeconds, 3, 60, DEFAULT_RULES.claimSeconds),
    baseScore: clampInt(base.baseScore, 1, 100, 1)
  }
}

export function createGame(host: SeatUser, rules: Partial<RuleConfig> | undefined, ctx: EngineContext, code?: string): GameState {
  const player = emptyPlayer(host, 0, true, ctx.now)
  const state: GameState = {
    gameId: randomUUID(),
    code: code ?? generateRoomCode(ctx.rng),
    hostId: host.userId,
    phase: GamePhase.WAITING,
    endReason: null,
    rules: normalizeRules(rules),
    players: [player],
    wall: [],
    currentPlayerIndex: 0,
    dealerIndex: 0,
    discardPile: [],
    actionHistory: [],
    winnersCount: 0,
    roundNumber: 1,
    handNumber: 0,
    createdAt: ctx.now,
    lastActionTime: ctx.now,
    handStartedAt: null,
    sessionScores: { [player.id]: 0 },
    ledger: [],
    handHistory: [],
    claimWindow: null,
    exchange: null,
    lastDiscard: null,
    lastKong: null,
    turnDeadline: null,
    pristine: true,
    nextDealerId: null,
    eventSeq: 0,
    version: 0,
    pendingActions: []
  }
  emit(state, ctx, { type: 'player_joined', playerId: player.id, label: player.name })
  return state
}

// ---------- helpers ----------

function emit(state: GameState, ctx: EngineContext, event: Omit<GameEvent, 'id' | 'at'>) {
  state.eventSeq++
  ctx.events.push({ id: state.eventSeq, at: ctx.now, ...event })
}

export function playerById(state: GameState, playerId: string): Player {
  const player = state.players.find(p => p.id === playerId)
  if (!player) fail('player_not_found', 'Player not found in this room')
  return player
}

export function playerByUser(state: GameState, userId: string): Player | undefined {
  return state.players.find(p => p.userId === userId)
}

function currentPlayer(state: GameState): Player {
  return state.players[state.currentPlayerIndex]!
}

/** Players who still pay and receive this hand. */
function activePlayers(state: GameState): Player[] {
  return state.players.filter(p => p.status === PlayerStatus.PLAYING)
}

function nonWinners(state: GameState): Player[] {
  return state.players.filter(p => p.wins.length === 0 && p.status !== PlayerStatus.WAITING)
}

function requirePhase(state: GameState, phase: GamePhase) {
  if (state.phase !== phase) fail('wrong_phase', `This action is not available while the game is ${state.phase}`)
}

function seatAfter(state: GameState, position: number, predicate: (p: Player) => boolean): Player | null {
  const n = state.players.length
  for (let step = 1; step <= n; step++) {
    const candidate = state.players[(position + step) % n]!
    if (predicate(candidate)) return candidate
  }
  return null
}

function setTurnDeadline(state: GameState, ctx: EngineContext, player: Player) {
  if (player.autoPlay) {
    state.turnDeadline = ctx.now + AUTOPLAY_DELAY_MS
  } else {
    state.turnDeadline = state.rules.turnSeconds > 0 ? ctx.now + state.rules.turnSeconds * 1000 : null
  }
}

function addLedger(state: GameState, ctx: EngineContext, type: ScoreEventType, from: Player, to: Player, points: number, label: string, kongId?: string): ScoreEvent {
  const event: ScoreEvent = {
    id: randomUUID(),
    handNumber: state.handNumber,
    type,
    from: from.id,
    to: to.id,
    points,
    label,
    kongId,
    at: ctx.now
  }
  state.ledger.push(event)
  emit(state, ctx, { type: 'score', playerId: to.id, targetPlayerId: from.id, points, label })
  return event
}

function holdsVoidSuit(player: Player): boolean {
  return !!player.missingSuit && player.hand.concealedTiles.some(t => t.suit === player.missingSuit)
}

function refreshTing(player: Player) {
  player.isTing = listeningKinds(player.hand.concealedTiles, player.hand.exposedMelds, player.missingSuit).length > 0
}

export function fanIfWin(state: GameState, player: Player, tile: Tile, flags: WinFlags = NO_FLAGS): number | null {
  const concealed = [...player.hand.concealedTiles, tile]
  if (!checkWin(concealed, player.hand.exposedMelds, player.missingSuit).canWin) return null
  return calculateFan({ concealed, exposed: player.hand.exposedMelds, flags, rules: state.rules }).totalFan
}

/** passed-win lock: cannot win by discard on a tile you passed on until you draw, unless the fan is higher. */
function blockedByPassedHu(state: GameState, player: Player, tile: Tile, fan: number): boolean {
  if (!state.rules.passedHuRule || !player.passedHu) return false
  return player.passedHu.key === tileKey(tile) && fan <= player.passedHu.fan
}

// ---------- seating & rules ----------

export function seatPlayer(state: GameState, user: SeatUser, ctx: EngineContext, options: { bot?: boolean } = {}): Player {
  const existing = playerByUser(state, user.userId)
  if (existing) {
    existing.name = user.name || existing.name
    existing.avatar = user.avatar ?? existing.avatar
    return existing
  }
  if (state.phase !== GamePhase.WAITING) fail('already_started', 'This game has already started')
  if (state.players.length >= 4) fail('room_full', 'This room is full (4 players)')

  const position = state.players.length
  const player = emptyPlayer(user, position, false, ctx.now)
  if (options.bot) {
    player.isBot = true
    player.autoPlay = true
    player.connected = false
  }
  state.players.push(player)
  state.sessionScores[player.id] = 0
  emit(state, ctx, { type: 'player_joined', playerId: player.id, label: player.name })
  return player
}

/** Seat an automatic player (useful when friends are short of a fourth). */
export function seatBot(state: GameState, ctx: EngineContext): Player {
  const used = new Set(state.players.map(p => p.name))
  const name = BOT_NAMES.find(n => !used.has(n)) ?? `Bot ${state.players.length + 1}`
  return seatPlayer(state, { userId: `bot-${randomUUID()}`, name }, ctx, { bot: true })
}

/** Let auto-play / bot players finish the setup phases without waiting for the timer. */
function runAutoPlayers(state: GameState, ctx: EngineContext) {
  if (state.phase === GamePhase.EXCHANGING) {
    for (const p of state.players) {
      if ((state.phase as GamePhase) !== GamePhase.EXCHANGING) break
      if (!p.autoPlay || p.exchangeSubmitted) continue
      const pickTiles = suggestExchange(p.hand.concealedTiles)
      if (pickTiles) {
        submitExchange(state, p.id, pickTiles.map(t => t.id), ctx)
        p.autoPlay = true
      }
    }
  }
  if (state.phase === GamePhase.CHOOSING_SUIT) {
    for (const p of state.players) {
      if ((state.phase as GamePhase) !== GamePhase.CHOOSING_SUIT) break
      if (!p.autoPlay || p.missingSuit) continue
      chooseSuit(state, p.id, suggestVoidSuit(p.hand.concealedTiles), ctx)
      p.autoPlay = true
    }
  }
}

export function unseatPlayer(state: GameState, playerId: string, ctx: EngineContext) {
  if (state.phase !== GamePhase.WAITING && state.phase !== GamePhase.ENDED) {
    fail('in_progress', 'Players cannot leave in the middle of a hand')
  }
  const index = state.players.findIndex(p => p.id === playerId)
  if (index === -1) return
  const [removed] = state.players.splice(index, 1)
  state.players.forEach((p, i) => {
    p.position = i
  })
  if (removed!.isHost && state.players.length > 0) {
    const next = state.players[0]!
    next.isHost = true
    state.hostId = next.userId
  }
  if (state.nextDealerId === removed!.id) state.nextDealerId = null
  state.dealerIndex = Math.min(state.dealerIndex, Math.max(0, state.players.length - 1))
  state.players.forEach((p, i) => {
    p.isDealer = i === state.dealerIndex
  })
  emit(state, ctx, { type: 'player_left', playerId: removed!.id, label: removed!.name })
}

export function updateRules(state: GameState, patch: Partial<RuleConfig>, ctx: EngineContext) {
  if (state.phase !== GamePhase.WAITING && state.phase !== GamePhase.ENDED) {
    fail('in_progress', 'Rules can only change between hands')
  }
  state.rules = normalizeRules({ ...state.rules, ...patch })
  state.lastActionTime = ctx.now
}

export function transferHost(state: GameState, toPlayerId: string) {
  const target = playerById(state, toPlayerId)
  for (const p of state.players) p.isHost = p.id === target.id
  state.hostId = target.userId
}

// ---------- hand lifecycle ----------

export function startHand(state: GameState, ctx: EngineContext) {
  if (state.phase !== GamePhase.WAITING && state.phase !== GamePhase.ENDED) {
    fail('in_progress', 'A hand is already in progress')
  }
  if (state.players.length < 2) fail('not_enough_players', 'Need at least 2 players to start')

  state.handNumber++
  state.phase = state.rules.exchangeThree ? GamePhase.EXCHANGING : GamePhase.CHOOSING_SUIT
  state.endReason = null
  state.endedAt = undefined
  state.finalScores = undefined
  state.customScoringMode = null
  state.discardPile = []
  state.claimWindow = null
  state.lastDiscard = null
  state.lastKong = null
  state.pristine = true
  state.winnersCount = 0
  state.roundNumber = 1
  state.handStartedAt = ctx.now
  state.lastActionTime = ctx.now
  state.pendingActions = []

  // Dealer: first winner of the previous hand, shooter on a multi-win, otherwise unchanged.
  if (state.nextDealerId) {
    const index = state.players.findIndex(p => p.id === state.nextDealerId)
    if (index !== -1) state.dealerIndex = index
  }
  if (state.dealerIndex >= state.players.length) state.dealerIndex = 0
  state.nextDealerId = null

  const wall = shuffleTiles(createDeck(), ctx.rng)
  for (const player of state.players) {
    player.hand = { concealedTiles: [], exposedMelds: [], discardedTiles: [] }
    player.status = PlayerStatus.PLAYING
    player.isDealer = player.position === state.dealerIndex
    player.isTing = false
    player.missingSuit = null
    player.windScore = 0
    player.rainScore = 0
    player.wonFan = 0
    player.winOrder = null
    player.winRound = null
    player.winTimestamp = null
    player.score = 0
    player.wins = []
    player.handLocked = false
    player.lastDrawnTileId = null
    player.passedHu = null
    player.drawCount = 0
    player.exchangeSubmitted = false
    for (let i = 0; i < 13; i++) player.hand.concealedTiles.push(wall.pop()!)
    player.hand.concealedTiles = sortTiles(player.hand.concealedTiles)
  }
  const dealer = state.players[state.dealerIndex]!
  const fourteenth = wall.pop()!
  dealer.hand.concealedTiles = sortTiles([...dealer.hand.concealedTiles, fourteenth])
  dealer.lastDrawnTileId = fourteenth.id
  state.wall = wall
  state.currentPlayerIndex = state.dealerIndex

  state.exchange = state.rules.exchangeThree ? { direction: null, submissions: {}, received: {} } : null
  state.turnDeadline = ctx.now + SETUP_SECONDS * 1000

  emit(state, ctx, { type: 'hand_started', payload: { handNumber: state.handNumber, dealerId: dealer.id } })
  runAutoPlayers(state, ctx)
}

export function submitExchange(state: GameState, playerId: string, tileIds: string[], ctx: EngineContext) {
  requirePhase(state, GamePhase.EXCHANGING)
  const player = playerById(state, playerId)
  const unique = Array.from(new Set(tileIds))
  if (unique.length !== 3) fail('bad_exchange', 'Choose exactly three tiles')
  const tiles = unique.map(id => findTileById(player.hand.concealedTiles, id))
  if (tiles.some(t => !t)) fail('bad_exchange', 'Those tiles are not in your hand')
  const chosen = tiles as Tile[]
  if (new Set(chosen.map(t => t.suit)).size !== 1) fail('bad_exchange', 'All three tiles must be the same suit')

  state.exchange!.submissions[player.id] = chosen
  player.exchangeSubmitted = true
  if (!player.isBot) player.autoPlay = false
  state.lastActionTime = ctx.now

  if (state.players.every(p => p.exchangeSubmitted)) revealExchange(state, ctx)
}

function revealExchange(state: GameState, ctx: EngineContext) {
  const n = state.players.length
  const options: ExchangeDirection[] = n >= 4 ? ['clockwise', 'anticlockwise', 'across'] : n === 3 ? ['clockwise', 'anticlockwise'] : ['clockwise']
  const direction = pick(ctx.rng, options)
  const offset = direction === 'clockwise' ? 1 : direction === 'anticlockwise' ? n - 1 : 2

  const exchange = state.exchange!
  exchange.direction = direction
  const ordered = [...state.players].sort((a, b) => a.position - b.position)
  for (const giver of ordered) {
    const given = exchange.submissions[giver.id] ?? []
    giver.hand.concealedTiles = giver.hand.concealedTiles.filter(t => !given.some(g => g.id === t.id))
  }
  for (const giver of ordered) {
    const receiver = ordered[(giver.position + offset) % n]!
    const given = exchange.submissions[giver.id] ?? []
    exchange.received[receiver.id] = given
    receiver.hand.concealedTiles = sortTiles([...receiver.hand.concealedTiles, ...given])
  }
  state.phase = GamePhase.CHOOSING_SUIT
  state.turnDeadline = ctx.now + SETUP_SECONDS * 1000
  emit(state, ctx, { type: 'exchange_revealed', payload: { direction } })
  runAutoPlayers(state, ctx)
}

export function chooseSuit(state: GameState, playerId: string, suit: TileSuit, ctx: EngineContext) {
  requirePhase(state, GamePhase.CHOOSING_SUIT)
  if (!ALL_SUITS.includes(suit)) fail('bad_suit', 'Unknown suit')
  const player = playerById(state, playerId)
  if (player.missingSuit) fail('already_chosen', 'You already declared your void suit')
  player.missingSuit = suit
  if (!player.isBot) player.autoPlay = false
  state.lastActionTime = ctx.now
  emit(state, ctx, { type: 'suit_chosen', playerId: player.id, payload: { suit } })

  if (state.players.every(p => p.missingSuit)) beginPlay(state, ctx)
}

function beginPlay(state: GameState, ctx: EngineContext) {
  state.phase = GamePhase.PLAYING
  state.currentPlayerIndex = state.dealerIndex
  const dealer = state.players[state.dealerIndex]!
  for (const p of state.players) refreshTing(p)
  setTurnDeadline(state, ctx, dealer)
  emit(state, ctx, { type: 'turn', playerId: dealer.id })
}

// ---------- actions ----------

export interface ActionPayload {
  tileId?: string
  tileIds?: string[]
  suit?: TileSuit
}

export function act(state: GameState, playerId: string, action: ActionType, payload: ActionPayload, ctx: EngineContext) {
  const player = playerById(state, playerId)

  switch (action) {
    case ActionType.EXCHANGE_TILES:
      return submitExchange(state, playerId, payload.tileIds ?? [], ctx)
    case ActionType.CHOOSE_SUIT:
      return chooseSuit(state, playerId, payload.suit as TileSuit, ctx)
  }

  requirePhase(state, GamePhase.PLAYING)
  if (player.status !== PlayerStatus.PLAYING) fail('not_active', 'You are no longer active in this hand')
  if (!player.isBot) player.autoPlay = false

  if (state.claimWindow) {
    if (![ActionType.HU, ActionType.KONG, ActionType.PENG, ActionType.PASS].includes(action)) {
      fail('claim_pending', 'Waiting for players to respond to the last discard')
    }
    respondClaim(state, player, action, ctx)
    return
  }

  if (currentPlayer(state).id !== player.id) fail('not_your_turn', 'It is not your turn')

  switch (action) {
    case ActionType.DISCARD:
      return discard(state, player, payload.tileId ?? '', ctx)
    case ActionType.HU:
      return selfDrawWin(state, player, ctx)
    case ActionType.CONCEALED_KONG:
      return concealedKong(state, player, payload.tileIds ?? (payload.tileId ? [payload.tileId] : []), ctx)
    case ActionType.EXTENDED_KONG:
      return extendedKong(state, player, payload.tileId ?? '', ctx)
    case ActionType.CHEAT_HU:
      return cheatWin(state, player, ctx)
    case ActionType.PASS:
      fail('nothing_to_pass', 'There is nothing to pass on')
    default:
      fail('bad_action', `Unsupported action ${action}`)
  }
}

function recordAction(state: GameState, ctx: EngineContext, player: Player, type: ActionType, tile?: Tile, tiles?: Tile[]) {
  state.actionHistory.push({ playerId: player.id, type, tile, tiles, timestamp: ctx.now })
  if (state.actionHistory.length > 400) state.actionHistory.splice(0, state.actionHistory.length - 400)
  state.lastActionTime = ctx.now
}

// ----- discard -----

function discard(state: GameState, player: Player, tileId: string, ctx: EngineContext) {
  const tile = findTileById(player.hand.concealedTiles, tileId)
  if (!tile) fail('tile_not_found', 'That tile is not in your hand')
  const handSize = player.hand.concealedTiles.length
  if ((handSize - 2) % 3 !== 0) fail('cannot_discard', 'You have to draw before discarding')
  if (player.handLocked && tile.id !== player.lastDrawnTileId) {
    fail('hand_locked', 'After winning you may only discard the tile you just drew')
  }
  if (holdsVoidSuit(player) && tile.suit !== player.missingSuit) {
    fail('void_suit_first', 'You must discard your void suit first')
  }

  player.hand.concealedTiles = removeTile(player.hand.concealedTiles, tile.id)
  player.hand.discardedTiles.push(tile)
  state.discardPile.push(tile)
  state.eventSeq++

  const afterKong = !!state.lastKong && state.lastKong.playerId === player.id && state.lastKong.replacementDrawn
  state.lastDiscard = {
    tile,
    playerId: player.id,
    seq: state.eventSeq,
    afterKong,
    kongId: afterKong ? state.lastKong!.kongId : null,
    isLastTile: state.wall.length === 0
  }
  state.lastKong = null
  player.lastDrawnTileId = null
  refreshTing(player)
  state.roundNumber = Math.max(1, Math.ceil(state.discardPile.length / Math.max(1, state.players.length)))
  recordAction(state, ctx, player, ActionType.DISCARD, tile)
  emit(state, ctx, { type: 'tile_discarded', playerId: player.id, tile })

  openClaims(state, player, tile, ctx)
}

function openClaims(state: GameState, discarder: Player, tile: Tile, ctx: EngineContext) {
  const claims: ClaimOption[] = []
  for (const other of activePlayers(state)) {
    if (other.id === discarder.id) continue
    const options: ActionType[] = []
    const fan = fanIfWin(state, other, tile)
    if (fan !== null && !blockedByPassedHu(state, other, tile, fan)) options.push(ActionType.HU)
    if (!other.handLocked) {
      const matching = other.hand.concealedTiles.filter(t => tilesEqual(t, tile)).length
      if (matching >= 3 && state.wall.length > 0) options.push(ActionType.KONG)
      if (matching >= 2) options.push(ActionType.PENG)
    }
    if (options.length > 0) {
      options.push(ActionType.PASS)
      claims.push({ playerId: other.id, options, response: null, huFan: fan ?? undefined })
    }
  }

  if (claims.length === 0) {
    advanceTurn(state, discarder.position, ctx)
    return
  }

  state.claimWindow = {
    kind: 'discard',
    tile,
    fromPlayerId: discarder.id,
    claims,
    deadline: state.rules.claimSeconds > 0 ? ctx.now + state.rules.claimSeconds * 1000 : null
  }
  state.turnDeadline = null
  autoRespondClaims(state, ctx)
}

/** auto-play players answer immediately: take a win, decline everything else. */
function autoRespondClaims(state: GameState, ctx: EngineContext) {
  const window = state.claimWindow
  if (!window) return
  for (const claim of window.claims) {
    if (claim.response !== null) continue
    const player = playerById(state, claim.playerId)
    if (!player.autoPlay) continue
    claim.response = claim.options.includes(ActionType.HU) ? ActionType.HU : ActionType.PASS
  }
  tryResolveClaims(state, ctx)
}

function respondClaim(state: GameState, player: Player, action: ActionType, ctx: EngineContext) {
  const window = state.claimWindow!
  const claim = window.claims.find(c => c.playerId === player.id)
  if (!claim) fail('no_claim', 'You have nothing to claim on this tile')
  if (claim.response !== null) fail('already_responded', 'You already responded')
  if (!claim.options.includes(action)) fail('bad_claim', 'That option is not available to you')

  claim.response = action
  if (action === ActionType.PASS && claim.options.includes(ActionType.HU) && claim.huFan !== undefined) {
    player.passedHu = { key: tileKey(window.tile), fan: claim.huFan }
  }
  recordAction(state, ctx, player, action, window.tile)
  tryResolveClaims(state, ctx)
}

function tryResolveClaims(state: GameState, ctx: EngineContext) {
  const window = state.claimWindow
  if (!window) return
  const undecided = window.claims.filter(c => c.response === null)
  if (undecided.length > 0) {
    const best = Math.max(0, ...window.claims.filter(c => c.response !== null).map(c => PRIORITY[c.response!] ?? 0))
    if (best === 0) return
    const someoneHigherPending = undecided.some(c => Math.max(...c.options.map(o => PRIORITY[o] ?? 0)) >= best && best < PRIORITY[ActionType.HU]!)
    const anotherHuPending = best === PRIORITY[ActionType.HU] && undecided.some(c => c.options.includes(ActionType.HU))
    if (someoneHigherPending || anotherHuPending) return
  }
  resolveClaims(state, ctx)
}

function resolveClaims(state: GameState, ctx: EngineContext) {
  const window = state.claimWindow!
  state.claimWindow = null
  const from = playerById(state, window.fromPlayerId)
  const n = state.players.length
  const seatOrder = (a: ClaimOption, b: ClaimOption) => {
    const da = (playerById(state, a.playerId).position - from.position + n) % n
    const db = (playerById(state, b.playerId).position - from.position + n) % n
    return da - db
  }
  const winners = window.claims.filter(c => c.response === ActionType.HU).sort(seatOrder)

  if (winners.length > 0) {
    if (window.kind === 'kong_rob') {
      // The kong is cancelled: the tile leaves the extender and goes to the winner.
      state.pristine = false
      if (state.rules.bloodRiver) {
        // Locked hands do not take the tile; show it in the river so every tile stays accounted for.
        from.hand.discardedTiles.push(window.tile)
        state.discardPile.push(window.tile)
      }
    } else if (!state.rules.bloodRiver) {
      // Remove the discard from the river once; the winner's hand receives it.
      state.discardPile = state.discardPile.filter(t => t.id !== window.tile.id)
      from.hand.discardedTiles = from.hand.discardedTiles.filter(t => t.id !== window.tile.id)
    }
    const multiple = winners.length > 1
    let lastWinner: Player = from
    for (const claim of winners) {
      const winner = playerById(state, claim.playerId)
      const flags: WinFlags = {
        ...NO_FLAGS,
        robbingKong: window.kind === 'kong_rob',
        kongDiscard: window.kind === 'discard' && !!state.lastDiscard?.afterKong,
        lastTile: window.kind === 'discard' && !!state.lastDiscard?.isLastTile
      }
      settleWin(state, winner, window.tile, from, flags, ctx)
      lastWinner = winner
      if ((state.phase as GamePhase) !== GamePhase.PLAYING) break
    }
    if (multiple && state.nextDealerId && winners.some(w => w.playerId === state.nextDealerId)) state.nextDealerId = from.id
    if ((state.phase as GamePhase) === GamePhase.PLAYING) advanceTurn(state, lastWinner.position, ctx)
    return
  }

  const kong = window.claims.find(c => c.response === ActionType.KONG)
  if (kong && window.kind === 'discard') {
    directKong(state, playerById(state, kong.playerId), from, window.tile, ctx)
    return
  }
  const peng = window.claims.find(c => c.response === ActionType.PENG)
  if (peng && window.kind === 'discard') {
    pengClaim(state, playerById(state, peng.playerId), from, window.tile, ctx)
    return
  }

  if (window.kind === 'kong_rob') {
    completeExtendedKong(state, from, window.tile, window.meldIndex!, ctx)
    return
  }
  advanceTurn(state, from.position, ctx)
}

// ----- claims: peng & direct kong -----

function takeDiscard(state: GameState, from: Player, tile: Tile) {
  state.discardPile = state.discardPile.filter(t => t.id !== tile.id)
  from.hand.discardedTiles = from.hand.discardedTiles.filter(t => t.id !== tile.id)
}

function pengClaim(state: GameState, player: Player, from: Player, tile: Tile, ctx: EngineContext) {
  const matching = player.hand.concealedTiles.filter(t => tilesEqual(t, tile)).slice(0, 2)
  if (matching.length < 2) fail('bad_peng', 'Not enough matching tiles to peng')
  for (const t of matching) player.hand.concealedTiles = removeTile(player.hand.concealedTiles, t.id)
  takeDiscard(state, from, tile)
  const meld: Meld = { type: MeldType.TRIPLET, tiles: [tile, ...matching], isConcealed: false, fromPlayerId: from.id, kongKind: null }
  player.hand.exposedMelds.push(meld)
  player.lastDrawnTileId = null
  state.pristine = false
  state.lastKong = null
  state.currentPlayerIndex = player.position
  setTurnDeadline(state, ctx, player)
  recordAction(state, ctx, player, ActionType.PENG, tile, meld.tiles)
  emit(state, ctx, { type: 'claim_peng', playerId: player.id, targetPlayerId: from.id, tile, tiles: meld.tiles })
  emit(state, ctx, { type: 'turn', playerId: player.id })
}

function directKong(state: GameState, player: Player, from: Player, tile: Tile, ctx: EngineContext) {
  const matching = player.hand.concealedTiles.filter(t => tilesEqual(t, tile)).slice(0, 3)
  if (matching.length < 3) fail('bad_kong', 'Not enough matching tiles to kong')
  for (const t of matching) player.hand.concealedTiles = removeTile(player.hand.concealedTiles, t.id)
  takeDiscard(state, from, tile)
  const meld: Meld = { type: MeldType.KONG, tiles: [tile, ...matching], isConcealed: false, fromPlayerId: from.id, kongKind: 'direct' }
  player.hand.exposedMelds.push(meld)
  const kongId = randomUUID()
  const points = 2 * state.rules.baseScore
  addLedger(state, ctx, 'kong_direct', from, player, points, `Exposed kong ${tileLabel(tile)}`, kongId)
  player.windScore += points
  state.pristine = false
  recordAction(state, ctx, player, ActionType.KONG, tile, meld.tiles)
  emit(state, ctx, { type: 'claim_kong', playerId: player.id, targetPlayerId: from.id, tile, tiles: meld.tiles })
  afterKong(state, player, kongId, ctx)
}

// ----- own-turn kongs -----

function concealedKong(state: GameState, player: Player, tileIds: string[], ctx: EngineContext) {
  if (state.wall.length === 0) fail('wall_empty', 'No tiles left to draw after a kong')
  if ((player.hand.concealedTiles.length - 2) % 3 !== 0) fail('cannot_kong', 'You have to draw before declaring a kong')
  let group: Tile[] | undefined
  if (tileIds.length > 0) {
    const first = findTileById(player.hand.concealedTiles, tileIds[0]!)
    if (first) group = player.hand.concealedTiles.filter(t => tilesEqual(t, first))
  } else {
    group = concealedKongOptions(player)[0]
  }
  if (!group || group.length !== 4) fail('bad_kong', 'You need four identical tiles for a concealed kong')
  if (player.handLocked && !group.some(t => t.id === player.lastDrawnTileId)) {
    fail('hand_locked', 'After winning you may only kong with the tile you just drew')
  }
  for (const t of group) player.hand.concealedTiles = removeTile(player.hand.concealedTiles, t.id)
  const meld: Meld = { type: MeldType.CONCEALED_KONG, tiles: group, isConcealed: true, fromPlayerId: null, kongKind: 'concealed' }
  player.hand.exposedMelds.push(meld)
  const kongId = randomUUID()
  const points = 2 * state.rules.baseScore
  for (const payer of activePlayers(state)) {
    if (payer.id === player.id) continue
    addLedger(state, ctx, 'kong_concealed', payer, player, points, `Concealed kong ${tileLabel(group[0]!)}`, kongId)
    player.rainScore += points
  }
  state.pristine = false
  recordAction(state, ctx, player, ActionType.CONCEALED_KONG, undefined, group)
  emit(state, ctx, { type: 'kong_concealed', playerId: player.id, tiles: group })
  afterKong(state, player, kongId, ctx)
}

function extendedKong(state: GameState, player: Player, tileId: string, ctx: EngineContext) {
  if (state.wall.length === 0) fail('wall_empty', 'No tiles left to draw after a kong')
  if ((player.hand.concealedTiles.length - 2) % 3 !== 0) fail('cannot_kong', 'You have to draw before declaring a kong')
  const tile = findTileById(player.hand.concealedTiles, tileId) ?? extendedKongOptions(player)[0]
  if (!tile) fail('bad_kong', 'No matching exposed pung to extend')
  const meldIndex = player.hand.exposedMelds.findIndex(m => m.type === MeldType.TRIPLET && tilesEqual(m.tiles[0]!, tile))
  if (meldIndex === -1) fail('bad_kong', 'No matching exposed pung to extend')
  if (player.handLocked && tile.id !== player.lastDrawnTileId) {
    fail('hand_locked', 'After winning you may only kong with the tile you just drew')
  }

  player.hand.concealedTiles = removeTile(player.hand.concealedTiles, tile.id)
  recordAction(state, ctx, player, ActionType.EXTENDED_KONG, tile)

  // robbing the kong: anyone who can win on this tile may rob the kong.
  const claims: ClaimOption[] = []
  for (const other of activePlayers(state)) {
    if (other.id === player.id) continue
    const fan = fanIfWin(state, other, tile, { ...NO_FLAGS, robbingKong: true })
    if (fan !== null && !blockedByPassedHu(state, other, tile, fan)) {
      claims.push({ playerId: other.id, options: [ActionType.HU, ActionType.PASS], response: null, huFan: fan })
    }
  }
  if (claims.length === 0) {
    completeExtendedKong(state, player, tile, meldIndex, ctx)
    return
  }
  state.claimWindow = {
    kind: 'kong_rob',
    tile,
    fromPlayerId: player.id,
    claims,
    deadline: state.rules.claimSeconds > 0 ? ctx.now + state.rules.claimSeconds * 1000 : null,
    meldIndex
  }
  state.turnDeadline = null
  emit(state, ctx, { type: 'kong_extended', playerId: player.id, tile, payload: { pendingRob: true } })
  autoRespondClaims(state, ctx)
}

function completeExtendedKong(state: GameState, player: Player, tile: Tile, meldIndex: number, ctx: EngineContext) {
  const meld = player.hand.exposedMelds[meldIndex]!
  meld.type = MeldType.KONG
  meld.kongKind = 'extended'
  meld.tiles = [...meld.tiles, tile]
  const kongId = randomUUID()
  const points = 1 * state.rules.baseScore
  for (const payer of activePlayers(state)) {
    if (payer.id === player.id) continue
    addLedger(state, ctx, 'kong_extended', payer, player, points, `Added kong ${tileLabel(tile)}`, kongId)
    player.windScore += points
  }
  state.pristine = false
  state.currentPlayerIndex = player.position
  emit(state, ctx, { type: 'kong_extended', playerId: player.id, tile, tiles: meld.tiles })
  afterKong(state, player, kongId, ctx)
}

/** Replacement draw after any kong. */
function afterKong(state: GameState, player: Player, kongId: string, ctx: EngineContext) {
  state.lastKong = { playerId: player.id, kongId, replacementDrawn: false, replacementTileId: null }
  state.currentPlayerIndex = player.position
  if (state.wall.length === 0) {
    endHand(state, GameEndReason.WALL_EXHAUSTED, ctx)
    return
  }
  const tile = state.wall.pop()!
  player.hand.concealedTiles = sortTiles([...player.hand.concealedTiles, tile])
  player.lastDrawnTileId = tile.id
  player.drawCount++
  state.lastKong.replacementDrawn = true
  state.lastKong.replacementTileId = tile.id
  setTurnDeadline(state, ctx, player)
  emit(state, ctx, { type: 'tile_drawn', playerId: player.id, tile, payload: { replacement: true } })
  emit(state, ctx, { type: 'turn', playerId: player.id })
}

// ----- wins -----

function selfDrawWin(state: GameState, player: Player, ctx: EngineContext) {
  if (!player.lastDrawnTileId) fail('no_draw', 'You can only declare a win on a drawn tile')
  const tile = findTileById(player.hand.concealedTiles, player.lastDrawnTileId)
  if (!tile) fail('no_draw', 'Drawn tile missing')
  const flags: WinFlags = {
    ...NO_FLAGS,
    selfDrawn: true,
    kongFlower: !!state.lastKong && state.lastKong.playerId === player.id && state.lastKong.replacementTileId === tile.id,
    lastTile: state.wall.length === 0,
    heaven: player.isDealer && player.drawCount === 0 && state.pristine && state.discardPile.length === 0,
    earth: !player.isDealer && player.drawCount === 1 && state.pristine && player.hand.discardedTiles.length === 0
  }
  const concealed = player.hand.concealedTiles
  // Validate before mutating anything.
  if (!checkWin(concealed, player.hand.exposedMelds, player.missingSuit).canWin) {
    fail('not_winning', holdsVoidSuit(player) ? 'You still hold your void suit' : 'That is not a winning hand')
  }
  settleWin(state, player, tile, null, flags, ctx)
  if ((state.phase as GamePhase) !== GamePhase.PLAYING) return

  if (player.handLocked && player.status === PlayerStatus.PLAYING) {
    // Blood River: the winning tile is discarded and play continues.
    state.lastKong = null
    discard(state, player, tile.id, ctx)
    return
  }
  advanceTurn(state, player.position, ctx)
}

/**
 * Settle a win: validates, computes fan, pays, records. For discard wins the tile is not yet
 * in the hand; for self-draws it already is.
 */
function settleWin(state: GameState, winner: Player, tile: Tile, from: Player | null, flags: WinFlags, ctx: EngineContext) {
  const concealed = from ? [...winner.hand.concealedTiles, tile] : [...winner.hand.concealedTiles]
  const check = checkWin(concealed, winner.hand.exposedMelds, winner.missingSuit)
  if (!check.canWin) fail('not_winning', 'That is not a winning hand')
  const fan = calculateFan({ concealed, exposed: winner.hand.exposedMelds, flags, rules: state.rules })

  const payers = from ? [from] : activePlayers(state).filter(p => p.id !== winner.id)
  const extraBase = flags.selfDrawn && state.rules.selfDrawBonus === 'base' ? state.rules.baseScore : 0
  let received = 0
  for (const payer of payers) {
    const amount = fan.points + extraBase
    addLedger(state, ctx, from ? 'win_discard' : 'win_self', payer, winner, amount, from ? `Discard win: ${fan.summary}` : `Self-draw win: ${fan.summary}`)
    received += amount
  }

  // kong transfer: a kong whose replacement discard is shot transfers the kong income to the winner.
  if (from && flags.kongDiscard && state.rules.kongTransfer && state.lastDiscard?.kongId) {
    const kongId = state.lastDiscard.kongId
    const income = state.ledger
      .filter(e => e.kongId === kongId && e.to === from.id && e.handNumber === state.handNumber && e.type.startsWith('kong_'))
      .reduce((sum, e) => sum + e.points, 0)
    if (income > 0 && !state.ledger.some(e => e.type === 'kong_transfer' && e.kongId === kongId)) {
      addLedger(state, ctx, 'kong_transfer', from, winner, income, 'Kong transfer', kongId)
      received += income
    }
  }

  const firstWin = winner.wins.length === 0
  if (firstWin) {
    state.winnersCount++
    winner.winOrder = state.winnersCount
    winner.winRound = state.roundNumber
    winner.winTimestamp = ctx.now
    if (!state.nextDealerId) state.nextDealerId = winner.id
  }
  winner.wonFan = Math.max(winner.wonFan, fan.totalFan)
  const record: WinRecord = {
    playerId: winner.id,
    order: winner.winOrder ?? state.winnersCount,
    handNumber: state.handNumber,
    tiles: sortTiles(concealed),
    melds: winner.hand.exposedMelds.map(m => ({ ...m, tiles: [...m.tiles] })),
    winningTile: tile,
    fromPlayerId: from?.id ?? null,
    flags,
    fan,
    pointsReceived: received,
    at: ctx.now
  }
  winner.wins.push(record)
  state.pristine = false

  if (state.rules.bloodRiver) {
    winner.handLocked = true
    winner.isTing = true
    // Discard wins: the tile is not taken into a locked hand.
  } else {
    winner.status = PlayerStatus.WON
    winner.isTing = true
    if (from) winner.hand.concealedTiles = sortTiles(concealed)
  }

  recordAction(state, ctx, winner, ActionType.HU, tile)
  emit(state, ctx, {
    type: 'hu',
    playerId: winner.id,
    targetPlayerId: from?.id,
    tile,
    points: received,
    label: fan.summary,
    payload: { selfDrawn: flags.selfDrawn, fan: fan.totalFan, order: record.order }
  })

  if (!state.rules.bloodRiver) {
    const remaining = activePlayers(state).length
    if (remaining <= 1) {
      endHand(state, remaining === 0 ? GameEndReason.ALL_WON : GameEndReason.LAST_PLAYER, ctx)
    }
  }
}

function cheatWin(state: GameState, player: Player, ctx: EngineContext) {
  // Admin testing shortcut: counts as a 0-fan self-draw and ignores hand shape.
  const payers = activePlayers(state).filter(p => p.id !== player.id)
  let received = 0
  for (const payer of payers) {
    addLedger(state, ctx, 'cheat', payer, player, state.rules.baseScore, 'Admin test win')
    received += state.rules.baseScore
  }
  state.customScoringMode = 'cheat'
  if (player.wins.length === 0) {
    state.winnersCount++
    player.winOrder = state.winnersCount
    player.winRound = state.roundNumber
    player.winTimestamp = ctx.now
    if (!state.nextDealerId) state.nextDealerId = player.id
  }
  player.wins.push({
    playerId: player.id,
    order: player.winOrder!,
    handNumber: state.handNumber,
    tiles: [...player.hand.concealedTiles],
    melds: [...player.hand.exposedMelds],
    winningTile: player.hand.concealedTiles[player.hand.concealedTiles.length - 1] ?? { suit: TileSuit.CHARACTERS, value: 1, id: 'cheat' },
    fromPlayerId: null,
    flags: { ...NO_FLAGS, selfDrawn: true },
    fan: { handType: { key: 'cheat', name: 'Admin test win', english: 'Admin test win', fan: 0 }, extras: [], rawFan: 0, totalFan: 0, capped: false, points: state.rules.baseScore, summary: 'Admin test win' },
    pointsReceived: received,
    at: ctx.now
  })
  player.status = state.rules.bloodRiver ? PlayerStatus.PLAYING : PlayerStatus.WON
  player.handLocked = state.rules.bloodRiver
  recordAction(state, ctx, player, ActionType.CHEAT_HU)
  emit(state, ctx, { type: 'hu', playerId: player.id, points: received, label: 'Admin test win', payload: { selfDrawn: true, fan: 0, cheat: true } })
  if (!state.rules.bloodRiver && activePlayers(state).length <= 1) {
    endHand(state, GameEndReason.LAST_PLAYER, ctx)
    return
  }
  advanceTurn(state, player.position, ctx)
}

// ----- turn flow -----

function advanceTurn(state: GameState, fromPosition: number, ctx: EngineContext) {
  if (state.phase !== GamePhase.PLAYING) return
  const next = seatAfter(state, fromPosition, p => p.status === PlayerStatus.PLAYING)
  if (!next) {
    endHand(state, GameEndReason.ALL_WON, ctx)
    return
  }
  if (state.wall.length === 0) {
    endHand(state, GameEndReason.WALL_EXHAUSTED, ctx)
    return
  }
  const tile = state.wall.pop()!
  next.hand.concealedTiles = sortTiles([...next.hand.concealedTiles, tile])
  next.lastDrawnTileId = tile.id
  next.passedHu = null
  next.drawCount++
  state.currentPlayerIndex = next.position
  state.lastKong = null
  setTurnDeadline(state, ctx, next)
  emit(state, ctx, { type: 'tile_drawn', playerId: next.id, tile })
  emit(state, ctx, { type: 'turn', playerId: next.id })
}

// ----- end of hand -----

function capValue(state: GameState): number {
  const cap = state.rules.fanCap > 0 ? state.rules.fanCap : 5
  return state.rules.baseScore * Math.pow(2, cap)
}

function bestReadyFan(state: GameState, player: Player): number {
  let best = 0
  for (const kind of listeningKinds(player.hand.concealedTiles, player.hand.exposedMelds, player.missingSuit)) {
    const fan = bestFanForKind(player.hand.concealedTiles, player.hand.exposedMelds, kind, state.rules)
    if (fan && fan.totalFan > best) best = fan.totalFan
  }
  return best
}

export function endHand(state: GameState, reason: GameEndReason, ctx: EngineContext) {
  if (state.phase === GamePhase.ENDED) return
  state.claimWindow = null
  state.turnDeadline = null

  const losers = nonWinners(state)
  if (reason === GameEndReason.WALL_EXHAUSTED && losers.length >= 2) {
    const isPig = (p: Player) => suitsInHand(p.hand.concealedTiles, p.hand.exposedMelds).size === 3 || holdsVoidSuit(p)
    const pigs = losers.filter(isPig)
    const ready = losers.filter(p => !isPig(p) && listeningKinds(p.hand.concealedTiles, p.hand.exposedMelds, p.missingSuit).length > 0)
    const notReady = losers.filter(p => !isPig(p) && !ready.includes(p))

    // flower pig penalty
    for (const pig of pigs) {
      const amount = state.rules.flowerPigPenalty === 'flat48' ? 16 * state.rules.baseScore : capValue(state)
      for (const other of losers) {
        if (other.id === pig.id || pigs.includes(other)) continue
        addLedger(state, ctx, 'flower_pig', pig, other, amount, 'Flower pig penalty')
      }
    }
    // not-ready penalty: pigs are not ready either, so they pay too.
    for (const payer of [...notReady, ...pigs]) {
      for (const tingPlayer of ready) {
        const fan = bestReadyFan(state, tingPlayer)
        const amount = state.rules.baseScore * Math.pow(2, fan)
        addLedger(state, ctx, 'not_ready', payer, tingPlayer, amount, 'Not-ready penalty')
      }
    }
    // kong refund: players who were not ready give back kong income.
    for (const payer of [...notReady, ...pigs]) {
      const incomes = state.ledger.filter(e => e.handNumber === state.handNumber && e.to === payer.id && e.type.startsWith('kong_') && e.type !== 'kong_refund')
      for (const income of incomes) {
        addLedger(state, ctx, 'kong_refund', payer, playerById(state, income.from), income.points, 'Kong refund', income.kongId)
      }
    }
  }

  // Hand scores from the ledger (single source of truth).
  const scores: Record<string, number> = {}
  for (const p of state.players) scores[p.id] = 0
  for (const e of state.ledger) {
    if (e.handNumber !== state.handNumber) continue
    scores[e.from] = (scores[e.from] ?? 0) - e.points
    scores[e.to] = (scores[e.to] ?? 0) + e.points
  }
  for (const p of state.players) {
    p.score = scores[p.id] ?? 0
    p.sessionScore += p.score
    state.sessionScores[p.id] = (state.sessionScores[p.id] ?? 0) + p.score
    if (p.wins.length > 0) p.status = PlayerStatus.WON
    else if (p.status === PlayerStatus.PLAYING) p.status = PlayerStatus.LOST
    refreshTing(p)
  }

  state.finalScores = scores
  state.endReason = reason
  state.endedAt = ctx.now
  state.lastActionTime = ctx.now
  state.phase = GamePhase.ENDED
  state.handHistory.push({
    handNumber: state.handNumber,
    endReason: reason,
    dealerId: state.players[state.dealerIndex]?.id ?? '',
    scores,
    wins: state.players.flatMap(p => p.wins),
    ledger: state.ledger.filter(e => e.handNumber === state.handNumber),
    endedAt: ctx.now,
    durationMs: Math.max(0, ctx.now - (state.handStartedAt ?? ctx.now))
  })
  if (state.handHistory.length > 50) state.handHistory.splice(0, state.handHistory.length - 50)
  emit(state, ctx, { type: 'hand_ended', payload: { reason, scores } })
}

/** Force-end a hand (host left for good, room emptied). */
export function abortHand(state: GameState, reason: GameEndReason, ctx: EngineContext) {
  if (state.phase === GamePhase.WAITING) {
    state.phase = GamePhase.ENDED
    state.endReason = reason
    state.endedAt = ctx.now
    return
  }
  if (state.phase === GamePhase.ENDED) {
    state.endReason = reason
    return
  }
  if (state.phase !== GamePhase.PLAYING) {
    // Setup phases: nothing scored yet.
    state.phase = GamePhase.ENDED
    state.endReason = reason
    state.endedAt = ctx.now
    state.claimWindow = null
    state.turnDeadline = null
    for (const p of state.players) p.status = p.wins.length ? PlayerStatus.WON : PlayerStatus.LOST
    emit(state, ctx, { type: 'hand_ended', payload: { reason, scores: {} } })
    return
  }
  endHand(state, reason, ctx)
}

// ---------- timers / auto play ----------

function autoDiscardTile(player: Player): Tile | null {
  const hand = player.hand.concealedTiles
  if (hand.length === 0) return null
  if (player.handLocked && player.lastDrawnTileId) return findTileById(hand, player.lastDrawnTileId) ?? null
  const pool = holdsVoidSuit(player) ? hand.filter(t => t.suit === player.missingSuit) : hand
  const counts = countTiles(hand)
  let best: Tile | null = null
  let bestScore = Infinity
  for (const tile of pool) {
    const same = counts.get(tileKey(tile)) ?? 0
    const left = counts.get(`${tile.suit}-${tile.value - 1}`) ?? 0
    const right = counts.get(`${tile.suit}-${tile.value + 1}`) ?? 0
    const far = (counts.get(`${tile.suit}-${tile.value - 2}`) ?? 0) + (counts.get(`${tile.suit}-${tile.value + 2}`) ?? 0)
    const edge = tile.value === 1 || tile.value === 9 ? -0.5 : 0
    const score = same * 3 + (left + right) * 1.5 + far * 0.5 + edge
    if (score < bestScore) {
      bestScore = score
      best = tile
    }
  }
  return best
}

/** Apply any expired deadline. Returns true when the state changed. */
export function tick(state: GameState, ctx: EngineContext): boolean {
  let changed = false

  if (state.phase === GamePhase.EXCHANGING && state.turnDeadline !== null && ctx.now >= state.turnDeadline) {
    for (const p of state.players) {
      if (p.exchangeSubmitted) continue
      const pickTiles = suggestExchange(p.hand.concealedTiles)
      if (pickTiles) {
        submitExchange(state, p.id, pickTiles.map(t => t.id), ctx)
        emit(state, ctx, { type: 'timeout', playerId: p.id, label: 'exchange' })
        changed = true
      }
      if ((state.phase as GamePhase) !== GamePhase.EXCHANGING) break
    }
    return changed
  }

  if (state.phase === GamePhase.CHOOSING_SUIT && state.turnDeadline !== null && ctx.now >= state.turnDeadline) {
    for (const p of state.players) {
      if (p.missingSuit) continue
      chooseSuit(state, p.id, suggestVoidSuit(p.hand.concealedTiles), ctx)
      emit(state, ctx, { type: 'timeout', playerId: p.id, label: 'suit' })
      changed = true
      if ((state.phase as GamePhase) !== GamePhase.CHOOSING_SUIT) break
    }
    return changed
  }

  if (state.phase !== GamePhase.PLAYING) return false

  if (state.claimWindow) {
    if (state.claimWindow.deadline !== null && ctx.now >= state.claimWindow.deadline) {
      for (const claim of state.claimWindow.claims) {
        if (claim.response !== null) continue
        const player = playerById(state, claim.playerId)
        claim.response = claim.options.includes(ActionType.HU) && player.autoPlay ? ActionType.HU : ActionType.PASS
        if (claim.response === ActionType.PASS && claim.options.includes(ActionType.HU) && claim.huFan !== undefined) {
          player.passedHu = { key: tileKey(state.claimWindow.tile), fan: claim.huFan }
        }
        emit(state, ctx, { type: 'timeout', playerId: player.id, label: 'claim' })
      }
      resolveClaims(state, ctx)
      return true
    }
    return false
  }

  if (state.turnDeadline !== null && ctx.now >= state.turnDeadline) {
    const player = currentPlayer(state)
    player.autoPlay = true
    emit(state, ctx, { type: 'timeout', playerId: player.id, label: 'turn' })
    const actions = availableActions(state, player.id)
    if (actions.includes(ActionType.HU)) {
      selfDrawWin(state, player, ctx)
      return true
    }
    if (actions.includes(ActionType.DISCARD)) {
      const tile = autoDiscardTile(player)
      if (tile) {
        discard(state, player, tile.id, ctx)
        return true
      }
    }
    // Nothing legal to do automatically; move on defensively.
    state.turnDeadline = null
    return true
  }
  return false
}

export function nextDeadline(state: GameState): number | null {
  if (state.claimWindow?.deadline) return state.claimWindow.deadline
  return state.turnDeadline
}

// ---------- queries ----------

export function concealedKongOptions(player: Player): Tile[][] {
  const options: Tile[][] = []
  for (const group of groupTiles(player.hand.concealedTiles).values()) {
    if (group.length === 4) {
      if (player.handLocked && !group.some(t => t.id === player.lastDrawnTileId)) continue
      options.push(group)
    }
  }
  return options
}

export function extendedKongOptions(player: Player): Tile[] {
  const options: Tile[] = []
  for (const meld of player.hand.exposedMelds) {
    if (meld.type !== MeldType.TRIPLET) continue
    const match = player.hand.concealedTiles.find(t => tilesEqual(t, meld.tiles[0]!))
    if (!match) continue
    if (player.handLocked && match.id !== player.lastDrawnTileId) continue
    options.push(match)
  }
  return options
}

export function availableActions(state: GameState, playerId: string): ActionType[] {
  const player = state.players.find(p => p.id === playerId)
  if (!player) return []

  if (state.phase === GamePhase.EXCHANGING) return player.exchangeSubmitted ? [] : [ActionType.EXCHANGE_TILES]
  if (state.phase === GamePhase.CHOOSING_SUIT) return player.missingSuit ? [] : [ActionType.CHOOSE_SUIT]
  if (state.phase !== GamePhase.PLAYING || player.status !== PlayerStatus.PLAYING) return []

  if (state.claimWindow) {
    const claim = state.claimWindow.claims.find(c => c.playerId === player.id)
    return claim && claim.response === null ? [...claim.options] : []
  }

  if (currentPlayer(state).id !== player.id) return []
  const actions: ActionType[] = []
  const handSize = player.hand.concealedTiles.length
  const hasExtraTile = (handSize - 2) % 3 === 0
  if (!hasExtraTile) return actions

  actions.push(ActionType.DISCARD)
  if (player.lastDrawnTileId && checkWin(player.hand.concealedTiles, player.hand.exposedMelds, player.missingSuit).canWin) {
    actions.push(ActionType.HU)
  }
  if (state.wall.length > 0) {
    if (concealedKongOptions(player).length > 0) actions.push(ActionType.CONCEALED_KONG)
    if (extendedKongOptions(player).length > 0) actions.push(ActionType.EXTENDED_KONG)
  }
  return actions
}

export function mustDiscardSuit(player: Player): TileSuit | null {
  return holdsVoidSuit(player) ? player.missingSuit : null
}
