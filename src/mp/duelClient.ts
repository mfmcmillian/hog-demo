import { Entity, engine } from '@dcl/sdk/ecs'
import { dailyBump } from '../game/daily'
import { partyUnits } from '../game/party'
import { findOwned, game } from '../game/store'
import { getMyAddress } from './identity'
import { DUEL_MODES, DuelMode, DuelMsg, DuelPub } from './protocol'
import { MpDuelState, room } from './transport'
import { activeDuel, duelViews, fz } from './views'

// Client side of the friendzone duel rings - the rift pattern in miniature:
// send intents, mirror the server's per-mode snapshots, feed the battle FX.

/** Last seen phase per ring, so the tab pull fires only when a duel kicks off. */
const lastDuelPhase: Record<DuelMode, string> = { '1v1': 'lobby', '4v4': 'lobby' }

function sendDuel(msg: DuelMsg): void {
  room.send('duelMsg', { json: JSON.stringify(msg) })
}

/** Lobby picks are sealed in the server broadcast (no scouting the enemy),
 * so each client remembers its own hand to draw on its own seat plate. */
const myPickFaces: Record<DuelMode, string[]> = { '1v1': [], '4v4': [] }
/** The 1v1 champion's uid, so the lobby strip can highlight it for a swap. */
const myPickUid: Record<DuelMode, string> = { '1v1': '', '4v4': '' }

export function myDuelPickFaces(mode: DuelMode): string[] {
  return myPickFaces[mode]
}

export function myDuelPickUid(mode: DuelMode): string {
  return myPickUid[mode]
}

/** 1v1 sits your picked champion; 4v4 sits your current party (no heroUid).
 * Sitting again while seated swaps the pick (server un-readies you). */
export function duelSit(mode: DuelMode, heroUid?: string): void {
  myPickFaces[mode] =
    mode === '1v1' ? [findOwned(heroUid ?? '')?.defId ?? ''] : partyUnits().map((owned) => owned.defId)
  myPickUid[mode] = mode === '1v1' ? (heroUid ?? '') : ''
  sendDuel({ type: 'sit', mode, heroUid })
}

export function duelLeave(mode: DuelMode): void {
  sendDuel({ type: 'leave', mode })
}

export function duelReady(mode: DuelMode, ready: boolean): void {
  sendDuel({ type: 'ready', mode, ready })
}

export function duelInvite(mode: DuelMode, to: string): void {
  sendDuel({ type: 'invite', mode, to })
}

/** FIGHT A GHOST: seated and alone, ask the server to seat an absent rival's picks. */
export function duelGhost(mode: DuelMode): void {
  sendDuel({ type: 'ghost', mode })
}

/** PLAY AGAIN on the verdict screen: sit back down in this ring (same
 * champion in 1v1, current party in 4v4) the moment it reopens. */
export function duelRequeue(mode: DuelMode): void {
  const seat = myDuelSeat(mode)
  if (!seat) return
  fz.requeue = { arena: mode, heroUid: mode === '1v1' ? seat.heroes[0]?.uid : undefined }
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
    const last = lastDuelPhase[pub.mode]
    if (pub.phase === 'battle' && last === 'lobby' && mine) {
      fz.tab = 'duels'
      fz.duelMode = pub.mode
    }
    // Fighting a duel (win or lose) is a daily task.
    if (pub.phase === 'done' && last !== 'done' && mine) dailyBump('duel')
    // The ring reopened after a duel I asked to replay: sit straight back down.
    if (pub.phase === 'lobby' && last !== 'lobby' && fz.requeue?.arena === pub.mode) {
      const uid = fz.requeue.heroUid
      fz.requeue = undefined
      if (game.phase === 'rift' && (pub.mode === '4v4' ? partyUnits().length >= 4 : !!findOwned(uid ?? ''))) {
        duelSit(pub.mode, uid)
      }
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
