import { gameManager } from '../../utils/gameManager'
import { seatUserFromEvent, throwHttp } from '../../utils/gameHttp'

/** Leave a room. Body: { gameId } */
export default defineEventHandler(async (event) => {
  const user = await seatUserFromEvent(event)
  const body = (await readBody(event).catch(() => ({}))) ?? {}
  if (!body.gameId) throw createError({ statusCode: 400, message: 'gameId is required' })
  try {
    await gameManager.leave(body.gameId, user.userId)
    return { success: true }
  } catch (error) {
    throwHttp(error)
  }
})
