<template>
  <div class="exchange">
    <template v-if="!submitted">
      <h3>Swap three tiles</h3>
      <p class="hint">Pick three tiles of the <b>same suit</b>. They go to a neighbour chosen at random once everyone has picked.</p>
      <div class="row">
        <span class="count">{{ selectedCount }}/3 selected</span>
        <button class="mj-btn small ghost" @click="emit('suggest')">Suggest</button>
        <button class="mj-btn primary" :disabled="selectedCount !== 3 || busy" @click="emit('confirm')">Swap</button>
      </div>
    </template>
    <template v-else>
      <h3>Swap three tiles</h3>
      <p class="hint">Waiting for the other players… ({{ submittedCount }}/{{ total }})</p>
      <div class="given">
        <MahjongTile v-for="t in mine ?? []" :key="t.id" :tile="t" size="sm" flat dimmed />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { Tile } from '~/types/game'
defineProps<{ selectedCount: number; submitted: boolean; submittedCount: number; total: number; mine: Tile[] | null; busy?: boolean }>()
const emit = defineEmits<{ (e: 'confirm'): void; (e: 'suggest'): void }>()
</script>

<style scoped>
.exchange { text-align: center; padding: 10px 12px; animation: mj-fade-up 0.3s ease; }
h3 { margin: 0 0 4px; font-size: 1.05rem; }
.hint { color: var(--ink-dim); font-size: 0.85rem; margin: 0 0 10px; }
.row { display: flex; gap: 10px; align-items: center; justify-content: center; }
.count { font-size: 0.85rem; color: var(--ink-dim); }
.given { display: flex; gap: 4px; justify-content: center; margin-top: 8px; }
</style>
