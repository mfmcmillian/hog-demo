import { findOwned, game } from './store'
import { OwnedFamiliar, PARTY_SIZE } from './types'

function partyIndexOf(uid: string) {
  return game.party.indexOf(uid)
}

function firstEmptyPartySlot() {
  return game.party.indexOf('')
}

export function partyUnits(): OwnedFamiliar[] {
  const units: OwnedFamiliar[] = []
  for (const uid of game.party) {
    const owned = findOwned(uid)
    if (owned) units.push(owned)
  }
  return units
}

function seatedDefIds(): Set<string> {
  const ids = new Set<string>()
  for (const uid of game.party) {
    const owned = findOwned(uid)
    if (owned) ids.add(owned.defId)
  }
  return ids
}

/** Best copy per face: higher stars, then higher level. First-seen order. */
export function bestPerFace(list: OwnedFamiliar[]): OwnedFamiliar[] {
  const best = new Map<string, OwnedFamiliar>()
  for (const owned of list) {
    const kept = best.get(owned.defId)
    if (!kept || owned.stars > kept.stars || (owned.stars === kept.stars && owned.level > kept.level)) {
      best.set(owned.defId, owned)
    }
  }
  return [...best.values()]
}

export function benchUnits(): OwnedFamiliar[] {
  const taken = seatedDefIds()
  // Best copy per face (stars, then level), matching the rift picker, so
  // the bench never offers a spare 1★ while a fused copy sits unseated.
  const list: OwnedFamiliar[] = []
  for (const owned of game.collection) {
    if (partyIndexOf(owned.uid) >= 0) continue
    if (taken.has(owned.defId)) continue
    list.push(owned)
  }
  return bestPerFace(list)
}

export function seatInParty(uid: string) {
  if (!uid || partyIndexOf(uid) >= 0) return
  const owned = findOwned(uid)
  if (!owned || seatedDefIds().has(owned.defId)) return
  const hole = firstEmptyPartySlot()
  if (hole < 0) return
  game.party[hole] = uid
}

export function tapPartySlot(slot: number) {
  if (slot < 0 || slot >= PARTY_SIZE) return
  if (game.selectedSlot === slot) {
    if (game.party[slot] && game.party[slot] !== game.heroUid) game.party[slot] = ''
    game.selectedSlot = -1
    return
  }
  if (game.selectedSlot >= 0) {
    const a = game.selectedSlot
    const hold = game.party[a]
    game.party[a] = game.party[slot]
    game.party[slot] = hold
    game.selectedSlot = -1
    return
  }
  game.selectedSlot = slot
}

export function tapBenchHero(uid: string) {
  if (!uid) return
  const owned = findOwned(uid)
  if (!owned || seatedDefIds().has(owned.defId)) return
  if (game.selectedSlot < 0) {
    seatInParty(uid)
    return
  }
  const slot = game.selectedSlot
  if (game.party[slot] === game.heroUid) {
    game.selectedSlot = -1
    return
  }
  if (partyIndexOf(uid) >= 0) return
  game.party[slot] = uid
  game.selectedSlot = -1
}
