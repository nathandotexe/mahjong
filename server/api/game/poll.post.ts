import { GamePhase } from '../../../shared/types/game'
import { gameManager } from '../../utils/gameManager'
import { throwHttp } from '../../utils/gameHttp'
import { resolveUserFromEvent } from '../../utils/session'

/**
 * Polling transport (used on serverless hosts such as Vercel, where Socket.IO cannot run).
 * Brings the game up to date (expired timers, presence) and returns this player's view.
 *
 * Body: {
 *   gameId?: string, code?: string   which room
 *   join?: boolean                   take a free seat if the room is still waiting
 *   since?: number                   last event id the client has seen (returns newer events)
 *   version?: number                 state version the client has; unchanged state returns { unchanged: true }
 *   reveal?: boolean                 admin "reveal all hands"
 * }
 */
export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const user = await resolveUserFromEvent(event)
  const body = (await readBody(event).catch(() => ({}))) ?? {}
  const isAdmin = !!user.isAdmin

  try {
    let gameId = typeof body.gameId === 'string' ? body.gameId : ''
    if (!gameId) {
      const code = typeof body.code === 'string' ? body.code : ''
      if (!code) throw createError({ statusCode: 400, message: 'gameId or code is required' })
      const found = await gameManager.getGameByCode(code)
      if (!found) throw createError({ statusCode: 404, message: 'Room not found', data: { code: 'game_not_found' } })
      gameId = found.gameId
    }

    let state = await gameManager.refresh(gameId, user.userId)
    if (!state) throw createError({ statusCode: 404, message: 'Room not found', data: { code: 'game_not_found' } })

    if (body.join && state.phase === GamePhase.WAITING && !state.players.some(p => p.userId === user.userId)) {
      state = await gameManager.join(gameId, { userId: user.userId, name: user.name, avatar: user.avatar ?? null })
    }

    const spectator = !state.players.some(p => p.userId === user.userId)
    const base = { gameId: state.gameId, code: state.code, spectator, eventSeq: state.eventSeq, serverTime: Date.now() }
    if (typeof body.version === 'number' && body.version === state.version) {
      return { success: true, data: { ...base, unchanged: true } }
    }
    const since = typeof body.since === 'number' ? body.since : null
    const view = gameManager.viewFor(state, user.userId, { isAdmin, revealAll: isAdmin && !!body.reveal })
    view.events = gameManager.eventsSince(state, since, user.userId, isAdmin)
    return { success: true, data: { ...base, unchanged: false, view } }
  } catch (error) {
    throwHttp(error)
  }
})
