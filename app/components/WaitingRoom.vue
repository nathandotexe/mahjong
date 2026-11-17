<template>
  <div class="waiting">
    <section class="panel seats">
      <h3>Table · {{ view.players.length }}/4</h3>
      <ul>
        <li v-for="i in 4" :key="i" :class="{ filled: !!view.players[i - 1], me: view.players[i - 1]?.isSelf }">
          <template v-if="view.players[i - 1]">
            <span class="dot" :class="{ online: view.players[i - 1]!.connected }" />
            <span class="pname">{{ view.players[i - 1]!.name }}</span>
            <span v-if="view.players[i - 1]!.isHost" class="mj-chip gold">host</span>
            <span v-if="view.players[i - 1]!.isSelf" class="mj-chip muted">you</span>
            <span v-if="view.players[i - 1]!.isBot" class="mj-chip blue">bot</span>
            <span v-if="view.handNumber > 0" class="session" :class="cls(view.sessionScores[view.players[i - 1]!.id] ?? 0)">{{ fmt(view.sessionScores[view.players[i - 1]!.id] ?? 0) }}</span>
            <button v-if="isHost && !view.players[i - 1]!.isSelf" class="mj-btn small ghost" @click="emit('kick', view.players[i - 1]!.id)">Remove</button>
          </template>
          <template v-else>
            <span class="dot" />
            <span class="pname empty">Waiting for a player…</span>
          </template>
        </li>
      </ul>
      <div class="start">
        <template v-if="isHost">
          <button class="mj-btn primary block" :disabled="view.players.length < 2 || busy" @click="emit('start')">
            {{ view.players.length < 2 ? 'Need at least 2 players' : view.handNumber > 0 ? 'Deal next hand' : `Start with ${view.players.length} players` }}
          </button>
          <button v-if="view.players.length < 4" class="mj-btn small" :disabled="busy" @click="emit('bot')">+ Add a bot seat</button>
          <p class="hint" v-if="view.players.length < 4">The table plays with 2 to 4. Bots auto-play so you can start before it is full.</p>
        </template>
        <p v-else class="hint">Waiting for <b>{{ hostName }}</b> to start the game.</p>
        <button class="mj-btn ghost small" @click="emit('leave')">Leave table</button>
      </div>
    </section>

    <section class="panel">
      <h3>Invite friends</h3>
      <InvitePanel :code="view.code" />
    </section>

    <section class="panel">
      <h3>Rules <span v-if="!isHost" class="mj-chip muted">set by host</span></h3>
      <RoomSettings :rules="view.rules" :editable="isHost" @update="p => emit('rules', p)" />
    </section>
  </div>
</template>

<script setup lang="ts">
import type { GameView, RuleConfig } from '~/types/game'

const props = defineProps<{ view: GameView; isHost: boolean; busy?: boolean }>()
const emit = defineEmits<{
  (e: 'start'): void
  (e: 'leave'): void
  (e: 'kick', playerId: string): void
  (e: 'rules', patch: Partial<RuleConfig>): void
  (e: 'bot'): void
}>()

const hostName = computed(() => props.view.players.find(p => p.isHost)?.name ?? 'the host')
const fmt = (v: number) => (v > 0 ? `+${v}` : `${v}`)
const cls = (v: number) => (v > 0 ? 'score-pos' : v < 0 ? 'score-neg' : 'score-zero')
</script>

<style scoped>
.waiting { display: grid; gap: 16px; grid-template-columns: 1fr; width: 100%; max-width: 1100px; margin: 0 auto; }
@media (min-width: 900px) { .waiting { grid-template-columns: 1.1fr 1fr; } .waiting > :last-child { grid-column: 1 / -1; } }
.panel { background: var(--panel); border: 1px solid var(--panel-border); border-radius: 18px; padding: 18px; }
h3 { margin: 0 0 12px; font-size: 1rem; display: flex; align-items: center; gap: 8px; }
ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
li { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 12px; background: rgba(255, 255, 255, 0.04); border: 1px dashed rgba(255, 255, 255, 0.1); }
li.filled { border-style: solid; animation: mj-fade-up 0.3s ease; }
li.me { background: rgba(233, 196, 106, 0.1); }
.dot { width: 10px; height: 10px; border-radius: 50%; background: rgba(255, 255, 255, 0.15); flex: none; }
.dot.online { background: var(--accent); box-shadow: 0 0 8px rgba(70, 197, 116, 0.8); }
.pname { flex: 1; font-weight: 600; }
.pname.empty { color: var(--ink-faint); font-weight: 400; }
.session { font-weight: 700; font-variant-numeric: tabular-nums; }
.start { margin-top: 14px; display: flex; flex-direction: column; gap: 8px; align-items: center; }
.hint { margin: 0; color: var(--ink-dim); font-size: 0.85rem; text-align: center; }
</style>
