import { describe, expect, it } from 'vitest'
import { DEFAULT_RULES, MIL_RULES, type Meld, type RuleConfig } from '../../shared/types/game'
import { calculateFan, NO_FLAGS } from '../../server/engine/fan'
import { tiles, meld } from './helpers'

function fan(hand: string, exposed: Meld[] = [], rules: RuleConfig = DEFAULT_RULES, flags = NO_FLAGS) {
  return calculateFan({ concealed: tiles(hand), exposed, flags, rules })
}

describe('fan calculation (standard online table)', () => {
  it('Basic Win is 0 fan → 1 point', () => {
    const f = fan('123m 456m 789p 111s 99s')
    expect(f.handType.key).toBe('ping_hu')
    expect(f.totalFan).toBe(0)
    expect(f.points).toBe(1)
  })

  it('All Pungs is 1 fan', () => {
    const f = fan('111m 222m 333p 444s 99s')
    expect(f.handType.key).toBe('dui_dui_hu')
    expect(f.totalFan).toBe(1)
  })

  it('Full Flush is 2 fan, Pure Pungs is 3 fan', () => {
    expect(fan('234m 456m 789m 111m 99m').handType.key).toBe('qing_yi_se')
    expect(fan('234m 456m 789m 111m 99m').totalFan).toBe(2)
    // Four 1m across a sequence and a pung is a root on top of the flush.
    expect(fan('123m 456m 789m 111m 99m').totalFan).toBe(3)
    const qd = fan('111m 222m 333m 555m 99m')
    expect(qd.handType.key).toBe('qing_dui')
    expect(qd.totalFan).toBe(3)
  })

  it('Seven Pairs 2 fan, Dragon Seven Pairs 3 fan (pair + root), Pure Seven Pairs 4 fan', () => {
    expect(fan('11m 22m 33m 55p 77p 99s 88s').totalFan).toBe(2)
    const dragon = fan('11m 22m 3333m 55p 77p 99s')
    expect(dragon.handType.name).toBe('Dragon Seven Pairs')
    expect(dragon.totalFan).toBe(3)
    expect(fan('11m 22m 33m 55m 77m 99m 88m').totalFan).toBe(4)
  })

  it('Golden Hook is 2 fan and does not double count All Pungs', () => {
    const exposed = [meld('triplet', '111m'), meld('triplet', '222p'), meld('kong', '3333p'), meld('triplet', '444s')]
    const f = fan('99s', exposed)
    expect(f.handType.key).toBe('jin_gou_diao')
    expect(f.totalFan).toBe(3) // 2 + 1 root
  })

  it('2-5-8 Pungs is 3 fan and All Terminals is 2 fan', () => {
    expect(fan('222m 555m 888p 222s 55s').handType.key).toBe('jiang_dui')
    expect(fan('222m 555m 888p 222s 55s').totalFan).toBe(3)
    expect(fan('123m 789m 111p 999s 99p').handType.key).toBe('yao_jiu')
    expect(fan('123m 789m 111p 999s 99p').totalFan).toBe(2)
  })

  it('adds self-draw, kong flower and last tile bonuses', () => {
    const f = fan('123m 456m 789p 111s 99s', [], DEFAULT_RULES, { ...NO_FLAGS, selfDrawn: true, kongFlower: true, lastTile: true })
    expect(f.extras.map(e => e.key)).toEqual(['gang_shang_hua', 'hai_di'])
    expect(f.totalFan).toBe(2) // win after kong replaces the plain self-draw bonus
    const g = fan('123m 456m 789p 111s 99s', [], DEFAULT_RULES, { ...NO_FLAGS, selfDrawn: true })
    expect(g.totalFan).toBe(1)
  })

  it('caps at the configured fan limit', () => {
    const f = fan('11m 22m 33m 55m 77m 99m 88m', [], { ...DEFAULT_RULES, fanCap: 3 }, { ...NO_FLAGS, selfDrawn: true })
    expect(f.rawFan).toBe(5)
    expect(f.totalFan).toBe(3)
    expect(f.capped).toBe(true)
    expect(f.points).toBe(8)
    const uncapped = fan('11m 22m 33m 55m 77m 99m 88m', [], { ...DEFAULT_RULES, fanCap: 0 }, { ...NO_FLAGS, selfDrawn: true })
    expect(uncapped.totalFan).toBe(5)
  })

  it('Heavenly Hand jumps straight to the cap', () => {
    const f = fan('123m 456m 789p 111s 99s', [], DEFAULT_RULES, { ...NO_FLAGS, selfDrawn: true, heaven: true })
    expect(f.totalFan).toBe(DEFAULT_RULES.fanCap)
  })
})

describe('fan calculation (MIL preset)', () => {
  it('uses 3-fan cap and base self-draw bonus', () => {
    const f = fan('111m 222m 333m 555m 99m', [], MIL_RULES, { ...NO_FLAGS, selfDrawn: true })
    expect(f.handType.key).toBe('qing_dui')
    expect(f.rawFan).toBe(3)
    expect(f.totalFan).toBe(3)
    expect(f.extras.find(e => e.key === 'zi_mo')).toBeUndefined()
  })
})
