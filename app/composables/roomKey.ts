import type { InjectionKey } from 'vue'
import type { useGameRoom } from './useGameRoom'

export type RoomApi = ReturnType<typeof useGameRoom>
export const ROOM_KEY: InjectionKey<RoomApi> = Symbol('mahjong-room')
