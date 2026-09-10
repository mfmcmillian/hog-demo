import { Color4 } from '@dcl/sdk/math'
import ReactEcs from '@dcl/sdk/react-ecs'
import { UiEntity } from './ui'
import { DEFAULT_LOOK, Look, lookOf } from '../mp/looks'
import { ARMORS, HAIR_COLORS, OUTFITS, SKIN_TONES } from '../mp/protocol'
import { LABELS, LabelInfo } from './labels.gen'

// The customizable walker. The old single walk sheet is split into layers
// (tools/split-walk-layers.py): outline + boots, a tunic sheet per OUTFITS
// entry (the tailor's rack), then a skin sheet per
// SKIN_TONES entry and a hair sheet per HAIR_COLORS entry (short, and long
// for BaseFemale / LONG HAIR). Colors are baked into the sheets rather than
// tinted at draw time: the explorer's UI does not reliably tint textured
// backgrounds. Every sheet shares the 4x4 cell grid, so one set of uvs draws
// the whole figure. Which sheets a wallet wears comes from mp/looks.ts.

const sheet = (name: string): LabelInfo => ({ src: `images/chars/player-walk-${name}.png`, w: 512, h: 512 })

export const AVATAR_LABELS: Record<string, LabelInfo> = { 'player-walk-base': sheet('base') }
for (let k = 0; k < OUTFITS.length; k++) AVATAR_LABELS[`player-walk-fit-${k}`] = sheet(`fit-${k}`)
for (let k = 1; k <= ARMORS.length; k++) AVATAR_LABELS[`player-walk-arm-${k}`] = sheet(`arm-${k}`)
for (let i = 0; i < SKIN_TONES.length; i++) AVATAR_LABELS[`player-walk-skin-${i}`] = sheet(`skin-${i}`)
for (let j = 0; j < HAIR_COLORS.length; j++) {
  AVATAR_LABELS[`player-walk-hair-${j}`] = sheet(`hair-${j}`)
  AVATAR_LABELS[`player-walk-hair-f-${j}`] = sheet(`hair-f-${j}`)
}

Object.assign(LABELS, AVATAR_LABELS)

/** The sheets a look draws, for preloading. */
export function avatarSrcs(look: Look): string[] {
  return avatarLayers(look).map((layer) => layer.src)
}

/** The base and the default villager's sheets: what any screen with walkers
 * on it needs bound before it opens. Other tones bind as they are first drawn. */
export const AVATAR_SRCS = avatarSrcs(DEFAULT_LOOK)

const COLS = 4
const ROWS = 4

/** Uvs of a walk-sheet cell, optionally a sub-rectangle of it (fractions
 * of the cell: x0..x1 across, y0..y1 down) to zoom on the figure. */
function cellRectUvs(cell: number, x0 = 0, y0 = 0, x1 = 1, y1 = 1): number[] {
  const col = cell % COLS
  const row = Math.floor(cell / COLS)
  const u0 = (col + x0) / COLS
  const u1 = (col + x1) / COLS
  const vTop = 1 - (row + y0) / ROWS
  const vBottom = 1 - (row + y1) / ROWS
  return [u0, vBottom, u0, vTop, u1, vTop, u1, vBottom]
}

/** Draw order per layer for a look; `cast` is applied to every layer (the
 * map's cool cast on fellow travelers, a ghost's translucency). */
export function avatarLayers(look: Look, cast: Color4 = Color4.White()): { src: string; tint: Color4 }[] {
  const base = AVATAR_LABELS['player-walk-base']
  const fit = AVATAR_LABELS[`player-walk-fit-${look.outfit}`] ?? AVATAR_LABELS['player-walk-fit-0']
  const armor = look.armor > 0 ? AVATAR_LABELS[`player-walk-arm-${look.armor}`] : undefined
  const skin = AVATAR_LABELS[`player-walk-skin-${look.skin}`] ?? AVATAR_LABELS[`player-walk-skin-${DEFAULT_LOOK.skin}`]
  const hair =
    AVATAR_LABELS[`player-walk-hair${look.body === 'f' ? '-f' : ''}-${look.hair}`] ??
    AVATAR_LABELS[`player-walk-hair-${DEFAULT_LOOK.hair}`]
  const out: { src: string; tint: Color4 }[] = []
  if (base) out.push({ src: base.src, tint: cast })
  if (fit) out.push({ src: fit.src, tint: cast })
  if (skin) out.push({ src: skin.src, tint: cast })
  if (hair) out.push({ src: hair.src, tint: cast })
  // Last: the suit sits over the tunic and its helm over the hair.
  if (armor) out.push({ src: armor.src, tint: cast })
  return out
}

/**
 * One walk-sheet pose as stacked quads, absolute at (left, top) in the
 * parent, `size` square. Layers are direct siblings (no wrapper): a
 * zero-sized wrapper clips its children on some explorers.
 */
export function avatarQuads(props: {
  look: Look
  cell: number
  size: number
  left: number
  top: number
  cast?: Color4
  keyPrefix: string
}): ReactEcs.JSX.Element[] {
  const uvs = cellRectUvs(props.cell)
  return avatarLayers(props.look, props.cast).map((layer, i) => (
    <UiEntity
      key={`${props.keyPrefix}${i}`}
      uiTransform={{
        positionType: 'absolute',
        position: { left: props.left, top: props.top },
        width: props.size,
        height: props.size,
        pointerFilter: 'none'
      }}
      uiBackground={{ textureMode: 'stretch', texture: { src: layer.src }, uvs, color: layer.tint }}
    />
  ))
}

// The figure fills roughly this much of a cell (head at low x, boots at high
// x in the pre-rotated sheet); the bust zooms on it so a 40-unit box shows a
// recognizable person rather than a speck in a field of alpha.
const FIG_X0 = 0.16
const FIG_X1 = 0.88
const FIG_Y0 = 0.28
const FIG_Y1 = 0.7

/**
 * A traveler's figure in a `w`-square box in normal flex flow: the standing,
 * down-facing pose, zoomed on the body. For seat plates, the feed, the hall.
 * `address` looks up their avatar; `look` overrides it (ghosts, previews).
 * `cell` picks another pose (the fireside ring faces the fire).
 */
export function AvatarBust(props: {
  address?: string
  look?: Look
  w: number
  cell?: number
  cast?: Color4
  margin?: number | { top?: number; bottom?: number; left?: number; right?: number }
  key?: string | number
}) {
  const look = props.look ?? (props.address ? lookOf(props.address) : DEFAULT_LOOK)
  const uvs = cellRectUvs(props.cell ?? 0, FIG_X0, FIG_Y0, FIG_X1, FIG_Y1)
  // Keep the zoomed rect's aspect: it is wider (x) than tall (y) in canvas terms.
  const w = props.w
  const h = Math.round((w * (FIG_Y1 - FIG_Y0)) / (FIG_X1 - FIG_X0))
  return (
    <UiEntity uiTransform={{ width: w, height: h, margin: props.margin ?? 2, pointerFilter: 'none' }}>
      {avatarLayers(look, props.cast).map((layer, i) => (
        <UiEntity
          key={i}
          uiTransform={{
            positionType: 'absolute',
            position: { left: 0, top: 0 },
            width: w,
            height: h,
            pointerFilter: 'none'
          }}
          uiBackground={{ textureMode: 'stretch', texture: { src: layer.src }, uvs, color: layer.tint }}
        />
      ))}
    </UiEntity>
  )
}

/** Ghost seats and busts: pale, see-through, moonlit. */
export const GHOST_CAST = Color4.create(0.7, 0.85, 1, 0.62)
