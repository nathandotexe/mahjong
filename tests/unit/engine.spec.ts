import { describe, expect, it } from 'vitest'
import { ActionType, GameEndReason, GamePhase, PlayerStatus, TileSuit } from '../../shared/types/game'
import * as engine from '../../server/engine/engine'
import { NOT_READY, act, allTileIds, discardKind, makeTable, meld, scoresFromLedger, setHand, setTurn, setWall, tiles } from './helpers'

const m = TileSuit.CHARACTERS
const p = TileSuit.DOTS
const s = TileSuit.BAMBOOS

describe('hand setup', () => {
  it('deals 13 tiles to everyone and 14 to the dealer, then plays', () => {
    const table = makeTable({ seed: 7 })
    const { state } = table
    expect(state.phase).toBe(GamePhase.PLAYING)
    expect(state.players[0]!.hand.concealedTiles).toHaveLength(14)
    for (let i = 1; i < 4; i++) expect(state.players[i]!.hand.concealedTiles).toHaveLength(13)
    expect(state.wall).toHaveLength(108 - 13 * 4 - 1)
    expect(allTileIds(state)).toHaveLength(108)
    expect(engine.availableActions(state, state.players[0]!.id)).toContain(ActionType.DISCARD)
  })

  it('runs the swap three exchange with a random direction', () => {
    const table = makeTable({ seed: 3, rules: { exchangeThree: true }, start: false })
    const { state, ctx } = table
    engine.startHand(state, ctx)
    expect(state.phase).toBe(GamePhase.EXCHANGING)
    for (const player of state.players) {
      const suit = player.hand.concealedTiles.find(t => player.hand.concealedTiles.filter(x => x.suit === t.suit).length >= 3)!.suit
      const give = player.hand.concealedTiles.filter(t => t.suit === suit).slice(0, 3)
      engine.submitExchange(state, player.id, give.map(t => t.id), ctx)
    }
    expect(state.phase).toBe(GamePhase.CHOOSING_SUIT)
    expect(['clockwise', 'anticlockwise', 'across']).toContain(state.exchange!.direction)
    expect(allTileIds(state)).toHaveLength(108)
    for (const player of state.players) {
      expect(state.exchange!.received[player.id]).toHaveLength(3)
    }
  })

  it('forces void-suit tiles to be discarded first', () => {
    const table = makeTable({ seed: 5 })
    setHand(table, 0, { hand: '123m 456m 789p 111s 9s 5p', missingSuit: p, drawn: true })
    setTurn(table, 0)
    expect(() => discardKind(table, 0, '1m')).toThrow(/void suit/)
    expect(() => discardKind(table, 0, '7p')).not.toThrow()
  })
})

