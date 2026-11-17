import { gameManager } from '../../utils/gameManager'
import { throwHttp } from '../../utils/gameHttp'
import { resolveUserFromEvent } from '../../utils/session'

/** Table chat for the polling transport. Body: { gameId, kind: 'message' | 'emote', text } */
export default defineEventHandler(async (event) => {
  const user = await resolveUserFromEvent(event)
  const body = (await readBody(event).catch(() => ({}))) ?? {}
  if (!body.gameId) throw createError({ statusCode: 400, message: 'gameId is required' })
  const kind = body.kind === 'emote' ? 'emote' : 'message'
  try {
    await gameManager.chat(body.gameId, { userId: user.userId, name: user.name }, kind, String(body.text ?? ''))
    return { success: true }
  } catch (error) {
    throwHttp(error)
  }
})
