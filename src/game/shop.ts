import { makeOwned } from './familiars'
import { revealAcquisition } from './menu'
import { PACKS, PackId, packAt, rollPack } from './packs'
import { game } from './store'

function buyPack(id?: string) {
  const pack = PACKS.find((entry) => entry.id === id) ?? packAt(game.cursor)
  if (game.coins < pack.cost) {
    game.notice = 'no-coin'
    return
  }
  game.coins -= pack.cost
  revealAcquisition(makeOwned(rollPack(pack).id), 'shop')
}

/** Tapping a chest asks first; ACCEPT actually opens it. */
export function requestPack(id: PackId) {
  if (game.coins < PACKS.find((entry) => entry.id === id)!.cost) {
    game.notice = 'no-coin'
    return
  }
  game.pendingPack = id
}

export function confirmPack() {
  const id = game.pendingPack
  game.pendingPack = ''
  game.chestOpening = false
  if (id) buyPack(id)
}

export function cancelPack() {
  game.pendingPack = ''
  game.chestOpening = false
}

/** ACCEPT on the pending chest: flags the ceremony; the FX clock lives in the UI. */
export function openPendingChest() {
  if (!game.pendingPack) return
  game.chestOpening = true
}
