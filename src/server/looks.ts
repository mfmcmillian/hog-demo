import { AvatarBase, engine, executeTask } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'
import { Storage } from '@dcl/sdk/server'
import { hexOfRgb, LOOKS_MAX, LooksPub, PackedLook, validArmor, validOutfit } from '../mp/protocol'
import { LOOKS_SYNC_ID, MpLooksState } from '../mp/transport'
import { ServerCtx } from './ctx'

// Looks: the server remembers how each wallet's walker should be drawn (body
// shape, skin, hair), persisted and published, so the hall's rows and the
// feed's lines for players who have left still show their colors. Two
// sources: the look a player picked in settings > appearance (in their save;
// wins), else their Decentraland avatar as presence reads it off AvatarBase
// for display names. Nothing is taken from client messages directly.

const LOOKS_KEY = 'hog-looks-v1'

/** A skin or hair the explorer reports as pure white is a default it never
 * filled in, not a color anyone chose; treat it as unknown. */
function blank(c: { r: number; g: number; b: number }): boolean {
  return c.r > 0.97 && c.g > 0.97 && c.b > 0.97
}

/** Some runtimes hand colors over as 0..255; bring those back to 0..1. */
function unit(c: { r: number; g: number; b: number }): { r: number; g: number; b: number } {
  return c.r > 1 || c.g > 1 || c.b > 1 ? { r: c.r / 255, g: c.g / 255, b: c.b / 255 } : c
}

type LooksStore = {
  /** Insertion order is recency: the oldest key is the first to go. */
  looks: LooksPub
}

export type LooksApi = {
  /** Presence saw this avatar in the scene: record its look if it changed. */
  note: (address: string, base: ReturnType<typeof AvatarBase.get>) => void
}

