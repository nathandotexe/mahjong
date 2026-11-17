import {
  GamePhase,
  TileSuit,
  type GameEvent,
  type GameState,
  type GameView,
  type ListeningTile,
  type PlayerView,
  type Tile
} from '../../shared/types/game'
import { availableActions, concealedKongOptions, extendedKongOptions, mustDiscardSuit } from './engine'
import { listeningKinds, remainingCopies } from './hand'
import { bestFanForKind } from './fan'

function hiddenTiles(playerId: string, count: number): Tile[] {
  const tiles: Tile[] = []
  for (let i = 0; i < count; i++) tiles.push({ id: `hidden-${playerId}-${i}`, suit: TileSuit.CHARACTERS, value: 0 })
  return tiles
}

/** Tiles the viewer can see: own hand, every discard, every exposed meld, revealed winning hands. */
function visibleTiles(state: GameState, viewerId: string | null): Tile[] {
  const tiles: Tile[] = []
  for (const p of state.players) {
    tiles.push(...p.hand.discardedTiles)
    for (const meld of p.hand.exposedMelds) tiles.push(...meld.tiles)
    if (p.id === viewerId) tiles.push(...p.hand.concealedTiles)
    else if (p.wins.length > 0 && !state.rules.bloodRiver) tiles.push(...p.hand.concealedTiles)
  }
  return tiles
}

export function listeningFor(state: GameState, playerId: string): ListeningTile[] {
  const player = state.players.find(p => p.id === playerId)
  if (!player || state.phase !== GamePhase.PLAYING) return []
  const hand = player.hand.concealedTiles
  // Only meaningful when the hand is one tile short (after a discard / before a draw) or when
  // the player holds an extra tile: then evaluate each possible discard? Keep it simple: 13-shape only.
  const expected = 13 - player.hand.exposedMelds.length * 3
  if (hand.length !== expected) return []
  const seen = visibleTiles(state, playerId)
  return listeningKinds(hand, player.hand.exposedMelds, player.missingSuit).map(kind => {
    const fan = bestFanForKind(hand, player.hand.exposedMelds, kind, state.rules)
    return {
      suit: kind.suit,
      value: kind.value,
      remaining: remainingCopies(kind, seen),
      fan: fan?.totalFan ?? 0,
      summary: fan?.summary ?? ''
    }
  })
}

/** Mask events so a tile draw is only visible to the drawer (and admins). */
export function maskEvents(events: GameEvent[], viewerPlayerId: string | null, isAdmin: boolean): GameEvent[] {
  return events.map(event => {
    if (event.type === 'tile_drawn' && event.playerId !== viewerPlayerId && !isAdmin) {
      return { ...event, tile: null }
    }
    return event
  })
}

export interface ViewOptions {
  userId: string | null
  isAdmin?: boolean
  revealAll?: boolean
  now?: number
}

export function buildView(state: GameState, options: ViewOptions): GameView {
  const viewer = options.userId ? state.players.find(p => p.userId === options.userId) ?? null : null
  const viewerId = viewer?.id ?? null
  const reveal = !!options.isAdmin && !!options.revealAll
  const ended = state.phase === GamePhase.ENDED

  const players: PlayerView[] = state.players.map(p => {
    const isSelf = p.id === viewerId
    const showHand = isSelf || reveal || (ended && p.status !== 'waiting') || (p.wins.length > 0 && !state.rules.bloodRiver)
    return {
      ...p,
      hand: {
        concealedTiles: showHand ? p.hand.concealedTiles : hiddenTiles(p.id, p.hand.concealedTiles.length),
        exposedMelds: p.hand.exposedMelds,
        discardedTiles: p.hand.discardedTiles
      },
      handCount: p.hand.concealedTiles.length,
      isSelf,
      passedHu: isSelf ? p.passedHu : null
    }
  })

  const claim = state.claimWindow
  const myClaim = claim && viewerId ? claim.claims.find(c => c.playerId === viewerId) ?? null : null

  return {
    gameId: state.gameId,
    code: state.code,
    hostId: state.hostId,
    phase: state.phase,
    endReason: state.endReason,
    rules: state.rules,
    players,
    viewerPlayerId: viewerId,
    isHost: !!viewer && viewer.isHost,
    isAdmin: !!options.isAdmin,
    wallCount: state.wall.length,
    currentPlayerIndex: state.currentPlayerIndex,
    dealerIndex: state.dealerIndex,
    discardPile: state.discardPile,
    winnersCount: state.winnersCount,
    roundNumber: state.roundNumber,
    handNumber: state.handNumber,
    sessionScores: state.sessionScores,
    ledger: state.ledger.filter(e => e.handNumber === state.handNumber),
    handHistory: state.handHistory,
    claimWindow: claim
      ? {
          kind: claim.kind,
          tile: claim.tile,
          fromPlayerId: claim.fromPlayerId,
          deadline: claim.deadline,
          meldIndex: claim.meldIndex,
          pending: claim.claims.filter(c => c.response === null).map(c => c.playerId),
          mine: myClaim && myClaim.response === null ? myClaim : null
        }
      : null,
    exchange: state.exchange
      ? {
          direction: state.exchange.direction,
          submitted: state.players.filter(p => p.exchangeSubmitted).map(p => p.id),
          mine: viewerId ? state.exchange.submissions[viewerId] ?? null : null,
          received: viewerId ? state.exchange.received[viewerId] ?? null : null
        }
      : null,
    lastDiscard: state.lastDiscard,
    turnDeadline: state.turnDeadline,
    availableActions: viewerId ? availableActions(state, viewerId) : [],
    listening: viewerId ? listeningFor(state, viewerId) : [],
    concealedKongOptions: viewer ? concealedKongOptions(viewer) : [],
    extendedKongOptions: viewer ? extendedKongOptions(viewer) : [],
    mustDiscardSuit: viewer ? mustDiscardSuit(viewer) : null,
    finalScores: state.finalScores,
    version: state.version,
    serverTime: options.now ?? Date.now()
  }
}
