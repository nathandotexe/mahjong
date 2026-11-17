/**
 * Shared game types used by both the Nitro server engine and the Vue client.
 * Server-only files re-export from here so existing import paths keep working.
 */

// ---------- Tiles ----------

export enum TileSuit {
  DOTS = 'dots',      
  CHARACTERS = 'wan', 
  BAMBOOS = 'tiao'   
}

export const ALL_SUITS: TileSuit[] = [TileSuit.DOTS, TileSuit.CHARACTERS, TileSuit.BAMBOOS]

export interface Tile {
  suit: TileSuit
  value: number // 1-9
  id: string    // Unique identifier for each physical tile
}

// ---------- Melds ----------

export enum MeldType {
  SEQUENCE = 'sequence',             // (only appears inside winning-hand decompositions)
  TRIPLET = 'triplet',               //
  KONG = 'kong',                     //
  CONCEALED_KONG = 'concealed_kong', //
  PAIR = 'pair'                      //
}

export interface Meld {
  type: MeldType
  tiles: Tile[]
  isConcealed: boolean
  /** Seat id of the player whose discard supplied the claimed tile (peng / direct kong). */
  fromPlayerId?: string | null
  /** Hand-level meld subtype for display: 'direct' | 'extended' | 'concealed'. */
  kongKind?: 'direct' | 'extended' | 'concealed' | null
}

export interface PlayerHand {
  concealedTiles: Tile[]
  exposedMelds: Meld[]
  discardedTiles: Tile[]
}

// ---------- Players ----------

export enum PlayerStatus {
  WAITING = 'waiting',
  PLAYING = 'playing',
  WON = 'won',
  LOST = 'lost'
}

export interface WinFlags {
  selfDrawn: boolean
  kongFlower: boolean   // 
  kongDiscard: boolean  // 
  robbingKong: boolean  // 
  lastTile: boolean     //
  heaven: boolean       //
  earth: boolean        // 
}

export interface FanItem {
  key: string
  name: string   // Chinese
  english: string
  fan: number
}

export interface FanCalculation {
  handType: FanItem          // the single highest-valued hand pattern
  extras: FanItem[]          // additive bonuses (roots, self-draw, kong flower, ...)
  rawFan: number
  totalFan: number           // after cap
  capped: boolean
  points: number             // 2^totalFan × base (per payer, before self-draw base bonus)
  summary: string            //
}

export interface WinRecord {
  playerId: string
  order: number              // 1 = first winner of the hand
  handNumber: number
  tiles: Tile[]              // full concealed hand including the winning tile
  melds: Meld[]
  winningTile: Tile
  fromPlayerId: string | null  // discarder, or null when self-drawn
  flags: WinFlags
  fan: FanCalculation
  pointsReceived: number
  at: number
}

export interface Player {
  id: string                 // seat id (stable for the life of the room)
  userId: string             // account id (session-bound)
  name: string
  avatar?: string | null
  position: number           // 0-3, seat order
  isHost: boolean
  hand: PlayerHand
  status: PlayerStatus
  isDealer: boolean
  isTing: boolean
  missingSuit: TileSuit | null   // declared void suit (void suit)
  windScore: number          // kong income this hand (legacy display)
  rainScore: number          // concealed-kong income this hand (legacy display)
  wonFan: number
  winOrder: number | null
  winRound: number | null
  winTimestamp: number | null
  score: number              // this hand
  sessionScore: number       // cumulative across hands
  wins: WinRecord[]          // this hand (more than one in Blood River)
  handLocked: boolean        // Blood River: already won, hand fixed
  lastDrawnTileId: string | null
  passedHu: { key: string; fan: number } | null   // passed-win lock guard
  drawCount: number          // draws this hand (for Earthly Hand)
  exchangeSubmitted: boolean
  connected: boolean
  lastSeenAt: number
  autoPlay: boolean          // auto-play after a timeout or while away
  isBot: boolean             // seat filler that always auto-plays
}

// ---------- Actions ----------

