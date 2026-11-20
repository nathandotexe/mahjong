<template>
  <div class="mj-page login-page">
    <div class="mj-card">
      <div class="hero">
        <div class="hero-tiles">
          <MahjongTile :tile="heroTiles[0]!" size="sm" flat />
          <MahjongTile :tile="heroTiles[1]!" size="sm" flat />
          <MahjongTile :tile="heroTiles[2]!" size="sm" flat />
        </div>
        <h1 class="mj-title">Blood on Mahjong</h1>
        <p class="mj-subtitle">Blood Battle · Sichuan mahjong with friends, in the browser.</p>
        <NuxtLink to="/how-to-play" class="rules-link">New to Sichuan mahjong? Learn how to play →</NuxtLink>
      </div>

      <form class="guest" @submit.prevent="continueAsGuest">
        <label class="mj-label" for="nick">Your nickname</label>
        <div class="guest-row">
          <input id="nick" v-model="nickname" class="mj-input" maxlength="24" autocomplete="nickname" placeholder="e.g. Red Panda" />
          <button class="mj-btn primary" type="submit" :disabled="!nickname.trim() || busy">Play</button>
        </div>
        <p class="hint">{{ nextHint }}</p>
        <p v-if="error" class="mj-error">{{ error }}</p>
      </form>

      <div class="mj-divider" />

      <button class="mj-btn block" type="button" :disabled="busy" @click="handleGoogle">
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.8 6C12.3 13.2 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-10 7.1-17.5z"/><path fill="#FBBC05" d="M10.4 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.8-6z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.7-3.7-13.6-9l-7.8 6C6.5 42.6 14.6 48 24 48z"/></svg>
        Continue with Google
      </button>
      <p v-if="oauthError" class="mj-error">{{ oauthError }}</p>

      <details class="dev" :open="devUsers.length > 0">
        <summary>Dev accounts</summary>
        <div class="dev-grid">
          <button v-for="u in devUsers" :key="u.userId" class="mj-btn small" :class="{ gold: u.isAdmin }" type="button" :disabled="busy" @click="handleDebug(u.userId)">
            {{ u.name }}
          </button>
          <p v-if="!devUsers.length" class="hint">No local accounts.</p>
        </div>
      </details>
    </div>
  </div>
</template>

<script setup lang="ts">
import { TileSuit, type Tile } from '~/types/game'

definePageMeta({ layout: false })

const heroTiles: Tile[] = [
  { suit: TileSuit.CHARACTERS, value: 1, id: 'h1' },
  { suit: TileSuit.DOTS, value: 5, id: 'h2' },
  { suit: TileSuit.BAMBOOS, value: 9, id: 'h3' }
]

const route = useRoute()
const session = useSession()
const nickname = ref('')
const busy = ref(false)
const error = ref('')
const oauthError = ref('')
const devUsers = ref<{ userId: string; name: string; isAdmin: boolean }[]>([])

const next = computed(() => {
  const value = typeof route.query.next === 'string' ? route.query.next : '/'
  return value.startsWith('/') ? value : '/'
})
const nextHint = computed(() => (next.value.startsWith('/room/') ? `You'll be seated at table ${next.value.split('/').pop()}.` : 'No account needed. Your nickname is remembered on this device.'))

onMounted(async () => {
  try {
    const stored = window.localStorage.getItem('mj-nickname')
    if (stored) nickname.value = stored
  } catch {
    /* ignore */
  }
  try {
    const response = await $fetch<{ users: { userId: string; name: string; isAdmin: boolean }[] }>('/api/auth/users')
    devUsers.value = response.users ?? []
  } catch {
    devUsers.value = []
  }
  // Already signed in? Skip the form.
  const user = await session.ensure()
  if (user) navigateTo(next.value, { replace: true })
})

const continueAsGuest = async () => {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await session.loginGuest(nickname.value.trim())
    try {
      window.localStorage.setItem('mj-nickname', nickname.value.trim())
    } catch {
      /* ignore */
    }
    await navigateTo(next.value, { replace: true })
  } catch (e: any) {
    error.value = e?.data?.message || e?.message || 'Could not sign in'
  } finally {
    busy.value = false
  }
}

const handleDebug = async (userId: string) => {
  busy.value = true
  error.value = ''
  try {
    await session.loginDebug(userId)
    await navigateTo(next.value, { replace: true })
  } catch (e: any) {
    error.value = e?.data?.message || e?.message || 'Could not sign in'
  } finally {
    busy.value = false
  }
}

const handleGoogle = async () => {
  oauthError.value = ''
  busy.value = true
  try {
    const response = await $fetch<{ authUrl: string }>('/api/auth/google/login', { query: { next: next.value } })
    window.location.href = response.authUrl
  } catch (e: any) {
    oauthError.value = e?.data?.message || 'Google sign-in is not available on this server.'
    busy.value = false
  }
}
</script>

<style scoped>
.login-page { align-items: center; }
.hero { text-align: center; margin-bottom: 20px; }
.hero-tiles { display: flex; justify-content: center; gap: 4px; margin-bottom: 12px; --tile-w: 44px; --tile-h: 62px; }
.hero-tiles :deep(.tile:nth-child(1)) { transform: rotate(-8deg); }
.hero-tiles :deep(.tile:nth-child(3)) { transform: rotate(8deg); }
.guest-row { display: flex; gap: 8px; }
.hint { color: var(--ink-faint); font-size: 0.82rem; margin: 8px 0 0; }
.rules-link { display: inline-block; margin-top: -6px; font-size: 0.85rem; color: var(--gold); text-decoration: none; }
.rules-link:hover { text-decoration: underline; }
.dev { margin-top: 18px; font-size: 0.85rem; color: var(--ink-dim); }
.dev summary { cursor: pointer; }
.dev-grid { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
</style>