describe('claims', () => {
  it('Hu beats Peng when both respond, and the discarder pays', () => {
    const table = makeTable({ seed: 11 })
    const { state } = table
    setHand(table, 0, { hand: '123m 456m 789m 111s 5s 2m', missingSuit: p, drawn: true })
    setHand(table, 1, { hand: '123m 456m 789m 999s 5s', missingSuit: p }) // waits on 5s (pair)
    setHand(table, 2, { hand: '55s 111m 222m 333m 44p', missingSuit: p }) // can peng 5s, cannot win (holds void)
    setHand(table, 3, { hand: NOT_READY, missingSuit: s })
    setTurn(table, 0)
    discardKind(table, 0, '5s')
    expect(state.claimWindow).not.toBeNull()
    const pending = state.claimWindow!.claims.map(c => c.playerId)
    expect(pending).toContain(state.players[1]!.id)
    expect(pending).toContain(state.players[2]!.id)

    act(table, 2, ActionType.PENG)
    // Not resolved yet: player 1 can still win.
    expect(state.claimWindow).not.toBeNull()
    act(table, 1, ActionType.HU)
    expect(state.claimWindow).toBeNull()
    expect(state.players[1]!.status).toBe(PlayerStatus.WON)
    expect(state.players[2]!.hand.exposedMelds).toHaveLength(0)
    const scores = scoresFromLedger(state)
    expect(scores[state.players[0]!.id]).toBeLessThan(0)
    expect(scores[state.players[1]!.id]).toBe(-scores[state.players[0]!.id]!)
    expect(scores[state.players[2]!.id]).toBe(0)
    // Turn continues after the winner.
    expect(state.currentPlayerIndex).toBe(2)
  })

  it('resolves a Peng immediately when nobody else can win', () => {
    const table = makeTable({ seed: 12 })
    const { state } = table
    setHand(table, 0, { hand: '123m 456m 789m 111s 5s 2m', missingSuit: p, drawn: true })
    setHand(table, 1, { hand: NOT_READY, missingSuit: s })
    setHand(table, 2, { hand: '55s 111m 222m 333m 47p', missingSuit: s })
    setHand(table, 3, { hand: NOT_READY, missingSuit: s })
    setTurn(table, 0)
    discardKind(table, 0, '5s')
    expect(state.claimWindow!.claims).toHaveLength(1)
    act(table, 2, ActionType.PENG)
    expect(state.claimWindow).toBeNull()
    expect(state.players[2]!.hand.exposedMelds[0]!.type).toBe('triplet')
    expect(state.currentPlayerIndex).toBe(2)
    expect(engine.availableActions(state, state.players[2]!.id)).toContain(ActionType.DISCARD)
  })

  it('passed-win lock: passing on a winning discard blocks the same tile until the next draw', () => {
    const table = makeTable({ seed: 13 })
    const { state } = table
    setHand(table, 3, { hand: '123m 456m 789m 111s 5s 2m', missingSuit: p, drawn: true })
    setHand(table, 1, { hand: '123m 456m 789m 999s 5s', missingSuit: p })
    setHand(table, 0, { hand: NOT_READY, missingSuit: s })
    setHand(table, 2, { hand: NOT_READY, missingSuit: s })
    setTurn(table, 3)
    discardKind(table, 3, '5s')
    act(table, 1, ActionType.PASS)
    expect(state.players[1]!.passedHu?.key).toBe('tiao-5')
    // Player 0 draws next and discards another 5s: player 1 has not drawn, so it may not claim it.
    expect(state.currentPlayerIndex).toBe(0)
    setHand(table, 0, { hand: `${NOT_READY} 5s`, missingSuit: s, drawn: true })
    discardKind(table, 0, '5s')
    const claim = state.claimWindow?.claims.find(c => c.playerId === state.players[1]!.id)
    expect(claim).toBeUndefined()
  })
})

