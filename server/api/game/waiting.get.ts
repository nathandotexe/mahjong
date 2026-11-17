import { gameManager } from '../../utils/gameManager'

/** Open tables that can still be joined. */
export default defineEventHandler(async () => {
  const games = await gameManager.listWaitingGames()
  return { success: true, data: { games } }
})
