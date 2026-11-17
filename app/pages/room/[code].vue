<template>
  <div class="room-page">
    <header class="topbar">
      <button class="mj-btn ghost small" @click="confirmLeave">← Lobby</button>
      <div class="room-title">
        <span class="brand">Blood Battle</span>
        <button class="code-btn" :title="copied ? 'Copied!' : 'Copy invite link'" @click="copyInvite">
          {{ view?.code ?? code }} <small>{{ copied ? '✓ copied' : 'copy link' }}</small>
        </button>
      </div>
      <div class="top-actions">
        <span v-if="!room.connected.value" class="mj-chip red">reconnecting…</span>
        <span v-else-if="room.spectator.value" class="mj-chip muted">spectating</span>
        <button class="icon-btn" :title="muted ? 'Unmute' : 'Mute'" @click="toggleMute">{{ muted ? '🔇' : '🔊' }}</button>
        <button class="icon-btn" title="Scores" @click="toggleDrawer('scores')">🏆</button>
        <button class="icon-btn" title="Chat" @click="toggleDrawer('chat')">
          💬<span v-if="room.unreadChat.value && drawer !== 'chat'" class="badge">{{ room.unreadChat.value }}</span>
        </button>
        <button v-if="view && view.phase !== 'waiting'" class="icon-btn" title="Rules" @click="toggleDrawer('rules')">⚙️</button>
      </div>
    </header>

    <main class="room-main">
      <div v-if="loading" class="centered"><p>Joining table…</p></div>
      <div v-else-if="fatal" class="centered error-box">
        <h2>Couldn't open this table</h2>
        <p>{{ fatal }}</p>
        <NuxtLink to="/" class="mj-btn primary">Back to lobby</NuxtLink>
      </div>

      <template v-else-if="view">
        <WaitingRoom
          v-if="view.phase === 'waiting'"
          :view="view"
          :is-host="room.isHost.value"
          :busy="busy"
          @start="startHand"
          @leave="confirmLeave"
          @kick="room.kick"
          @rules="room.updateRules"
          @bot="room.addBot"
        />
        <div v-else class="table-stage">
          <GameTable />
          <Transition name="fade">
            <ResultOverlay v-if="view.phase === 'ended' && showResult" :view="view" :is-host="room.isHost.value" :busy="busy" @next="startHand" @leave="confirmLeave" />
          </Transition>
          <button v-if="view.phase === 'ended'" class="mj-btn small result-toggle" @click="showResult = !showResult">
            {{ showResult ? 'Look at the table' : 'Show results' }}
          </button>
        </div>
      </template>
    </main>

    <!-- Drawers -->
    <Transition name="drawer">
      <aside v-if="drawer" class="drawer">
        <header>
          <b>{{ drawer === 'chat' ? 'Table chat' : drawer === 'scores' ? 'Scores' : 'Rules' }}</b>
          <button class="icon-btn" @click="drawer = null">✕</button>
        </header>
        <div class="drawer-body">
          <ChatDrawer v-if="drawer === 'chat'" :messages="room.chat.value" :self-user-id="session.user.value?.userId ?? null" @send="room.sendChat" @emote="room.sendEmote" />
          <Scoreboard v-else-if="drawer === 'scores' && view" :view="view" />
          <RoomSettings v-else-if="drawer === 'rules' && view" :rules="view.rules" :editable="room.isHost.value && (view.phase === 'waiting' || view.phase === 'ended')" @update="room.updateRules" />
        </div>
        <div v-if="drawer === 'rules' && session.isAdmin.value" class="admin-tools">
          <b>Admin</b>
          <label><input type="checkbox" :checked="room.revealAll.value" @change="room.setRevealAll(($event.target as HTMLInputElement).checked)" /> Reveal all hands</label>
          <button class="mj-btn small" :disabled="!room.isMyTurn.value" @click="room.act(ActionType.CHEAT_HU)">Cheat Hu (test)</button>
        </div>
      </aside>
    </Transition>

    <Transition name="fade">
      <div v-if="room.notice.value" class="toast">{{ room.notice.value }}</div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ActionType } from '~/types/game'
import { ROOM_KEY } from '~/composables/roomKey'

const route = useRoute()
const code = computed(() => String(route.params.code || '').toUpperCase())
const session = useSession()
const room = useGameRoom()
provide(ROOM_KEY, room)

const { muted, toggle: toggleMute } = useSound()
const view = room.view
const loading = ref(true)
const fatal = ref<string | null>(null)
const busy = ref(false)
const drawer = ref<'chat' | 'scores' | 'rules' | null>(null)
const showResult = ref(true)
const copied = ref(false)

