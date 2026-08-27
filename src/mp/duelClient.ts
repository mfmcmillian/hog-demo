import { Entity, engine } from '@dcl/sdk/ecs'
import { goHome } from '../game/menu'
import { partyUnits } from '../game/party'
import { findOwned, game } from '../game/store'
import { getMyAddress } from './identity'
import { DUEL_MODES, DuelMode, DuelMsg, DuelPub } from './protocol'
import { MpDuelState, room } from './transport'
import { activeDuel, duelViews, fz } from './views'

// Client side of the friendzone duel rings - the rift pattern in miniature:
// send intents, mirror the server's per-mode snapshots, feed the battle FX.

/** Watchers leave the verdict on their own clock, not the ring's 10s hold. */
const SPECTATOR_HOME_SECS = 2.8
let spectatorHomeIn = SPECTATOR_HOME_SECS

/** Last seen phase per ring, so the tab pull fires only when a duel kicks off. */
const lastDuelPhase: Record<DuelMode, string> = { '1v1': 'lobby', '4v4': 'lobby' }

function sendDuel(msg: DuelMsg): void {
  room.send('duelMsg', { json: JSON.stringify(msg) })
}

/** Lobby picks are sealed in the server broadcast (no scouting the enemy),
 * so each client remembers its own hand to draw on its own seat plate. */
const myPickFaces: Record<DuelMode, string[]> = { '1v1': [], '4v4': [] }

export function myDuelPickFaces(mode: DuelMode): string[] {
  return myPickFaces[mode]
}

/** 1v1 sits your picked champion; 4v4 sits your current party (no heroUid). */
export function duelSit(mode: DuelMode, heroUid?: string): void {
  myPickFaces[mode] =
    mode === '1v1' ? [findOwned(heroUid ?? '')?.defId ?? ''] : partyUnits().map((owned) => owned.defId)
  sendDuel({ type: 'sit', mode, heroUid })
}

export function duelLeave(mode: DuelMode): void {
  sendDuel({ type: 'leave', mode })
}

export function duelReady(mode: DuelMode, ready: boolean): void {
  sendDuel({ type: 'ready', mode, ready })
}

export function myDuelSeat(mode?: DuelMode) {
  const pub = mode ? duelViews[mode].pub : activeDuel()
  return pub.seats.find((seat) => seat.address === getMyAddress())
}

/** Which ring each synced entity carries, learned from its first parse. */
const ringOf = new Map<Entity, DuelMode>()

export function tickDuelMirror(): void {
  // Mirror both synced rings; the mode inside the JSON says which is which.
  for (const [entity, state] of engine.getEntitiesWith(MpDuelState)) {
    const known = ringOf.get(entity)
    if (known && state.revision === duelViews[known].revision) continue
    let pub: DuelPub
    try {
      pub = JSON.parse(state.json) as DuelPub
    } catch {
      continue
    }
    const view = duelViews[pub.mode]
    if (!view || state.revision === view.revision) continue
    ringOf.set(entity, pub.mode)
    view.revision = state.revision
    view.pub = pub
    // My duel just kicked off while I was looking elsewhere: pull me to the
    // ring. Edge-triggered so parallel fights don't wrestle the tab.
    const mine = pub.seats.some((seat) => seat.address === getMyAddress())
    if (pub.phase === 'battle' && lastDuelPhase[pub.mode] === 'lobby' && mine) {
      fz.tab = 'duels'
      fz.duelMode = pub.mode
    }
    lastDuelPhase[pub.mode] = pub.phase
  }
  // The server-simulated fight feeds the regular battle FX while watched.
  const pub = activeDuel()
  if (game.phase === 'rift' && fz.tab === 'duels' && pub.battle) game.battle = pub.battle
}

/** Total sitters across both rings (the home POI badge). */
export function duelSeatCount(): number {
  return DUEL_MODES.reduce((sum, mode) => sum + duelViews[mode].pub.seats.length, 0)
}

export function tickDuelSpectatorHome(dt: number): void {
  // Watchers get a short look at the verdict, then head home - the ring's
  // 10s hold belongs to the duelists.
  if (game.phase === 'rift' && fz.tab === 'duels' && !myDuelSeat() && activeDuel().phase === 'done') {
    spectatorHomeIn -= dt
    if (spectatorHomeIn <= 0) {
      spectatorHomeIn = SPECTATOR_HOME_SECS
      goHome()
    }
  } else {
    spectatorHomeIn = SPECTATOR_HOME_SECS
  }
}