export enum ActionType {
  DRAW = 'draw',
  DISCARD = 'discard',
  PENG = 'peng',
  KONG = 'kong',                      // direct kong from a discard
  EXTENDED_KONG = 'extended_kong',    // 
  CONCEALED_KONG = 'concealed_kong',  // 
  HU = 'hu',
  PASS = 'pass',
  CHEAT_HU = 'cheat_hu',
  EXCHANGE_TILES = 'exchange_tiles',  // 
  CHOOSE_SUIT = 'choose_suit'         // 
}

export interface GameAction {
  playerId: string
  type: ActionType
  tile?: Tile
  tiles?: Tile[]
  timestamp: number
}

export enum WinType {
  STANDARD = 'standard',
  SEVEN_PAIRS = 'seven_pairs'
}

// ---------- Rules ----------

export type RulePreset = 'standard' | 'mil'

export interface RuleConfig {
  preset: RulePreset
  /** 0 = no cap */
  fanCap: 0 | 3 | 4 | 5
  selfDrawBonus: 'fan' | 'base'
  exchangeThree: boolean      // 
  bloodRiver: boolean         // (winners keep playing)
  passedHuRule: boolean       // 
  kongTransfer: boolean       // 
  flowerPigPenalty: 'cap' | 'flat48'
  turnSeconds: number         // 0 = no timer
  claimSeconds: number        // 0 = no timer
  baseScore: number
}

export const DEFAULT_RULES: RuleConfig = {
  preset: 'standard',
  fanCap: 4,
  selfDrawBonus: 'fan',
  exchangeThree: true,
  bloodRiver: false,
  passedHuRule: true,
  kongTransfer: true,
  flowerPigPenalty: 'cap',
  turnSeconds: 20,
  claimSeconds: 8,
  baseScore: 1
}

export const MIL_RULES: RuleConfig = {
  ...DEFAULT_RULES,
  preset: 'mil',
  fanCap: 3,
  selfDrawBonus: 'base',
  exchangeThree: false,
  flowerPigPenalty: 'flat48'
}

// ---------- Scoring ledger ----------

export type ScoreEventType =
  | 'kong_direct'
  | 'kong_concealed'
  | 'kong_extended'
  | 'win_discard'
  | 'win_self'
  | 'kong_transfer'
  | 'kong_refund'
  | 'flower_pig'
  | 'not_ready'
  | 'cheat'

export interface ScoreEvent {
  id: string
  handNumber: number
  type: ScoreEventType
  from: string       // payer seat id
  to: string         // receiver seat id
  points: number
  label: string
  /** For kong events: the originating kong event id (used for refunds / transfers). */
  kongId?: string
  at: number
}

// ---------- Claims ----------

export interface ClaimOption {
  playerId: string
  options: ActionType[]       // subset of HU / KONG / PENG, always plus PASS
  response: ActionType | null
  huFan?: number              // fan the player would score by winning (for passed-win lock bookkeeping)
}

export interface ClaimWindow {
  kind: 'discard' | 'kong_rob'
  tile: Tile
  fromPlayerId: string
  claims: ClaimOption[]
  deadline: number | null
  /** For kong_rob: the triplet index being extended, so it can be completed or cancelled. */
  meldIndex?: number
}

// ---------- Game ----------

export enum GamePhase {
  WAITING = 'waiting',
  EXCHANGING = 'exchanging',       // 
  CHOOSING_SUIT = 'choosing_suit', // 
  PLAYING = 'playing',
  ENDED = 'ended'
}

export enum GameEndReason {
  WALL_EXHAUSTED = 'wall_exhausted',
  LAST_PLAYER = 'last_player',
  ALL_WON = 'all_won',
  OWNER_LEFT = 'owner_left',
  EMPTY_ROOM = 'empty_room',
  CHEAT = 'cheat'
}

export type ExchangeDirection = 'clockwise' | 'anticlockwise' | 'across'

export interface ExchangeState {
  direction: ExchangeDirection | null
  submissions: Record<string, Tile[]>   // seat id -> three tiles
  received: Record<string, Tile[]>      // seat id -> three tiles received (after reveal)
}

export interface LastDiscard {
  tile: Tile
  playerId: string
  seq: number
  /** Discarded right after a kong replacement draw. */
  afterKong: boolean
  kongId: string | null
  /** Discarded after the wall ran out. */
  isLastTile: boolean
}

