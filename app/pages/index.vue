<template>
  <div class="mj-page lobby">
    <div class="lobby-grid">
      <section class="mj-card hero">
        <div class="hero-head">
          <div>
            <h1 class="mj-title">Waiting Room</h1>
            <p class="mj-subtitle">
              Welcome back, <b>{{ session.user.value?.name || 'Player' }}</b>
              <span v-if="session.isAdmin.value" class="mj-chip gold">admin</span>
            </p>
          </div>
          <button class="mj-btn ghost small" @click="logout">Log out</button>
        </div>

        <div v-if="liveGame" class="rejoin">
          <div>
            <b>You have a table in progress</b>
            <p>Room {{ liveGame.code }} · {{ liveGame.playerCount }} players · {{ phaseLabel(liveGame.phase) }}</p>
          </div>
          <NuxtLink :to="`/room/${liveGame.code}`" class="mj-btn gold">Rejoin</NuxtLink>
        </div>

        <div class="actions">
          <button class="mj-btn primary big" :disabled="creating" @click="createTable">
            {{ creating ? 'Creating…' : 'New table' }}
            <small>Get a code to share</small>
          </button>
          <form class="join" @submit.prevent="joinByCode">
            <input v-model="joinCode" class="mj-input code" maxlength="8" placeholder="ROOM CODE" autocapitalize="characters" spellcheck="false" />
            <button class="mj-btn" type="submit" :disabled="joining || joinCode.replace(/[^a-z0-9]/gi, '').length < 4">{{ joining ? 'Joining…' : 'Join' }}</button>
          </form>
          <p v-if="error" class="mj-error">{{ error }}</p>
        </div>

        <details class="quick-rules">
          <summary>Table rules for new tables</summary>
          <RoomSettings :rules="newRules" :editable="true" @update="p => Object.assign(newRules, p)" />
        </details>

        <div class="links">
          <NuxtLink to="/history" class="mj-btn">Match history</NuxtLink>
          <button class="mj-btn" @click="editingName = !editingName">Change name</button>
        </div>
        <form v-if="editingName" class="rename" @submit.prevent="saveName">
          <input v-model="newName" class="mj-input" maxlength="24" placeholder="New display name" />
          <button class="mj-btn primary" type="submit" :disabled="!newName.trim()">Save</button>
        </form>
      </section>

      <section class="mj-card tables">
        <div class="tables-head">
          <h2>Open tables</h2>
          <button class="mj-btn small ghost" :disabled="loadingTables" @click="loadTables">{{ loadingTables ? '…' : 'Refresh' }}</button>
        </div>
        <p v-if="!tables.length && !loadingTables" class="empty">No open tables right now. Start one and share the code.</p>
        <ul v-else class="table-list">
          <li v-for="t in tables" :key="t.gameId">
            <div class="t-main">
              <span class="t-code">{{ t.code }}</span>
              <span class="t-meta">{{ t.playerCount }}/4 · host {{ t.hostName || '?' }}</span>
              <span class="t-rules">
                <span class="mj-chip muted">{{ t.rules.preset === 'mil' ? 'MIL' : 'Standard' }}</span>
                <span class="mj-chip muted">cap {{ t.rules.fanCap || '∞' }}</span>
                <span v-if="t.rules.exchangeThree" class="mj-chip muted">Swap three</span>
                <span v-if="t.rules.bloodRiver" class="mj-chip red">Blood River</span>
              </span>
            </div>
            <NuxtLink :to="`/room/${t.code}`" class="mj-btn small primary">Join</NuxtLink>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { DEFAULT_RULES, type RuleConfig } from '~/types/game'

interface OpenTable { gameId: string; code: string; playerCount: number; hostName: string | null; rules: RuleConfig }

const session = useSession()
const creating = ref(false)
const joining = ref(false)
const joinCode = ref('')
const error = ref('')
const tables = ref<OpenTable[]>([])
const loadingTables = ref(false)
const liveGame = ref<{ code: string; phase: string; playerCount: number } | null>(null)
const newRules = reactive<RuleConfig>({ ...DEFAULT_RULES })
const editingName = ref(false)
const newName = ref('')

useHead({ title: 'Blood on Mahjong' })

