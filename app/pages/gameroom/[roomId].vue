<template>
  <div class="mj-page" style="align-items: center">
    <div class="mj-card" style="text-align: center">
      <h1 class="mj-title">Opening table…</h1>
      <p class="mj-subtitle">{{ message }}</p>
      <NuxtLink v-if="failed" to="/" class="mj-btn primary">Back to lobby</NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
/** Legacy URL (/gameroom/<gameId>?playerId=…) → redirect to the room code route. */
const route = useRoute()
const message = ref('Looking up the room code…')
const failed = ref(false)

onMounted(async () => {
  try {
    const response = await $fetch<{ success: boolean; data: { code: string } }>('/api/game/state', {
      query: { gameId: String(route.params.roomId) }
    })
    navigateTo(`/room/${response.data.code}`, { replace: true })
  } catch {
    failed.value = true
    message.value = 'That game no longer exists.'
  }
})
</script>
