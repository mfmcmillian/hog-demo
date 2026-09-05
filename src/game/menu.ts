import { seatInParty } from './party'
import { clampCleared } from './progress'
import { findOwned, game } from './store'
import { OwnedFamiliar, Phase } from './types'

export function resetMenu() {
  game.cursor = 0
  game.menuShift = 0
  game.notice = ''
  game.noticeArg = ''
  game.fireTalk = false
  game.onlineOpen = false
  game.nftTalk = ''
  // A tip cleared without being dismissed stays unseen and shows again next
  // visit (open() re-fires it right after this reset).
  game.tutTip = ''
  game.tutPage = 0
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
    game.phase === 'start' ||
    game.phase === 'intro' ||
    game.phase === 'credits'
  )
}

export function openHeroCard(uid: string, back: Phase = 'home') {
  if (!findOwned(uid)) return
  game.inspectUid = uid
  game.heroCardBack = back
  game.phase = 'heroCard'
  resetMenu()
}

/** Everyone you own, party seats first, for flipping through hero cards. */
export function heroCardRoster(): string[] {
  const seated = game.party.filter((uid) => !!findOwned(uid))
  const bench = game.collection.map((owned) => owned.uid).filter((uid) => !seated.includes(uid))
  return [...seated, ...bench]
}

/** Flip to the previous/next owned hero without leaving the card. Wraps. */
export function cycleHeroCard(delta: number) {
  if (game.phase !== 'heroCard' || game.reveal) return
  const roster = heroCardRoster()
  if (roster.length < 2) return
  const at = roster.indexOf(game.inspectUid)
  const next = ((at < 0 ? 0 : at) + delta + roster.length) % roster.length
  game.inspectUid = roster[next]
}

export function revealAcquisition(owned: OwnedFamiliar, back: Phase, opts?: { seat?: boolean; show?: boolean }) {
  if (!findOwned(owned.uid)) game.collection.push(owned)
  if (opts?.seat) seatInParty(owned.uid)
  game.reveal = owned
  game.dropBack = back
  if (opts?.show === false) return
  openHeroCard(owned.uid, back)
}
