<template>
  <div class="table-wrap" v-if="view && me">
    <div class="table-grid" :class="{ 'has-left': !!seats.left, 'has-right': !!seats.right, 'has-top': !!seats.top }">
      <!-- Opponents -->
      <div class="area area-top" v-if="seats.top">
        <SeatPanel
          :player="seats.top"
          dir="top"
          :active="activeId === seats.top.id"
          :claiming="claimingIds.includes(seats.top.id)"
          :seconds="secondsFor(seats.top.id)"
          :timer-total="timerTotal"
          :highlight-id="lastDiscardId"
          :session-score="view.sessionScores[seats.top.id] ?? 0"
          :callouts="calloutsFor(seats.top.id)"
          :floats="floatsFor(seats.top.id)"
          :revealed="view.isAdmin && room.revealAll.value"
          :show-ting="view.phase === 'ended' || view.rules.bloodRiver"
        />
      </div>
      <div class="area area-left" v-if="seats.left">
        <SeatPanel
          :player="seats.left"
          dir="left"
          :active="activeId === seats.left.id"
          :claiming="claimingIds.includes(seats.left.id)"
          :seconds="secondsFor(seats.left.id)"
          :timer-total="timerTotal"
          :highlight-id="lastDiscardId"
          :session-score="view.sessionScores[seats.left.id] ?? 0"
          :callouts="calloutsFor(seats.left.id)"
          :floats="floatsFor(seats.left.id)"
          :revealed="view.isAdmin && room.revealAll.value"
          :show-ting="view.phase === 'ended' || view.rules.bloodRiver"
        />
      </div>
      <div class="area area-right" v-if="seats.right">
        <SeatPanel
          :player="seats.right"
          dir="right"
          :active="activeId === seats.right.id"
          :claiming="claimingIds.includes(seats.right.id)"
          :seconds="secondsFor(seats.right.id)"
          :timer-total="timerTotal"
          :highlight-id="lastDiscardId"
          :session-score="view.sessionScores[seats.right.id] ?? 0"
          :callouts="calloutsFor(seats.right.id)"
          :floats="floatsFor(seats.right.id)"
          :revealed="view.isAdmin && room.revealAll.value"
          :show-ting="view.phase === 'ended' || view.rules.bloodRiver"
        />
      </div>

      <!-- Centre -->
      <div class="area area-center">
        <div class="center-card">
          <div class="center-stats">
            <span class="stat"><b>{{ view.wallCount }}</b><small>tiles left</small></span>
            <span class="stat"><b>{{ view.handNumber }}</b><small>hand</small></span>
            <span class="stat" v-if="view.rules.bloodRiver"><b>Blood River</b><small>mode</small></span>
          </div>

          <Transition name="fade" mode="out-in">
            <ExchangePanel
              v-if="view.phase === 'exchanging'"
              key="exchange"
              :selected-count="selectedIds.length"
              :submitted="!!me.exchangeSubmitted"
              :submitted-count="view.exchange?.submitted.length ?? 0"
              :total="view.players.length"
              :mine="view.exchange?.mine ?? null"
              :busy="room.pendingAction.value"
              @confirm="confirmExchange"
              @suggest="suggestExchange"
            />
            <div v-else-if="revealBanner" key="reveal" class="reveal">
              <div class="reveal-arrow">{{ revealBanner.icon }}</div>
              <div>
                <b>Swap three · {{ revealBanner.label }}</b>
                <p>You received</p>
                <div class="reveal-tiles">
                  <MahjongTile v-for="t in view.exchange?.received ?? []" :key="t.id" :tile="t" size="sm" flat highlight />
                </div>
              </div>
            </div>
            <SuitPicker
              v-else-if="view.phase === 'choosing_suit'"
              key="suit"
              :hand="me.hand.concealedTiles"
              :chosen="me.missingSuit"
              :chosen-count="view.players.filter(p => p.missingSuit).length"
              :total="view.players.length"
              @choose="chooseSuit"
            />
            <div v-else key="play" class="center-play">
              <div v-if="view.lastDiscard" class="spotlight">
                <MahjongTile :tile="view.lastDiscard.tile" size="md" :highlight="!!view.claimWindow" />
                <small>{{ room.playerName(view.lastDiscard.playerId) }}</small>
              </div>
              <p class="turn-text">{{ turnText }}</p>
              <TurnTimer v-if="centerSeconds !== null" :seconds="centerSeconds" :total="timerTotal" />
            </div>
          </Transition>
        </div>
      </div>

      <!-- Self -->
      <div class="area area-self" :class="{ 'is-turn': room.isMyTurn.value }">
        <CallOut :callouts="calloutsFor(me.id)" :floats="floatsFor(me.id)" />
        <div class="self-top">
          <div class="self-id">
            <span class="self-name">{{ me.name }}</span>
            <span v-if="me.isDealer" class="mj-chip gold">Dealer</span>
            <span v-if="me.missingSuit" class="mj-chip" :class="suitClass(me.missingSuit)" title="Void suit">Void: {{ suitLabel(me.missingSuit) }}</span>
            <span v-if="me.wins.length" class="mj-chip red">Won{{ me.wins.length > 1 ? ` ×${me.wins.length}` : '' }}</span>
            <span v-if="me.handLocked" class="mj-chip muted">hand locked</span>
            <span class="mj-chip muted" :class="cls(view.sessionScores[me.id] ?? 0)">{{ fmt(view.sessionScores[me.id] ?? 0) }}</span>
          </div>
          <TingHelper :listening="view.listening" />
          <TurnTimer v-if="room.isMyTurn.value && room.secondsLeft.value !== null" :seconds="room.secondsLeft.value" :total="timerTotal" small />
        </div>

        <DiscardRiver :tiles="me.hand.discardedTiles" :highlight-id="lastDiscardId" size="sm" />

        <ActionBar
          :actions="view.availableActions"
          :claim="view.claimWindow?.mine ? { kind: view.claimWindow.kind, tile: view.claimWindow.tile } : null"
          :from-name="view.claimWindow ? room.playerName(view.claimWindow.fromPlayerId) : ''"
          :selected-tile="view.phase === 'playing' ? selectedTile : null"
          :hint="hint"
          :busy="room.pendingAction.value"
          :urgent="(room.secondsLeft.value ?? 99) <= 5 && (room.isMyTurn.value || !!view.claimWindow?.mine)"
          @hu="doAct('hu')"
          @peng="doAct('peng')"
          @kong="doAct('kong')"
          @pass="doAct('pass')"
          @extended-kong="doExtendedKong"
          @concealed-kong="doConcealedKong"
          @discard="discardSelected"
          @clear="selectedIds = []"
        />

        <div v-if="kongChooser.length" class="kong-chooser">
          <span>Which kong?</span>
          <button v-for="opt in kongChooser" :key="opt.key" class="kong-option" @click="opt.run()">
            <MahjongTile :tile="opt.tile" size="sm" flat />
          </button>
          <button class="mj-btn ghost small" @click="kongChooser = []">Cancel</button>
        </div>

        <SelfHand
          :player="me"
          :selected-ids="selectedIds"
          :interactive="handInteractive"
          :multi-select="view.phase === 'exchanging'"
          :must-discard-suit="view.phase === 'playing' ? view.mustDiscardSuit : null"
          :lock-to-suit="view.phase === 'exchanging' ? exchangeSuit : null"
          :size="handSize"
          @tile-click="onTileClick"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ActionType, type GameEvent, type Tile, type TileSuit } from '~/types/game'
