import { MP_VERSION } from '../mp/protocol'
import { setupBoards } from './boards'
import { setupBoss } from './boss'
import { ServerCtx, displayNames, nameFor, present } from './ctx'
import { setupDuels } from './duel'
import { setupFeed } from './feed'
import { setupFest } from './fest'
import { setupGhosts } from './ghosts'
import { setupLevels } from './levels'
import { setupLooks } from './looks'
import { setupOverworld } from './overworld'
import { setupPresence } from './presence'
import { setupRift } from './rift'
import { setupSaves } from './saves'
import { setupTrades } from './trades'

// Heroes of Genesis authoritative server. Owns per-wallet saves (collection,
// party, coins, progress), hero-card trade sessions, the co-op Rift room, the
// duel rings, the realm feed and the ghost roster. Battles in the Rift and
// the rings are simulated HERE and broadcast as snapshots, so no client can
// forge results.

export function startServer(): void {
  console.log('[Server] Heroes of Genesis authoritative server starting')

  const grants = {
    maybeGrantFest: (_address: string) => {},
    maybeGrantGhost: (_address: string) => {},
    maybeGrantBoss: (_address: string) => {}
  }
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

  // The feed needs nothing; everything that has news feeds it.
  const feedApi = setupFeed(ctx)
  const ghostsApi = setupGhosts(ctx, feedApi)
  grants.maybeGrantGhost = ghostsApi.payOwed

  let riftApi!: ReturnType<typeof setupRift>
  // Ghost allies clear floors too, but only humans are festival contributors.
  const festApi = setupFest(ctx, { getRiftSeats: () => riftApi.rift.seats.filter((seat) => !seat.ghost) })
  grants.maybeGrantFest = festApi.maybeGrantFest

  // The Hall of Heroes boards are wired after the rooms that feed them; the
  // closures resolve lazily, and no raid or duel can finish before setup ends.
  let boardsApi!: ReturnType<typeof setupBoards>
  riftApi = setupRift(ctx, {
    festBump: festApi.festBump,
    raidWon: (address) => boardsApi.bumpRaid(address),
    feed: feedApi,
    ghosts: ghostsApi
  })

  const duelApi = setupDuels(ctx, { onWin: (address) => boardsApi.bumpWin(address), feed: feedApi, ghosts: ghostsApi })
  boardsApi = setupBoards(ctx, { duelWins: duelApi.allWins, feed: feedApi })

  // The world boss: everyone's fight, simulated here; payouts owed to absent
  // players are paid when their save loads.
  grants.maybeGrantBoss = setupBoss(ctx, { feed: feedApi }).maybeGrantBoss

  const tradesApi = setupTrades(ctx)

  const overworldApi = setupOverworld(ctx, { feed: feedApi })

  setupLevels(ctx)

  setupPresence(ctx, {
    loadOnArrive: savesApi.loadOnArrive,
    sessions: tradesApi.sessions,
    closeTrade: tradesApi.closeTrade,
    dropInvites: tradesApi.dropInvites,
    invites: tradesApi.invites,
    rift: riftApi.rift,
    publishRift: riftApi.publishRift,
    riftReset: riftApi.riftReset,
    duelRooms: duelApi.rooms,
    dropOwPlayer: overworldApi.dropOwPlayer,
    looks: setupLooks(ctx)
  })

  console.log(`[Server] ready (protocol v${MP_VERSION})`)
}
