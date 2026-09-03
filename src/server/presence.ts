import { AvatarBase, PlayerIdentityData, engine } from '@dcl/sdk/ecs'
import { RiftPub } from '../mp/protocol'
import { ServerCtx } from './ctx'
import { DuelRoom } from './duel'
import { TradeSession } from './trades'

export function setupPresence(
  ctx: ServerCtx,
  hooks: {
    loadOnArrive: (address: string) => void
    sessions: Map<string, TradeSession>
    closeTrade: (session: TradeSession, reason: 'declined' | 'cancelled' | 'left' | 'failed') => void
    invites: Map<string, { from: string; at: number }>
    rift: RiftPub
    publishRift: () => void
    riftReset: () => void
    duelRooms: DuelRoom[]
    dropOwPlayer: (address: string) => void
  }
): void {
  // --- Presence -----------------------------------------------------------------
  engine.addSystem(() => {
    const inScene = new Set<string>()
    for (const [entity, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
      const address = identity.address.toLowerCase()
      inScene.add(address)
      if (AvatarBase.has(entity)) {
        const name = (AvatarBase.get(entity).name ?? '').trim().slice(0, 16)
        if (name && !/^0x[0-9a-f]/i.test(name)) ctx.displayNames.set(address, name)
      }
    }

    for (const address of ctx.present) {
      if (inScene.has(address)) continue
      // Departures: void their trade, free their lobby seat, clear their tile.
      const session = hooks.sessions.get(address)
      if (session) hooks.closeTrade(session, 'left')
      hooks.invites.delete(address)
      hooks.dropOwPlayer(address)
      if (hooks.rift.phase === 'lobby' && hooks.rift.seats.some((seat) => seat.address === address)) {
        hooks.rift.seats = hooks.rift.seats.filter((seat) => seat.address !== address)
        hooks.publishRift()
      }
      for (const ring of hooks.duelRooms) {
        if (ring.duel.phase === 'lobby' && ring.duel.seats.some((seat) => seat.address === address)) {
          ring.duel.seats = ring.duel.seats.filter((seat) => seat.address !== address)
          ring.publishDuel()
        }
      }
    }

    // Mid-run wipeout of humans: nobody left to watch, reopen the room.
    if (hooks.rift.phase !== 'lobby' && hooks.rift.seats.length > 0 && !hooks.rift.seats.some((seat) => inScene.has(seat.address))) {
      console.log('[Server] rift: all participants left; resetting')
      hooks.riftReset()
    }

    // Both duelists gone mid-fight: nothing left to settle, reopen the ring.
    for (const ring of hooks.duelRooms) {
      if (ring.duel.phase !== 'lobby' && ring.duel.seats.length > 0 && !ring.duel.seats.some((seat) => inScene.has(seat.address))) {
        console.log(`[Server] duel ${ring.duel.mode}: all participants left; resetting`)
        ring.duelReset()
      }
    }

    for (const address of inScene) {
      if (!ctx.present.has(address)) hooks.loadOnArrive(address)
    }
    ctx.present.clear()
    for (const address of inScene) ctx.present.add(address)
  })
}
