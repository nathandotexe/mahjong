<template>
  <button
    type="button"
    class="tile"
    :class="[
      `tile--${size}`,
      {
        'tile--back': back,
        'tile--selected': selected,
        'tile--drawn': drawn,
        'tile--highlight': highlight,
        'tile--dimmed': dimmed,
        'tile--void': voidSuit,
        'tile--clickable': clickable,
        'tile--flat': flat
      }
    ]"
    :disabled="!clickable"
    :aria-label="back ? 'hidden tile' : `${tile.value}${suitName}`"
    @click="clickable && emit('click', tile)"
  >
    <span class="tile-body">
      <TileFace v-if="!back && tile.value > 0" :suit="tile.suit" :value="tile.value" />
      <span v-else class="tile-back-pattern" />
    </span>
  </button>
</template>

<script setup lang="ts">
import type { Tile } from '~/types/game'

const props = withDefaults(
  defineProps<{
    tile: Tile
    size?: 'xs' | 'sm' | 'md' | 'lg'
    back?: boolean
    selected?: boolean
    drawn?: boolean
    highlight?: boolean
    dimmed?: boolean
    voidSuit?: boolean
    clickable?: boolean
    flat?: boolean
  }>(),
  { size: 'md', back: false, selected: false, drawn: false, highlight: false, dimmed: false, voidSuit: false, clickable: false, flat: false }
)

const emit = defineEmits<{ (e: 'click', tile: Tile): void }>()

const suitName = computed(() => (props.tile.suit === 'wan' ? ' Characters' : props.tile.suit === 'dots' ? ' Dots' : ' Bamboo'))
</script>

<style scoped>
.tile {
  --w: var(--tile-w);
  --h: var(--tile-h);
  position: relative;
  width: var(--w);
  height: var(--h);
  padding: 0;
  border: none;
  background: transparent;
  border-radius: calc(var(--w) * 0.14);
  cursor: default;
  flex: none;
  transition: transform 0.14s ease, filter 0.14s ease, opacity 0.14s ease;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
  touch-action: manipulation;
}
.tile--xs { --w: calc(var(--tile-w) * 0.42); --h: calc(var(--tile-h) * 0.42); }
.tile--sm { --w: calc(var(--tile-w) * 0.6); --h: calc(var(--tile-h) * 0.6); }
.tile--lg { --w: calc(var(--tile-w) * 1.15); --h: calc(var(--tile-h) * 1.15); }

.tile-body {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(160deg, var(--tile-face) 0%, var(--tile-face-2) 100%);
  box-shadow:
    inset 0 -3px 0 rgba(0, 0, 0, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.7),
    0 2px 4px rgba(0, 0, 0, 0.45);
  border: 1px solid var(--tile-edge);
  overflow: hidden;
  padding: 6% 8%;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
}
.tile--flat .tile-body { box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4); }

.tile--back .tile-body {
  background: linear-gradient(160deg, var(--tile-back) 0%, var(--tile-back-2) 100%);
  border-color: #0d3b2f;
  padding: 14%;
}
.tile-back-pattern {
  width: 100%;
  height: 100%;
  border-radius: 4px;
  background:
    repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.12) 0 3px, transparent 3px 7px),
    radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.16), transparent 60%);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.25);
}

.tile--clickable { cursor: pointer; }
.tile--clickable:hover { transform: translateY(-4px); }
.tile--selected { transform: translateY(-14px) !important; }
.tile--selected .tile-body { box-shadow: 0 10px 18px rgba(0, 0, 0, 0.5), 0 0 0 2px var(--gold); }
.tile--drawn { margin-left: calc(var(--w) * 0.28); }
.tile--drawn .tile-body { box-shadow: 0 0 0 2px rgba(233, 196, 106, 0.85), 0 2px 4px rgba(0, 0, 0, 0.45); }
.tile--highlight .tile-body { box-shadow: 0 0 0 2px #ff9800, 0 0 14px rgba(255, 152, 0, 0.7); }
.tile--dimmed { opacity: 0.38; filter: grayscale(0.4); }
.tile--void .tile-body::after {
  content: "";
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(135deg, rgba(239, 83, 80, 0.22) 0 4px, transparent 4px 10px);
  pointer-events: none;
}
</style>
