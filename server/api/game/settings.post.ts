import { gameManager } from '../../utils/gameManager'
import { seatUserFromEvent, throwHttp } from '../../utils/gameHttp'

/** Host updates room rules between hands. Body: { gameId, rules } */
export default defineEventHandler(async (event) => {
  const user = await seatUserFromEvent(event)
  const body = (await readBody(event).catch(() => ({}))) ?? {}
  if (!body.gameId) throw createError({ statusCode: 400, message: 'gameId is required' })
  try {
    await gameManager.updateRules(body.gameId, { userId: user.userId, isAdmin: user.isAdmin }, body.rules ?? {})
    const game = await gameManager.getGame(body.gameId)
    return { success: true, data: game?.rules }
  } catch (error) {
    throwHttp(error)
  }
})
