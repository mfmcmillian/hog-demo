import { boot } from '../game/boot'
import { applyDebugGrants } from '../game/debug'
import { goHome } from '../game/menu'
import { game } from '../game/store'
import { SeenStoryId, STORY_IDS, TipId } from '../game/types'
import { getMyAddress } from './identity'
import { MP_VERSION, PlayerSave } from './protocol'
import { room } from './transport'

/** True once the server confirmed a storage-backed save round-trip. */
let hydrated = false
let lastPushedJson = ''
let pushWait = 0

export function isHydrated(): boolean {
  return hydrated
}

/**
 * Tell the server to wipe this wallet's stored save (settings > restart).
 * Uses a dedicated message because saveRequest deliberately refuses to
 * replace a real save with an empty one. The local wipe (resetAccount) puts
 * the game back on the start screen; the next debounced push after the new
 * oath stores the fresh account.
 */
export function pushAccountReset(): void {
  lastPushedJson = JSON.stringify(mySave())
  room.send('resetRequest', { confirm: true })
}

function mySave(): PlayerSave {
  return {
    v: MP_VERSION,
    collection: game.collection,
    party: game.party,
    heroUid: game.heroUid,
    coins: game.coins,
    energy: game.energy,
    cleared: game.cleared,
    floorAt: game.floorAt,
    roadStar: game.roadStar,
    soundOn: game.soundOn,
    musicOn: game.musicOn,
    giftDay: game.giftDay,
    tutSeen: game.tutSeen,
    fresh: game.freshUids,
    intro: game.introSeen,
    stories: (Object.keys(game.storySeen) as SeenStoryId[]).filter((id) => game.storySeen[id]),
    finalWon: game.finalWon
  }
}

function applySave(save: PlayerSave): void {
  game.collection = save.collection
  game.party = [save.party[0] ?? '', save.party[1] ?? '', save.party[2] ?? '', save.party[3] ?? '']
  game.heroUid = save.heroUid
  game.coins = save.coins
  game.energy = save.energy
  game.cleared = save.cleared
  game.floorAt = save.floorAt
  // Older saves predate ascension; every road starts back at tier 1.
  game.roadStar = save.roadStar ?? {}
  // Older saves predate the toggles; missing means on.
  game.soundOn = save.soundOn !== false
  game.musicOn = save.musicOn !== false
  game.giftDay = Math.max(0, Math.floor(Number(save.giftDay) || 0))
  // Older saves predate the tutorial; missing means every tip still fires.
  game.tutSeen = save.tutSeen ?? {}
  game.freshUids = Array.isArray(save.fresh) ? save.fresh : []
  // Older saves predate the intro story; anyone with a sworn hero has "seen" it.
  game.introSeen = save.intro === true || !!save.heroUid
  game.storySeen = {}
  for (const id of save.stories ?? []) {
    if ((STORY_IDS as readonly string[]).indexOf(id) >= 0) game.storySeen[id as SeenStoryId] = true
  }
  game.finalWon = save.finalWon === true
  applyDebugGrants()
}

/**
 * A server-side change (trade, rift reward, gift) landed. The server holds
 * the truth for cards and coins, but road progression is client-driven and
 * strictly forward-moving: a push racing a just-won floor must not relock it.
 */
function applyServerUpdate(save: PlayerSave): void {
  const cleared = Math.max(game.cleared, save.cleared)
  const floorAt: Record<string, number> = { ...save.floorAt }
  for (const road of Object.keys(game.floorAt)) {
    floorAt[road] = Math.max(floorAt[road] ?? 1, game.floorAt[road])
  }
  const roadStar: Record<string, number> = { ...(save.roadStar ?? {}) }
  for (const road of Object.keys(game.roadStar)) {
    roadStar[road] = Math.max(roadStar[road] ?? 1, game.roadStar[road])
  }
  // Seen tips and stories are forward-moving like road progress: a push
  // racing a just-dismissed tip must not replay it.
  const seen = { ...game.tutSeen }
  const storySeen = { ...game.storySeen }
  const introSeen = game.introSeen
  const finalWon = game.finalWon
  applySave(save)
  game.cleared = cleared
  game.floorAt = floorAt
  game.roadStar = roadStar
  for (const tip of Object.keys(seen) as TipId[]) {
    if (seen[tip]) game.tutSeen[tip] = true
  }
  for (const id of Object.keys(storySeen) as SeenStoryId[]) {
    if (storySeen[id]) game.storySeen[id] = true
  }
  if (introSeen) game.introSeen = true
  if (finalWon) game.finalWon = true
}

