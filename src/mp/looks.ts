import { AvatarBase, PlayerIdentityData, engine } from '@dcl/sdk/ecs'
import { game } from '../game/store'
import { getMyAddress } from './identity'
import { HAIR_COLORS, LooksPub, rgbOfHex, SKIN_TONES, validArmor, validOutfit } from './protocol'
import { MpLooksState } from './transport'

// Looks: what each traveler's 2D walker should look like. Body shape picks
// the hair sheet (BaseFemale / LONG HAIR wears it long); skin and hair are
// indices into SKIN_TONES / HAIR_COLORS, each of which has its own baked
// sheet (tools/split-walk-layers.py) - the explorer's UI does not reliably
// tint textures, so nothing is tinted at draw time. A player's own pick
// (settings > appearance) wins; otherwise their DCL avatar's colors snap to
// the nearest swatch.

export type Look = {
  body: 'm' | 'f'
  /** Index into SKIN_TONES. */
  skin: number
  /** Index into HAIR_COLORS. */
  hair: number
  /** Index into OUTFITS (the tailor's rack); 0 is the painted villager blue. */
  outfit: number
  /** 1-based into ARMORS, worn over the tunic; 0 = none. */
  armor: number
}

/** What the untinted sheet used to show: the light-skinned, brown-haired villager. */
export const DEFAULT_LOOK: Look = { body: 'm', skin: 1, hair: 2, outfit: 0, armor: 0 }

/** Live: avatars in the scene right now, read straight off AvatarBase. */
const looks = new Map<string, Look>()
/** Chosen: picks other players made in settings > appearance (server-published). */
const chosen = new Map<string, Look>()
/** Remembered: the server's last avatar sighting of wallets that have left. */
const remembered = new Map<string, Look>()
let rememberedRevision = -1
let scanWait = 0
/** Addresses whose raw avatar colors were logged once (explorer diagnostics). */
const logged = new Set<string>()

type Rgb = { r: number; g: number; b: number }

/** Some runtimes hand colors over as 0..255; bring those back to 0..1. */
function unit(c: Rgb): Rgb {
  return c.r > 1 || c.g > 1 || c.b > 1 ? { r: c.r / 255, g: c.g / 255, b: c.b / 255 } : c
}

/** A skin the explorer reports as pure white is a default it never filled in. */
function blank(c: Rgb): boolean {
  return c.r > 0.97 && c.g > 0.97 && c.b > 0.97
}

/** Index of the palette entry closest to a color (plain RGB distance). */
export function nearestIndex(c: Rgb, palette: string[]): number {
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < palette.length; i++) {
    const p = rgbOfHex(palette[i])
    if (!p) continue
    const d = (p.r - c.r) ** 2 + (p.g - c.g) ** 2 + (p.b - c.b) ** 2
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

function indexOfHex(hex: string, palette: string[], fallback: number): number {
  const exact = palette.indexOf(hex.toLowerCase())
  if (exact >= 0) return exact
  const c = rgbOfHex(hex)
  return c ? nearestIndex(c, palette) : fallback
}

function lookFromHex(body: string, skinHex: string, hairHex: string, outfit: unknown, armor: unknown): Look {
  return {
    body: body === 'f' ? 'f' : 'm',
    skin: indexOfHex(skinHex, SKIN_TONES, DEFAULT_LOOK.skin),
    hair: indexOfHex(hairHex, HAIR_COLORS, DEFAULT_LOOK.hair),
    outfit: validOutfit(outfit) ? outfit : 0,
    armor: validArmor(armor) ? armor : 0
  }
}

/** Refresh the address -> Look table from the avatars in the scene. Cheap,
 * but AvatarBase only changes when someone re-dresses, so once a second is plenty. */
export function tickLooks(dt: number): void {
  scanWait -= dt
  if (scanWait > 0) return
  scanWait = 1
  for (const [entity, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
    if (!AvatarBase.has(entity)) continue
    const base = AvatarBase.get(entity)
    const address = identity.address.toLowerCase()
    if (!logged.has(address)) {
      logged.add(address)
      console.log(
        `[looks] ${address.slice(0, 8)} body=${base.bodyShapeUrn ?? '?'} skin=${JSON.stringify(base.skinColor)} hair=${JSON.stringify(base.hairColor)}`
      )
    }
    const skin = base.skinColor ? unit(base.skinColor) : undefined
    const hair = base.hairColor ? unit(base.hairColor) : undefined
    looks.set(address, {
      body: /BaseFemale/i.test(base.bodyShapeUrn ?? '') ? 'f' : 'm',
      skin: skin && !blank(skin) ? nearestIndex(skin, SKIN_TONES) : DEFAULT_LOOK.skin,
      hair: hair ? nearestIndex(hair, HAIR_COLORS) : DEFAULT_LOOK.hair,
      outfit: 0,
      armor: 0
    })
  }
  // The server's memory of everyone it has seen, for hall rows and feed
  // lines about players who are not here, and everyone's settings picks
  // (server/looks.ts).
  for (const [, state] of engine.getEntitiesWith(MpLooksState)) {
    if (state.revision === rememberedRevision) break
    rememberedRevision = state.revision
    try {
      const pub = JSON.parse(state.json) as LooksPub
      remembered.clear()
      chosen.clear()
      for (const [address, packed] of Object.entries(pub)) {
        const look = lookFromHex(packed[0], packed[1], packed[2], packed[4], packed[5])
        if (packed[3] === 1) chosen.set(address, look)
        else remembered.set(address, look)
      }
    } catch (error) {
      console.log(`[looks] bad looks state: ${error}`)
    }
    break
  }
}

/** The look of a wallet: their settings pick if they made one, else their
 * avatar live if they are in the scene, the server's last sighting if not,
 * and the villager for anyone never seen (ghosts, founders). */
export function lookOf(address: string): Look {
  const key = address.toLowerCase()
  if (key === getMyAddress() && game.look) {
    // My own pick, straight from the store, so a swatch tap shows at once.
    // Resolved once per distinct pick: this runs for every figure of mine on
    // every UI frame (the fire, the map, seat plates).
    const body = game.look.body ?? looks.get(key)?.body ?? 'm'
    const pickKey = `${body}|${game.look.skin}|${game.look.hair}|${game.look.outfit ?? 0}|${game.look.armor ?? 0}`
    if (pickKey !== myPickKey) {
      myPickKey = pickKey
      myPick = lookFromHex(body, game.look.skin, game.look.hair, game.look.outfit, game.look.armor)
    }
    return myPick
  }
  return chosen.get(key) ?? looks.get(key) ?? remembered.get(key) ?? DEFAULT_LOOK
}

let myPickKey = ''
let myPick: Look = DEFAULT_LOOK

/** What the DCL avatar read says about me, ignoring my pick (settings preview). */
export function myAvatarLook(): Look {
  return looks.get(getMyAddress()) ?? DEFAULT_LOOK
}

export function myLook(): Look {
  return lookOf(getMyAddress())
}
