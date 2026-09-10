import { Storage } from '@dcl/sdk/server'
import { getDef } from '../game/familiars'
import { ROADS } from '../game/quests'
import { MAX_LEVEL, MAX_STARS, OwnedFamiliar, PARTY_SIZE, STORY_IDS, TIP_IDS } from '../game/types'
import { energyCapFor, levelForXp, retroXp, XP_HARD_CAP } from '../game/level'
import { PlayerSave, cleanArmory, emptySave, sanitizeDaily, sanitizeLook } from '../mp/protocol'
import { room } from '../mp/transport'

const SAVE_KEY = 'hog-save-v1'
/** Milestone copy of the save; only ever rewritten with equal-or-more progress. */
const BACKUP_KEY = 'hog-save-backup-v1'

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
  // Account XP; a save from before levels (no field) is back-filled from
  // roads and cards, the same formula the client uses.
  save.axp =
    typeof row.axp === 'number'
      ? Math.max(0, Math.min(XP_HARD_CAP, Math.floor(row.axp)))
      : Math.min(
          XP_HARD_CAP,
          retroXp({ collection: save.collection, cleared: save.cleared, finalWon: row.finalWon === true })
        )
  save.energy = Math.max(0, Math.min(energyCapFor(levelForXp(save.axp)), Math.floor(Number(row.energy) || 0)))
  // The regen anchor can't sit in the future (that would stall the refill).
  save.energyAt = Math.max(0, Math.min(Date.now(), Math.floor(Number(row.energyAt) || 0)))
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
  if (row.tutSeen && typeof row.tutSeen === 'object') {
    for (const tip of TIP_IDS) {
      if ((row.tutSeen as Record<string, unknown>)[tip] === true) save.tutSeen![tip] = true
    }
  }
  if (Array.isArray(row.fresh)) {
    save.fresh = row.fresh.filter((uid): uid is string => typeof uid === 'string' && uids.has(uid)).slice(0, 20)
  }
  save.intro = row.intro === true
  if (Array.isArray(row.stories)) {
    save.stories = STORY_IDS.filter((id) => (row.stories as unknown[]).indexOf(id) >= 0)
  }
  save.finalWon = row.finalWon === true
  save.owFlags = cleanOwList(row.owFlags)
  save.owItems = cleanOwList(row.owItems)
  save.daily = sanitizeDaily(row.daily)
  save.armory = cleanArmory(row.armory)
  const look = sanitizeLook(row.look)
  // Armor is worn only if it was bought.
  if (look?.armor !== undefined && save.armory.indexOf(look.armor) < 0) delete look.armor
  if (look) save.look = look
  return save
}

function cleanOwList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== 'string' || !/^[a-z0-9-]{1,40}$/.test(item) || seen.has(item)) continue
    seen.add(item)
    out.push(item)
    if (out.length >= 64) break
  }
  return out
}

// --- Regression guard ------------------------------------------------------------
//
// The one way a player used to lose everything: the server restarts (every
// deploy), the storage read for their wallet comes back empty (a blip, not an
// error), so they're greeted as a new player, and their first push after the
// intro - one card, nothing cleared - was accepted and written over the real
// save. These helpers make that shape of push impossible to persist.

/** A save that looks like the first minutes of a new account. */
function looksFresh(save: PlayerSave): boolean {
  return save.collection.length <= 2 && save.cleared === 0 && !save.finalWon
}

/** A save with progress worth protecting. */
function established(save: PlayerSave): boolean {
  return save.collection.length >= 3 || save.cleared >= 1 || save.finalWon === true
}

/**
 * True when accepting `incoming` over `ref` would throw progress away: a
 * fresh-start save replacing an established one, or cleared roads going
 * backwards (the client never regresses those on its own - only a stale or
 * unhydrated session does). Fusing (fewer cards) and spending are fine.
 */
function wouldRegress(incoming: PlayerSave, ref: PlayerSave): boolean {
  if (looksFresh(incoming) && established(ref)) return true
  return incoming.cleared < ref.cleared
}