describe('kongs and settlement', () => {
  it('exposed kong: the discarder pays 2 and the kong player draws a replacement', () => {
    const table = makeTable({ seed: 21 })
    const { state } = table
    setHand(table, 0, { hand: '123m 456m 789m 111s 5s 2m', missingSuit: p, drawn: true })
    setHand(table, 1, { hand: '555s 123m 456m 789m 9s', missingSuit: p })
    setHand(table, 2, { hand: NOT_READY, missingSuit: s })
    setHand(table, 3, { hand: NOT_READY, missingSuit: s })
    setTurn(table, 0)
    discardKind(table, 0, '5s')
    act(table, 1, ActionType.KONG)
    const scores = scoresFromLedger(state)
    expect(scores[state.players[0]!.id]).toBe(-2)
    expect(scores[state.players[1]!.id]).toBe(2)
    expect(state.players[1]!.hand.exposedMelds[0]!.kongKind).toBe('direct')
    expect(state.players[1]!.hand.concealedTiles).toHaveLength(11) // 13 - 3 + replacement
    expect(state.lastKong?.replacementDrawn).toBe(true)
  })

  it('concealed kong collects 2 from every active player and added kong collects 1', () => {
    const table = makeTable({ seed: 22 })
    const { state } = table
    setHand(table, 0, { hand: '5555s 123m 456m 99p 12p', missingSuit: null, drawn: true })
    setTurn(table, 0)
    expect(engine.availableActions(state, state.players[0]!.id)).toContain(ActionType.CONCEALED_KONG)
    act(table, 0, ActionType.CONCEALED_KONG)
    let scores = scoresFromLedger(state)
    expect(scores[state.players[0]!.id]).toBe(6)
    expect(Object.values(scores).reduce((a, b) => a + b, 0)).toBe(0)

    // Extended kong: player 0 holds a pung of 1m and draws the fourth.
    setHand(table, 0, {
      hand: '1m 456m 99p 23p',
      melds: [meld('triplet', '111m'), meld('concealed_kong', '5555s', { isConcealed: true, kongKind: 'concealed' })],
      missingSuit: null,
      drawn: true
    })
    for (let i = 1; i < 4; i++) setHand(table, i, { hand: NOT_READY, missingSuit: s })
    setTurn(table, 0)
    // No one is waiting on 1m, so the kong completes immediately.
    act(table, 0, ActionType.EXTENDED_KONG)
    scores = scoresFromLedger(state)
    expect(scores[state.players[0]!.id]).toBe(9)
    expect(state.players[0]!.hand.exposedMelds.find(x => x.kongKind === 'extended')).toBeTruthy()
  })

  it('robbing the kong: a player waiting on the extended tile robs the kong', () => {
    const table = makeTable({ seed: 23 })
    const { state } = table
    setHand(table, 0, { hand: '1m 456m 789m 99p 23p', melds: [meld('triplet', '111m')], missingSuit: s, drawn: true })
    setHand(table, 1, { hand: '1m 234p 567p 888s 99s', missingSuit: m }) // holds void suit, cannot win
    setHand(table, 2, { hand: '23m 234p 567p 888s 99s', missingSuit: null }) // waits on 1m / 4m
    setHand(table, 3, { hand: NOT_READY, missingSuit: s })
    setTurn(table, 0)
    act(table, 0, ActionType.EXTENDED_KONG)
    expect(state.claimWindow?.kind).toBe('kong_rob')
    act(table, 2, ActionType.HU)
    expect(state.players[2]!.status).toBe(PlayerStatus.WON)
    expect(state.players[2]!.wins[0]!.flags.robbingKong).toBe(true)
    expect(state.players[0]!.hand.exposedMelds[0]!.type).toBe('triplet')
    const scores = scoresFromLedger(state)
    expect(scores[state.players[0]!.id]).toBeLessThan(0)
  })

  it('self-draw is paid by every active player with +1 fan', () => {
    const table = makeTable({ seed: 24 })
    const { state } = table
    state.pristine = false // not the opening draw, so no Heavenly Hand
    setHand(table, 0, { hand: '123m 456m 789m 111s 99s', missingSuit: p, drawn: true })
    setTurn(table, 0)
    act(table, 0, ActionType.HU)
    const scores = scoresFromLedger(state)
    expect(scores[state.players[0]!.id]).toBe(6) // 0 fan + self-draw = 1 fan = 2 points × 3
    expect(state.players[0]!.wins[0]!.fan.extras.map(e => e.key)).toContain('zi_mo')
    expect(state.players[0]!.status).toBe(PlayerStatus.WON)
    expect(state.phase).toBe(GamePhase.PLAYING)
  })

  it('Heavenly Hand: the dealer winning on the opening hand scores the cap', () => {
    const table = makeTable({ seed: 26 })
    const { state } = table
    setHand(table, 0, { hand: '123m 456m 789m 111s 99s', missingSuit: p, drawn: true })
    setTurn(table, 0)
    act(table, 0, ActionType.HU)
    expect(state.players[0]!.wins[0]!.flags.heaven).toBe(true)
    expect(state.players[0]!.wins[0]!.fan.totalFan).toBe(state.rules.fanCap)
  })

  it('kong transfer: shooting right after a kong hands the kong income to the winner', () => {
    const table = makeTable({ seed: 25 })
    const { state } = table
    setHand(table, 0, { hand: '5555s 123m 456m 99p 18p', missingSuit: null, drawn: true })
    setHand(table, 1, { hand: '123m 456m 789m 999p 2p', missingSuit: s }) // waits on 2p
    setHand(table, 2, { hand: NOT_READY, missingSuit: s })
    setHand(table, 3, { hand: NOT_READY, missingSuit: s })
    setWall(table, '2p')
    setTurn(table, 0)
    act(table, 0, ActionType.CONCEALED_KONG) // draws 2p as replacement
    expect(state.players[0]!.hand.concealedTiles.some(t => t.suit === p && t.value === 2)).toBe(true)
    discardKind(table, 0, '2p')
    act(table, 1, ActionType.HU)
    const win = state.players[1]!.wins[0]!
    expect(win.flags.kongDiscard).toBe(true)
    expect(state.ledger.some(e => e.type === 'kong_transfer')).toBe(true)
    const scores = scoresFromLedger(state)
    // Player 0 collected 6 from the kong, paid the 1-fan win (2 points) and transferred the 6.
    expect(scores[state.players[0]!.id]).toBe(6 - 2 - 6)
    expect(scores[state.players[1]!.id]).toBe(2 + 6 - 2) // win + transfer − own kong payment
  })
})

