import { gameManager } from '../../utils/gameManager'
import { seatUserFromEvent, throwHttp } from '../../utils/gameHttp'

/** Create a room. The session user becomes the host. Body: { rules?: Partial<RuleConfig> } */
export default defineEventHandler(async (event) => {
  const user = await seatUserFromEvent(event)
  const body = (await readBody(event).catch(() => ({}))) ?? {}
  try {
    const state = await gameManager.createGame(user, body.rules)
    const view = gameManager.viewFor(state, user.userId, { isAdmin: user.isAdmin })
    return {
      success: true,
      data: { gameId: state.gameId, code: state.code, playerId: view.viewerPlayerId, view }
    }
  } catch (error) {
    throwHttp(error)
  }
})