import { ROOM_KEY } from '~/composables/roomKey'
import type { CalloutItem, FloatItem } from './CallOut.vue'

const room = inject(ROOM_KEY)!
const { play } = useSound()

const view = room.view
const me = room.me
const seats = room.seats

// ---------- selection ----------
const selectedIds = ref<string[]>([])
const selectedTile = computed<Tile | null>(() => {
  if (selectedIds.value.length !== 1) return null
  return me.value?.hand.concealedTiles.find(t => t.id === selectedIds.value[0]) ?? null
})
const exchangeSuit = computed<TileSuit | null>(() => {
  if (!selectedIds.value.length || !me.value) return null
  const first = me.value.hand.concealedTiles.find(t => t.id === selectedIds.value[0])
  return first?.suit ?? null
})

watch(() => view.value?.phase, () => (selectedIds.value = []))
watch(() => me.value?.hand.concealedTiles.length, () => {
  selectedIds.value = selectedIds.value.filter(id => me.value?.hand.concealedTiles.some(t => t.id === id))
})

const handInteractive = computed(() => {
  if (!view.value || !me.value) return false
  if (view.value.phase === 'exchanging') return !me.value.exchangeSubmitted
  if (view.value.phase === 'playing') return room.isMyTurn.value && room.canAct(ActionType.DISCARD)
  return false
})
const handSize = computed(() => ((me.value?.hand.concealedTiles.length ?? 0) > 11 ? 'md' : 'lg'))

