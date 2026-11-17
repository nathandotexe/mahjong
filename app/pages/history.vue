<template>
  <div class="mj-page history">
    <div class="mj-card shell">
      <header class="head">
        <NuxtLink to="/" class="mj-btn ghost small">← Back</NuxtLink>
        <div>
          <h1 class="mj-title">Match History</h1>
          <p class="mj-subtitle">Recent games across all rooms</p>
        </div>
        <button class="mj-btn small" :disabled="isLoading" @click="loadHistory">Refresh</button>
      </header>

      <label class="filter">
        <button class="mj-switch" role="switch" :aria-checked="showOnlyMine" @click="showOnlyMine = !showOnlyMine" />
        <span>Show only my hands</span>
      </label>

      <p v-if="errorMessage" class="mj-error">{{ errorMessage }}</p>
      <p v-else-if="isLoading" class="muted">Loading match history…</p>
      <p v-else-if="!histories.length" class="muted">No hands recorded yet.</p>

      <div v-else class="list">
        <article v-for="match in histories" :key="`${match.gameId}-${match.handNumber ?? 0}`" class="match">
          <div class="match-head">
            <div>
              <p class="room">Room {{ match.code ?? match.roomId.slice(0, 6).toUpperCase() }}<span v-if="match.handNumber"> · hand {{ match.handNumber }}</span></p>
              <h2>{{ formatDate(match.completedAt) }}</h2>
            </div>
            <div class="meta">
              <span class="mj-chip gold">{{ match.winnersCount }} winner{{ match.winnersCount === 1 ? '' : 's' }}</span>
              <span class="mj-chip muted">{{ reasonLabel(match.endReason) }}</span>
              <span v-if="match.rules" class="mj-chip muted">{{ match.rules.preset === 'mil' ? 'MIL' : 'Standard' }} · cap {{ match.rules.fanCap || '∞' }}</span>
            </div>
          </div>

          <ul class="players">
            <li v-for="player in match.results" :key="player.playerId" :class="{ winner: player.status === 'won', me: player.userId === myUserId }">
              <div>
                <p class="pname">{{ player.name }} <span v-if="player.userId === myUserId" class="mj-chip muted">you</span></p>
                <p class="pmeta">
                  {{ player.status === 'won' ? `won #${player.winOrder ?? ''}` : 'did not win' }}
                  <span v-if="player.fanSummary"> · {{ player.fanSummary }}</span>
                </p>
              </div>
              <div class="pscore">
                <b :class="cls(player.finalScore)">{{ fmt(player.finalScore) }}</b>
                <small v-if="player.sessionScore !== undefined" :class="cls(player.sessionScore)">session {{ fmt(player.sessionScore) }}</small>
              </div>
            </li>
          </ul>
        </article>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Result {
  playerId: string
  userId?: string
  name: string
  status: string
  winOrder: number | null
  finalScore: number
  sessionScore?: number
  fanSummary?: string | null
}
interface Match {
  gameId: string
  roomId: string
  code?: string
  handNumber?: number
  rules?: { preset: string; fanCap: number }
  endReason: string | null
  winnersCount: number
  completedAt: string | Date
  results: Result[]
}

const session = useSession()
const histories = ref<Match[]>([])
const isLoading = ref(false)
const errorMessage = ref<string | null>(null)
const showOnlyMine = ref(false)
const myUserId = computed(() => session.user.value?.userId ?? null)

useHead({ title: 'Match history · Blood on Mahjong' })

const loadHistory = async () => {
  isLoading.value = true
  errorMessage.value = null
  try {
    const response = await $fetch<{ success: boolean; data: Match[] }>('/api/history/list', {
      query: { limit: 30, ...(showOnlyMine.value ? { mine: 1 } : {}) },
      cache: 'no-cache'
    })
    histories.value = response.data || []
  } catch (err: any) {
    errorMessage.value = err?.data?.message || err?.message || 'Failed to load match history'
  } finally {
    isLoading.value = false
  }
}

watch(showOnlyMine, loadHistory)
onMounted(async () => {
  await session.ensure()
  loadHistory()
})

const formatDate = (value: string | Date) => new Date(value).toLocaleString()
const fmt = (v: number) => (v > 0 ? `+${v}` : `${v}`)
const cls = (v: number) => (v > 0 ? 'score-pos' : v < 0 ? 'score-neg' : 'score-zero')
const reasonLabel = (reason: string | null) =>
  ({ wall_exhausted: 'draw', last_player: 'blood battle', all_won: 'all won', owner_left: 'host left', empty_room: 'room emptied', cheat: 'test' })[reason ?? ''] ?? (reason || 'finished')
</script>

<style scoped>
.history { align-items: flex-start; }
.shell { max-width: 900px; }
.head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.filter { display: flex; align-items: center; gap: 10px; font-size: 0.9rem; color: var(--ink-dim); margin-bottom: 16px; }
.muted { color: var(--ink-faint); }
.list { display: flex; flex-direction: column; gap: 12px; }
.match { border: 1px solid var(--panel-border); border-radius: 14px; padding: 14px; background: rgba(255, 255, 255, 0.03); }
.match-head { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 10px; }
.room { margin: 0; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-faint); }
h2 { margin: 2px 0 0; font-size: 1rem; }
.meta { display: flex; gap: 6px; flex-wrap: wrap; align-items: flex-start; }
.players { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.players li { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 10px; background: rgba(255, 255, 255, 0.04); }
.players li.winner { background: rgba(239, 83, 80, 0.12); }
.players li.me { outline: 1px solid rgba(233, 196, 106, 0.5); }
.pname { margin: 0; font-weight: 600; }
.pmeta { margin: 2px 0 0; font-size: 0.8rem; color: var(--ink-dim); }
.pscore { display: flex; flex-direction: column; align-items: flex-end; font-variant-numeric: tabular-nums; }
.pscore b { font-size: 1.1rem; }
.pscore small { font-size: 0.72rem; }
</style>