describe('end of hand', () => {
  it('ends when only one player remains and rotates the dealer to the first winner', () => {
    const table = makeTable({ seed: 31, players: 2 })
    const { state } = table
    state.pristine = false
    setHand(table, 0, { hand: '123m 456m 789m 111s 99s', missingSuit: p, drawn: true })
    setTurn(table, 0)
    act(table, 0, ActionType.HU)
    expect(state.phase).toBe(GamePhase.ENDED)
    expect(state.endReason).toBe(GameEndReason.LAST_PLAYER)
    expect(state.players[1]!.status).toBe(PlayerStatus.LOST)
    expect(state.nextDealerId).toBe(state.players[0]!.id)
    expect(state.handHistory).toHaveLength(1)
    expect(state.sessionScores[state.players[0]!.id]).toBe(2)
    expect(state.sessionScores[state.players[1]!.id]).toBe(-2)
  })

  it('flower pig penalty / not-ready penalty at wall exhaustion, ready players keep kong income', () => {
    const table = makeTable({ seed: 32 })
    const { state, ctx } = table
    // P0: ready (waits on 9p), P1: not ready, P2: flower pig (three suits), P3: ready with a kong income.
    setHand(table, 0, { hand: '123m 456m 789m 111p 9p', missingSuit: s })
    setHand(table, 1, { hand: NOT_READY, missingSuit: s })
    setHand(table, 2, { hand: '1125699m 2357p 89s', missingSuit: s })
    setHand(table, 3, { hand: '123m 456m 78m 99p', melds: [meld('concealed_kong', '5555p', { isConcealed: true, kongKind: 'concealed' })], missingSuit: s })
    state.ledger.push({ id: 'k1', handNumber: state.handNumber, type: 'kong_concealed', from: state.players[1]!.id, to: state.players[3]!.id, points: 2, label: 'concealed kong', kongId: 'kong-1', at: ctx.now })
    state.wall = []
    engine.endHand(state, GameEndReason.WALL_EXHAUSTED, ctx)

    const scores = scoresFromLedger(state)
    const [p0, p1, p2, p3] = state.players.map(pl => pl.id)
    const types = state.ledger.map(e => e.type)
    expect(types).toContain('flower_pig')
    expect(types).toContain('not_ready')
    expect(types).not.toContain('kong_refund')
    expect(Object.values(scores).reduce((a, b) => a + b, 0)).toBe(0)
    expect(scores[p2!]).toBeLessThan(scores[p1!]!)
    expect(scores[p0!]).toBeGreaterThan(0)
    expect(scores[p3!]).toBeGreaterThan(0)
    expect(state.phase).toBe(GamePhase.ENDED)
  })

  it('kong refund: refunds kong income from players who were not ready', () => {
    const table = makeTable({ seed: 33 })
    const { state, ctx } = table
    setHand(table, 0, { hand: '123m 456m 789m 111p 9p', missingSuit: s })
    setHand(table, 1, { hand: NOT_READY, missingSuit: s })
    setHand(table, 2, { hand: NOT_READY, missingSuit: s })
    setHand(table, 3, { hand: NOT_READY, missingSuit: s })
    state.ledger.push({ id: 'k2', handNumber: state.handNumber, type: 'kong_direct', from: state.players[0]!.id, to: state.players[1]!.id, points: 2, label: 'exposed kong', kongId: 'kong-2', at: ctx.now })
    state.wall = []
    engine.endHand(state, GameEndReason.WALL_EXHAUSTED, ctx)
    const refund = state.ledger.find(e => e.type === 'kong_refund')
    expect(refund?.from).toBe(state.players[1]!.id)
    expect(refund?.to).toBe(state.players[0]!.id)
  })

  it('does not settle when every non-winner is in the same state', () => {
    const table = makeTable({ seed: 34 })
    const { state, ctx } = table
    for (let i = 0; i < 4; i++) setHand(table, i, { hand: NOT_READY, missingSuit: s })
    state.wall = []
    engine.endHand(state, GameEndReason.WALL_EXHAUSTED, ctx)
    expect(state.ledger).toHaveLength(0)
    expect(state.phase).toBe(GamePhase.ENDED)
  })
})

