import { randomUUID } from 'crypto'
import { getCollection } from '../utils/mongo'
import type { User } from '../types/database'

/**
 * Seed a few local dev accounts (quick login buttons + an admin) when the users collection
 * is empty. Never runs in production unless SEED_DEV_USERS=true.
 */
export default defineNitroPlugin(async () => {
  if (process.env.NODE_ENV === 'production' && process.env.SEED_DEV_USERS !== 'true') return
  try {
    const users = await getCollection<User>('users')
    const existing = await users.countDocuments({ oauthProvider: 'local' })
    if (existing > 0) return
    const now = new Date()
    const make = (name: string, isAdmin = false): User => ({
      userId: randomUUID(),
      email: `${name.toLowerCase().replace(/\s+/g, '')}@dev.local`,
      name,
      oauthProvider: 'local',
      isAdmin,
      createdAt: now,
      lastLoginAt: now,
      stats: { gamesPlayed: 0, gamesWon: 0, totalScore: 0, highestFan: 0, winRate: 0 }
    })
    await users.insertMany([make('Player 1'), make('Player 2'), make('Player 3'), make('Player 4'), make('Admin', true)])
    console.log('🌱 Seeded dev accounts: Player 1-4 and Admin')
  } catch (error) {
    console.warn('[seed] skipped:', (error as Error).message)
  }
})
