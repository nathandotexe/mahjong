<template>
  <div class="invite">
    <div class="code-block">
      <span class="mj-label">Room code</span>
      <div class="code">{{ code }}</div>
      <p class="hint">Friends can enter this code on the home page, scan the QR, or open the link.</p>
    </div>
    <div class="qr" v-if="qrDataUrl">
      <img :src="qrDataUrl" alt="QR code for the invite link" />
    </div>
    <div class="actions">
      <button class="mj-btn primary" @click="copy(link, 'Link copied')">Copy invite link</button>
      <button class="mj-btn" @click="copy(code, 'Code copied')">Copy code</button>
      <button v-if="canShare" class="mj-btn" @click="share">Share…</button>
    </div>
    <p class="link">{{ link }}</p>
    <Transition name="fade"><p v-if="toast" class="toast">{{ toast }}</p></Transition>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ code: string }>()

const origin = ref('')
onMounted(() => {
  origin.value = window.location.origin
})
const link = computed(() => `${origin.value}/join/${props.code}`)
const canShare = ref(false)
const qrDataUrl = ref<string | null>(null)
const toast = ref<string | null>(null)

onMounted(async () => {
  canShare.value = typeof navigator !== 'undefined' && !!navigator.share
  try {
    const QRCode = await import('qrcode')
    qrDataUrl.value = await QRCode.toDataURL(link.value, { margin: 1, width: 180, color: { dark: '#0b1f16', light: '#fbf7ee' } })
  } catch {
    qrDataUrl.value = null
  }
})

let toastTimer: ReturnType<typeof setTimeout> | null = null
const showToast = (text: string) => {
  toast.value = text
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = null), 1800)
}

const copy = async (text: string, message: string) => {
  try {
    await navigator.clipboard.writeText(text)
    showToast(message)
  } catch {
    showToast('Copy failed, select the text manually')
  }
}

const share = async () => {
  try {
    await navigator.share({ title: 'Blood on Mahjong', text: `Join my mahjong table, code ${props.code}`, url: link.value })
  } catch {
    /* cancelled */
  }
}
</script>

<style scoped>
.invite { display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center; }
.code { font-size: 2.4rem; font-weight: 900; letter-spacing: 0.35em; padding-left: 0.35em; color: var(--gold); text-shadow: 0 2px 12px rgba(233, 196, 106, 0.35); }
.hint { color: var(--ink-dim); font-size: 0.85rem; margin: 0; max-width: 360px; }
.qr img { width: 150px; height: 150px; border-radius: 12px; border: 4px solid #fbf7ee; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
.link { font-size: 0.78rem; color: var(--ink-faint); word-break: break-all; margin: 0; }
.toast { margin: 0; color: #9be7b5; font-size: 0.85rem; }
</style>