export function setupLooks(ctx: ServerCtx): LooksApi {
  const entity = engine.addEntity()
  let chosenWait = 0
  const logged = new Set<string>()
  let revision = 0
  const store: LooksStore = { looks: {} }
  let ready = false
  let dirty = false
  let publishWait = 0
  let persistDirty = false
  let persistWait = 0

  MpLooksState.create(entity, { json: JSON.stringify(store.looks), revision })
  syncEntity(entity, [MpLooksState.componentId], LOOKS_SYNC_ID)

  function publish(): void {
    revision += 1
    const state = MpLooksState.getMutable(entity)
    state.json = JSON.stringify(store.looks)
    state.revision = revision
    dirty = false
    publishWait = 1
  }

  function persist(): void {
    if (!ready) return
    persistDirty = false
    try {
      Storage.set(LOOKS_KEY, JSON.stringify(store))
        .then((ok) => {
          if (!ok) console.log('[Server] looks persist failed: storage set returned false')
        })
        .catch((error: unknown) => {
          console.log(`[Server] looks persist failed: ${error}`)
        })
    } catch (error) {
      console.log(`[Server] looks persist failed: ${error}`)
    }
  }

  function same(a: PackedLook | undefined, b: PackedLook): boolean {
    return (
      !!a &&
      a[0] === b[0] &&
      a[1] === b[1] &&
      a[2] === b[2] &&
      (a[3] ?? 0) === (b[3] ?? 0) &&
      (a[4] ?? 0) === (b[4] ?? 0) &&
      (a[5] ?? 0) === (b[5] ?? 0)
    )
  }

  /** Keep the newest LOOKS_MAX keys, re-inserting a key to mark it fresh. */
  function put(address: string, look: PackedLook): void {
    delete store.looks[address]
    store.looks[address] = look
    const keys = Object.keys(store.looks)
    for (let i = 0; i < keys.length - LOOKS_MAX; i++) delete store.looks[keys[i]]
  }

  function note(address: string, base: ReturnType<typeof AvatarBase.get>): void {
    if (!logged.has(address)) {
      // One line per wallet in the hosted log: what the runtime actually
      // reports for avatar colors (diagnosing white skin on some explorers).
      logged.add(address)
      console.log(
        `[Server] avatar ${address.slice(0, 10)} body=${base.bodyShapeUrn ?? '?'} skin=${JSON.stringify(base.skinColor)} hair=${JSON.stringify(base.hairColor)}`
      )
    }
    const current = store.looks[address]
    // Their own pick stands; the avatar read only fills in for those without one.
    if (current && current[3] === 1 && ctx.saves.get(address)?.look) return
    const body: 'm' | 'f' = /BaseFemale/i.test(base.bodyShapeUrn ?? '') ? 'f' : 'm'
    const skin = base.skinColor ? unit(base.skinColor) : undefined
    const hair = base.hairColor ? unit(base.hairColor) : undefined
    if (!skin || !hair || blank(skin)) return
    const look: PackedLook = [body, hexOfRgb(skin), hexOfRgb(hair)]
    if (same(current, look)) return
    put(address, look)
    dirty = true
    persistDirty = true
  }

  /** Once a second: anyone present whose save carries an appearance pick
   * publishes that pick (body from the pick, else from the avatar read). */
  function noteChosen(): void {
    for (const address of ctx.present) {
      const save = ctx.saves.get(address)
      const choice = save?.look
      const current = store.looks[address]
      if (!choice) {
        // Pick cleared (USE MY AVATAR): drop the chosen flag so the next
        // avatar read takes over.
        if (current && current[3] === 1) {
          put(address, [current[0], current[1], current[2]])
          dirty = true
          persistDirty = true
        }
        continue
      }
      const body: 'm' | 'f' = choice.body ?? current?.[0] ?? 'm'
      // Armor shows only if the save also holds the suit.
      const armor = choice.armor && (save?.armory ?? []).indexOf(choice.armor) >= 0 ? choice.armor : 0
      const look: PackedLook = [body, choice.skin, choice.hair, 1, choice.outfit ?? 0, armor]
      if (same(current, look)) continue
      put(address, look)
      dirty = true
      persistDirty = true
    }
  }

  function validLook(value: unknown): value is PackedLook {
    return (
      Array.isArray(value) &&
      value.length >= 3 &&
      value.length <= 6 &&
      (value[3] === undefined || value[3] === 0 || value[3] === 1) &&
      (value[4] === undefined || validOutfit(value[4])) &&
      (value[5] === undefined || value[5] === 0 || validArmor(value[5])) &&
      (value[0] === 'm' || value[0] === 'f') &&
      /^[0-9a-f]{6}$/i.test(String(value[1])) &&
      /^[0-9a-f]{6}$/i.test(String(value[2]))
    )
  }

  executeTask(async () => {
    try {
      const raw = await Storage.get<string>(LOOKS_KEY)
      if (raw) {
        const stored = JSON.parse(raw) as Partial<LooksStore>
        const looks = stored && typeof stored.looks === 'object' && stored.looks ? stored.looks : {}
        // Stored looks first, then whoever arrived in the seconds before the read.
        const live = store.looks
        store.looks = {}
        for (const [address, look] of Object.entries(looks)) if (validLook(look)) store.looks[address] = look
        for (const [address, look] of Object.entries(live)) put(address, look)
        dirty = true
      }
      ready = true
      // A missing key resolves null (no throw): seed it so the write path is
      // proven at boot and restarts stop re-reading an absent key.
      if (!raw) persist()
    } catch (error) {
      console.log(`[Server] looks load failed: ${error}`)
    }
  })

  engine.addSystem((dt) => {
    chosenWait -= dt
    if (chosenWait <= 0) {
      chosenWait = 1
      noteChosen()
    }
    publishWait -= dt
    if (dirty && publishWait <= 0) publish()
    persistWait -= dt
    if (persistDirty && persistWait <= 0) {
      persistWait = 10
      persist()
    }
  })

  return { note }
}