const onTileClick = async (tile: Tile) => {
  if (!view.value || !me.value) return
  if (view.value.phase === 'exchanging') {
    const idx = selectedIds.value.indexOf(tile.id)
    if (idx !== -1) {
      selectedIds.value = selectedIds.value.filter(id => id !== tile.id)
      return
    }
    if (exchangeSuit.value && exchangeSuit.value !== tile.suit) selectedIds.value = []
    if (selectedIds.value.length >= 3) return
    selectedIds.value = [...selectedIds.value, tile.id]
    play('click')
    return
  }
  if (view.value.phase !== 'playing') return
  if (selectedIds.value[0] === tile.id) {
    await discardSelected()
  } else {
    selectedIds.value = [tile.id]
    play('click')
  }
}

const discardSelected = async () => {
  const tile = selectedTile.value
  if (!tile) return
  const ok = await room.act(ActionType.DISCARD, { tileId: tile.id })
  if (ok) selectedIds.value = []
}

const confirmExchange = async () => {
  if (selectedIds.value.length !== 3) return
  const ok = await room.act(ActionType.EXCHANGE_TILES, { tileIds: [...selectedIds.value] })
  if (ok) selectedIds.value = []
}

const suggestExchange = () => {
  const hand = me.value?.hand.concealedTiles ?? []
  const bySuit = new Map<TileSuit, Tile[]>()
  for (const t of hand) bySuit.set(t.suit, [...(bySuit.get(t.suit) ?? []), t])
  const candidates = Array.from(bySuit.values()).filter(g => g.length >= 3).sort((a, b) => a.length - b.length)
  const group = candidates[0]
  if (!group) return
  selectedIds.value = group.slice(0, 3).map(t => t.id)
}

const chooseSuit = (suit: TileSuit) => room.act(ActionType.CHOOSE_SUIT, { suit })

const doAct = (action: string) => room.act(action as ActionType)

// ---------- kongs ----------
const kongChooser = ref<{ key: string; tile: Tile; run: () => void }[]>([])
const doConcealedKong = () => {
  const options = view.value?.concealedKongOptions ?? []
  if (options.length <= 1) {
    room.act(ActionType.CONCEALED_KONG, { tileIds: options[0]?.map(t => t.id) })
    return
  }
  kongChooser.value = options.map(group => ({
    key: group[0]!.id,
    tile: group[0]!,
    run: () => {
      kongChooser.value = []
      room.act(ActionType.CONCEALED_KONG, { tileIds: group.map(t => t.id) })
    }
  }))
}
const doExtendedKong = () => {
  const options = view.value?.extendedKongOptions ?? []
  if (options.length <= 1) {
    room.act(ActionType.EXTENDED_KONG, { tileId: options[0]?.id })
    return
  }
  kongChooser.value = options.map(tile => ({
    key: tile.id,
    tile,
    run: () => {
      kongChooser.value = []
      room.act(ActionType.EXTENDED_KONG, { tileId: tile.id })
    }
  }))
}