export interface HandSummary {
  handNumber: number
  endReason: GameEndReason
  dealerId: string
  scores: Record<string, number>
  wins: WinRecord[]
  ledger: ScoreEvent[]
  endedAt: number
  durationMs: number
}

export interface GameState {
  gameId: string
  code: string                 // short shareable room code
  hostId: string               // user id of the host
  phase: GamePhase
  endReason: GameEndReason | null
  rules: RuleConfig
  players: Player[]
  wall: Tile[]
  currentPlayerIndex: number
  dealerIndex: number
  discardPile: Tile[]
  actionHistory: GameAction[]
  winnersCount: number
  roundNumber: number
  handNumber: number
  createdAt: number
  lastActionTime: number
  handStartedAt: number | null
  endedAt?: number
  finalScores?: Record<string, number>
  sessionScores: Record<string, number>
  ledger: ScoreEvent[]
  handHistory: HandSummary[]
  claimWindow: ClaimWindow | null
  exchange: ExchangeState | null
  lastDiscard: LastDiscard | null
  /** Set while a kong's replacement tile is "live". */
  lastKong: { playerId: string; kongId: string; replacementDrawn: boolean; replacementTileId: string | null } | null
  turnDeadline: number | null
  /** No claim has happened yet this hand. */
  pristine: boolean
  /** Seat id of the player who deals the next hand (first winner / shooter). */
  nextDealerId: string | null
  /** Monotonic counter used to sequence discards and events. */
  eventSeq: number
  /** Monotonic counter for optimistic concurrency when persisting. */
  version: number
  /** Legacy field kept for persisted documents; always empty in new games. */
  pendingActions: PendingAction[]
  customScoringMode?: 'cheat' | null
  /** Last few events (unmasked), so polling clients can replay what they missed. */
  recentEvents?: GameEvent[]
}

/** @deprecated kept for backwards-compatible persisted documents */
export interface PendingAction {
  playerId: string
  availableActions: ActionType[]
  tile?: Tile
  expiresAt: number
}

// ---------- Client view ----------

export interface ListeningTile {
  suit: TileSuit
  value: number
  remaining: number
  fan: number
  summary: string
}

export interface GameEvent {
  id: number
  type:
    | 'hand_started'
    | 'exchange_revealed'
    | 'suit_chosen'
    | 'tile_drawn'
    | 'tile_discarded'
    | 'claim_peng'
    | 'claim_kong'
    | 'claim_hu'
    | 'kong_concealed'
    | 'kong_extended'
    | 'kong_robbed'
    | 'hu'
    | 'score'
    | 'turn'
    | 'timeout'
    | 'hand_ended'
    | 'player_joined'
    | 'player_left'
    | 'player_connected'
    | 'player_disconnected'
    | 'chat'
  playerId?: string
  targetPlayerId?: string
  tile?: Tile | null
  tiles?: Tile[]
  points?: number
  label?: string
  payload?: Record<string, unknown>
  at: number
}

export interface PlayerView extends Omit<Player, 'hand'> {
  hand: PlayerHand
  handCount: number
  isSelf: boolean
}

export interface GameView {
  gameId: string
  code: string
  hostId: string
  phase: GamePhase
  endReason: GameEndReason | null
  rules: RuleConfig
  players: PlayerView[]
  viewerPlayerId: string | null
  isHost: boolean
  isAdmin: boolean
  wallCount: number
  currentPlayerIndex: number
  dealerIndex: number
  discardPile: Tile[]
  winnersCount: number
  roundNumber: number
  handNumber: number
  sessionScores: Record<string, number>
  ledger: ScoreEvent[]
  handHistory: HandSummary[]
  claimWindow: (Omit<ClaimWindow, 'claims'> & { pending: string[]; mine: ClaimOption | null }) | null
  exchange: { direction: ExchangeDirection | null; submitted: string[]; mine: Tile[] | null; received: Tile[] | null } | null
  lastDiscard: LastDiscard | null
  turnDeadline: number | null
  availableActions: ActionType[]
  listening: ListeningTile[]
  concealedKongOptions: Tile[][]
  extendedKongOptions: Tile[]
  mustDiscardSuit: TileSuit | null
  finalScores?: Record<string, number>
  version: number
  serverTime: number
}