export interface SessionUser {
  userId: string
  name: string
  avatar: string | null
  isAdmin: boolean
  isGuest: boolean
  email?: string
  stats?: { gamesPlayed: number; gamesWon: number; totalScore: number; highestFan: number; winRate: number }
}

/**
 * Server-session backed identity. The httpOnly cookie is the only source of truth; the
 * `auth_token` cookie is just a marker so the route middleware can redirect without a fetch.
 */
export const useSession = () => {
  const user = useState<SessionUser | null>('session-user', () => null)
  const loaded = useState<boolean>('session-loaded', () => false)
  const marker = useCookie<string | null>('auth_token')

  const refresh = async () => {
    try {
      const response = await $fetch<{ success: boolean; data: SessionUser }>('/api/auth/me', { cache: 'no-cache' })
      user.value = response.data
    } catch {
      user.value = null
      marker.value = null
    } finally {
      loaded.value = true
    }
    return user.value
  }

  const ensure = async () => {
    if (!loaded.value) await refresh()
    return user.value
  }

  const loginGuest = async (name: string) => {
    const response = await $fetch<{ success: boolean; user: SessionUser }>('/api/auth/guest', {
      method: 'POST',
      body: { name }
    })
    user.value = response.user
    loaded.value = true
    marker.value = '1'
    return response.user
  }

  const loginDebug = async (userId: string) => {
    const response = await $fetch<{ success: boolean; user: SessionUser }>('/api/auth/debug-login', {
      method: 'POST',
      body: { userId }
    })
    user.value = response.user
    loaded.value = true
    marker.value = '1'
    return response.user
  }

  const logout = async () => {
    try {
      await $fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      user.value = null
      marker.value = null
      loaded.value = true
    }
  }

  const isAdmin = computed(() => !!user.value?.isAdmin)
  const isLoggedIn = computed(() => !!user.value)

  return { user, loaded, isAdmin, isLoggedIn, refresh, ensure, loginGuest, loginDebug, logout }
}
