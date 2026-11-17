import { gameManager } from '../../utils/gameManager'
import { optionalUserFromEvent } from '../../utils/session'

/** The live room the current user is seated at, if any (for the "rejoin" banner). */
export default defineEventHandler(async (event) => {
  const user = await optionalUserFromEvent(event)
  if (!user) return { success: true, data: null }
  const game = await gameManager.findLiveGameForUser(user.userId)
  if (!game) return { success: true, data: null }
  return {
    success: true,
    data: {
      gameId: game.gameId,
      code: game.code,
      phase: game.phase,
      playerCount: game.players.length,
      handNumber: game.handNumber
    }
  }
})
