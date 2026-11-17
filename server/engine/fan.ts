import {
  MeldType,
  WinType,
  type FanCalculation,
  type FanItem,
  type Meld,
  type RuleConfig,
  type Tile,
  type WinFlags
} from '../../shared/types/game'
import { checkWin, countRoots, type Decomposition } from './hand'
import { isFullFlush, isJiangValue, isTerminal } from './tiles'

export const NO_FLAGS: WinFlags = {
  selfDrawn: false,
  kongFlower: false,
  kongDiscard: false,
  robbingKong: false,
  lastTile: false,
  heaven: false,
  earth: false
}

interface Patterns {
  sevenPairs: boolean
  allPungs: boolean
  flush: boolean
  goldenHook: boolean
  terminals: boolean
  jiang: boolean
  fourKongs: boolean
  roots: number
}

function analyse(decomp: Decomposition, concealed: Tile[], exposed: Meld[]): Patterns {
  const allTiles = [...concealed, ...exposed.flatMap(m => m.tiles)]
  const sets = [...decomp.melds, ...exposed]
  const hasSequence = sets.some(m => m.type === MeldType.SEQUENCE)
  const sevenPairs = decomp.winType === WinType.SEVEN_PAIRS
  const allPungs = !sevenPairs && !hasSequence
  const flush = isFullFlush(allTiles)
  const goldenHook = !sevenPairs && exposed.length === 4 && concealed.length === 2
  const terminals = !sevenPairs && sets.every(m => m.tiles.some(isTerminal))
  const jiang = allPungs && sets.every(m => m.tiles.every(isJiangValue))
  const kongs = exposed.filter(m => m.type === MeldType.KONG || m.type === MeldType.CONCEALED_KONG).length
  return {
    sevenPairs,
    allPungs,
    flush,
    goldenHook,
    terminals,
    jiang,
    fourKongs: kongs === 4,
    roots: countRoots(concealed, exposed)
  }
}

function item(key: string, name: string, fan: number): FanItem {
  return { key, name, english: name, fan }
}

/** Highest-valued hand pattern for the "standard online table" preset. */
function standardHandType(p: Patterns): FanItem {
  if (p.sevenPairs) {
    if (p.flush) return item(p.roots ? 'qing_long_qi_dui' : 'qing_qi_dui', p.roots ? 'Pure Dragon Seven Pairs' : 'Pure Seven Pairs', 4)
    return item(p.roots ? 'long_qi_dui' : 'qi_dui', p.roots ? 'Dragon Seven Pairs' : 'Seven Pairs', 2)
  }
  if (p.fourKongs) return item(p.flush ? 'qing_shi_ba_luo_han' : 'shi_ba_luo_han', p.flush ? 'Pure Four Kongs' : 'Four Kongs', p.flush ? 4 : 2)
  if (p.goldenHook) return item(p.flush ? 'qing_jin_gou_diao' : 'jin_gou_diao', p.flush ? 'Pure Golden Hook' : 'Golden Hook', p.flush ? 4 : 2)
  if (p.jiang) return item(p.flush ? 'qing_jiang_dui' : 'jiang_dui', p.flush ? 'Pure 2-5-8 Pungs' : '2-5-8 Pungs', p.flush ? 5 : 3)
  if (p.terminals && p.allPungs) return item(p.flush ? 'qing_yao_jiu_dui' : 'yao_jiu_dui', p.flush ? 'Pure Terminal Pungs' : 'Terminal Pungs', p.flush ? 5 : 3)
  if (p.terminals) return item(p.flush ? 'qing_yao_jiu' : 'yao_jiu', p.flush ? 'Pure Terminals' : 'All Terminals', p.flush ? 4 : 2)
  if (p.allPungs) return item(p.flush ? 'qing_dui' : 'dui_dui_hu', p.flush ? 'Pure Pungs' : 'All Pungs', p.flush ? 3 : 1)
  if (p.flush) return item('qing_yi_se', 'Full Flush', 2)
  return item('ping_hu', 'Basic Win', 0)
}

