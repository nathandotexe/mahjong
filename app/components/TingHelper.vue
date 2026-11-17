<template>
  <div v-if="listening.length" class="ting">
    <span class="ting-label">READY · waiting on</span>
    <div class="ting-tiles">
      <div v-for="t in listening" :key="`${t.suit}-${t.value}`" class="ting-item" :class="{ dead: t.remaining === 0 }" :title="t.summary">
        <MahjongTile :tile="{ suit: t.suit, value: t.value, id: `ting-${t.suit}-${t.value}` }" size="xs" flat />
        <span class="ting-meta">
          <b>{{ t.remaining }} left</b>
          <i>{{ t.fan }} fan</i>
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ListeningTile } from '~/types/game'
defineProps<{ listening: ListeningTile[] }>()
</script>

<style scoped>
.ting { display: flex; align-items: center; gap: 8px; padding: 4px 10px; border-radius: 999px; background: rgba(70, 197, 116, 0.12); border: 1px solid rgba(70, 197, 116, 0.35); animation: mj-fade-up 0.3s ease; }
.ting-label { font-size: 0.75rem; font-weight: 700; color: #9be7b5; letter-spacing: 0.1em; }
.ting-tiles { display: flex; gap: 8px; flex-wrap: wrap; }
.ting-item { display: flex; align-items: center; gap: 4px; }
.ting-item.dead { opacity: 0.45; }
.ting-meta { display: flex; flex-direction: column; font-size: 0.65rem; line-height: 1.1; color: var(--ink-dim); }
.ting-meta b { color: var(--ink); }
.ting-meta i { font-style: normal; color: var(--gold); }
</style>
