import { makeOwned, nextUid } from './familiars'
import { revealAcquisition } from './menu'
import { bestPerFace, seatInParty } from './party'
import { findOwned, game } from './store'
import { MAX_STARS, OwnedFamiliar, PARTY_SIZE } from './types'

function fuseUnits(): OwnedFamiliar[] {
  const out = game.collection.filter((owned) => !owned.isHero)
  out.sort((a, b) => {
    if (a.defId !== b.defId) return a.defId < b.defId ? -1 : 1
    if (a.stars !== b.stars) return a.stars - b.stars
    return b.level - a.level
  })
  return out
}

/** The bench on the fuse screen: only faces that can fuse right now (two
 * copies at some rank below max). Nothing eligible = an empty list, and the
 * screen says so instead of showing cards that can't be used. */
export function fuseFaces(): OwnedFamiliar[] {
  return bestPerFace(fuseUnits()).filter((owned) => fusableRank(owned.defId) !== undefined)
}

function fuseAtRank(defId: string, stars: number): OwnedFamiliar[] {
  if (!defId) return []
  return fuseUnits().filter((owned) => owned.defId === defId && owned.stars === stars)
}

export function fuseCount(defId: string, stars: number): number {
  return fuseAtRank(defId, stars).length
}

/** Lowest rank of this face holding a fusable pair, if any. */
function fusableRank(defId: string): number | undefined {
  for (let stars = 1; stars < MAX_STARS; stars++) {
    if (fuseCount(defId, stars) >= 2) return stars
  }
  return undefined
}

function nextFuseRank(defId: string): number {
  return fusableRank(defId) ?? 1
}

function autoFillFuse() {
  const pool = fuseAtRank(game.fuseId, game.fuseRank)
  game.fuseA = pool[0]?.uid ?? ''
  game.fuseB = pool[1]?.uid ?? ''
}

export function prepareFuse() {
  const faces = fuseFaces()
  if (!game.fuseId || !faces.some((owned) => owned.defId === game.fuseId)) {
    game.fuseId = faces[0]?.defId ?? ''
  }
  game.fuseRank = nextFuseRank(game.fuseId)
  autoFillFuse()
}

export function pickFuseHero(defId: string) {
  if (!defId) return
  game.fuseId = defId
  game.fuseA = ''
  game.fuseB = ''
  game.fuseRank = nextFuseRank(defId)
  autoFillFuse()
}

export function pickFuseRank(stars: number) {
  if (stars < 1 || stars >= MAX_STARS) return
  game.fuseRank = stars
  game.fuseA = ''
  game.fuseB = ''
  autoFillFuse()
}

export function canFuse(a?: OwnedFamiliar, b?: OwnedFamiliar) {
  if (!a || !b || a.uid === b.uid) return false
  if (a.isHero || b.isHero) return false
  return a.defId === b.defId && a.stars === b.stars && a.stars < MAX_STARS
}

export function fuse() {
  const a = findOwned(game.fuseA)
  const b = findOwned(game.fuseB)
  if (!canFuse(a, b) || !a || !b) {
    game.notice = 'fuse-rule'
    return
  }
  const keep = a.level > b.level ? a : b.level > a.level ? b : a.xp >= b.xp ? a : b
  const fromStars = a.stars
  const child = makeOwned(a.defId, a.stars + 1, keep.level)
  child.uid = nextUid()
  child.xp = keep.xp
  game.collection = game.collection.filter((owned) => owned.uid !== a.uid && owned.uid !== b.uid)
  game.collection.push(child)
  for (let i = 0; i < PARTY_SIZE; i++) {
    if (game.party[i] === a.uid || game.party[i] === b.uid) game.party[i] = ''
  }
  seatInParty(child.uid)
  game.fuseA = ''
  game.fuseB = ''
  game.notice = 'fused'
  game.noticeArg = child.defId
  game.starBurstFrom = fromStars
  game.starBurstTo = child.stars
  revealAcquisition(child, 'fuse')
}

export function pickFuse(uid: string) {
  if (game.fuseA === uid) {
    game.fuseA = ''
    return
  }
  if (game.fuseB === uid) {
    game.fuseB = ''
    return
  }
  const owned = findOwned(uid)
  if (!owned || owned.isHero || owned.stars >= MAX_STARS) {
    game.notice = 'fuse-rule'
    return
  }
  if (game.fuseA) {
    const a = findOwned(game.fuseA)
    if (a && (a.defId !== owned.defId || a.stars !== owned.stars)) {
      game.notice = 'fuse-rule'
      return
    }
    game.fuseB = uid
    return
  }
  game.fuseA = uid
}