/** Of two saves, the one with more progress (roads, then cards). */
function richer(a: PlayerSave | undefined, b: PlayerSave | undefined): PlayerSave | undefined {
  if (!a) return b
  if (!b) return a
  if (a.cleared !== b.cleared) return a.cleared > b.cleared ? a : b
  return b.collection.length > a.collection.length ? b : a
}

/** Milestone fingerprint: the backup rewrites when this changes. */
function progressKey(save: PlayerSave): string {
  let stars = 0
  for (const owned of save.collection) stars += owned.stars
  return `${save.collection.length}|${stars}|${save.cleared}|${save.finalWon ? 1 : 0}|${(save.owItems ?? []).length}`
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Storage read that treats "nothing there" with suspicion: a genuinely new
 * wallet costs a couple of extra reads once, a transient miss on a veteran's
 * wallet no longer greets them as a stranger. Throws only if every attempt threw.
 */
async function readWithRetry(address: string, key: string, attempts = 3): Promise<PlayerSave | undefined> {
  let lastError: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      const stored = await Storage.player.get<PlayerSave>(address, key)
      if (stored && Array.isArray(stored.collection) && stored.collection.length > 0) return stored
      lastError = undefined
    } catch (error) {
      lastError = error
    }
    if (i + 1 < attempts) await sleep(600 * (i + 1))
  }
  if (lastError !== undefined) throw lastError
  return undefined
}

export type SaveGrants = {
  maybeGrantFest: (address: string) => void
  maybeGrantGhost: (address: string) => void
  maybeGrantBoss: (address: string) => void
}

