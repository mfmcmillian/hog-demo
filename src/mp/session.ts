import { engine } from '@dcl/sdk/ecs'
import { setupBossClient, tickBossMirror } from './bossClient'
import { tickDuelMirror } from './duelClient'
import { setupFeedClient, tickFeedMirror } from './feedClient'
import { setupFzClient, tickFzTimers } from './fzClient'
import { setupGiftClient, tickGiftDropReveal, tickGiftTimers } from './giftClient'
import { setupPresence, tickIdentity } from './identity'
import { tickLooks } from './looks'
import { tickOwMirror } from './owClient'
import { BoardsPub, FestPub } from './protocol'
import { tickRiftDropReveal, tickRiftMirror } from './riftClient'
import { setupSaveSync, tickSavePush } from './saveSync'
import { setupTradeClient } from './tradeClient'
import { MpBoardsState, MpFestState, MpLevelsState } from './transport'
import { boardsView, festView, levelsView } from './views'

// Client side of multiplayer. The server owns saves, trade tables, and the
// rift room; this module hydrates the local `game` from the server, pushes
// debounced save updates, and mirrors trade/rift state for the UI.

export { getMyAddress, getMyName, presentPlayers } from './identity'
export { canGiftToday, giftSend } from './giftClient'
export { mySeat, riftLeave, riftReady, riftRequeue, riftSit } from './riftClient'
export {
  duelGhost,
  duelLeave,
  duelReady,
  duelRequeue,
  duelSeatCount,
  duelSit,
  myDuelPickFaces,
  myDuelPickUid,
  myDuelSeat
} from './duelClient'
export { fzDecline, fzInvite, fzInviteLeft } from './fzClient'
export { feedToast, feedView, myFeed } from './feedClient'
export { lookOf, myLook } from './looks'
export { bossAttack, bossFighting, bossSecondsLeft, myBoss } from './bossClient'
export { isHydrated, pushAccountReset } from './saveSync'
export {
  trade,
  tradeAccept,
  tradeCancel,
  tradeDecline,
  tradeInvite,
  tradeLock,
  tradeOffer,
  tradeSides,
  tickTrade
} from './tradeClient'

// riftView / festView / gift live in ./views (leaf) so audio and FX modules
// can read them without importing this module. Re-exported for the UI.
export {
  activeDuel,
  boardsView,
  bossView,
  currentArena,
  duelViews,
  festView,
  fz,
  gift,
  hall,
  levelOf,
  myBoardRank,
  riftView
} from './views'

// --- Wiring ----------------------------------------------------------------------

let started = false

export function initMultiplayerSession(): void {
  if (started) return
  started = true

  setupPresence()
  setupSaveSync()
  setupTradeClient()
  setupGiftClient()
  setupFzClient()
  setupFeedClient()
  setupBossClient()

  engine.addSystem((dt) => {
    if (!tickIdentity()) return
    tickRiftMirror()
    tickDuelMirror()
    tickBossMirror(dt)
    tickFestMirror()
    tickLevelsMirror()
    tickBoardsMirror()
    tickFeedMirror(dt)
    tickLooks(dt)
    tickOwMirror(dt)
    tickGiftTimers(dt)
    tickFzTimers(dt)
    tickGiftDropReveal()
    tickRiftDropReveal()
    tickSavePush(dt)
  })
}

function tickLevelsMirror(): void {
  for (const [, state] of engine.getEntitiesWith(MpLevelsState)) {
    if (state.revision === levelsView.revision) break
    levelsView.revision = state.revision
    try {
      levelsView.levels = JSON.parse(state.json) as Record<string, number>
    } catch {
      // keep the last good roster
    }
    break
  }
}

function tickBoardsMirror(): void {
  for (const [, state] of engine.getEntitiesWith(MpBoardsState)) {
    if (state.revision === boardsView.revision) break
    boardsView.revision = state.revision
    try {
      boardsView.pub = JSON.parse(state.json) as BoardsPub
    } catch {
      // keep the last good wall
    }
    break
  }
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
