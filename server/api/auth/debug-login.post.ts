import { UserService } from '../../services/userService'
import { issueSession, toSessionUser } from '../../utils/session'

/**
 * Quick login as one of the seeded dev accounts (used by the Playwright smoke test).
 * Disabled in production unless ALLOW_DEBUG_LOGIN=true.
 */
export default defineEventHandler(async (event) => {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEBUG_LOGIN !== 'true') {
    throw createError({ statusCode: 404, message: 'Not found' })
  }

  const body = await readBody(event)
  const { userId } = body

  if (!userId) {
    throw createError({ statusCode: 400, message: 'userId is required' })
  }

  const user = await UserService.getUserById(userId)
  if (!user) {
    throw createError({ statusCode: 404, message: 'User not found' })
  }

  const session = await issueSession(event, user)

  return {
    success: true,
    token: session.token,
    user: { ...toSessionUser(user), stats: user.stats }
  }
})
