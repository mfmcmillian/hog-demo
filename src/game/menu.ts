import { seatInParty } from './party'
import { clampCleared } from './progress'
import { findOwned, game } from './store'
import { OwnedFamiliar, Phase } from './types'

export function resetMenu() {
  game.cursor = 0
  game.menuShift = 0
  game.notice = ''
  game.noticeArg = ''
  game.fuseHelp = false
  game.fireTalk = false
  game.onlineOpen = false
  game.nftTalk = ''
}

export function goHome() {
  clampCleared()
  game.phase = 'home'
  game.selectedSlot = -1
  resetMenu()
}

export function isCeremonyBusy() {
  return (
    game.phase === 'battle' ||
    game.phase === 'banner' ||
    game.phase === 'report' ||
    game.phase === 'heroCard' ||
    game.phase === 'start'
  )
}

export function openHeroCard(uid: string, back: Phase = 'home') {
  if (!findOwned(uid)) return
  game.inspectUid = uid
  game.heroCardBack = back
  game.phase = 'heroCard'
  resetMenu()
}

export function revealAcquisition(owned: OwnedFamiliar, back: Phase, opts?: { seat?: boolean; show?: boolean }) {
  if (!findOwned(owned.uid)) game.collection.push(owned)
  if (opts?.seat) seatInParty(owned.uid)
  game.reveal = owned
  game.dropBack = back
  if (opts?.show === false) return
  openHeroCard(owned.uid, back)
}
