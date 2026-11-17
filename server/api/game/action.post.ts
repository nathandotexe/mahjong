import { ActionType } from '../../../shared/types/game'
import { gameManager } from '../../utils/gameManager'
import { seatUserFromEvent, throwHttp } from '../../utils/gameHttp'

/**
 * REST fallback for game actions (the client normally uses the socket).
 * Body: { gameId, action | type, tileId?, tileIds?, suit?, asPlayerId? (admin) }
 */

export default defineEventHandler(async (event) => {
  const user = await seatUserFromEvent(event)
  const body = (await readBody(event).catch(() => ({}))) ?? {}
  const { gameId, tileId, tileIds, suit, asPlayerId } = body
  const action = body.action ?? body.type

  if (!gameId || !action) {
    throw createError({ statusCode: 400, message: 'gameId and action are required' })
  }
  if (!Object.values(ActionType).includes(action)) {
    throw createError({ statusCode: 400, message: 'Invalid action type' })
  }

  try {
    await gameManager.act(gameId, { userId: user.userId, isAdmin: user.isAdmin, asPlayerId: user.isAdmin ? asPlayerId : undefined }, action, { tileId, tileIds, suit })
    const game = await gameManager.getGame(gameId)
    return { success: true, data: game ? gameManager.viewFor(game, user.userId, { isAdmin: user.isAdmin }) : null }
  } catch (error) {
    throwHttp(error)
  }
})
