/**
 * The serverless (polling) path of the game manager: no in-memory cache, no timers.
 * Time is driven with a fake Date so deadlines expire on demand.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { GamePhase, type GameState } from '../../shared/types/game'

process.env.NUXT_PUBLIC_REALTIME = 'poll'

const { gameManager } = await import('../../server/utils/gameManager')
const { loadGameState } = await import('../../server/utils/gamePersistence')

const host = { userId: 'host-user', name: 'Host' }
const guest = { userId: 'guest-user', name: 'Guest' }

let clock = Date.parse('2026-11-17T10:00:00Z')
const advance = (ms: number) => {
  clock += ms
  vi.setSystemTime(clock)
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(clock)
})
afterAll(() => {
  vi.useRealTimers()
  delete process.env.NUXT_PUBLIC_REALTIME
})

describe('poll mode', () => {
  let gameId = ''

  it('creates a room and seats players through the database only', async () => {
    const state = await gameManager.createGame(host)
    gameId = state.gameId
    await gameManager.join(gameId, guest)
    await gameManager.addBot(gameId, { userId: host.userId })
    await gameManager.addBot(gameId, { userId: host.userId })
    const stored = await loadGameState(gameId)
    expect(stored?.players).toHaveLength(4)
    expect(stored?.recentEvents?.some(e => e.type === 'player_joined')).toBe(true)
  })

  it('applies expired setup timers when someone polls', async () => {
    await gameManager.startHand(gameId, { userId: host.userId })
    let state = (await gameManager.refresh(gameId, host.userId))!
    expect(state.phase).toBe(GamePhase.EXCHANGING)

    advance(31_000)
    state = (await gameManager.refresh(gameId, host.userId))!
    expect(state.phase).toBe(GamePhase.CHOOSING_SUIT)

    advance(31_000)
    state = (await gameManager.refresh(gameId, guest.userId))!
    expect(state.phase).toBe(GamePhase.PLAYING)
  })

  it('returns only events newer than the client has seen, masked per viewer', async () => {
    const before = (await loadGameState(gameId))!
    const since = before.eventSeq
    advance(25_000) // dealer's turn timer runs out: auto-discard
    const state = (await gameManager.refresh(gameId, host.userId))!
    const fresh = gameManager.eventsSince(state, since, guest.userId, false)
    expect(fresh.length).toBeGreaterThan(0)
    expect(fresh.every(e => e.id > since)).toBe(true)
    const guestId = state.players.find(p => p.userId === guest.userId)!.id
    for (const e of fresh) if (e.type === 'tile_drawn' && e.playerId !== guestId) expect(e.tile).toBeNull()
    expect(gameManager.eventsSince(state, null, guest.userId, false)).toEqual([])
  })

  it('does not write when nothing is due', async () => {
    const a = (await gameManager.refresh(gameId, host.userId))!
    const b = (await gameManager.refresh(gameId, host.userId))!
    expect(b.version).toBe(a.version)
  })

  it('hands a silent player to auto-play, and gives the seat back when they poll again', async () => {
    // Only the host keeps polling for a while.
    for (let i = 0; i < 4; i++) {
      advance(14_000)
      await gameManager.refresh(gameId, host.userId)
    }
    let state = (await loadGameState(gameId)) as GameState
    const away = state.players.find(p => p.userId === guest.userId)!
    expect(state.phase).toBe(GamePhase.PLAYING)
    expect(away.connected).toBe(false)
    expect(away.autoPlay).toBe(true)
    state = (await gameManager.refresh(gameId, guest.userId))!
    const back = state.players.find(p => p.userId === guest.userId)!
    expect(back.connected).toBe(true)
    expect(back.autoPlay).toBe(false)
  })

  it('plays the hand to the end on polls alone', async () => {
    let state = (await loadGameState(gameId))!
    for (let i = 0; i < 2000 && state.phase === GamePhase.PLAYING; i++) {
      advance(21_000)
      state = (await gameManager.refresh(gameId, i % 2 ? host.userId : guest.userId))!
    }
    expect(state.phase).toBe(GamePhase.ENDED)
    expect(state.handHistory).toHaveLength(1)
  })

  it('delivers chat as events and rate-limits bursts', async () => {
    const before = (await loadGameState(gameId))!
    await gameManager.chat(gameId, host, 'message', 'gg')
    await gameManager.chat(gameId, host, 'message', 'spam')
    const after = (await loadGameState(gameId))!
    const chats = gameManager.eventsSince(after, before.eventSeq, guest.userId, false).filter(e => e.type === 'chat')
    expect(chats).toHaveLength(1)
    expect(chats[0]!.payload).toMatchObject({ kind: 'message', text: 'gg', userId: host.userId })
  })
})
