<template>
  <div class="river" :class="[`river--${size}`, { 'river--empty': !tiles.length }]">
    <TransitionGroup name="river">
      <MahjongTile
        v-for="tile in tiles"
        :key="tile.id"
        :tile="tile"
        :size="size"
        flat
        :highlight="tile.id === highlightId"
      />
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
import type { Tile } from '~/types/game'
withDefaults(defineProps<{ tiles: Tile[]; highlightId?: string | null; size?: 'xs' | 'sm' }>(), { highlightId: null, size: 'sm' })
</script>

<style scoped>
.river { display: flex; flex-wrap: wrap; gap: 2px; align-content: flex-start; min-height: calc(var(--tile-h) * 0.6); }
.river--xs { min-height: calc(var(--tile-h) * 0.42); }
.river-enter-active { animation: mj-pop 0.3s ease; }
.river-leave-active { transition: all 0.25s ease; position: absolute; }
.river-leave-to { opacity: 0; transform: scale(0.6); }
.river-move { transition: transform 0.25s ease; }
</style>