// ---------- turn / timers ----------
const activeId = computed(() => (view.value?.claimWindow ? null : room.currentPlayer.value?.id ?? null))
const claimingIds = computed(() => view.value?.claimWindow?.pending ?? [])
const lastDiscardId = computed(() => view.value?.lastDiscard?.tile.id ?? null)
const timerTotal = computed(() => {
  const rules = view.value?.rules
  if (!rules) return 20
  if (view.value?.phase !== 'playing') return 30
  if (view.value?.claimWindow) return rules.claimSeconds || 8
  return rules.turnSeconds || 20
})
const secondsFor = (playerId: string) => {
  if (!view.value) return null
  if (view.value.claimWindow) return claimingIds.value.includes(playerId) ? room.secondsLeft.value : null
  return activeId.value === playerId ? room.secondsLeft.value : null
}
const centerSeconds = computed(() => {
  if (!view.value?.claimWindow) return null
  if (view.value.claimWindow.mine) return null
  return room.secondsLeft.value
})
const turnText = computed(() => {
  if (!view.value || !me.value) return ''
  const cw = view.value.claimWindow
  if (cw) {
    if (cw.mine) return cw.kind === 'kong_rob' ? 'You can rob this kong!' : 'Your call'
    const names = cw.pending.map(id => room.playerName(id)).join(', ')
    return `Waiting for ${names || 'players'} to decide…`
  }
  if (room.isMyTurn.value) {
    if (me.value.handLocked) return 'Your turn — discard the drawn tile'
    if (view.value.mustDiscardSuit) return `Your turn — discard your void suit (${suitLabel(view.value.mustDiscardSuit)}) first`
    return 'Your turn'
  }
  const current = room.currentPlayer.value
  return current ? `${current.name}'s turn` : ''
})
const hint = computed(() => {
  if (!view.value || !me.value || view.value.phase !== 'playing') return null
  if (room.isMyTurn.value && !selectedTile.value && view.value.availableActions.length === 1) {
    return me.value.handLocked ? 'Tap the drawn tile to discard it' : 'Tap a tile, then tap again to discard'
  }
  return null
})

// ---------- events → callouts, floats, sounds ----------
const callouts = ref<Record<string, CalloutItem[]>>({})
const floats = ref<Record<string, FloatItem[]>>({})
let seq = 0
const calloutsFor = (id: string) => callouts.value[id] ?? []
const floatsFor = (id: string) => floats.value[id] ?? []
const pushCallout = (playerId: string, item: Omit<CalloutItem, 'id'>) => {
  const id = ++seq
  callouts.value = { ...callouts.value, [playerId]: [...(callouts.value[playerId] ?? []), { id, ...item }] }
  setTimeout(() => {
    callouts.value = { ...callouts.value, [playerId]: (callouts.value[playerId] ?? []).filter(c => c.id !== id) }
  }, 1700)
}
const pushFloat = (playerId: string, points: number) => {
  const id = ++seq
  floats.value = { ...floats.value, [playerId]: [...(floats.value[playerId] ?? []), { id, points }] }
  setTimeout(() => {
    floats.value = { ...floats.value, [playerId]: (floats.value[playerId] ?? []).filter(f => f.id !== id) }
  }, 1700)
}

const revealBanner = ref<{ label: string; icon: string } | null>(null)
let revealTimer: ReturnType<typeof setTimeout> | null = null

