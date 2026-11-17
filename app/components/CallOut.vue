<template>
  <div class="callouts">
    <TransitionGroup name="stamp">
      <div v-for="c in callouts" :key="c.id" class="stamp" :class="`stamp--${c.kind}`">
        <span class="stamp-main">{{ c.text }}</span>
        <span v-if="c.sub" class="stamp-sub">{{ c.sub }}</span>
      </div>
    </TransitionGroup>
    <TransitionGroup name="float">
      <div v-for="f in floats" :key="f.id" class="float" :class="f.points >= 0 ? 'pos' : 'neg'">
        {{ f.points >= 0 ? '+' : '' }}{{ f.points }}
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
export interface CalloutItem { id: number; text: string; sub?: string; kind: 'peng' | 'kong' | 'hu' | 'zimo' | 'info' }
export interface FloatItem { id: number; points: number }
defineProps<{ callouts: CalloutItem[]; floats: FloatItem[] }>()
</script>

<style scoped>
.callouts { position: absolute; inset: 0; pointer-events: none; display: flex; align-items: center; justify-content: center; z-index: 5; }
.stamp {
  position: absolute;
  padding: 8px 18px;
  border-radius: 12px;
  border: 3px solid currentColor;
  font-size: clamp(1.1rem, 3vw, 2rem);
  font-weight: 900;
  letter-spacing: 0.06em;
  white-space: nowrap;
  background: rgba(8, 20, 14, 0.85);
  animation: mj-stamp 1.6s ease forwards;
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
}
.stamp-sub { font-size: 0.72rem; letter-spacing: 0.02em; font-weight: 600; opacity: 0.9; }
.stamp--peng { color: #ffd54f; }
.stamp--kong { color: #ff8a65; }
.stamp--hu { color: #ff5252; }
.stamp--zimo { color: #ff5252; }
.stamp--info { color: #b0bec5; font-size: 1rem; border-width: 1px; animation-duration: 1.2s; }
.float {
  position: absolute;
  top: 30%;
  font-size: 1.4rem;
  font-weight: 800;
  animation: mj-float-up 1.6s ease forwards;
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.7);
}
.float.pos { color: #8fe3ad; }
.float.neg { color: #ff9a97; }
.stamp-enter-active, .stamp-leave-active, .float-enter-active, .float-leave-active { transition: opacity 0.2s; }
.stamp-leave-to, .float-leave-to { opacity: 0; }
</style>
