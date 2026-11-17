import { gameManager } from '../../utils/gameManager'
import { seatUserFromEvent, throwHttp } from '../../utils/gameHttp'

/** Host removes a seated player while waiting. Body: { gameId, playerId } */
export default defineEventHandler(async (event) => {
  const user = await seatUserFromEvent(event)
  const body = (await readBody(event).catch(() => ({}))) ?? {}
  if (!body.gameId || !body.playerId) throw createError({ statusCode: 400, message: 'gameId and playerId are required' })
  try {
    await gameManager.kick(body.gameId, { userId: user.userId, isAdmin: user.isAdmin }, body.playerId)
    return { success: true }
  } catch (error) {
    throwHttp(error)
  }
})
