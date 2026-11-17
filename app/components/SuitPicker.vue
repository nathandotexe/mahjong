<template>
  <div class="picker">
    <h3>Choose your void suit</h3>
    <p class="hint">You cannot win while holding this suit, and you must discard it first. Fewest tiles is usually best.</p>
    <div class="suits">
      <button
        v-for="s in suits"
        :key="s.suit"
        class="suit"
        :class="[`suit--${s.suit}`, { recommended: s.suit === recommended, chosen: chosen === s.suit }]"
        :disabled="!!chosen"
        @click="emit('choose', s.suit)"
      >
        <MahjongTile :tile="{ suit: s.suit, value: 5, id: `pick-${s.suit}` }" size="sm" flat />
        <span class="glyph">{{ s.label }}</span>
        <span class="count">{{ s.count }} tile{{ s.count === 1 ? '' : 's' }}</span>
        <span v-if="s.suit === recommended && !chosen" class="mj-chip green">suggested</span>
      </button>
    </div>
    <p v-if="chosen" class="waiting">Waiting for the other players… ({{ chosenCount }}/{{ total }})</p>
  </div>
</template>

<script setup lang="ts">
import { TileSuit, type Tile } from '~/types/game'

const props = defineProps<{ hand: Tile[]; chosen: TileSuit | null; chosenCount: number; total: number }>()
const emit = defineEmits<{ (e: 'choose', suit: TileSuit): void }>()

const suits = computed(() =>
  [
    { suit: TileSuit.CHARACTERS, label: 'Characters' },
    { suit: TileSuit.DOTS, label: 'Dots' },
    { suit: TileSuit.BAMBOOS, label: 'Bamboo' }
  ].map(s => ({ ...s, count: props.hand.filter(t => t.suit === s.suit).length }))
)
const recommended = computed(() => suits.value.reduce((best, s) => (s.count < best.count ? s : best), suits.value[0]!).suit)
</script>

<style scoped>
.picker { text-align: center; padding: 12px; animation: mj-fade-up 0.3s ease; }
h3 { margin: 0 0 4px; font-size: 1.1rem; }
.hint { color: var(--ink-dim); font-size: 0.85rem; margin: 0 0 12px; }
.suits { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
.suit {
  display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 14px 22px; min-width: 110px;
  border-radius: 16px; border: 2px solid rgba(255, 255, 255, 0.12); background: rgba(255, 255, 255, 0.06); color: var(--ink);
  cursor: pointer; transition: transform 0.15s ease, border-color 0.15s ease;
}
.suit:hover:not(:disabled) { transform: translateY(-3px); }
.suit:disabled { cursor: default; opacity: 0.6; }
.suit.recommended { border-color: var(--accent); }
.suit.chosen { border-color: var(--gold); opacity: 1; box-shadow: 0 0 20px rgba(233, 196, 106, 0.35); }
.glyph { font-size: 1.05rem; font-weight: 800; }
.suit--wan .glyph { color: #ff8a80; }
.suit--dots .glyph { color: #82b1ff; }
.suit--tiao .glyph { color: #9be7b5; }
.count { font-size: 0.8rem; color: var(--ink-dim); }
.waiting { margin-top: 12px; color: var(--ink-dim); font-size: 0.9rem; }
</style>
