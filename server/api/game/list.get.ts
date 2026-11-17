import { gameManager } from '../../utils/gameManager'

/** Alias of /api/game/waiting kept for older clients and the Postman collection. */
export default defineEventHandler(async () => {
  const games = await gameManager.listWaitingGames()
  return { success: true, data: { games } }
})