const handleEvent = (event: GameEvent) => {
  const mine = event.playerId === me.value?.id
  switch (event.type) {
    case 'tile_discarded':
      play('click')
      break
    case 'tile_drawn':
      if (mine) play('draw')
      break
    case 'claim_peng':
      pushCallout(event.playerId!, { text: 'PUNG', kind: 'peng' })
      play('claim')
      break
    case 'claim_kong':
    case 'kong_concealed':
    case 'kong_extended':
      if (event.payload?.pendingRob) break
      pushCallout(event.playerId!, { text: 'KONG', kind: 'kong', sub: event.type === 'kong_concealed' ? 'concealed' : event.type === 'kong_extended' ? 'added to pung' : 'exposed' })
      play('kong')
      break
    case 'hu':
      pushCallout(event.playerId!, { text: event.payload?.selfDrawn ? 'SELF-DRAW' : 'WIN', kind: 'hu', sub: event.label ?? undefined })
      play('win')
      break
    case 'score':
      if (event.playerId && event.points) pushFloat(event.playerId, event.points)
      if (event.targetPlayerId && event.points) pushFloat(event.targetPlayerId, -event.points)
      break
    case 'turn':
      if (mine) play('alert')
      break
    case 'timeout':
      if (event.playerId && event.label === 'turn') pushCallout(event.playerId, { text: 'Auto-play', kind: 'info' })
      break
    case 'exchange_revealed': {
      const dir = String(event.payload?.direction ?? '')
      const label = dir === 'clockwise' ? 'to the next player ↻' : dir === 'anticlockwise' ? 'to the previous player ↺' : 'across the table ⇵'
      revealBanner.value = { label, icon: dir === 'across' ? '⇵' : dir === 'clockwise' ? '↻' : '↺' }
      play('shuffle')
      if (revealTimer) clearTimeout(revealTimer)
      revealTimer = setTimeout(() => (revealBanner.value = null), 3200)
      break
    }
    case 'hand_started':
      play('shuffle')
      break
  }
}

let unsubscribe: (() => void) | null = null
onMounted(() => {
  unsubscribe = room.onEvent(handleEvent)
})
onUnmounted(() => {
  unsubscribe?.()
  if (revealTimer) clearTimeout(revealTimer)
})

watch(
  () => [view.value?.claimWindow?.mine ? 1 : 0, room.secondsLeft.value] as const,
  ([mine, secs], [, prev]) => {
    if (secs === null || secs === prev) return
    const myDecision = room.isMyTurn.value || mine === 1
    if (myDecision && secs <= 5 && secs > 0) play('tick')
  }
)
watch(
  () => view.value?.claimWindow?.mine,
  next => {
    if (next) play('alert')
  }
)

// ---------- helpers ----------
const suitLabel = (suit: TileSuit) => (suit === 'wan' ? 'Characters' : suit === 'dots' ? 'Dots' : 'Bamboo')
const suitClass = (suit: TileSuit) => (suit === 'wan' ? 'red' : suit === 'dots' ? 'blue' : 'green')
const fmt = (v: number) => (v > 0 ? `+${v}` : `${v}`)
const cls = (v: number) => (v > 0 ? 'score-pos' : v < 0 ? 'score-neg' : 'score-zero')
</script>

<style scoped>
.table-wrap {
  --tile-w: clamp(30px, 6.4vw, 46px);
  --tile-h: calc(var(--tile-w) * 1.42);
  position: relative;
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
  border-radius: 24px;
  padding: 10px;
  background:
    radial-gradient(ellipse at 50% 40%, rgba(255, 255, 255, 0.08), transparent 55%),
    linear-gradient(180deg, var(--felt) 0%, var(--felt-deep) 100%);
  border: 6px solid var(--felt-edge);
  box-shadow: inset 0 0 0 2px rgba(0, 0, 0, 0.25), var(--shadow);
  box-sizing: border-box;
}
.table-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: minmax(0, 1fr);
  grid-template-areas:
    "top"
    "center"
    "self";
}
.table-grid.has-left.has-right {
  grid-template-areas:
    "top"
    "sides"
    "center"
    "self";
}
.area { position: relative; min-width: 0; }
.area-top { grid-area: top; }
.area-center { grid-area: center; display: flex; align-items: center; justify-content: center; }
.area-self { grid-area: self; position: relative; display: flex; flex-direction: column; gap: 8px; padding: 10px; border-radius: 18px; background: rgba(0, 0, 0, 0.18); transition: box-shadow 0.2s ease; }
.area-self.is-turn { box-shadow: 0 0 0 2px rgba(233, 196, 106, 0.6), 0 0 30px rgba(233, 196, 106, 0.2); }

