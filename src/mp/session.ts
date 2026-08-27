import { engine } from '@dcl/sdk/ecs'
import { tickDuelMirror, tickDuelSpectatorHome } from './duelClient'
import { setupGiftClient, tickGiftDropReveal, tickGiftTimers } from './giftClient'
import { setupPresence, tickIdentity } from './identity'
import { FestPub } from './protocol'
import { tickRiftDropReveal, tickRiftMirror, tickSpectatorHome } from './riftClient'
import { setupSaveSync, tickSavePush } from './saveSync'
import { setupTradeClient } from './tradeClient'
import { MpFestState } from './transport'
import { festView } from './views'

// Client side of multiplayer. The server owns saves, trade tables, and the
// rift room; this module hydrates the local `game` from the server, pushes
// debounced save updates, and mirrors trade/rift state for the UI.

export { getMyAddress, getMyName, presentPlayers } from './identity'
export { canGiftToday, giftSend } from './giftClient'
export { mySeat, riftLeave, riftReady, riftSit } from './riftClient'
export { duelLeave, duelReady, duelSeatCount, duelSit, myDuelPickFaces, myDuelSeat } from './duelClient'
export { isHydrated, pushAccountReset } from './saveSync'
export {
  trade,
  tradeAccept,
  tradeCancel,
  tradeDecline,
  tradeInvite,
  tradeLock,
  tradeOffer,
  tradeSides
} from './tradeClient'

// riftView / festView / gift live in ./views (leaf) so audio and FX modules
// can read them without importing this module. Re-exported for the UI.
export { activeDuel, duelViews, festView, fz, gift, riftView } from './views'

// --- Wiring ----------------------------------------------------------------------

let started = false

export function initMultiplayerSession(): void {
  if (started) return
  started = true

  setupPresence()
  setupSaveSync()
  setupTradeClient()
  setupGiftClient()

  engine.addSystem((dt) => {
    if (!tickIdentity()) return
    tickRiftMirror()
    tickDuelMirror()
    tickSpectatorHome(dt)
    tickDuelSpectatorHome(dt)
    tickFestMirror()
    tickGiftTimers(dt)
    tickGiftDropReveal()
    tickRiftDropReveal()
    tickSavePush(dt)
  })
}

function tickFestMirror(): void {
  // Mirror the synced festival state (realm goal + window clock).
  for (const [, state] of engine.getEntitiesWith(MpFestState)) {
    if (state.revision === festView.revision) break
    festView.revision = state.revision
    try {
      festView.pub = JSON.parse(state.json) as FestPub
    } catch {
      // keep the last good snapshot
    }
    break
  }
}
