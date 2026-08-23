import { MP_VERSION } from '../mp/protocol'
import { ServerCtx, displayNames, nameFor, present } from './ctx'
import { setupFest } from './fest'
import { setupPresence } from './presence'
import { setupRift } from './rift'
import { setupSaves } from './saves'
import { setupTrades } from './trades'

// Heroes of Genesis authoritative server. Owns per-wallet saves (collection,
// party, coins, progress), hero-card trade sessions, and the co-op Rift room.
// Battles in the Rift are simulated HERE and broadcast as snapshots, so no
// client can forge results.

export function startServer(): void {
  console.log('[Server] Heroes of Genesis authoritative server starting')

  const grants = { maybeGrantFest: (_address: string) => {} }
  const savesApi = setupSaves(grants)

  const ctx: ServerCtx = {
    saves: savesApi.saves,
    isSaveReady: savesApi.isSaveReady,
    persistSave: savesApi.persistSave,
    pushSave: savesApi.pushSave,
    present,
    displayNames,
    nameFor
  }

  let riftApi!: ReturnType<typeof setupRift>
  const festApi = setupFest(ctx, { getRiftSeats: () => riftApi.rift.seats })
  grants.maybeGrantFest = festApi.maybeGrantFest

  riftApi = setupRift(ctx, { festBump: festApi.festBump })

  const tradesApi = setupTrades(ctx)

  setupPresence(ctx, {
    loadOnArrive: savesApi.loadOnArrive,
    sessions: tradesApi.sessions,
    closeTrade: tradesApi.closeTrade,
    invites: tradesApi.invites,
    rift: riftApi.rift,
    publishRift: riftApi.publishRift,
    riftReset: riftApi.riftReset
  })

  console.log(`[Server] ready (protocol v${MP_VERSION})`)
}
