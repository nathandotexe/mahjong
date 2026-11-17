<template>
  <div class="self-hand" :class="{ 'self-hand--locked': player.handLocked }">
    <div class="melds" v-if="player.hand.exposedMelds.length">
      <div v-for="(meld, i) in player.hand.exposedMelds" :key="i" class="meld" :class="`meld--${meld.type}`">
        <MahjongTile v-for="tile in meld.tiles" :key="tile.id" :tile="tile" size="sm" flat />
        <span class="meld-tag">{{ meldLabel(meld) }}</span>
      </div>
    </div>

    <TransitionGroup name="hand" tag="div" class="hand" :class="{ 'hand--multi': multiSelect }">
      <MahjongTile
        v-for="tile in orderedTiles"
        :key="tile.id"
        :tile="tile"
        :size="size"
        :selected="selectedIds.includes(tile.id)"
        :drawn="tile.id === player.lastDrawnTileId && orderedTiles.length % 3 === 2"
        :dimmed="isDimmed(tile)"
        :void-suit="!!player.missingSuit && tile.suit === player.missingSuit"
        :clickable="isClickable(tile)"
        @click="emit('tileClick', tile)"
      />
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
import type { Meld, PlayerView, Tile, TileSuit } from '~/types/game'

const props = withDefaults(
  defineProps<{
    player: PlayerView
    selectedIds?: string[]
    interactive?: boolean
    multiSelect?: boolean
    mustDiscardSuit?: TileSuit | null
    lockToSuit?: TileSuit | null
    size?: 'md' | 'lg'
  }>(),
  { selectedIds: () => [], interactive: false, multiSelect: false, mustDiscardSuit: null, lockToSuit: null, size: 'md' }
)
const emit = defineEmits<{ (e: 'tileClick', tile: Tile): void }>()

/** Keep the freshly drawn tile at the right end so the hand reads like a real table. */
const orderedTiles = computed(() => {
  const tiles = props.player.hand.concealedTiles
  const drawnId = props.player.lastDrawnTileId
  if (!drawnId || tiles.length % 3 !== 2) return tiles
  const drawn = tiles.find(t => t.id === drawnId)
  if (!drawn) return tiles
  return [...tiles.filter(t => t.id !== drawnId), drawn]
})

const isDimmed = (tile: Tile) => {
  if (!props.interactive) return false
  if (props.player.handLocked) return tile.id !== props.player.lastDrawnTileId
  if (props.mustDiscardSuit) return tile.suit !== props.mustDiscardSuit
  if (props.lockToSuit) return tile.suit !== props.lockToSuit
  return false
}
const isClickable = (tile: Tile) => props.interactive && !isDimmed(tile)

const meldLabel = (meld: Meld) => {
  if (meld.type === 'triplet') return 'Pung'
  if (meld.type === 'concealed_kong') return 'Concealed'
  if (meld.kongKind === 'extended') return 'Added kong'
  if (meld.type === 'kong') return 'Kong'
  return ''
}
</script>

<style scoped>
.self-hand { display: flex; flex-direction: column; gap: 10px; align-items: center; }
.melds { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
.meld { position: relative; display: inline-flex; gap: 1px; padding: 3px; border-radius: 8px; background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(255, 255, 255, 0.1); }
.meld--kong, .meld--concealed_kong { box-shadow: 0 0 10px rgba(255, 214, 0, 0.35); }
.meld-tag { position: absolute; top: -8px; right: -4px; font-size: 0.6rem; padding: 1px 5px; border-radius: 999px; background: var(--gold); color: #2a1d04; font-weight: 700; }
.hand { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: center; gap: 2px; row-gap: 16px; padding: 16px 6px 6px; max-width: 100%; }
.hand-enter-active { animation: mj-fade-up 0.25s ease; }
.hand-leave-active { transition: all 0.2s ease; position: absolute; }
.hand-leave-to { opacity: 0; transform: translateY(-30px) scale(0.8); }
.hand-move { transition: transform 0.25s ease; }
.self-hand--locked .hand { opacity: 0.95; }
</style>
