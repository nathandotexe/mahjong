import type { H3Event } from 'h3'
import { createError } from 'h3'
import { EngineError, gameManager } from './gameManager'
import { resolveUserFromEvent } from './session'
import type { SeatUser } from '../engine/engine'
import type { GameState } from '../../shared/types/game'

const STATUS_BY_CODE: Record<string, number> = {
  game_not_found: 404,
  player_not_found: 404,
  forbidden: 403,
  unauthenticated: 401,
  room_full: 409,
  already_started: 409,
  conflict: 409
}

/** Translate engine errors into HTTP errors; rethrow anything else. */
export function throwHttp(error: unknown): never {
  if (error instanceof EngineError) {
    throw createError({ statusCode: STATUS_BY_CODE[error.code] ?? 400, message: error.message, data: { code: error.code } })
  }
  if (error && typeof error === 'object' && 'statusCode' in error) throw error as unknown as Error
  const message = error instanceof Error ? error.message : 'Unexpected error'
  throw createError({ statusCode: 500, message })
}

export async function seatUserFromEvent(event: H3Event): Promise<SeatUser & { isAdmin: boolean }> {
  const user = await resolveUserFromEvent(event)
  return { userId: user.userId, name: user.name, avatar: user.avatar ?? null, isAdmin: !!user.isAdmin }
}

export async function loadGameOr404(gameIdOrCode: { gameId?: string; code?: string }): Promise<GameState> {
  let game: GameState | null = null
  if (gameIdOrCode.gameId) game = await gameManager.getGame(gameIdOrCode.gameId)
  if (!game && gameIdOrCode.code) game = await gameManager.getGameByCode(gameIdOrCode.code)
  if (!game) throw createError({ statusCode: 404, message: 'Game not found' })
  return game
}
