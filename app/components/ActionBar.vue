<template>
  <Transition name="fade">
    <div v-if="visible" class="action-bar" :class="{ 'action-bar--urgent': urgent }">
      <div class="action-context">
        <template v-if="claim">
          <MahjongTile :tile="claim.tile" size="sm" highlight />
          <span class="context-text">
            {{ claim.kind === 'kong_rob' ? `${fromName} is extending a kong` : `${fromName} discarded` }}
          </span>
        </template>
        <template v-else-if="selectedTile">
          <MahjongTile :tile="selectedTile" size="sm" selected />
          <span class="context-text">Discard this tile?</span>
        </template>
        <template v-else-if="hint">
          <span class="context-text">{{ hint }}</span>
        </template>
      </div>

      <div class="action-buttons">
        <button v-if="has('hu')" class="act act--hu" :disabled="busy" @click="emit('hu')">
          Win <small>{{ claim ? 'take this tile' : 'self-draw' }}</small>
        </button>
        <button v-if="has('kong')" class="act act--kong" :disabled="busy" @click="emit('kong')">Kong <small>take this tile</small></button>
        <button v-if="has('extended_kong')" class="act act--kong" :disabled="busy" @click="emit('extendedKong')">Kong <small>add to pung</small></button>
        <button v-if="has('concealed_kong')" class="act act--kong" :disabled="busy" @click="emit('concealedKong')">Kong <small>concealed</small></button>
        <button v-if="has('peng')" class="act act--peng" :disabled="busy" @click="emit('peng')">Pung <small>take this tile</small></button>
        <button v-if="has('pass')" class="act act--pass" :disabled="busy" @click="emit('pass')">Pass</button>
        <button v-if="!claim && selectedTile && has('discard')" class="act act--discard" :disabled="busy" @click="emit('discard')">Discard</button>
        <button v-if="!claim && selectedTile" class="act act--ghost" :disabled="busy" @click="emit('clear')">✕</button>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import type { ActionType, Tile } from '~/types/game'

const props = defineProps<{
  actions: ActionType[]
  claim: { kind: 'discard' | 'kong_rob'; tile: Tile } | null
  fromName?: string
  selectedTile?: Tile | null
  hint?: string | null
  busy?: boolean
  urgent?: boolean
}>()
const emit = defineEmits<{
  (e: 'hu'): void
  (e: 'kong'): void
  (e: 'extendedKong'): void
  (e: 'concealedKong'): void
  (e: 'peng'): void
  (e: 'pass'): void
  (e: 'discard'): void
  (e: 'clear'): void
}>()

const has = (action: string) => props.actions.includes(action as ActionType)
const TABLE_ACTIONS = ['hu', 'peng', 'kong', 'pass', 'extended_kong', 'concealed_kong']
const visible = computed(() => {
  const special = props.actions.filter(a => TABLE_ACTIONS.includes(a))
  return !!props.claim || special.length > 0 || !!props.selectedTile || !!props.hint
})
</script>

<style scoped>
.action-bar {
  display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 10px 16px;
  padding: 8px 12px; border-radius: 16px;
  background: rgba(4, 16, 10, 0.9); border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
}
.action-bar--urgent { border-color: rgba(239, 83, 80, 0.6); animation: mj-pulse 1s ease infinite; }
.action-context { display: flex; align-items: center; gap: 10px; min-height: 40px; }
.context-text { font-size: 0.9rem; color: var(--ink-dim); }
.action-buttons { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
.act {
  border: none; border-radius: 14px; padding: 8px 16px; min-width: 64px; min-height: 48px;
  font-size: 1.05rem; font-weight: 800; color: #fff; cursor: pointer;
  display: flex; flex-direction: column; align-items: center; line-height: 1.05;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.45); transition: transform 0.12s ease, filter 0.12s ease;
  animation: mj-pop 0.3s ease;
}
.act small { font-size: 0.62rem; font-weight: 600; opacity: 0.85; letter-spacing: 0.04em; }
.act:hover:not(:disabled) { transform: translateY(-2px); filter: brightness(1.08); }
.act:disabled { opacity: 0.5; cursor: wait; }
.act--hu { background: linear-gradient(135deg, #b71c1c, #ef5350); }
.act--kong { background: linear-gradient(135deg, #e65100, #ff9800); }
.act--peng { background: linear-gradient(135deg, #f9a825, #ffd54f); color: #2a1d04; }
.act--pass { background: rgba(255, 255, 255, 0.12); }
.act--discard { background: linear-gradient(135deg, var(--accent-deep), var(--accent)); color: #04170c; }
.act--ghost { background: transparent; box-shadow: none; min-width: 40px; font-size: 1rem; color: var(--ink-dim); }
</style>
