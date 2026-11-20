export default defineNuxtRouteMiddleware((to) => {
  if (to.path === '/login' || to.path === '/how-to-play' || to.path.startsWith('/join/')) return

  // The marker cookie mirrors the httpOnly session cookie; the server still verifies every call.
  const marker = useCookie('auth_token').value
  if (!marker) {
    const next = to.fullPath && to.fullPath !== '/' ? `?next=${encodeURIComponent(to.fullPath)}` : ''
    return navigateTo(`/login${next}`)
  }
})