useHead(() => ({ title: view.value ? `Room ${view.value.code} · Blood on Mahjong` : 'Blood on Mahjong' }))

onMounted(async () => {
  const user = await session.ensure()
  if (!user) {
    navigateTo(`/login?next=${encodeURIComponent(`/room/${code.value}`)}`)
    return
  }
  const result = await room.connect(code.value)
  loading.value = false
  if (!result) fatal.value = room.error.value ?? 'Room not found'
})

onUnmounted(() => room.disconnect())

room.onEvent(event => {
  if (event.type === 'hand_ended') showResult.value = true
  if (event.type === 'hand_started') {
    showResult.value = true
    drawer.value = null
  }
})

const toggleDrawer = (which: 'chat' | 'scores' | 'rules') => {
  drawer.value = drawer.value === which ? null : which
  if (drawer.value === 'chat') room.markChatRead()
}

const startHand = async () => {
  busy.value = true
  try {
    await room.startHand()
  } finally {
    busy.value = false
  }
}

const confirmLeave = async () => {
  const inHand = view.value && !['waiting', 'ended'].includes(view.value.phase)
  if (inHand && !window.confirm('Leave in the middle of a hand? Your seat will be auto-played until you come back.')) return
  await room.leaveRoom()
  navigateTo('/')
}

const copyInvite = async () => {
  try {
    await navigator.clipboard.writeText(`${window.location.origin}/join/${view.value?.code ?? code.value}`)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    room.flash('Could not copy; the code is ' + (view.value?.code ?? code.value))
  }
}
</script>

<style scoped>
.room-page { min-height: 100vh; min-height: 100dvh; display: flex; flex-direction: column; }
.topbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 12px; position: sticky; top: 0; z-index: 20; background: rgba(7, 21, 16, 0.9); backdrop-filter: blur(8px); border-bottom: 1px solid var(--panel-border); }
.room-title { display: flex; align-items: center; gap: 10px; min-width: 0; }
.brand { font-weight: 800; letter-spacing: 0.1em; color: var(--gold); white-space: nowrap; }
.code-btn { border: 1px dashed rgba(233, 196, 106, 0.6); background: rgba(233, 196, 106, 0.08); color: var(--ink); border-radius: 10px; padding: 4px 10px; font-weight: 800; letter-spacing: 0.2em; cursor: pointer; display: flex; flex-direction: column; align-items: center; line-height: 1.1; }
.code-btn small { font-size: 0.6rem; letter-spacing: 0.04em; font-weight: 500; color: var(--ink-faint); }
.top-actions { display: flex; align-items: center; gap: 6px; }
.icon-btn { position: relative; border: none; background: rgba(255, 255, 255, 0.07); color: var(--ink); width: 38px; height: 38px; border-radius: 10px; cursor: pointer; font-size: 1.05rem; }
.icon-btn:hover { background: rgba(255, 255, 255, 0.14); }
.badge { position: absolute; top: -4px; right: -4px; background: var(--danger); color: #fff; font-size: 0.65rem; font-weight: 700; border-radius: 999px; padding: 1px 5px; }
.room-main { flex: 1; padding: 12px; display: flex; flex-direction: column; }
.centered { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: var(--ink-dim); text-align: center; }
.error-box h2 { margin: 0; color: var(--ink); }
.table-stage { position: relative; flex: 1; }
.result-toggle { position: absolute; top: 12px; right: 12px; z-index: 31; }
.drawer { position: fixed; top: 0; right: 0; bottom: 0; width: min(380px, 92vw); z-index: 40; background: var(--panel-solid); border-left: 1px solid var(--panel-border); box-shadow: -10px 0 40px rgba(0, 0, 0, 0.6); display: flex; flex-direction: column; }
.drawer header { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-bottom: 1px solid var(--panel-border); }
.drawer-body { flex: 1; overflow-y: auto; padding: 14px; }
.admin-tools { border-top: 1px solid var(--panel-border); padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; font-size: 0.85rem; }
.drawer-enter-active, .drawer-leave-active { transition: transform 0.25s ease; }
.drawer-enter-from, .drawer-leave-to { transform: translateX(100%); }
@media (max-width: 600px) {
  .topbar { padding: 6px 8px; gap: 4px; }
  .brand { display: none; }
  .code-btn { padding: 3px 8px; letter-spacing: 0.12em; font-size: 0.9rem; }
  .top-actions { gap: 4px; }
  .icon-btn { width: 32px; height: 32px; font-size: 0.9rem; }
  .room-main { padding: 6px; }
}
.toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 50; background: rgba(239, 83, 80, 0.92); color: #fff; padding: 10px 16px; border-radius: 12px; font-weight: 600; box-shadow: var(--shadow); max-width: 90vw; text-align: center; }
</style>