describe('timers', () => {
  it('auto-discards for a player who times out and marks them auto-play', () => {
    const table = makeTable({ seed: 41 })
    const { state, ctx } = table
    const dealer = state.players[state.dealerIndex]!
    expect(state.turnDeadline).toBeGreaterThan(ctx.now)
    ctx.now = state.turnDeadline! + 1
    expect(engine.tick(state, ctx)).toBe(true)
    expect(dealer.hand.discardedTiles).toHaveLength(1)
    expect(dealer.autoPlay).toBe(true)
  })

  it('lets a timed-out player take control back with a fresh turn timer', () => {
    const table = makeTable({ seed: 41 })
    const { state, ctx } = table
    const dealer = state.players[state.dealerIndex]!
    ctx.now = state.turnDeadline! + 1
    engine.tick(state, ctx)
    expect(dealer.autoPlay).toBe(true)

    // Their next turn comes round on the short auto-play clock...
    setTurn(table, state.dealerIndex)
    state.turnDeadline = ctx.now + 1200
    act(table, state.dealerIndex, ActionType.RESUME)
    expect(dealer.autoPlay).toBe(false)
    // ...and resuming restores the full 20 s turn.
    expect(state.turnDeadline).toBe(ctx.now + 20_000)
    expect(ctx.events.some(e => e.type === 'player_resumed' && e.playerId === dealer.id)).toBe(true)

    // Resuming again is harmless.
    expect(() => act(table, state.dealerIndex, ActionType.RESUME)).not.toThrow()
  })

  it('does not let a bot seat be resumed', () => {
    const table = makeTable({ seed: 43, players: 3, start: false })
    const bot = engine.seatBot(table.state, table.ctx)
    expect(() => engine.act(table.state, bot.id, ActionType.RESUME, {}, table.ctx)).toThrow(/Bots/)
  })

  it('auto-passes a claim window after the deadline', () => {
    const table = makeTable({ seed: 42 })
    const { state, ctx } = table
    setHand(table, 0, { hand: '123m 456m 789m 111s 5s 2m', missingSuit: p, drawn: true })
    setHand(table, 1, { hand: '55s 111m 222m 333m 47p', missingSuit: null })
    setHand(table, 2, { hand: NOT_READY, missingSuit: s })
    setHand(table, 3, { hand: NOT_READY, missingSuit: s })
    setTurn(table, 0)
    discardKind(table, 0, '5s')
    expect(state.claimWindow).not.toBeNull()
    ctx.now = state.claimWindow!.deadline! + 1
    engine.tick(state, ctx)
    expect(state.claimWindow).toBeNull()
    expect(state.currentPlayerIndex).toBe(1)
    expect(state.players[1]!.hand.concealedTiles).toHaveLength(14)
  })
})

