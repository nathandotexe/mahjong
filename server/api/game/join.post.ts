import { gameManager } from '../../utils/gameManager'
import { seatUserFromEvent, throwHttp } from '../../utils/gameHttp'

/** Join a room by short code (or gameId). Body: { code?: string; gameId?: string } */
export default defineEventHandler(async (event) => {
  const user = await seatUserFromEvent(event)
  const body = (await readBody(event).catch(() => ({}))) ?? {}
  const code = typeof body.code === 'string' ? body.code : ''
  const gameId = typeof body.gameId === 'string' ? body.gameId : ''
  if (!code && !gameId) {
    throw createError({ statusCode: 400, message: 'Room code is required' })
  }
  try {
    const state = gameId ? await gameManager.join(gameId, user) : await gameManager.joinByCode(code, user)
    const view = gameManager.viewFor(state, user.userId, { isAdmin: user.isAdmin })
    return {
      success: true,
      data: { gameId: state.gameId, code: state.code, playerId: view.viewerPlayerId, view }
    }
  } catch (error) {
    throwHttp(error)
  }
})
