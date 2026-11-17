<template>
  <div
    v-if="player"
    class="seat"
    :class="[`seat--${dir}`, { 'seat--active': active, 'seat--won': player.wins.length > 0, 'seat--away': !player.connected && !player.isBot, 'seat--claiming': claiming }]"
  >
    <CallOut :callouts="callouts" :floats="floats" />

    <header class="seat-head">
      <div class="avatar" :style="avatarStyle">{{ initial }}</div>
      <div class="seat-meta">
        <div class="seat-name">
          <span class="name">{{ player.name }}</span>
          <span v-if="player.isDealer" class="mj-chip gold">Dealer</span>
          <span v-if="player.isHost" class="mj-chip muted">Host</span>
        </div>
        <div class="seat-badges">
          <span v-if="player.missingSuit" class="mj-chip" :class="suitClass(player.missingSuit)" title="Void suit">Void: {{ suitLabel(player.missingSuit) }}</span>
          <span v-if="player.isTing && !player.wins.length && showTing" class="mj-chip green">Ready</span>
          <span v-if="player.wins.length" class="mj-chip red">Won{{ player.wins.length > 1 ? ` ×${player.wins.length}` : '' }}</span>
          <span v-if="player.isBot" class="mj-chip blue">bot</span>
          <template v-else>
            <span v-if="player.autoPlay" class="mj-chip blue" title="Playing automatically">Auto</span>
            <span v-if="!player.connected" class="mj-chip muted">Offline</span>
          </template>
          <span class="mj-chip muted score" :class="scoreClass(sessionScore)">{{ formatScore(sessionScore) }}</span>
        </div>
      </div>
      <TurnTimer v-if="active && seconds !== null" :seconds="seconds" :total="timerTotal" small />
      <span v-else-if="claiming" class="thinking" title="deciding…">…</span>
    </header>

    <div class="seat-hand">
      <div class="melds" v-if="player.hand.exposedMelds.length">
        <div v-for="(meld, i) in player.hand.exposedMelds" :key="i" class="meld" :class="`meld--${meld.type}`">
          <MahjongTile
            v-for="(tile, j) in meld.tiles"
            :key="tile.id"
            :tile="tile"
            size="xs"
            flat
            :back="meld.type === 'concealed_kong' && !revealed && (j === 0 || j === 3)"
          />
        </div>
      </div>
      <div class="hidden-hand">
        <MahjongTile
          v-for="tile in player.hand.concealedTiles"
          :key="tile.id"
          :tile="tile"
          size="xs"
          :back="tile.value === 0"
          flat
          :dimmed="player.wins.length > 0 && tile.value > 0 && !player.handLocked"
        />
      </div>
    </div>

    <DiscardRiver :tiles="player.hand.discardedTiles" :highlight-id="highlightId" size="xs" />
  </div>
  <div v-else class="seat seat--empty" :class="`seat--${dir}`">
    <span>Empty seat</span>
  </div>
</template>

<script setup lang="ts">
import type { PlayerView, TileSuit } from '~/types/game'
import type { CalloutItem, FloatItem } from './CallOut.vue'

const props = withDefaults(
  defineProps<{
    player: PlayerView | null
    dir: 'top' | 'left' | 'right'
    active?: boolean
    claiming?: boolean
    seconds?: number | null
    timerTotal?: number
    highlightId?: string | null
    sessionScore?: number
    callouts?: CalloutItem[]
    floats?: FloatItem[]
    revealed?: boolean
    showTing?: boolean
  }>(),
  { active: false, claiming: false, seconds: null, timerTotal: 20, highlightId: null, sessionScore: 0, callouts: () => [], floats: () => [], revealed: false, showTing: false }
)

const initial = computed(() => (props.player?.name ?? '?').trim().charAt(0).toUpperCase())
const avatarStyle = computed(() => {
  const name = props.player?.name ?? ''
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % 360
  return { background: `hsl(${hash}, 45%, 38%)` }
})

const suitLabel = (suit: TileSuit) => (suit === 'wan' ? 'Char' : suit === 'dots' ? 'Dots' : 'Bam')
const suitClass = (suit: TileSuit) => (suit === 'wan' ? 'red' : suit === 'dots' ? 'blue' : 'green')
const formatScore = (v: number) => (v > 0 ? `+${v}` : `${v}`)
const scoreClass = (v: number) => (v > 0 ? 'score-pos' : v < 0 ? 'score-neg' : 'score-zero')
</script>

<style scoped>
.seat {
  position: relative;
  background: var(--panel);
  border: 1px solid var(--panel-border);
  border-radius: var(--radius);
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  transition: box-shadow 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
}
.seat--active { border-color: rgba(233, 196, 106, 0.8); box-shadow: 0 0 0 1px rgba(233, 196, 106, 0.4), 0 0 24px rgba(233, 196, 106, 0.25); }
.seat--claiming { border-color: rgba(255, 152, 0, 0.7); }
.seat--won { background: rgba(60, 10, 10, 0.55); }
.seat--away { opacity: 0.75; }
.seat--empty { align-items: center; justify-content: center; color: var(--ink-faint); font-size: 0.85rem; min-height: 80px; border-style: dashed; }

.seat-head { display: flex; align-items: center; gap: 8px; }
.avatar {
  width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  font-weight: 800; font-size: 0.95rem; color: #fff; flex: none; box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.25);
}
.seat-meta { min-width: 0; flex: 1; }
.seat-name { display: flex; align-items: center; gap: 6px; font-weight: 700; font-size: 0.9rem; }
.name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.seat-badges { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 3px; }
.score { font-variant-numeric: tabular-nums; }
.thinking { font-size: 1.2rem; color: var(--warn); animation: mj-pop 0.8s ease infinite alternate; }

.seat-hand { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.melds { display: flex; gap: 6px; flex-wrap: wrap; }
.meld { display: inline-flex; gap: 1px; padding: 2px; border-radius: 6px; background: rgba(0, 0, 0, 0.25); }
.meld--kong, .meld--concealed_kong { box-shadow: 0 0 8px rgba(255, 214, 0, 0.35); }
.hidden-hand { display: flex; gap: 1px; flex-wrap: wrap; }

/* side seats stack their hidden tiles tighter */
.seat--left .hidden-hand, .seat--right .hidden-hand { gap: 0; }
</style>