/**
 * The stored save arrived after the player already started playing (raced
 * past the start screen). Never clobber the live session - fold the stored
 * cards and progress in on top of it.
 */
function mergeSave(save: PlayerSave): void {
  const have = new Set(game.collection.map((owned) => owned.uid))
  for (const owned of save.collection) {
    if (!have.has(owned.uid)) game.collection.push(owned)
  }
  game.coins = Math.max(game.coins, save.coins)
  game.energy = Math.max(game.energy, save.energy)
  game.cleared = Math.max(game.cleared, save.cleared)
  for (const road of Object.keys(save.floorAt)) {
    game.floorAt[road] = Math.max(game.floorAt[road] ?? 1, save.floorAt[road])
  }
  for (const road of Object.keys(save.roadStar ?? {})) {
    game.roadStar[road] = Math.max(game.roadStar[road] ?? 1, save.roadStar![road])
  }
  for (const tip of Object.keys(save.tutSeen ?? {}) as TipId[]) {
    if (save.tutSeen![tip]) game.tutSeen[tip] = true
  }
  if (save.intro === true) game.introSeen = true
  for (const id of save.stories ?? []) {
    if ((STORY_IDS as readonly string[]).indexOf(id) >= 0) game.storySeen[id as SeenStoryId] = true
  }
  if (save.finalWon === true) game.finalWon = true
  applyDebugGrants()
}

export function setupSaveSync(): void {
  room.onMessage('saveLoaded', (data) => {
    if (!getMyAddress() || data.address.toLowerCase() !== getMyAddress()) return
    // Any answer (save, empty, or storage-down) releases the boot curtain.
    boot.saveKnown = true
    let parsed: { save?: PlayerSave | null; ready?: boolean; reason?: string }
    try {
      parsed = JSON.parse(data.json) as { save?: PlayerSave | null; ready?: boolean; reason?: string }
    } catch {
      return
    }
    if (parsed.ready === false) return // storage down: play session-only, never push
    const save = parsed.save
    // After a merge the local session may be AHEAD of the server; leaving
    // lastPushedJson stale lets the next debounce tick push the merged state.
    let merged = false
    if (save && save.collection.length > 0) {
      if (hydrated) {
        if (parsed.reason === 'load') {
          // Storage echo (e.g. the presence tracker blinked and re-loaded
          // us): the live session is newer, fold the echo in, never regress.
          mergeSave(save)
          merged = true
        } else {
          // A real server-side change (trade / rift reward / gift): mirror
          // it, but never let it roll road progression backwards.
          applyServerUpdate(save)
        }
      } else if (game.phase === 'start' || game.phase === 'intro') {
        applySave(save)
        // Returning player: skip the story and oath ceremony, straight to the hall.
        if (save.heroUid) goHome()
      } else {
        // Save arrived after the player already started playing; folding it
        // in keeps live cards (like a mid-battle drop) alive.
        mergeSave(save)
        merged = true
      }
    }
    if (!merged) lastPushedJson = JSON.stringify(mySave())
    hydrated = true
  })
}

export function tickSavePush(dt: number): void {
  // Debounced save push, only after a confirmed hydration round-trip.
  if (!hydrated) return
  pushWait -= dt
  if (pushWait > 0) return
  pushWait = 1.5
  if (game.phase === 'start' || game.phase === 'intro') return // nothing worth saving before the oath
  const json = JSON.stringify(mySave())
  if (json === lastPushedJson) return
  lastPushedJson = json
  room.send('saveRequest', { json })
}
