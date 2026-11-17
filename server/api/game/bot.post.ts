import { gameManager } from '../../utils/gameManager'
import { seatUserFromEvent, throwHttp } from '../../utils/gameHttp'

/** Host seats an automatic player. Body: { gameId } */
export default defineEventHandler(async (event) => {
  const user = await seatUserFromEvent(event)
  const body = (await readBody(event).catch(() => ({}))) ?? {}
  if (!body.gameId) throw createError({ statusCode: 400, message: 'gameId is required' })
  try {
    await gameManager.addBot(body.gameId, { userId: user.userId, isAdmin: user.isAdmin })
    return { success: true }
  } catch (error) {
    throwHttp(error)
  }
})