/** Sichuan Bloody Rules (MIL 2017) hand patterns. */
function milHandType(p: Patterns): FanItem {
  if (p.sevenPairs) return item(p.flush ? 'qing_qi_dui' : 'qi_dui', p.flush ? 'Pure Seven Pairs' : 'Seven Pairs', p.flush ? 4 : 2)
  if (p.goldenHook) return item(p.flush ? 'qing_jin_gou_diao' : 'jin_gou_diao', p.flush ? 'Pure Golden Single Wait' : 'Golden Single Wait', p.flush ? 4 : 2)
  if (p.allPungs) return item(p.flush ? 'qing_dui' : 'dui_dui_hu', p.flush ? 'Pure Pungs' : 'All Pungs', p.flush ? 3 : 1)
  if (p.flush) return item('qing_yi_se', 'Full Flush', 2)
  return item('ping_hu', 'Basic Win', 0)
}

export interface FanInput {
  concealed: Tile[]       // includes the winning tile
  exposed: Meld[]
  flags: WinFlags
  rules: RuleConfig
}

/**
 * Calculate fan for a winning hand. Evaluates every decomposition and keeps the best.
 * Throws if the hand cannot win (callers validate first).
 */
export function calculateFan(input: FanInput): FanCalculation {
  const { concealed, exposed, flags, rules } = input
  const check = checkWin(concealed, exposed, null)
  if (!check.canWin) throw new Error('Hand is not a winning hand')

  let best: FanCalculation | null = null
  for (const decomp of check.decompositions) {
    const candidate = scoreDecomposition(decomp, concealed, exposed, flags, rules)
    if (!best || candidate.rawFan > best.rawFan) best = candidate
  }
  return best!
}

function scoreDecomposition(decomp: Decomposition, concealed: Tile[], exposed: Meld[], flags: WinFlags, rules: RuleConfig): FanCalculation {
  const patterns = analyse(decomp, concealed, exposed)
  const handType = rules.preset === 'mil' ? milHandType(patterns) : standardHandType(patterns)
  const extras: FanItem[] = []

  if (patterns.roots > 0) extras.push(item('gen', `${patterns.roots} Root${patterns.roots > 1 ? 's' : ''}`, patterns.roots))
  if (flags.selfDrawn && rules.selfDrawBonus === 'fan' && !flags.kongFlower) extras.push(item('zi_mo', 'Self-draw', 1))
  if (flags.kongFlower) extras.push(item('gang_shang_hua', 'Win after Kong', 1))
  if (flags.kongDiscard) extras.push(item('gang_shang_pao', 'Shoot after Kong', 1))
  if (flags.robbingKong) extras.push(item('qiang_gang', 'Robbing the Kong', 1))
  if (flags.lastTile) extras.push(item('hai_di', flags.selfDrawn ? 'Under the Sea' : 'Last-tile Shot', 1))

  let rawFan = handType.fan + extras.reduce((sum, e) => sum + e.fan, 0)

  if ((flags.heaven || flags.earth) && rules.preset !== 'mil') {
    const bonus = rules.fanCap > 0 ? Math.max(0, rules.fanCap - rawFan) : 8
    extras.push(item(flags.heaven ? 'tian_hu' : 'di_hu', flags.heaven ? 'Heavenly Hand' : 'Earthly Hand', bonus))
    rawFan += bonus
  }

  const totalFan = rules.fanCap > 0 ? Math.min(rawFan, rules.fanCap) : rawFan
  const points = rules.baseScore * Math.pow(2, totalFan)
  const parts = [handType.name, ...extras.map(e => e.name)]
  return {
    handType,
    extras,
    rawFan,
    totalFan,
    capped: totalFan < rawFan,
    points,
    summary: parts.join(' · ')
  }
}

/** Best possible fan a ready hand could score (used for not-ready penalty and the ting helper). */
export function bestFanForKind(concealed: Tile[], exposed: Meld[], kind: Tile, rules: RuleConfig): FanCalculation | null {
  try {
    return calculateFan({ concealed: [...concealed, kind], exposed, flags: NO_FLAGS, rules })
  } catch {
    return null
  }
}
