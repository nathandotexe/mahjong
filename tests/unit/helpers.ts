import {
  ActionType,
  GamePhase,
  TileSuit,
  type GameState,
  type Meld,
  type Player,
  type RuleConfig,
  type Tile
} from '../../shared/types/game'
import * as engine from '../../server/engine/engine'
import { createRng } from '../../server/engine/rng'
import { sortTiles } from '../../server/engine/tiles'

const SUIT_BY_LETTER: Record<string, TileSuit> = { m: TileSuit.CHARACTERS, p: TileSuit.DOTS, s: TileSuit.BAMBOOS }

let tileCounter = 0

/** "123m 55p 999s" → tiles (m = Characters, p = Dots, s = Bamboo). Each tile gets a unique id. */
export function tiles(notation: string): Tile[] {
  const out: Tile[] = []
  for (const group of notation.trim().split(/\s+/)) {
    if (!group) continue
    const letter = group[group.length - 1]!
    const suit = SUIT_BY_LETTER[letter]
    if (!suit) throw new Error(`Bad suit letter in ${group}`)
    for (const ch of group.slice(0, -1)) {
      out.push({ suit, value: Number(ch), id: `${suit}-${ch}-t${tileCounter++}` })
    }
  }
  return out
}

export function meld(type: Meld['type'], notation: string, extra: Partial<Meld> = {}): Meld {
  return { type, tiles: tiles(notation), isConcealed: false, fromPlayerId: null, kongKind: null, ...extra }
}

export interface Table {
  state: GameState
  ctx: engine.EngineContext
  players: Player[]
  rng: () => number
  advance(ms?: number): void
}

export function makeTable(options: { seed?: number; players?: number; rules?: Partial<RuleConfig>; start?: boolean } = {}): Table {
  const rng = createRng(options.seed ?? 1)
  const ctx = engine.createContext({ rng, now: 1_700_000_000_000 })
  const state = engine.createGame({ userId: 'u0', name: 'P0' }, { exchangeThree: false, turnSeconds: 20, claimSeconds: 8, ...options.rules }, ctx, 'TEST01')
  const count = options.players ?? 4
  for (let i = 1; i < count; i++) engine.seatPlayer(state, { userId: `u${i}`, name: `P${i}` }, ctx)
  const table: Table = {
    state,
    ctx,
    players: state.players,
    rng,
    advance(ms = 1000) {
      ctx.now += ms
    }
  }
  if (options.start !== false) {
    engine.startHand(state, ctx)
    if (state.phase === GamePhase.EXCHANGING) {
      ctx.now = state.turnDeadline! + 1
      engine.tick(state, ctx)
    }
    if (state.phase === GamePhase.CHOOSING_SUIT) {
      for (const p of state.players) {
        if (!p.missingSuit) engine.chooseSuit(state, p.id, suggestedSuit(p), ctx)
      }
    }
  }
  return table
}

function suggestedSuit(player: Player): TileSuit {
  const counts = new Map<TileSuit, number>()
  for (const t of player.hand.concealedTiles) counts.set(t.suit, (counts.get(t.suit) ?? 0) + 1)
  let best = TileSuit.CHARACTERS
  let min = Infinity
  for (const suit of [TileSuit.CHARACTERS, TileSuit.DOTS, TileSuit.BAMBOOS]) {
    const c = counts.get(suit) ?? 0
    if (c < min) {
      min = c
      best = suit
    }
  }
  return best
}

/**
 * Overwrite a player's concealed hand / melds / void suit. Tiles are swapped with the wall so
 * the 108-tile invariant still holds (the wall simply gets whatever the player had).
 */
export function setHand(table: Table, index: number, options: { hand: string; melds?: Meld[]; missingSuit?: TileSuit | null; drawn?: boolean }) {
  const player = table.players[index]!
  const newTiles = tiles(options.hand)
  // Return old tiles to the wall, remove the new ones' kinds from the wall where possible.
  table.state.wall.push(...player.hand.concealedTiles, ...player.hand.exposedMelds.flatMap(m => m.tiles))
  for (const t of newTiles) {
    const i = table.state.wall.findIndex(w => w.suit === t.suit && w.value === t.value)
    if (i !== -1) table.state.wall.splice(i, 1)
  }
  for (const m of options.melds ?? []) {
    for (const t of m.tiles) {
      const i = table.state.wall.findIndex(w => w.suit === t.suit && w.value === t.value)
      if (i !== -1) table.state.wall.splice(i, 1)
    }
  }
  player.hand.concealedTiles = sortTiles(newTiles)
  player.hand.exposedMelds = options.melds ?? []
  if (options.missingSuit !== undefined) player.missingSuit = options.missingSuit
  if (options.drawn) player.lastDrawnTileId = player.hand.concealedTiles[player.hand.concealedTiles.length - 1]!.id
}

/**
 * Put specific tiles on top of the wall (the last one listed is drawn first). Matching kinds
 * are pulled out of the existing wall so the tile count stays stable.
 */
export function setWall(table: Table, notation: string) {
  const top = tiles(notation)
  for (const t of top) {
    const i = table.state.wall.findIndex(w => w.suit === t.suit && w.value === t.value)
    if (i !== -1) table.state.wall.splice(i, 1)
  }
  table.state.wall.push(...top)
}

/** A 13-tile hand that is nowhere near ready (void suit: bamboo). */
export const NOT_READY = '1125699m 235789p'

export function setTurn(table: Table, index: number) {
  table.state.currentPlayerIndex = index
  table.state.claimWindow = null
}

export function act(table: Table, index: number, action: ActionType, payload: engine.ActionPayload = {}) {
  engine.act(table.state, table.players[index]!.id, action, payload, table.ctx)
}

export function discardKind(table: Table, index: number, notation: string) {
  const [kind] = tiles(notation)
  const player = table.players[index]!
  const tile = player.hand.concealedTiles.find(t => t.suit === kind!.suit && t.value === kind!.value)
  if (!tile) throw new Error(`Player ${index} does not hold ${notation}`)
  act(table, index, ActionType.DISCARD, { tileId: tile.id })
  return tile
}

export function scoresFromLedger(state: GameState): Record<string, number> {
  const scores: Record<string, number> = {}
  for (const p of state.players) scores[p.id] = 0
  for (const e of state.ledger) {
    if (e.handNumber !== state.handNumber) continue
    scores[e.from]! -= e.points
    scores[e.to]! += e.points
  }
  return scores
}

export function allTileIds(state: GameState): string[] {
  const ids: string[] = [...state.wall.map(t => t.id)]
  for (const p of state.players) {
    ids.push(...p.hand.concealedTiles.map(t => t.id))
    ids.push(...p.hand.exposedMelds.flatMap(m => m.tiles.map(t => t.id)))
    ids.push(...p.hand.discardedTiles.map(t => t.id))
  }
  if (state.claimWindow?.kind === 'kong_rob') ids.push(state.claimWindow.tile.id)
  return ids
}
