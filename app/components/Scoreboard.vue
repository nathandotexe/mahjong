<template>
  <div class="scoreboard">
    <section>
      <h4>Session · {{ view.handNumber }} hand{{ view.handNumber === 1 ? '' : 's' }}</h4>
      <ol class="totals">
        <li v-for="(p, i) in ranked" :key="p.id" :class="{ me: p.isSelf }">
          <span class="rank">{{ i + 1 }}</span>
          <span class="name">{{ p.name }}</span>
          <span class="total" :class="cls(view.sessionScores[p.id] ?? 0)">{{ fmt(view.sessionScores[p.id] ?? 0) }}</span>
        </li>
      </ol>
    </section>

    <section v-if="view.ledger.length">
      <h4>This hand</h4>
      <ul class="ledger">
        <li v-for="e in view.ledger.slice().reverse()" :key="e.id">
          <span class="label">{{ e.label }}</span>
          <span class="flow">{{ name(e.from) }} → {{ name(e.to) }}</span>
          <span class="pts">{{ e.points }}</span>
        </li>
      </ul>
    </section>

    <section v-if="view.handHistory.length">
      <h4>Previous hands</h4>
      <ul class="hands">
        <li v-for="h in view.handHistory.slice().reverse()" :key="h.handNumber">
          <div class="hand-head">
            <b>Hand {{ h.handNumber }}</b>
            <span class="muted">{{ reasonLabel(h.endReason) }}</span>
          </div>
          <div class="hand-scores">
            <span v-for="p in view.players" :key="p.id" :class="cls(h.scores[p.id] ?? 0)">{{ p.name }} {{ fmt(h.scores[p.id] ?? 0) }}</span>
          </div>
          <div v-if="h.wins.length" class="hand-wins">
            <span v-for="(w, i) in h.wins" :key="i">{{ name(w.playerId) }} · {{ w.fan.summary }} ({{ w.fan.totalFan }} fan)</span>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { GameView } from '~/types/game'

const props = defineProps<{ view: GameView }>()
const ranked = computed(() => [...props.view.players].sort((a, b) => (props.view.sessionScores[b.id] ?? 0) - (props.view.sessionScores[a.id] ?? 0)))
const name = (id: string) => props.view.players.find(p => p.id === id)?.name ?? '?'
const fmt = (v: number) => (v > 0 ? `+${v}` : `${v}`)
const cls = (v: number) => (v > 0 ? 'score-pos' : v < 0 ? 'score-neg' : 'score-zero')
const reasonLabel = (reason: string) =>
  ({ wall_exhausted: 'Draw (wall ran out)', last_player: 'Three winners', all_won: 'Everyone won', owner_left: 'Host left', empty_room: 'Room emptied', cheat: 'Test' })[reason] ?? reason
</script>

<style scoped>
.scoreboard { display: flex; flex-direction: column; gap: 16px; font-size: 0.88rem; }
h4 { margin: 0 0 6px; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-faint); }
.totals { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.totals li { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 8px; background: rgba(255, 255, 255, 0.04); }
.totals li.me { background: rgba(233, 196, 106, 0.12); }
.rank { width: 18px; color: var(--ink-faint); font-weight: 700; }
.name { flex: 1; }
.total { font-weight: 800; font-variant-numeric: tabular-nums; }
.ledger, .hands { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.ledger li { display: grid; grid-template-columns: 1fr auto auto; gap: 8px; padding: 4px 6px; border-bottom: 1px dashed rgba(255, 255, 255, 0.08); }
.flow { color: var(--ink-dim); }
.pts { font-weight: 700; color: var(--gold); }
.hands li { padding: 6px 8px; border-radius: 8px; background: rgba(255, 255, 255, 0.04); }
.hand-head { display: flex; justify-content: space-between; }
.muted { color: var(--ink-faint); }
.hand-scores { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 2px; }
.hand-wins { color: var(--ink-dim); font-size: 0.78rem; margin-top: 2px; display: flex; flex-direction: column; }
</style>
