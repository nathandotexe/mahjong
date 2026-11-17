import { getCollection } from '../utils/mongo'
import type { MatchHistory } from '../types/database'
import { PlayerStatus, type GameEndReason, type GameState, type HandSummary } from '../../shared/types/game'

export class MatchHistoryService {
  private static COLLECTION_NAME = 'matchHistory'

  /** Record one finished hand. Keyed by gameId + handNumber so re-saves are idempotent. */
  static async recordHand(game: GameState, summary: HandSummary): Promise<void> {
    const collection = await getCollection<MatchHistory>(this.COLLECTION_NAME)
    const completedAt = new Date(summary.endedAt)

    const history: MatchHistory = {
      gameId: game.gameId,
      roomId: game.gameId,
      code: game.code,
      handNumber: summary.handNumber,
      rules: game.rules,
      endReason: summary.endReason as GameEndReason,
      winnersCount: summary.wins.length,
      roundNumber: game.roundNumber,
      completedAt,
      durationMs: summary.durationMs,
      finalScores: summary.scores,
      sessionScores: { ...game.sessionScores },
      wins: summary.wins,
      ledger: summary.ledger,
      results: game.players.map(player => ({
        playerId: player.id,
        userId: player.userId,
        name: player.name,
        avatar: player.avatar ?? null,
        position: player.position,
        status: player.status,
        winOrder: player.winOrder ?? null,
        winRound: player.winRound ?? null,
        winTimestamp: player.winTimestamp ?? null,
        wonFan: player.wonFan,
        windScore: player.windScore,
        rainScore: player.rainScore,
        finalScore: summary.scores[player.id] ?? 0,
        sessionScore: game.sessionScores[player.id] ?? 0,
        fanSummary: player.wins.map(w => w.fan.summary).join(' / ') || null
      }))
    }

    await collection.updateOne(
      { gameId: game.gameId, handNumber: summary.handNumber },
      { $set: history },
      { upsert: true }
    )

    // Light-weight user stats update (best effort).
    try {
      const users = await getCollection<any>('users')
      for (const player of game.players) {
        const won = player.status === PlayerStatus.WON
        await users.updateOne(
          { userId: player.userId },
          {
            $inc: {
              'stats.gamesPlayed': 1,
              'stats.gamesWon': won ? 1 : 0,
              'stats.totalScore': summary.scores[player.id] ?? 0
            }
          }
        )
      }
    } catch (error) {
      console.warn('[matchHistory] stats update skipped:', (error as Error).message)
    }
  }

  static async listMatches(options?: { userId?: string; limit?: number }): Promise<MatchHistory[]> {
    const collection = await getCollection<MatchHistory>(this.COLLECTION_NAME)
    const { userId, limit = 20 } = options || {}
    const query = userId ? { 'results.userId': userId } : {}
    return collection.find(query).sort({ completedAt: -1 }).limit(limit).toArray()
  }
}
