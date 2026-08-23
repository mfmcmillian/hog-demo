import { AvatarBase, PlayerIdentityData, engine } from '@dcl/sdk/ecs'
import { RiftPub } from '../mp/protocol'
import { ServerCtx } from './ctx'
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
      // Departures: void their trade, free their lobby seat.
      const session = hooks.sessions.get(address)
      if (session) hooks.closeTrade(session, 'left')
      hooks.invites.delete(address)
      if (hooks.rift.phase === 'lobby' && hooks.rift.seats.some((seat) => seat.address === address)) {
        hooks.rift.seats = hooks.rift.seats.filter((seat) => seat.address !== address)
        hooks.publishRift()
      }
    }

    // Mid-run wipeout of humans: nobody left to watch, reopen the room.
    if (hooks.rift.phase !== 'lobby' && hooks.rift.seats.length > 0 && !hooks.rift.seats.some((seat) => inScene.has(seat.address))) {
      console.log('[Server] rift: all participants left; resetting')
      hooks.riftReset()
    }

    for (const address of inScene) {
      if (!ctx.present.has(address)) hooks.loadOnArrive(address)
    }
    ctx.present.clear()
    for (const address of inScene) ctx.present.add(address)
  })
}
