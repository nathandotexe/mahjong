import type { H3Event } from 'h3'
import { createError, deleteCookie, getCookie, setCookie } from 'h3'
import { AuthService } from '../services/authService'
import { UserService } from '../services/userService'
import type { User } from '../types/database'

export const SESSION_COOKIE = 'mahjong_session'
const WEEK = 60 * 60 * 24 * 7

export interface SessionUser {
  userId: string
  name: string
  avatar: string | null
  isAdmin: boolean
  isGuest: boolean
  email?: string
}

export function toSessionUser(user: User): SessionUser {
  return {
    userId: user.userId,
    name: user.name,
    avatar: user.avatar ?? null,
    isAdmin: !!user.isAdmin,
    isGuest: user.oauthProvider === 'guest',
    email: user.email
  }
}

/**
 * Issue a server session and set the cookies the client relies on.
 * Only `mahjong_session` is trusted server-side; the others are display hints.
 */
export async function issueSession(event: H3Event, user: User): Promise<{ token: string }> {
  const session = await AuthService.createSession(user.userId)
  const secure = process.env.NODE_ENV === 'production' && !process.env.INSECURE_COOKIES
  setCookie(event, SESSION_COOKIE, session.token, { httpOnly: true, secure, sameSite: 'lax', maxAge: WEEK, path: '/' })
  setCookie(event, 'auth_token', '1', { httpOnly: false, secure, sameSite: 'lax', maxAge: WEEK, path: '/' })
  setCookie(event, 'user_name', user.name, { sameSite: 'lax', maxAge: WEEK, path: '/' })
  setCookie(event, 'user_id', user.userId, { sameSite: 'lax', maxAge: WEEK, path: '/' })
  setCookie(event, 'is_admin', user.isAdmin ? 'true' : 'false', { sameSite: 'lax', maxAge: WEEK, path: '/' })
  return { token: session.token }
}

export function clearSessionCookies(event: H3Event) {
  for (const name of [SESSION_COOKIE, 'auth_token', 'user_name', 'user_id', 'is_admin']) {
    deleteCookie(event, name, { path: '/' })
  }
}

export async function resolveUserIdFromToken(token: string | undefined | null): Promise<string | null> {
  if (!token) return null
  return AuthService.validateSession(token)
}

export async function resolveUserIdFromEvent(event: H3Event): Promise<string> {
  const userId = await resolveUserIdFromToken(getCookie(event, SESSION_COOKIE))
  if (!userId) {
    throw createError({ statusCode: 401, message: 'Not authenticated' })
  }
  return userId
}

export async function resolveUserFromEvent(event: H3Event): Promise<User> {
  const userId = await resolveUserIdFromEvent(event)
  const user = await UserService.getUserById(userId)
  if (!user) {
    throw createError({ statusCode: 401, message: 'Session user no longer exists' })
  }
  return user
}

export async function optionalUserFromEvent(event: H3Event): Promise<User | null> {
  try {
    return await resolveUserFromEvent(event)
  } catch {
    return null
  }
}

export async function requireAdminUser(event: H3Event): Promise<User> {
  const user = await resolveUserFromEvent(event)
  if (!user.isAdmin) {
    throw createError({ statusCode: 403, message: 'Admin privileges required' })
  }
  return user
}

export async function isAdminFromEvent(event: H3Event): Promise<boolean> {
  const user = await optionalUserFromEvent(event)
  return !!user?.isAdmin
}

/** Parse a raw Cookie header (Socket.IO handshake) and resolve the session user. */
export async function resolveUserFromCookieHeader(header: string | undefined): Promise<User | null> {
  if (!header) return null
  let token: string | null = null
  for (const part of header.split(';')) {
    const [rawKey, ...rest] = part.trim().split('=')
    if (rawKey && decodeURIComponent(rawKey) === SESSION_COOKIE) {
      token = decodeURIComponent(rest.join('=') || '')
      break
    }
  }
  const userId = await resolveUserIdFromToken(token)
  if (!userId) return null
  return UserService.getUserById(userId)
}