export function setupSaves(grants: SaveGrants): {
  saves: Map<string, PlayerSave>
  isSaveReady: (address: string) => boolean
  persistSave: (address: string) => void
  pushSave: (address: string, reason?: 'load' | 'update') => void
  loadOnArrive: (address: string) => void
} {
  // --- Saves -----------------------------------------------------------------
  const saves = new Map<string, PlayerSave>()
  /** Last milestone copy per address (see persistSave / BACKUP_KEY). */
  const backups = new Map<string, PlayerSave>()
  /** Addresses whose storage load succeeded; only those may persist. */
  const saveReady = new Set<string>()
  /** Apparently-new wallets whose first push was double-checked against storage. */
  const verified = new Set<string>()
  /** Double-check in flight: holds the newest push to apply once it settles. */
  const verifying = new Map<string, PlayerSave>()
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

  function writeKey(address: string, key: string, save: PlayerSave, what: string): void {
    try {
      // Storage.set resolves false on a failed PUT (it does not reject).
      Storage.player
        .set(address, key, save)
        .then((ok) => {
          if (!ok) console.log(`[Server] ${what} persist failed for ${address}: storage set returned false`)
        })
        .catch((error: unknown) => {
          console.log(`[Server] ${what} persist failed for ${address}: ${error}`)
        })
    } catch (error) {
      console.log(`[Server] ${what} persist failed for ${address}: ${error}`)
    }
  }

  function persistSave(address: string): void {
    if (!saveReady.has(address)) return
    const save = saves.get(address)
    if (!save) return
    writeKey(address, SAVE_KEY, save, 'save')
    // Second copy under its own key, rewritten only at progress milestones
    // (cards, stars, roads) and never with a regression, so a bad write to the
    // main key - or a fresh-start overwrite that slips past the guard - is
    // one arrival away from being undone.
    const backup = backups.get(address)
    if (backup && (wouldRegress(save, backup) || progressKey(save) === progressKey(backup))) return
    if (!backup && save.collection.length === 0) return
    backups.set(address, save)
    writeKey(address, BACKUP_KEY, save, 'backup')
  }

  function loadOnArrive(address: string): void {
    enqueue(address, async () => {
      try {
        const [stored, backup] = await Promise.all([
          readWithRetry(address, SAVE_KEY),
          readWithRetry(address, BACKUP_KEY, 2).catch(() => undefined)
        ])
        const cleanStored = stored ? sanitizeSave(stored) : undefined
        const cleanBackup = backup ? sanitizeSave(backup) : undefined
        if (cleanBackup) backups.set(address, cleanBackup)
        // The main key lost progress the backup still has (an empty read, or a
        // fresh-start save written over a veteran): the backup wins, and is
        // written straight back to the main key.
        const restored = !!cleanBackup && (!cleanStored || wouldRegress(cleanStored, cleanBackup))
        const loaded = restored ? cleanBackup : cleanStored
        if (loaded) {
          saves.set(address, loaded)
        } else if (!saves.has(address)) {
          saves.set(address, emptySave())
        }
        saveReady.add(address)
        if (restored) {
          console.log(
            `[Server] save RESTORED from backup for ${address}: ${loaded!.collection.length} card(s), ${loaded!.cleared} road(s)`
          )
          writeKey(address, SAVE_KEY, loaded!, 'save')
        }
        // One line per arrival so the hosted log shows storage is answering.
        console.log(`[Server] save loaded for ${address}: ${saves.get(address)?.collection.length ?? 0} card(s)`)
        grants.maybeGrantFest(address) // contributor arriving after the goal completed
        grants.maybeGrantGhost(address) // their heroes raided as ghosts while they were away
        grants.maybeGrantBoss(address) // world boss spoils banked while they were away
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
    // Nor let a fresh-start / stale session overwrite real progress. The
    // richer of what we hold and the backup is the truth: keep it, write it
    // back, and make the client mirror it.
    if (rejectIfRegressing(sender, incoming)) return
    // Pushes that land while the first one is being double-checked wait
    // their turn (only the newest matters), so nothing persists early.
    if (verifying.has(sender)) {
      verifying.set(sender, incoming)
      return
    }
    // First push from a wallet we hold nothing real for: before it becomes
    // the save of record, look in storage one more time. This is the exact
    // moment a veteran whose load came back empty would be overwritten.
    if (!verified.has(sender) && saveReady.has(sender) && (!stored || !established(stored))) {
      verified.add(sender)
      verifying.set(sender, incoming)
      enqueue(sender, async () => {
        try {
          const [again, backupAgain] = await Promise.all([
            readWithRetry(sender, SAVE_KEY, 2).catch(() => undefined),
            readWithRetry(sender, BACKUP_KEY, 2).catch(() => undefined)
          ])
          const found = richer(
            again ? sanitizeSave(again) : undefined,
            backupAgain ? sanitizeSave(backupAgain) : undefined
          )
          if (found && established(found)) {
            backups.set(sender, richer(found, backups.get(sender))!)
            console.log(
              `[Server] late storage hit for ${sender}: ${found.collection.length} card(s), ${found.cleared} road(s)`
            )
          }
        } finally {
          const latest = verifying.get(sender) ?? incoming
          verifying.delete(sender)
          if (!rejectIfRegressing(sender, latest)) {
            saves.set(sender, latest)
            persistSave(sender)
          }
        }
      })
      return
    }
    saves.set(sender, incoming)
    persistSave(sender)
  })

  /** Keep the richer of held save / backup instead of `incoming` when
   * accepting it would lose progress; the client is told to mirror it. */
  function rejectIfRegressing(sender: string, incoming: PlayerSave): boolean {
    const ref = richer(saves.get(sender), backups.get(sender))
    if (!ref || !wouldRegress(incoming, ref)) return false
    console.log(
      `[Server] rejected regressing save from ${sender}: ${incoming.collection.length} card(s)/${incoming.cleared} road(s) vs ${ref.collection.length}/${ref.cleared}`
    )
    saves.set(sender, ref)
    persistSave(sender)
    pushSave(sender, 'update')
    return true
  }

  room.onMessage('resetRequest', (data, context) => {
    if (!context || !data.confirm) return
    const sender = context.from.toLowerCase()
    if (!sender) return
    // A deliberate wipe clears the backup too, or the next arrival would
    // "restore" the account the player just asked to erase.
    saves.set(sender, emptySave())
    backups.delete(sender)
    if (saveReady.has(sender)) {
      writeKey(sender, SAVE_KEY, emptySave(), 'save')
      writeKey(sender, BACKUP_KEY, emptySave(), 'backup')
    }
  })

  return {
    saves,
    isSaveReady: (address: string) => saveReady.has(address),
    persistSave,
    pushSave,
    loadOnArrive
  }
}
