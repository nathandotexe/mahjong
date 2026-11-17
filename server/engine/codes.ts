import type { Rng } from './rng'

/** Unambiguous alphabet: no 0/O, 1/I/L. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function generateRoomCode(rng: Rng = Math.random, length = 6): string {
  let code = ''
  for (let i = 0; i < length; i++) {
    code += ALPHABET[Math.floor(rng() * ALPHABET.length)]
  }
  return code
}

/** Upper-case, strip separators, and map look-alike characters onto the alphabet. */
export function normalizeRoomCode(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/0/g, 'O')
    .replace(/[1L]/g, 'I')
    // O and I are not in the alphabet; the two most common confusions are Q→O and J→I typos
    // going the other way, which we cannot recover, so leave them as typed.
}

export function isRoomCode(input: string): boolean {
  return /^[A-Z0-9]{4,8}$/.test(normalizeRoomCode(input))
}
