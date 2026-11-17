import { getCollection } from './mongo'
import { GamePhase, type GameState } from '../../shared/types/game'

const COLLECTION_NAME = 'mahjongGames'

/**
 * Stored shape: the full GameState plus a few denormalised fields for lobby queries.
 * Dates are kept as epoch numbers inside the state; `updatedAt` is a real Date for sorting.
 */
export interface StoredGame extends GameState {
  playerUserIds: string[]
  playerCount: number
  updatedAt: Date
}

export class PersistConflictError extends Error {
  constructor(public readonly gameId: string) {
    super('Game state was modified concurrently')
    this.name = 'PersistConflictError'
  }
}

function toStored(state: GameState): StoredGame {
  return {
    ...state,
    playerUserIds: state.players.map(p => p.userId),
    playerCount: state.players.length,
    updatedAt: new Date()
  }
}

function fromStored(doc: any): GameState {
  const { _id, playerUserIds, playerCount, updatedAt, ...state } = doc
  // Backfill fields for documents persisted by older versions of the engine.
  state.rules ??= {}
  state.sessionScores ??= {}
  state.ledger ??= []
  state.handHistory ??= []
  state.claimWindow ??= null
  state.exchange ??= null
  state.lastDiscard ??= null
  state.lastKong ??= null
  state.turnDeadline ??= null
  state.pristine ??= false
  state.nextDealerId ??= null
  state.eventSeq ??= 0
  state.recentEvents ??= []
  state.version ??= 0
  state.handNumber ??= state.phase === GamePhase.WAITING ? 0 : 1
  state.code ??= String(state.gameId).slice(0, 6).toUpperCase()
  state.hostId ??= state.players?.[0]?.userId ?? ''
  for (const p of state.players ?? []) {
    p.userId ??= p.id
    p.wins ??= []
    p.sessionScore ??= 0
    p.handLocked ??= false
    p.lastDrawnTileId ??= null
    p.passedHu ??= null
    p.drawCount ??= 0
    p.exchangeSubmitted ??= false
    p.connected ??= false
    p.lastSeenAt ??= 0
    p.autoPlay ??= false
    p.isBot ??= false
    p.isHost ??= p.userId === state.hostId
  }
  return state as GameState
}

/**
 * Compare-and-swap save. `expectedVersion` is the version loaded before the mutation;
 * the caller must already have incremented `state.version`.
 */
export async function saveGameState(state: GameState, expectedVersion: number): Promise<void> {
  const collection = await getCollection<StoredGame>(COLLECTION_NAME)
  const doc = toStored(state)
  if (expectedVersion === 0 && state.version === 1) {
    // First save; tolerate a pre-existing document with the same id (dev HMR) by replacing it.
    await collection.updateOne({ gameId: state.gameId }, { $set: doc as any }, { upsert: true })
    return
  }
  const result = await collection.updateOne({ gameId: state.gameId, version: expectedVersion }, { $set: doc as any })
  if (result.matchedCount === 0) {
    const exists = await collection.countDocuments({ gameId: state.gameId })
    if (exists === 0) {
      await collection.insertOne(doc as any)
      return
    }
    throw new PersistConflictError(state.gameId)
  }
}

export async function loadGameState(gameId: string): Promise<GameState | null> {
  const collection = await getCollection<StoredGame>(COLLECTION_NAME)
  const doc = await collection.findOne({ gameId })
  return doc ? fromStored(doc) : null
}

export async function loadGameByCode(code: string): Promise<GameState | null> {
  const collection = await getCollection<StoredGame>(COLLECTION_NAME)
  const docs = await collection.find({ code }).sort({ updatedAt: -1 }).limit(5).toArray()
  // Prefer a live room over an ended one with the same code.
  const live = docs.find(d => d.phase !== GamePhase.ENDED) ?? docs[0]
  return live ? fromStored(live) : null
}

export async function loadActiveGameStates(): Promise<GameState[]> {
  const collection = await getCollection<StoredGame>(COLLECTION_NAME)
  const docs = await collection.find({ phase: { $ne: GamePhase.ENDED } }).sort({ updatedAt: -1 }).limit(200).toArray()
  return docs.map(fromStored)
}

export async function loadWaitingGameStates(): Promise<GameState[]> {
  const collection = await getCollection<StoredGame>(COLLECTION_NAME)
  const docs = await collection.find({ phase: GamePhase.WAITING }).sort({ updatedAt: -1 }).limit(25).toArray()
  return docs.map(fromStored)
}

export async function loadGamesForUser(userId: string): Promise<GameState[]> {
  const collection = await getCollection<StoredGame>(COLLECTION_NAME)
  const docs = await collection
    .find({ playerUserIds: userId, phase: { $ne: GamePhase.ENDED } })
    .sort({ updatedAt: -1 })
    .limit(10)
    .toArray()
  return docs.map(fromStored)
}

export async function deleteGameState(gameId: string): Promise<void> {
  const collection = await getCollection<StoredGame>(COLLECTION_NAME)
  await collection.deleteOne({ gameId })
}
