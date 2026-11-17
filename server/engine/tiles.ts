import { TileSuit, ALL_SUITS, type Tile } from '../../shared/types/game'
import type { Rng } from './rng'

/** Full Sichuan deck: 3 suits × 9 values × 4 copies = 108 tiles. */
export function createDeck(): Tile[] {
  const tiles: Tile[] = []
  for (const suit of ALL_SUITS) {
    for (let value = 1; value <= 9; value++) {
      for (let copy = 0; copy < 4; copy++) {
        tiles.push({ suit, value, id: `${suit}-${value}-${copy}` })
      }
    }
  }
  return tiles
}

/** Fisher–Yates shuffle (pure: returns a new array). */
export function shuffleTiles(tiles: Tile[], rng: Rng = Math.random): Tile[] {
  const shuffled = [...tiles]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!]
  }
  return shuffled
}

export function tileKey(tile: Pick<Tile, 'suit' | 'value'>): string {
  return `${tile.suit}-${tile.value}`
}

export function tilesEqual(a: Pick<Tile, 'suit' | 'value'>, b: Pick<Tile, 'suit' | 'value'>): boolean {
  return a.suit === b.suit && a.value === b.value
}

export function findTileById(tiles: Tile[], tileId: string): Tile | undefined {
  return tiles.find(t => t.id === tileId)
}

export function removeTile(tiles: Tile[], tileId: string): Tile[] {
  const index = tiles.findIndex(t => t.id === tileId)
  if (index === -1) return tiles
  return [...tiles.slice(0, index), ...tiles.slice(index + 1)]
}

const SUIT_ORDER: Record<TileSuit, number> = {
  [TileSuit.CHARACTERS]: 0,
  [TileSuit.DOTS]: 1,
  [TileSuit.BAMBOOS]: 2
}

export function sortTiles(tiles: Tile[]): Tile[] {
  return [...tiles].sort((a, b) => {
    if (a.suit !== b.suit) return SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit]
    if (a.value !== b.value) return a.value - b.value
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

export function groupTiles(tiles: Tile[]): Map<string, Tile[]> {
  const groups = new Map<string, Tile[]>()
  for (const tile of tiles) {
    const key = tileKey(tile)
    const group = groups.get(key)
    if (group) group.push(tile)
    else groups.set(key, [tile])
  }
  return groups
}

export function countTiles(tiles: Tile[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const tile of tiles) {
    const key = tileKey(tile)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

export function getSuits(tiles: Pick<Tile, 'suit'>[]): Set<TileSuit> {
  return new Set(tiles.map(t => t.suit))
}

export function isFullFlush(tiles: Tile[]): boolean {
  return getSuits(tiles).size === 1
}

export function isTerminal(tile: Pick<Tile, 'value'>): boolean {
  return tile.value === 1 || tile.value === 9
}

export function isJiangValue(tile: Pick<Tile, 'value'>): boolean {
  return tile.value === 2 || tile.value === 5 || tile.value === 8
}

export function suitLabel(suit: TileSuit): string {
  switch (suit) {
    case TileSuit.CHARACTERS: return 'Characters'
    case TileSuit.DOTS: return 'Dots'
    case TileSuit.BAMBOOS: return 'Bamboo'
  }
}

export function tileLabel(tile: Pick<Tile, 'suit' | 'value'>): string {
  return `${tile.value} ${suitLabel(tile.suit)}`
}

/** All 27 tile kinds as pseudo tiles (ids prefixed with "kind-"). */
export function allTileKinds(): Tile[] {
  const kinds: Tile[] = []
  for (const suit of ALL_SUITS) {
    for (let value = 1; value <= 9; value++) {
      kinds.push({ suit, value, id: `kind-${suit}-${value}` })
    }
  }
  return kinds
}

/** Suits present in the hand (concealed + melds). */
export function suitsInHand(concealed: Tile[], melds: { tiles: Tile[] }[]): Set<TileSuit> {
  const suits = getSuits(concealed)
  for (const meld of melds) for (const tile of meld.tiles) suits.add(tile.suit)
  return suits
}

/** Choose the suit a player holds the fewest of (ties: fewest high-value tiles, then order). */
export function suggestVoidSuit(tiles: Tile[]): TileSuit {
  let best: TileSuit = ALL_SUITS[0]!
  let bestCount = Infinity
  for (const suit of ALL_SUITS) {
    const count = tiles.filter(t => t.suit === suit).length
    if (count < bestCount) {
      best = suit
      bestCount = count
    }
  }
  return best
}

/** Pick three tiles of one suit for swap three, preferring the suit the player has least of (but at least 3). */
export function suggestExchange(tiles: Tile[]): Tile[] | null {
  const ranked = ALL_SUITS
    .map(suit => ({ suit, tiles: tiles.filter(t => t.suit === suit) }))
    .filter(entry => entry.tiles.length >= 3)
    .sort((a, b) => a.tiles.length - b.tiles.length)
  const choice = ranked[0]
  if (!choice) return null
  // Prefer isolated tiles: sort by how many copies/neighbours they have.
  const counts = countTiles(tiles)
  const scored = choice.tiles
    .map(tile => {
      const same = counts.get(tileKey(tile)) ?? 0
      const left = counts.get(`${tile.suit}-${tile.value - 1}`) ?? 0
      const right = counts.get(`${tile.suit}-${tile.value + 1}`) ?? 0
      return { tile, score: same * 3 + left + right }
    })
    .sort((a, b) => a.score - b.score)
  return scored.slice(0, 3).map(s => s.tile)
}
