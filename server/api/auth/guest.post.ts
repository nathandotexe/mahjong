import { randomUUID } from 'crypto'
import { getCollection } from '../../utils/mongo'
import type { User } from '../../types/database'
import { issueSession, toSessionUser } from '../../utils/session'

/**
 * Guest login: a nickname is all a friend needs to sit down at a table.
 * Guest accounts are ordinary users with oauthProvider = 'guest'.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({}))
  const rawName = typeof body?.name === 'string' ? body.name : ''
  const name = rawName.replace(/\s+/g, ' ').trim().slice(0, 24)

  if (name.length < 1) {
    throw createError({ statusCode: 400, message: 'Please enter a nickname' })
  }

  const users = await getCollection<User>('users')
  const userId = randomUUID()
  const user: User = {
    userId,
    email: `guest-${userId}@guest.local`,
    name,
    avatar: null as unknown as string | undefined,
    oauthProvider: 'guest',
    isAdmin: false,
    createdAt: new Date(),
    lastLoginAt: new Date(),
    stats: { gamesPlayed: 0, gamesWon: 0, totalScore: 0, highestFan: 0, winRate: 0 }
  }
  await users.insertOne(user)
  await issueSession(event, user)

  return { success: true, user: toSessionUser(user) }
})
