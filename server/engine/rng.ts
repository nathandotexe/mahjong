/**
 * Small seedable PRNG (mulberry32) so tests can replay deterministic deals.
 * Production uses Math.random-backed entropy via `createRng()` with no seed.
 */
export type Rng = () => number

export function createRng(seed?: number): Rng {
  if (seed === undefined) {
    return Math.random
  }
  let a = seed >>> 0
  return function () {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]!
}
