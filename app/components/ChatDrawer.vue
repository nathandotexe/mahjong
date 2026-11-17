<template>
  <div class="chat">
    <div ref="list" class="messages">
      <p v-if="!messages.length" class="empty">Say hi, or send an emote.</p>
      <div v-for="m in messages" :key="m.id" class="msg" :class="[m.kind, { me: m.userId === selfUserId }]">
        <span class="who">{{ m.name }}</span>
        <span class="text">{{ m.text }}</span>
      </div>
    </div>
    <div class="emotes">
      <button v-for="e in EMOTES" :key="e" type="button" @click="emit('emote', e)">{{ e }}</button>
    </div>
    <form class="compose" @submit.prevent="send">
      <input v-model="draft" class="mj-input" maxlength="200" placeholder="Message the table…" />
      <button class="mj-btn primary small" type="submit" :disabled="!draft.trim()">Send</button>
    </form>
  </div>
</template>

<script setup lang="ts">
import type { ChatMessage } from '~/composables/useGameRoom'

const props = defineProps<{ messages: ChatMessage[]; selfUserId: string | null }>()
const emit = defineEmits<{ (e: 'send', text: string): void; (e: 'emote', emote: string): void }>()

const EMOTES = ['👍', '😂', '😭', '🔥', '🀄', '👋', '🤔', '🎉']
const draft = ref('')
const list = ref<HTMLElement | null>(null)

const send = () => {
  const text = draft.value.trim()
  if (!text) return
  emit('send', text)
  draft.value = ''
}

watch(
  () => props.messages.length,
  async () => {
    await nextTick()
    if (list.value) list.value.scrollTop = list.value.scrollHeight
  }
)
</script>

<style scoped>
.chat { display: flex; flex-direction: column; gap: 8px; height: 100%; min-height: 240px; }
.messages { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; padding-right: 4px; }
.empty { color: var(--ink-faint); font-size: 0.85rem; text-align: center; margin-top: 20px; }
.msg { display: flex; flex-direction: column; padding: 6px 10px; border-radius: 10px; background: rgba(255, 255, 255, 0.06); max-width: 85%; align-self: flex-start; font-size: 0.9rem; }
.msg.me { align-self: flex-end; background: rgba(70, 197, 116, 0.16); }
.msg.emote .text { font-size: 1.6rem; line-height: 1.1; }
.who { font-size: 0.7rem; color: var(--ink-faint); }
.emotes { display: flex; gap: 4px; flex-wrap: wrap; }
.emotes button { border: none; background: rgba(255, 255, 255, 0.08); border-radius: 10px; font-size: 1.2rem; padding: 4px 8px; cursor: pointer; }
.emotes button:hover { background: rgba(255, 255, 255, 0.16); }
.compose { display: flex; gap: 6px; }
</style>
