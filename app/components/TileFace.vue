<template>
  <svg class="tile-face" viewBox="0 0 60 84" :aria-label="label" role="img">
    <!-- Characters: traditional Chinese numeral + 萬, as printed on real tiles -->
    <template v-if="suit === 'wan'">
      <text x="30" y="36" text-anchor="middle" class="num wan">{{ CHINESE_NUMERALS[value] }}</text>
      <text x="30" y="72" text-anchor="middle" class="suit wan">萬</text>
    </template>

    <!-- Dots: circles -->
    <template v-else-if="suit === 'dots'">
      <g v-for="(dot, i) in DOTS[value]" :key="i">
        <circle :cx="dot[0]" :cy="dot[1]" :r="dotRadius" class="dot-outer" />
        <circle :cx="dot[0]" :cy="dot[1]" :r="dotRadius * 0.55" :class="['dot-inner', dot[2] || 'dots']" />
      </g>
    </template>

    <!-- Bamboo: sticks (1 bamboo is traditionally a bird) -->
    <template v-else>
      <template v-if="value === 1">
        <ellipse cx="30" cy="46" rx="11" ry="19" class="bird" />
        <circle cx="30" cy="25" r="7" class="bird" />
        <path d="M30 18 l5 -7 l-3 7z" class="bird-beak" />
        <path d="M22 60 q8 10 16 0" class="bird-tail" />
      </template>
      <g v-for="(stick, i) in STICKS[value]" :key="i">
        <rect :x="stick[0] - 4" :y="stick[1] - 9" width="8" height="18" rx="3" :class="['stick', stick[2] || 'tiao']" />
        <rect :x="stick[0] - 4" :y="stick[1] - 1.5" width="8" height="3" class="stick-band" />
      </g>
    </template>
  </svg>
</template>

<script setup lang="ts">
import type { TileSuit } from '~/types/game'

const props = defineProps<{ suit: TileSuit | string; value: number }>()

// Tile faces keep their traditional Chinese characters; only the UI text is English.
const CHINESE_NUMERALS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九']
type Pt = [number, number, string?]

// Dot layouts on a 60×84 canvas.
const DOTS: Pt[][] = [
  [],
  [[30, 42, 'red']],
  [[30, 24, 'green'], [30, 60, 'red']],
  [[18, 22, 'dots'], [30, 42, 'red'], [42, 62, 'green']],
  [[19, 24, 'dots'], [41, 24, 'green'], [19, 60, 'green'], [41, 60, 'dots']],
  [[18, 22, 'dots'], [42, 22, 'green'], [30, 42, 'red'], [18, 62, 'green'], [42, 62, 'dots']],
  [[19, 20, 'green'], [41, 20, 'green'], [19, 42, 'red'], [41, 42, 'red'], [19, 64, 'red'], [41, 64, 'red']],
  [[16, 18, 'green'], [30, 24, 'green'], [44, 30, 'green'], [19, 48, 'red'], [41, 48, 'red'], [19, 68, 'red'], [41, 68, 'red']],
  [[19, 16, 'dots'], [41, 16, 'dots'], [19, 33, 'dots'], [41, 33, 'dots'], [19, 51, 'dots'], [41, 51, 'dots'], [19, 68, 'dots'], [41, 68, 'dots']],
  [[16, 18, 'red'], [30, 18, 'red'], [44, 18, 'red'], [16, 42, 'green'], [30, 42, 'green'], [44, 42, 'green'], [16, 66, 'dots'], [30, 66, 'dots'], [44, 66, 'dots']]
]

const STICKS: Pt[][] = [
  [],
  [],
  [[30, 26, 'tiao'], [30, 58, 'red']],
  [[30, 22, 'tiao'], [19, 58, 'red'], [41, 58, 'red']],
  [[19, 26, 'tiao'], [41, 26, 'red'], [19, 58, 'red'], [41, 58, 'tiao']],
  [[17, 22, 'tiao'], [43, 22, 'tiao'], [30, 42, 'red'], [17, 62, 'tiao'], [43, 62, 'tiao']],
  [[17, 26, 'tiao'], [30, 26, 'tiao'], [43, 26, 'tiao'], [17, 58, 'red'], [30, 58, 'red'], [43, 58, 'red']],
  [[30, 16, 'red'], [17, 42, 'tiao'], [30, 42, 'tiao'], [43, 42, 'tiao'], [17, 66, 'tiao'], [30, 66, 'tiao'], [43, 66, 'tiao']],
  [[17, 16, 'tiao'], [43, 16, 'tiao'], [17, 36, 'tiao'], [43, 36, 'tiao'], [17, 52, 'red'], [43, 52, 'red'], [17, 70, 'red'], [43, 70, 'red']],
  [[17, 18, 'tiao'], [30, 18, 'tiao'], [43, 18, 'tiao'], [17, 42, 'red'], [30, 42, 'red'], [43, 42, 'red'], [17, 66, 'dots'], [30, 66, 'dots'], [43, 66, 'dots']]
]

const dotRadius = computed(() => (props.value <= 2 ? 11 : props.value <= 4 ? 8.5 : props.value <= 6 ? 7.5 : 6.5))

const label = computed(() => {
  const suit = props.suit === 'wan' ? 'Characters' : props.suit === 'dots' ? 'Dots' : 'Bamboo'
  return `${props.value} ${suit}`
})
</script>

<style scoped>
.tile-face { width: 100%; height: 100%; display: block; }
.num { font-size: 30px; font-weight: 700; font-family: "Songti SC", "SimSun", "Noto Serif CJK SC", serif; }
.suit { font-size: 24px; font-weight: 700; font-family: "Songti SC", "SimSun", "Noto Serif CJK SC", serif; }
.wan { fill: var(--wan); }
.dot-outer { fill: #f1e9d6; stroke: rgba(0, 0, 0, 0.35); stroke-width: 1.4; }
.dot-inner.dots { fill: var(--dots); }
.dot-inner.red { fill: var(--wan); }
.dot-inner.green { fill: var(--tiao); }
.stick.tiao { fill: var(--tiao); }
.stick.red { fill: var(--wan); }
.stick.dots { fill: var(--dots); }
.stick-band { fill: rgba(255, 255, 255, 0.55); }
.bird { fill: var(--tiao); }
.bird-beak { fill: var(--wan); }
.bird-tail { fill: none; stroke: var(--wan); stroke-width: 3; stroke-linecap: round; }
</style>
