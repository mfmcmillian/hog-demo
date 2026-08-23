import { Storage } from '@dcl/sdk/server'
import { getDef } from '../game/familiars'
import { ROADS } from '../game/quests'
import { MAX_LEVEL, MAX_STARS, OwnedFamiliar, PARTY_SIZE } from '../game/types'
import { ENERGY_MAX, PlayerSave, emptySave } from '../mp/protocol'
import { room } from '../mp/transport'

const SAVE_KEY = 'hog-save-v1'

// --- Save sanitizing -------------------------------------------------------------

function knownDef(defId: unknown): boolean {
  if (typeof defId !== 'string' || !defId) return false
  try {
    getDef(defId)
    return true
  } catch {
    return false
  }
}

function sanitizeOwned(raw: unknown): OwnedFamiliar | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const row = raw as Partial<OwnedFamiliar>
  if (!knownDef(row.defId) || typeof row.uid !== 'string' || !row.uid) return undefined
  return {
    uid: row.uid.slice(0, 40),
    defId: row.defId as string,
    stars: Math.max(1, Math.min(MAX_STARS, Math.floor(Number(row.stars) || 1))),
    level: Math.max(1, Math.min(MAX_LEVEL, Math.floor(Number(row.level) || 1))),
    xp: Math.max(0, Math.min(999999, Math.floor(Number(row.xp) || 0))),
    ...(row.isHero === true ? { isHero: true } : {})
  }
}

function sanitizeSave(raw: unknown): PlayerSave {
  const save = emptySave()
  if (!raw || typeof raw !== 'object') return save
  const row = raw as Partial<PlayerSave>
  const seen = new Set<string>()
  for (const item of Array.isArray(row.collection) ? row.collection.slice(0, 300) : []) {
    const owned = sanitizeOwned(item)
    if (!owned || seen.has(owned.uid)) continue
    seen.add(owned.uid)
    save.collection.push(owned)
  }
  const uids = new Set(save.collection.map((owned) => owned.uid))
  save.heroUid = typeof row.heroUid === 'string' && uids.has(row.heroUid) ? row.heroUid : ''
  for (let i = 0; i < PARTY_SIZE; i++) {
    const uid = Array.isArray(row.party) ? row.party[i] : ''
    save.party[i] = typeof uid === 'string' && uids.has(uid) && save.party.indexOf(uid) < 0 ? uid : ''
  }
  save.coins = Math.max(0, Math.min(9999999, Math.floor(Number(row.coins) || 0)))
  save.energy = Math.max(0, Math.min(ENERGY_MAX, Math.floor(Number(row.energy) || 0)))
  save.cleared = Math.max(0, Math.min(ROADS.length, Math.floor(Number(row.cleared) || 0)))
  if (row.floorAt && typeof row.floorAt === 'object') {
    for (const road of ROADS) {
      const floor = (row.floorAt as Record<string, unknown>)[road.id]
      if (typeof floor === 'number' && floor > 1) save.floorAt[road.id] = Math.min(10, Math.floor(floor))
    }
  }
  if (row.roadStar && typeof row.roadStar === 'object') {
    for (const road of ROADS) {
      const star = (row.roadStar as Record<string, unknown>)[road.id]
      if (typeof star === 'number' && star > 1) save.roadStar![road.id] = Math.min(MAX_STARS, Math.floor(star))
    }
  }
  save.soundOn = row.soundOn !== false
  save.musicOn = row.musicOn !== false
  save.giftDay = Math.max(0, Math.floor(Number(row.giftDay) || 0))
  return save
}

export type SaveGrants = { maybeGrantFest: (address: string) => void }

export function setupSaves(grants: SaveGrants): {
  saves: Map<string, PlayerSave>
  isSaveReady: (address: string) => boolean
  persistSave: (address: string) => void
  pushSave: (address: string, reason?: 'load' | 'update') => void
  loadOnArrive: (address: string) => void
} {
  // --- Saves -----------------------------------------------------------------
  const saves = new Map<string, PlayerSave>()
  /** Addresses whose storage load succeeded; only those may persist. */
  const saveReady = new Set<string>()
  const saveChain = new Map<string, Promise<void>>()

  function enqueue(address: string, work: () => Promise<void>): void {
    const previous = saveChain.get(address) ?? Promise.resolve()
    const next = previous.then(work, work)
    saveChain.set(
      address,
      next.catch((error: unknown) => console.log(`[Server] save task failed for ${address}: ${error}`))
    )
  }

  /**
   * 'load' = echoing held/stored state (arrivals, hello requests) - the client
   * may be ahead of it and should merge. 'update' = the server itself changed
   * the save (trade, rift, gift) - the client should mirror it.
   */
  function pushSave(address: string, reason: 'load' | 'update' = 'update'): void {
    const save = saves.get(address)
    room.send('saveLoaded', {
      address,
      json: JSON.stringify({ save: save ?? null, ready: saveReady.has(address), reason })
    })
  }

  function persistSave(address: string): void {
    if (!saveReady.has(address)) return
    const save = saves.get(address)
    if (!save) return
    try {
      Storage.player.set(address, SAVE_KEY, save).catch((error: unknown) => {
        console.log(`[Server] save persist failed for ${address}: ${error}`)
      })
    } catch (error) {
      console.log(`[Server] save persist failed for ${address}: ${error}`)
    }
  }

  function loadOnArrive(address: string): void {
    enqueue(address, async () => {
      try {
        const stored = await Storage.player.get<PlayerSave>(address, SAVE_KEY)
        if (!saves.has(address) || (stored && stored.collection?.length)) {
          saves.set(address, sanitizeSave(stored ?? undefined))
        }
        saveReady.add(address)
        grants.maybeGrantFest(address) // contributor arriving after the goal completed
      } catch (error) {
        console.log(`[Server] save load failed for ${address}: ${error}`)
        saveReady.delete(address)
      }
      pushSave(address, 'load')
    })
  }

  room.onMessage('saveRequest', (data, context) => {
    if (!context) return
    const sender = context.from.toLowerCase()
    if (!sender) return
    if (!data.json) {
      pushSave(sender, 'load')
      return
    }
    let incoming: PlayerSave
    try {
      incoming = sanitizeSave(JSON.parse(data.json))
    } catch {
      return
    }
    const stored = saves.get(sender)
    // Never let an unhydrated client wipe a real save with an empty one.
    // Deliberate wipes go through resetRequest instead.
    if (stored && stored.collection.length > 0 && incoming.collection.length === 0) return
    saves.set(sender, incoming)
    persistSave(sender)
  })

  room.onMessage('resetRequest', (data, context) => {
    if (!context || !data.confirm) return
    const sender = context.from.toLowerCase()
    if (!sender) return
    saves.set(sender, emptySave())
    persistSave(sender)
  })

  return {
    saves,
    isSaveReady: (address: string) => saveReady.has(address),
    persistSave,
    pushSave,
    loadOnArrive
  }
}
