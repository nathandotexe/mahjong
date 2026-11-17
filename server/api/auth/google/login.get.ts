/**
 * Step 1: Initiate Google OAuth login. Query: next=/path to return to after login.
 */
export default defineEventHandler((event) => {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback'

  if (!clientId) {
    throw createError({
      statusCode: 503,
      message: 'Google sign-in is not configured on this server. Use a nickname instead.'
    })
  }

  const query = getQuery(event)
  const next = typeof query.next === 'string' && query.next.startsWith('/') ? query.next : '/'

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', 'openid email profile')
  authUrl.searchParams.set('access_type', 'offline')
  authUrl.searchParams.set('prompt', 'select_account')
  authUrl.searchParams.set('state', next)

  return { success: true, authUrl: authUrl.toString() }
})