/* Phones: the two side seats sit next to each other in one row */
.table-grid.has-left.has-right .area-left,
.table-grid.has-left.has-right .area-right { grid-area: sides; }
.table-grid.has-left.has-right .area-left { grid-column: 1; }
.table-grid.has-left.has-right {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  grid-template-areas:
    "top top"
    "left right"
    "center center"
    "self self";
}
.table-grid.has-left.has-right .area-left { grid-area: left; }
.table-grid.has-left.has-right .area-right { grid-area: right; }
.table-grid:not(.has-left) .area-right, .table-grid:not(.has-right) .area-left { grid-area: top; }
.table-grid.has-right:not(.has-left):not(.has-top) { grid-template-areas: "top" "center" "self"; }

/* Phones: bigger tap targets for your own hand (it wraps onto two rows) */
@media (max-width: 600px) {
  .table-wrap { padding: 6px; border-width: 4px; border-radius: 18px; }
  .table-grid { gap: 6px; }
  .area-self { --tile-w: 36px; --tile-h: 51px; padding: 8px 4px; }
}

@media (min-width: 900px) {
  .table-wrap { --tile-w: clamp(34px, 3.4vw, 48px); padding: 16px; }
  .table-grid, .table-grid.has-left.has-right {
    grid-template-columns: minmax(180px, 1fr) minmax(0, 2.2fr) minmax(180px, 1fr);
    grid-template-rows: auto minmax(180px, auto) auto;
    grid-template-areas:
      "top top top"
      "left center right"
      "self self self";
  }
  .table-grid .area-left { grid-area: left; }
  .table-grid .area-right { grid-area: right; }
  .area-top { max-width: 720px; justify-self: center; width: 100%; }
}

.center-card { width: 100%; max-width: 520px; display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 12px; border-radius: 18px; background: rgba(0, 0, 0, 0.22); border: 1px solid rgba(255, 255, 255, 0.08); }
.center-stats { display: flex; gap: 18px; }
.stat { display: flex; flex-direction: column; align-items: center; line-height: 1.1; }
.stat b { font-size: 1.05rem; }
.stat small { font-size: 0.65rem; color: var(--ink-faint); text-transform: uppercase; letter-spacing: 0.08em; }
.center-play { display: flex; flex-direction: column; align-items: center; gap: 8px; min-height: 90px; justify-content: center; }
.spotlight { display: flex; flex-direction: column; align-items: center; gap: 2px; animation: mj-pop 0.3s ease; }
.spotlight small { font-size: 0.7rem; color: var(--ink-dim); }
.turn-text { margin: 0; font-weight: 600; text-align: center; }
.reveal { display: flex; align-items: center; gap: 14px; animation: mj-pop 0.4s ease; }
.reveal-arrow { font-size: 2.6rem; color: var(--gold); animation: mj-pulse 1s ease infinite; border-radius: 50%; }
.reveal p { margin: 2px 0; font-size: 0.8rem; color: var(--ink-dim); }
.reveal-tiles { display: flex; gap: 3px; }

.self-top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.self-id { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.self-name { font-weight: 800; }
.kong-chooser { display: flex; align-items: center; gap: 8px; justify-content: center; flex-wrap: wrap; font-size: 0.85rem; }
.kong-option { border: 2px solid transparent; background: rgba(255, 255, 255, 0.08); border-radius: 10px; padding: 4px; cursor: pointer; }
.kong-option:hover { border-color: var(--gold); }
</style>
