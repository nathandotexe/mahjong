<template>
  <div class="overlay">
    <div class="card">
      <header class="head" style="--i: 0">
        <p class="eyebrow">Hand {{ view.handNumber }} · {{ reasonLabel }}</p>
        <h2>{{ headline }}</h2>
      </header>

      <section v-if="wins.length" class="wins">
        <article v-for="(w, i) in wins" :key="`${w.playerId}-${i}`" class="win" :style="{ '--i': i + 1 }">
          <div class="win-head">
            <span class="win-name">{{ name(w.playerId) }}</span>
            <span class="mj-chip red">{{ w.flags.selfDrawn ? 'Self-draw' : `Discarded by ${name(w.fromPlayerId)}` }}</span>
            <span class="win-points">+{{ w.pointsReceived }}</span>
          </div>
          <div class="win-tiles">
            <MahjongTile v-for="t in w.tiles" :key="t.id" :tile="t" size="sm" flat :highlight="t.id === w.winningTile.id" />
            <div v-for="(m, j) in w.melds" :key="`m${j}`" class="win-meld">
              <MahjongTile v-for="t in m.tiles" :key="t.id" :tile="t" size="sm" flat />
            </div>
          </div>
          <ul class="fan-list">
            <li class="fan-item main" :style="{ '--i': i + 1 }">
              <span>{{ w.fan.handType.name }}</span>
              <b>{{ w.fan.handType.fan }} fan</b>
            </li>
            <li v-for="(x, k) in w.fan.extras" :key="x.key" class="fan-item" :style="{ '--i': i + 1 + (k + 1) * 0.35 }">
              <span>{{ x.name }}</span>
              <b>+{{ x.fan }}</b>
            </li>
            <li class="fan-item total" :style="{ '--i': i + 1 + (w.fan.extras.length + 1) * 0.35 }">
              <span>Total{{ w.fan.capped ? ' (capped)' : '' }}</span>
              <b>{{ w.fan.totalFan }} fan · {{ w.fan.points }} pt{{ w.fan.points === 1 ? '' : 's' }}{{ w.flags.selfDrawn ? ' each' : '' }}</b>
            </li>
          </ul>
        </article>
      </section>

      <section class="settle" :style="{ '--i': wins.length + 1.5 }">
        <h3>Settlement</h3>
        <table>
          <thead><tr><th>Player</th><th>Hand</th><th>Session</th><th>Status</th></tr></thead>
          <tbody>
            <tr v-for="p in ranked" :key="p.id" :class="{ me: p.isSelf }">
              <td>{{ p.name }}</td>
              <td :class="cls(score(p.id))">{{ fmt(score(p.id)) }}</td>
              <td :class="cls(view.sessionScores[p.id] ?? 0)">{{ fmt(view.sessionScores[p.id] ?? 0) }}</td>
              <td class="status">{{ statusLabel(p) }}</td>
            </tr>
          </tbody>
        </table>
        <details v-if="view.ledger.length" class="ledger">
          <summary>Point by point ({{ view.ledger.length }})</summary>
          <ul>
            <li v-for="e in view.ledger" :key="e.id"><span>{{ e.label }}</span><span>{{ name(e.from) }} → {{ name(e.to) }}</span><b>{{ e.points }}</b></li>
          </ul>
        </details>
      </section>

      <footer class="actions" :style="{ '--i': wins.length + 2 }">
        <button v-if="isHost" class="mj-btn primary" :disabled="busy" @click="emit('next')">Next hand</button>
        <p v-else class="waiting">Waiting for the host to deal the next hand…</p>
        <button class="mj-btn" @click="copyResults">Copy results</button>
        <button class="mj-btn ghost" @click="emit('leave')">Leave table</button>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { GameView, PlayerView } from '~/types/game'

const props = defineProps<{ view: GameView; isHost: boolean; busy?: boolean }>()
const emit = defineEmits<{ (e: 'next'): void; (e: 'leave'): void }>()

const wins = computed(() => props.view.players.flatMap(p => p.wins).sort((a, b) => a.at - b.at))
const name = (id: string | null) => props.view.players.find(p => p.id === id)?.name ?? '?'
const score = (id: string) => props.view.finalScores?.[id] ?? props.view.players.find(p => p.id === id)?.score ?? 0
const fmt = (v: number) => (v > 0 ? `+${v}` : `${v}`)
const cls = (v: number) => (v > 0 ? 'score-pos' : v < 0 ? 'score-neg' : 'score-zero')
const ranked = computed(() => [...props.view.players].sort((a, b) => score(b.id) - score(a.id)))