describe('Blood River', () => {
  it('winners keep playing with a locked hand and the winning tile is discarded', () => {
    const table = makeTable({ seed: 51, rules: { bloodRiver: true } })
    const { state } = table
    state.pristine = false
    setHand(table, 0, { hand: '123m 456m 789m 111s 99s', missingSuit: p, drawn: true })
    setHand(table, 1, { hand: NOT_READY, missingSuit: s })
    setHand(table, 2, { hand: NOT_READY, missingSuit: s })
    setHand(table, 3, { hand: NOT_READY, missingSuit: s })
    setTurn(table, 0)
    act(table, 0, ActionType.HU)
    const winner = state.players[0]!
    expect(winner.handLocked).toBe(true)
    expect(winner.status).toBe(PlayerStatus.PLAYING)
    expect(state.phase).toBe(GamePhase.PLAYING)
    expect(winner.hand.discardedTiles).toHaveLength(1)
    expect(winner.hand.concealedTiles).toHaveLength(13)
    expect(state.currentPlayerIndex).toBe(1)
  })
})

describe('fuzz: random legal play never breaks invariants', () => {
  const seeds = Array.from({ length: 60 }, (_, i) => i + 100)
  it.each(seeds)('seed %i', seed => {
    for (const bloodRiver of [false, true]) {
      const table = makeTable({ seed: seed + (bloodRiver ? 1000 : 0), rules: { bloodRiver, exchangeThree: seed % 2 === 0 } })
      const { state, ctx, rng } = table
      let steps = 0
      while (state.phase === GamePhase.PLAYING && steps < 1500) {
        steps++
        expect(allTileIds(state)).toHaveLength(108)
        const total = Object.values(scoresFromLedger(state)).reduce((a, b) => a + b, 0)
        expect(total).toBe(0)

        if (state.claimWindow) {
          const pending = state.claimWindow.claims.filter(c => c.response === null)
          const claim = pending[Math.floor(rng() * pending.length)]!
          const options = claim.options.filter(o => o !== ActionType.PASS)
          const choice = options.includes(ActionType.HU) && rng() < 0.9 ? ActionType.HU : rng() < 0.5 && options.length ? options[0]! : ActionType.PASS
          engine.act(state, claim.playerId, choice, {}, ctx)
          continue
        }
        const player = state.players[state.currentPlayerIndex]!
        const actions = engine.availableActions(state, player.id)
        if (actions.length === 0) {
          throw new Error(`No actions for current player at step ${steps} (seed ${seed})`)
        }
        if (actions.includes(ActionType.HU) && rng() < 0.9) {
          engine.act(state, player.id, ActionType.HU, {}, ctx)
          continue
        }
        if (actions.includes(ActionType.CONCEALED_KONG) && rng() < 0.7) {
          engine.act(state, player.id, ActionType.CONCEALED_KONG, {}, ctx)
          continue
        }
        if (actions.includes(ActionType.EXTENDED_KONG) && rng() < 0.7) {
          engine.act(state, player.id, ActionType.EXTENDED_KONG, {}, ctx)
          continue
        }
        if (rng() < 0.1) {
          ctx.now = state.turnDeadline! + 1
          engine.tick(state, ctx)
          continue
        }
        const must = engine.mustDiscardSuit(player)
        const pool = player.handLocked
          ? player.hand.concealedTiles.filter(t => t.id === player.lastDrawnTileId)
          : must ? player.hand.concealedTiles.filter(t => t.suit === must) : player.hand.concealedTiles
        const tile = pool[Math.floor(rng() * pool.length)]!
        engine.act(state, player.id, ActionType.DISCARD, { tileId: tile.id }, ctx)
      }
      expect(state.phase).toBe(GamePhase.ENDED)
      expect(allTileIds(state)).toHaveLength(108)
      const scores = scoresFromLedger(state)
      expect(Object.values(scores).reduce((a, b) => a + b, 0)).toBe(0)
      for (const pl of state.players) expect(pl.score).toBe(scores[pl.id])
      engine.startHand(state, ctx)
      expect([GamePhase.EXCHANGING, GamePhase.CHOOSING_SUIT]).toContain(state.phase)
      expect(allTileIds(state)).toHaveLength(108)
    }
  })
})

describe('tiles helper sanity', () => {
  it('parses notation', () => {
    expect(tiles('123m 5p').map(t => `${t.value}${t.suit}`)).toEqual(['1wan', '2wan', '3wan', '5dots'])
  })
})
