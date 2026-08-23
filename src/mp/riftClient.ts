import { engine } from '@dcl/sdk/ecs'
import { goHome, openHeroCard } from '../game/menu'
import { findOwned, game } from '../game/store'
import { getMyAddress } from './identity'
import { RiftMsg, RiftPub } from './protocol'
import { MpRiftState, room } from './transport'
import { riftView } from './views'

/** Watchers leave the end plaque on their own clock, not the room's 12s hold. */
const SPECTATOR_HOME_SECS = 2.8
let spectatorHomeIn = SPECTATOR_HOME_SECS

/** My rift drop, waiting for its hero-card reveal after the spoils screen. */
let riftDropUid = ''

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
    // Spectate: the server-simulated battle feeds the regular battle UI/FX.
    if (game.phase === 'rift' && riftView.pub.battle) game.battle = riftView.pub.battle
    if (riftView.pub.phase === 'won') {
      const mine = riftView.pub.rewards?.find((reward) => reward.address === getMyAddress())
      if (mine?.dropUid) riftDropUid = mine.dropUid
    }
    break
  }
}

export function tickSpectatorHome(dt: number): void {
  // Watchers are not on the spoils clock. A short recap, then home —
  // they should not sit on YOU WIN until the raiders tap through.
  if (game.phase === 'rift' && !mySeat() && (riftView.pub.phase === 'won' || riftView.pub.phase === 'lost')) {
    spectatorHomeIn -= dt
    if (spectatorHomeIn <= 0) {
      spectatorHomeIn = SPECTATOR_HOME_SECS
      goHome()
    }
  } else {
    spectatorHomeIn = SPECTATOR_HOME_SECS
  }
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
