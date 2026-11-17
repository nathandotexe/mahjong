import { MeldType, WinType, type Meld, type Tile, type TileSuit } from '../../shared/types/game'
import { allTileKinds, countTiles, groupTiles, sortTiles, tileKey, tilesEqual } from './tiles'

export interface Decomposition {
  winType: WinType
  melds: Meld[]        // concealed part only: triplets / sequences / pair(s)
  pair: Tile[]
}

/**
 * Try to split `tiles` into `n` melds (triplets or sequences). Returns the melds or null.
 * Works on sorted input; the smallest tile must start either a triplet or a sequence.
 */
function splitMelds(tiles: Tile[], n: number): Meld[] | null {
  if (n === 0) return tiles.length === 0 ? [] : null
  if (tiles.length !== n * 3) return null

  const sorted = sortTiles(tiles)
  const first = sorted[0]!

  // Triplet
  const same = sorted.filter(t => tilesEqual(t, first))
  if (same.length >= 3) {
    const remaining = [...sorted]
    for (let i = 0; i < 3; i++) remaining.splice(remaining.findIndex(t => t.id === same[i]!.id), 1)
    const rest = splitMelds(remaining, n - 1)
    if (rest) return [{ type: MeldType.TRIPLET, tiles: same.slice(0, 3), isConcealed: true }, ...rest]
  }

  // Sequence
  if (first.value <= 7) {
    const second = sorted.find(t => t.suit === first.suit && t.value === first.value + 1)
    const third = sorted.find(t => t.suit === first.suit && t.value === first.value + 2)
    if (second && third) {
      const remaining = [...sorted]
      for (const tile of [first, second, third]) remaining.splice(remaining.findIndex(t => t.id === tile.id), 1)
      const rest = splitMelds(remaining, n - 1)
      if (rest) return [{ type: MeldType.SEQUENCE, tiles: [first, second, third], isConcealed: true }, ...rest]
    }
  }

  return null
}

/** All distinct standard decompositions (one per candidate pair kind that works). */
export function decomposeStandard(tiles: Tile[], exposedMeldCount: number): Decomposition[] {
  const required = 4 - exposedMeldCount
  if (tiles.length !== required * 3 + 2) return []

  const results: Decomposition[] = []
  const groups = groupTiles(tiles)
  for (const group of groups.values()) {
    if (group.length < 2) continue
    const pair = [group[0]!, group[1]!]
    const remaining = tiles.filter(t => t.id !== pair[0]!.id && t.id !== pair[1]!.id)
    const melds = splitMelds(remaining, required)
    if (melds) {
      results.push({
        winType: WinType.STANDARD,
        melds: [...melds, { type: MeldType.PAIR, tiles: pair, isConcealed: true }],
        pair
      })
    }
  }
  return results
}

export function decomposeSevenPairs(tiles: Tile[], exposedMeldCount: number): Decomposition | null {
  if (exposedMeldCount > 0 || tiles.length !== 14) return null
  const groups = groupTiles(tiles)
  const melds: Meld[] = []
  for (const group of groups.values()) {
    if (group.length % 2 !== 0) return null
    for (let i = 0; i < group.length; i += 2) {
      melds.push({ type: MeldType.PAIR, tiles: [group[i]!, group[i + 1]!], isConcealed: true })
    }
  }
  if (melds.length !== 7) return null
  return { winType: WinType.SEVEN_PAIRS, melds, pair: [] }
}

export interface WinCheck {
  canWin: boolean
  decompositions: Decomposition[]
  reason?: 'void_suit' | 'shape'
}

/**
 * Can this concealed hand (14 - 3×melds tiles, winning tile included) win?
 * `voidSuit` enforces void suit: no tile of the void suit may remain in the concealed hand.
 */
export function checkWin(tiles: Tile[], exposedMelds: Meld[], voidSuit: TileSuit | null): WinCheck {
  if (voidSuit && tiles.some(t => t.suit === voidSuit)) {
    return { canWin: false, decompositions: [], reason: 'void_suit' }
  }
  const decompositions = decomposeStandard(tiles, exposedMelds.length)
  const seven = decomposeSevenPairs(tiles, exposedMelds.length)
  if (seven) decompositions.push(seven)
  return decompositions.length > 0
    ? { canWin: true, decompositions }
    : { canWin: false, decompositions: [], reason: 'shape' }
}

export function canWin(tiles: Tile[], exposedMelds: Meld[], voidSuit: TileSuit | null): boolean {
  return checkWin(tiles, exposedMelds, voidSuit).canWin
}

/** Tile kinds that would complete the hand (hand must be one tile short). */
export function listeningKinds(tiles: Tile[], exposedMelds: Meld[], voidSuit: TileSuit | null): Tile[] {
  const expected = 13 - exposedMelds.length * 3
  if (tiles.length !== expected) return []
  if (voidSuit && tiles.some(t => t.suit === voidSuit)) return []
  const out: Tile[] = []
  for (const kind of allTileKinds()) {
    if (voidSuit && kind.suit === voidSuit) continue
    if (canWin([...tiles, kind], exposedMelds, voidSuit)) out.push(kind)
  }
  return out
}

export function isTing(tiles: Tile[], exposedMelds: Meld[], voidSuit: TileSuit | null): boolean {
  return listeningKinds(tiles, exposedMelds, voidSuit).length > 0
}

/** Number of four-of-a-kind groups (root): kongs plus quads hidden in the concealed hand. */
export function countRoots(tiles: Tile[], exposedMelds: Meld[]): number {
  let roots = 0
  for (const meld of exposedMelds) {
    if (meld.type === MeldType.KONG || meld.type === MeldType.CONCEALED_KONG) roots++
  }
  for (const count of countTiles(tiles).values()) {
    if (count === 4) roots++
  }
  // A concealed quad that matches an exposed triplet cannot exist (only 4 copies), so no double count.
  return roots
}

/** Copies of a tile kind still unseen from one player's perspective. */
export function remainingCopies(kind: Pick<Tile, 'suit' | 'value'>, visible: Tile[]): number {
  const key = tileKey(kind)
  let seen = 0
  for (const tile of visible) if (tileKey(tile) === key) seen++
  return Math.max(0, 4 - seen)
}
