import { describe, expect, it } from 'vitest'
import { TileSuit } from '../../shared/types/game'
import { checkWin, listeningKinds, countRoots, decomposeSevenPairs } from '../../server/engine/hand'
import { tiles, meld } from './helpers'

describe('hand validation', () => {
  it('accepts 4 sets + pair', () => {
    expect(checkWin(tiles('123m 456m 789p 111s 99s'), [], null).canWin).toBe(true)
  })

  it('accepts triplets and sequences mixed with exposed melds', () => {
    const exposed = [meld('triplet', '555p'), meld('kong', '7777s')]
    expect(checkWin(tiles('123m 99m 456p'), exposed, null).canWin).toBe(true)
  })

  it('rejects incomplete shapes', () => {
    expect(checkWin(tiles('123m 456m 789p 111s 98s'), [], null).canWin).toBe(false)
  })

  it('accepts seven pairs including a quad as two pairs', () => {
    expect(checkWin(tiles('11m 22m 3333m 55p 77p 99s'), [], null).canWin).toBe(true)
    expect(decomposeSevenPairs(tiles('11m 22m 3333m 55p 77p 99s'), 0)?.melds.length).toBe(7)
  })

  it('rejects a winning shape that still holds the void suit', () => {
    const result = checkWin(tiles('123m 456m 789p 111s 99s'), [], TileSuit.BAMBOOS)
    expect(result.canWin).toBe(false)
    expect(result.reason).toBe('void_suit')
  })

  it('lists listening tiles and respects the void suit', () => {
    const waits = listeningKinds(tiles('123m 456m 789p 111s 9s'), [], TileSuit.DOTS)
    // 789p is in the hand, so a hand with void suit dots can never win.
    expect(waits).toHaveLength(0)
    const waits2 = listeningKinds(tiles('123m 456m 789m 111s 9s'), [], TileSuit.DOTS)
    expect(waits2.map(t => `${t.value}${t.suit}`)).toEqual(['9tiao'])
  })

  it('counts roots across concealed quads and kongs', () => {
    expect(countRoots(tiles('1111m 22p'), [meld('kong', '5555s'), meld('triplet', '777p')])).toBe(2)
  })
})
