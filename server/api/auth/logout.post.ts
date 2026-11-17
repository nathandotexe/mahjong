import { AuthService } from '../../services/authService'
import { SESSION_COOKIE, clearSessionCookies } from '../../utils/session'

export default defineEventHandler(async (event) => {
  const token = getCookie(event, SESSION_COOKIE)
  if (token) {
    await AuthService.deleteSession(token)
  }
  clearSessionCookies(event)
  return { success: true, message: 'Logged out successfully' }
})