onMounted(async () => {
  const user = await session.ensure()
  if (!user) {
    navigateTo('/login')
    return
  }
  newName.value = user.name
  try {
    const saved = window.localStorage.getItem('mj-new-rules')
    if (saved) Object.assign(newRules, JSON.parse(saved))
  } catch {
    /* ignore */
  }
  loadTables()
  try {
    const mine = await $fetch<{ data: { code: string; phase: string; playerCount: number } | null }>('/api/game/mine')
    liveGame.value = mine.data
  } catch {
    liveGame.value = null
  }
})

watch(newRules, value => {
  try {
    window.localStorage.setItem('mj-new-rules', JSON.stringify(value))
  } catch {
    /* ignore */
  }
})

const loadTables = async () => {
  loadingTables.value = true
  try {
    const response = await $fetch<{ data: { games: OpenTable[] } }>('/api/game/waiting', { cache: 'no-cache' })
    tables.value = response.data.games
  } catch {
    tables.value = []
  } finally {
    loadingTables.value = false
  }
}

const createTable = async () => {
  if (creating.value) return
  creating.value = true
  error.value = ''
  try {
    const response = await $fetch<{ data: { code: string } }>('/api/game/create', { method: 'POST', body: { rules: newRules } })
    await navigateTo(`/room/${response.data.code}`)
  } catch (e: any) {
    error.value = e?.data?.message || 'Could not create a table'
  } finally {
    creating.value = false
  }
}

const joinByCode = async () => {
  const code = joinCode.value.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (code.length < 4) return
  joining.value = true
  error.value = ''
  try {
    const response = await $fetch<{ data: { code: string } }>('/api/game/join', { method: 'POST', body: { code } })
    await navigateTo(`/room/${response.data.code}`)
  } catch (e: any) {
    error.value = e?.data?.message || 'No table with that code'
  } finally {
    joining.value = false
  }
}

const saveName = async () => {
  try {
    await $fetch('/api/profile', { method: 'PUT', body: { name: newName.value.trim() } })
    await session.refresh()
    editingName.value = false
  } catch (e: any) {
    error.value = e?.data?.message || 'Could not save the name'
  }
}

const logout = async () => {
  await session.logout()
  navigateTo('/login')
}

const phaseLabel = (phase: string) => ({ waiting: 'waiting to start', exchanging: 'swapping tiles', choosing_suit: 'choosing suits', playing: 'in play', ended: 'between hands' })[phase] ?? phase
</script>

<style scoped>
.lobby { align-items: flex-start; }
.lobby-grid { width: 100%; max-width: 1080px; display: grid; gap: 16px; grid-template-columns: 1fr; }
@media (min-width: 900px) { .lobby-grid { grid-template-columns: 1.1fr 0.9fr; } }
.mj-card { max-width: none; }
.hero-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.rejoin { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; border-radius: 14px; background: rgba(233, 196, 106, 0.12); border: 1px solid rgba(233, 196, 106, 0.4); margin-bottom: 16px; animation: mj-fade-up 0.3s ease; }
.rejoin p { margin: 2px 0 0; color: var(--ink-dim); font-size: 0.85rem; }
.actions { display: flex; flex-direction: column; gap: 12px; }
.big { padding: 16px; font-size: 1.15rem; flex-direction: column; gap: 2px; border-radius: 16px; }
.big small { font-size: 0.72rem; font-weight: 500; opacity: 0.8; }
.join { display: flex; gap: 8px; }
.quick-rules { margin-top: 18px; color: var(--ink-dim); font-size: 0.9rem; }
.quick-rules summary { cursor: pointer; margin-bottom: 10px; }
.links { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 18px; }
.rename { display: flex; gap: 8px; margin-top: 10px; }
.tables-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
h2 { margin: 0; font-size: 1.1rem; }
.empty { color: var(--ink-faint); font-size: 0.9rem; }
.table-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.table-list li { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px; border-radius: 12px; background: rgba(255, 255, 255, 0.04); border: 1px solid var(--panel-border); }
.t-main { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.t-code { font-weight: 800; letter-spacing: 0.2em; color: var(--gold); }
.t-meta { font-size: 0.82rem; color: var(--ink-dim); }
.t-rules { display: flex; gap: 4px; flex-wrap: wrap; }
</style>