const me = computed(() => props.view.players.find(p => p.isSelf))
const headline = computed(() => {
  if (!me.value) return 'Hand over'
  const s = score(me.value.id)
  if (me.value.wins.length) return s > 0 ? `You won! +${s}` : 'You won!'
  if (props.view.endReason === 'owner_left') return 'The host closed the table'
  return s < 0 ? `You lost ${Math.abs(s)}` : s > 0 ? `You gained ${s}` : 'No change'
})
const reasonLabel = computed(
  () =>
    ({
      wall_exhausted: 'Draw · the wall ran out',
      last_player: 'Blood battle · one player left',
      all_won: 'Everyone won',
      owner_left: 'Host left',
      empty_room: 'Room emptied',
      cheat: 'Admin test'
    } as Record<string, string>)[props.view.endReason ?? ''] ?? 'Finished'
)
const statusLabel = (p: PlayerView) => {
  if (p.wins.length) return p.wins.length > 1 ? `Won ×${p.wins.length}` : `Won #${p.winOrder ?? ''}`
  if (p.isTing) return 'Ready'
  return 'Not ready'
}

const copyResults = async () => {
  const lines = [
    `Blood on Mahjong · room ${props.view.code} · hand ${props.view.handNumber}`,
    ...ranked.value.map(p => `${p.name}: ${fmt(score(p.id))} (session ${fmt(props.view.sessionScores[p.id] ?? 0)})`),
    ...wins.value.map(w => `${name(w.playerId)} ${w.flags.selfDrawn ? 'self-draw' : 'on discard'}: ${w.fan.summary} (${w.fan.totalFan} fan)`)
  ]
  try {
    await navigator.clipboard.writeText(lines.join('\n'))
  } catch {
    /* ignore */
  }
}
</script>

<style scoped>
.overlay { position: absolute; inset: 0; z-index: 30; display: flex; align-items: center; justify-content: center; padding: 12px; background: rgba(3, 10, 7, 0.78); backdrop-filter: blur(4px); overflow-y: auto; }
.card { width: 100%; max-width: 680px; max-height: 100%; overflow-y: auto; background: var(--panel-solid); border: 1px solid var(--panel-border); border-radius: 20px; padding: 20px; box-shadow: var(--shadow); display: flex; flex-direction: column; gap: 16px; }
.head, .win, .settle, .actions, .fan-item { animation: mj-fade-up 0.5s ease both; animation-delay: calc(var(--i, 0) * 0.22s); }
.eyebrow { margin: 0; color: var(--ink-faint); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.1em; }
h2 { margin: 2px 0 0; font-size: 1.7rem; }
.wins { display: flex; flex-direction: column; gap: 12px; }
.win { background: rgba(255, 255, 255, 0.04); border-radius: 14px; padding: 12px; }
.win-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.win-name { font-weight: 800; }
.win-points { margin-left: auto; font-weight: 900; color: #8fe3ad; font-size: 1.2rem; }
.win-tiles { display: flex; flex-wrap: wrap; gap: 2px; align-items: center; margin-bottom: 8px; }
.win-meld { display: inline-flex; gap: 1px; margin-left: 8px; padding: 2px; border-radius: 6px; background: rgba(0, 0, 0, 0.3); }
.fan-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.fan-item { display: flex; justify-content: space-between; padding: 4px 6px; border-radius: 6px; font-size: 0.9rem; }
.fan-item small { color: var(--ink-faint); margin-left: 6px; font-size: 0.75rem; }
.fan-item.main { background: rgba(233, 196, 106, 0.12); }
.fan-item.total { border-top: 1px solid var(--panel-border); margin-top: 4px; font-weight: 700; color: var(--gold); }
h3 { margin: 0 0 8px; font-size: 1rem; }
table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
th { text-align: left; font-weight: 600; color: var(--ink-faint); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; padding: 4px 6px; }
td { padding: 6px; border-top: 1px solid rgba(255, 255, 255, 0.06); font-variant-numeric: tabular-nums; }
tr.me td { background: rgba(233, 196, 106, 0.08); }
.status { color: var(--ink-dim); font-size: 0.82rem; }
.ledger { margin-top: 8px; font-size: 0.82rem; color: var(--ink-dim); }
.ledger summary { cursor: pointer; }
.ledger ul { list-style: none; padding: 0; margin: 6px 0 0; display: flex; flex-direction: column; gap: 2px; }
.ledger li { display: grid; grid-template-columns: 1fr auto auto; gap: 10px; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; justify-content: center; }
.waiting { margin: 0; color: var(--ink-dim); font-size: 0.9rem; }
</style>
