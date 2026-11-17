import { MatchHistoryService } from '../../services/matchHistoryService'
import { optionalUserFromEvent } from '../../utils/session'

/** Recent hands. Query: mine=1 (session user only), limit */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const limitParam = typeof query.limit === 'string' ? parseInt(query.limit, 10) : undefined
  const limit = Number.isFinite(limitParam) && limitParam! > 0 ? Math.min(limitParam!, 100) : 20

  let userId: string | undefined
  if (query.mine === '1' || query.mine === 'true') {
    const user = await optionalUserFromEvent(event)
    userId = user?.userId
    if (!userId) return { success: true, data: [] }
  }

  const histories = await MatchHistoryService.listMatches({ userId, limit })
  return { success: true, data: histories }
})
