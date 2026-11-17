import { resolveUserFromEvent, toSessionUser } from '../../utils/session'

/** Current user from the server session. */
export default defineEventHandler(async (event) => {
  const user = await resolveUserFromEvent(event)
  return {
    success: true,
    data: { ...toSessionUser(user), stats: user.stats }
  }
})
