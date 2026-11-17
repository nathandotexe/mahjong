<template>
  <div class="mj-page" style="align-items: center">
    <div class="mj-card" style="text-align: center">
      <h1 class="mj-title">Joining table {{ code }}</h1>
      <p class="mj-subtitle">{{ message }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const code = computed(() => String(route.params.code || '').toUpperCase())
const message = ref('One moment…')
const session = useSession()

onMounted(async () => {
  const user = await session.ensure()
  if (!user) {
    message.value = 'Pick a nickname first…'
    navigateTo(`/login?next=${encodeURIComponent(`/room/${code.value}`)}`)
    return
  }
  navigateTo(`/room/${code.value}`, { replace: true })
})
</script>
