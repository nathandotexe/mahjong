<template>
  <div class="timer" :class="{ 'timer--urgent': urgent, 'timer--small': small }" :title="`${seconds}s`">
    <svg viewBox="0 0 36 36">
      <circle class="track" cx="18" cy="18" r="15.5" />
      <circle class="bar" cx="18" cy="18" r="15.5" :stroke-dasharray="`${progress * 97.4} 97.4`" />
    </svg>
    <span class="num">{{ seconds }}</span>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{ seconds: number; total: number; small?: boolean }>(), { small: false })
const progress = computed(() => (props.total > 0 ? Math.min(1, Math.max(0, props.seconds / props.total)) : 1))
const urgent = computed(() => props.seconds <= 5)
</script>

<style scoped>
.timer { position: relative; width: 44px; height: 44px; flex: none; }
.timer--small { width: 30px; height: 30px; }
svg { width: 100%; height: 100%; transform: rotate(-90deg); }
.track { fill: rgba(0, 0, 0, 0.35); stroke: rgba(255, 255, 255, 0.15); stroke-width: 3; }
.bar { fill: none; stroke: var(--gold); stroke-width: 3; stroke-linecap: round; transition: stroke-dasharray 0.25s linear, stroke 0.2s ease; }
.timer--urgent .bar { stroke: var(--danger); }
.num {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font-size: 0.85rem; font-weight: 700; font-variant-numeric: tabular-nums;
}
.timer--small .num { font-size: 0.65rem; }
.timer--urgent .num { color: #ffb3b1; animation: mj-pop 0.5s ease infinite alternate; }
</style>
