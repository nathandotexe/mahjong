<template>
  <div class="settings" :class="{ readonly: !editable }">
    <div class="row">
      <div class="row-text"><b>Rule table</b><span>Which fan values and settlement style to use</span></div>
      <div class="mj-seg">
        <button :class="{ on: rules.preset === 'standard' }" :disabled="!editable" @click="patch({ preset: 'standard', fanCap: 4, selfDrawBonus: 'fan', flowerPigPenalty: 'cap' })">Standard</button>
        <button :class="{ on: rules.preset === 'mil' }" :disabled="!editable" @click="patch({ preset: 'mil', fanCap: 3, selfDrawBonus: 'base', flowerPigPenalty: 'flat48', exchangeThree: false })">MIL 2017</button>
      </div>
    </div>

    <div class="row">
      <div class="row-text"><b>Fan cap</b><span>Maximum fan a single win can score</span></div>
      <div class="mj-seg">
        <button v-for="cap in [3, 4, 5, 0]" :key="cap" :class="{ on: rules.fanCap === cap }" :disabled="!editable" @click="patch({ fanCap: cap as any })">{{ cap === 0 ? '∞' : cap }}</button>
      </div>
    </div>

    <div class="row">
      <div class="row-text"><b>Self-draw bonus</b><span>Extra reward for winning on a tile you drew yourself</span></div>
      <div class="mj-seg">
        <button :class="{ on: rules.selfDrawBonus === 'fan' }" :disabled="!editable" @click="patch({ selfDrawBonus: 'fan' })">+1 fan</button>
        <button :class="{ on: rules.selfDrawBonus === 'base' }" :disabled="!editable" @click="patch({ selfDrawBonus: 'base' })">+1 point</button>
      </div>
    </div>

    <div class="row" v-for="t in toggles" :key="t.key">
      <div class="row-text"><b>{{ t.label }}</b><span>{{ t.desc }}</span></div>
      <button class="mj-switch" role="switch" :aria-checked="!!rules[t.key]" :disabled="!editable" @click="patch({ [t.key]: !rules[t.key] } as any)" />
    </div>

    <div class="row">
      <div class="row-text"><b>Flower pig penalty</b><span>What a player holding three suits pays at a draw</span></div>
      <div class="mj-seg">
        <button :class="{ on: rules.flowerPigPenalty === 'cap' }" :disabled="!editable" @click="patch({ flowerPigPenalty: 'cap' })">Cap each</button>
        <button :class="{ on: rules.flowerPigPenalty === 'flat48' }" :disabled="!editable" @click="patch({ flowerPigPenalty: 'flat48' })">16 each</button>
      </div>
    </div>

    <div class="row">
      <div class="row-text"><b>Turn timer</b><span>Seconds to discard before auto-play takes over</span></div>
      <div class="mj-seg">
        <button v-for="s in [0, 10, 20, 30, 60]" :key="s" :class="{ on: rules.turnSeconds === s }" :disabled="!editable" @click="patch({ turnSeconds: s })">{{ s === 0 ? 'Off' : `${s}s` }}</button>
      </div>
    </div>

    <div class="row">
      <div class="row-text"><b>Claim timer</b><span>Seconds to decide on Pung / Kong / Win</span></div>
      <div class="mj-seg">
        <button v-for="s in [0, 5, 8, 15]" :key="s" :class="{ on: rules.claimSeconds === s }" :disabled="!editable" @click="patch({ claimSeconds: s })">{{ s === 0 ? 'Off' : `${s}s` }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { RuleConfig } from '~/types/game'

defineProps<{ rules: RuleConfig; editable: boolean }>()
const emit = defineEmits<{ (e: 'update', patch: Partial<RuleConfig>): void }>()
const patch = (p: Partial<RuleConfig>) => emit('update', p)

const toggles: { key: keyof RuleConfig; label: string; desc: string }[] = [
  { key: 'exchangeThree', label: 'Swap three', desc: 'Exchange three tiles of one suit with a neighbour before declaring suits' },
  { key: 'bloodRiver', label: 'Blood River', desc: 'Winners keep playing and can win again until the wall runs out' },
  { key: 'passedHuRule', label: 'Passed win lock', desc: 'Passing on a winning discard blocks that tile until your next draw' },
  { key: 'kongTransfer', label: 'Kong transfer', desc: 'Shooting right after a kong hands the kong income to the winner' }
]
</script>

<style scoped>
.settings { display: flex; flex-direction: column; gap: 12px; }
.row { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.row-text { display: flex; flex-direction: column; min-width: 0; flex: 1 1 200px; }
.row-text b { font-size: 0.92rem; }
.row-text span { font-size: 0.78rem; color: var(--ink-faint); }
.readonly .mj-seg button:disabled, .readonly .mj-switch:disabled { cursor: default; }
</style>
