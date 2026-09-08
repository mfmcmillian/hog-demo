import { engine } from '@dcl/sdk/ecs'
import { dailyBump } from '../game/daily'
import { openHeroCard } from '../game/menu'
import { findOwned, game } from '../game/store'
import { getMyAddress } from './identity'
import { RiftMsg, RiftPub } from './protocol'
import { MpRiftState, room } from './transport'
import { fz, riftView } from './views'

/** My rift drop, waiting for its hero-card reveal after the spoils screen. */
let riftDropUid = ''

/** Last seen room phase, so the tab pull fires only when the raid kicks off. */
let lastRiftPhase = 'lobby'

function sendRift(msg: RiftMsg): void {
  room.send('riftMsg', { json: JSON.stringify(msg) })
}

export function riftSit(heroUid: string): void {
  sendRift({ type: 'sit', heroUid })
}

export function riftLeave(): void {
  sendRift({ type: 'leave' })
}

export function riftReady(ready: boolean): void {
  sendRift({ type: 'ready', ready })
}

export function riftInvite(to: string): void {
  sendRift({ type: 'invite', to })
}

/** PLAY AGAIN on the spoils screen: hold my hero and sit back down the moment
 * the room reopens (the server clears every seat when it resets). */
export function riftRequeue(): void {
  const seat = mySeat()
  if (!seat) return
  fz.requeue = { arena: 'raid', heroUid: seat.uid }
}

export function mySeat() {
  return riftView.pub.seats.find((seat) => seat.address === getMyAddress())
}

export function tickRiftMirror(): void {
  // Mirror the synced rift room.
  for (const [, state] of engine.getEntitiesWith(MpRiftState)) {
    if (state.revision === riftView.revision) break
    riftView.revision = state.revision
    try {
      riftView.pub = JSON.parse(state.json) as RiftPub
    } catch {
      break
    }
    const phase = riftView.pub.phase
    // My raid just kicked off while I was looking at the duel ring: pull me
    // back. Edge-triggered so parallel raid+duel fights don't wrestle the tab.
    if (phase === 'battle' && lastRiftPhase === 'lobby' && mySeat()) fz.tab = 'raids'
    if (phase === 'won' && lastRiftPhase !== 'won') {
      const mine = riftView.pub.rewards?.find((reward) => reward.address === getMyAddress())
      if (mine?.dropUid) riftDropUid = mine.dropUid
      if (mySeat()) dailyBump('raid')
    }
    // The room reopened after a run I asked to replay: sit straight back down.
    if (phase === 'lobby' && lastRiftPhase !== 'lobby' && fz.requeue?.arena === 'raid') {
      const uid = fz.requeue.heroUid
      fz.requeue = undefined
      if (uid && findOwned(uid) && game.phase === 'rift') riftSit(uid)
    }
    lastRiftPhase = phase
    break
  }
  // Spectate: the server-simulated battle feeds the regular battle UI/FX.
  if (game.phase === 'rift' && fz.tab === 'raids' && riftView.pub.battle) game.battle = riftView.pub.battle
}

export function tickRiftDropReveal(): void {
  // Rift drop ceremony: once the spoils screen ends (room reset) or the
  // player walks off, open the hero card - same reveal as pack drops.
  if (riftDropUid && game.phase !== 'battle' && game.phase !== 'heroCard') {
    const doneWatching = riftView.pub.phase === 'lobby' || game.phase !== 'rift'
    const owned = findOwned(riftDropUid) // waits for the updated save to land
    if (doneWatching && owned) {
      riftDropUid = ''
      game.reveal = owned
      openHeroCard(owned.uid, game.phase === 'rift' ? 'rift' : 'home')
    }
  }
}
