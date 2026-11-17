import { gameManager } from '../../utils/gameManager'
import { loadGameOr404 } from '../../utils/gameHttp'
import { optionalUserFromEvent } from '../../utils/session'

/** Per-player masked view. Query: gameId or code; admins may pass reveal=1. */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const gameId = typeof query.gameId === 'string' ? query.gameId : undefined
  const code = typeof query.code === 'string' ? query.code : undefined
  if (!gameId && !code) {
    throw createError({ statusCode: 400, message: 'gameId or code is required' })
  }
  const user = await optionalUserFromEvent(event)
  const game = await loadGameOr404({ gameId, code })
  const view = gameManager.viewFor(game, user?.userId ?? null, {
    isAdmin: !!user?.isAdmin,
    revealAll: !!user?.isAdmin && query.reveal === '1'
  })
  return { success: true, data: view }
})
