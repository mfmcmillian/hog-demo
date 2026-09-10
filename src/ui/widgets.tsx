import { Color4 } from '@dcl/sdk/math'
import ReactEcs from '@dcl/sdk/react-ecs'
import { UiEntity } from './ui'
import { tap } from '../game/audio'
import { game } from '../game/store'
import { facePoster, idlePoster, sparksSheet, starBurstFx } from './flipbook'
import { press, pressAmt, pressShrink, pressTint } from './fx/press'
import { LABELS } from './labels.gen'
import { Rarity } from '../game/types'
import { cream, gold, ink, muted, PASS, rarityGlow, xpBlue } from './theme'

// ---- moved primitives --------------------------------------------------------

/** A pre-rotated label image. `w` is its on-screen width; height keeps aspect. */
export function Img(props: { k: string; w: number; tint?: Color4; margin?: number; key?: string | number }) {
  const info = LABELS[props.k]
  if (!info) return null
  return (
    <UiEntity
      uiTransform={{
        width: props.w,
        height: Math.round((props.w * info.h) / info.w),
        margin: props.margin ?? 2
      }}
      uiBackground={{
        textureMode: 'stretch',
        texture: { src: info.src },
        uvs: info.uvs,
        color: props.tint ?? cream
      }}
    />
  )
}

/** Game logo, pushed past the chrome inset toward the physical screen top
 * (stage left). Decorative and stage-relative — a camera cutout grazing it
 * is fine; shifting it off its slot is not. */
export function GameLogo() {
  if (!LABELS['boot-logo']) return null
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { left: -185, top: 0 },
        width: 170,
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        pointerFilter: 'none'
      }}
    >
      <UiEntity
        uiTransform={{ width: 160, height: 320, pointerFilter: 'none' }}
        uiBackground={{ textureMode: 'stretch', texture: { src: LABELS['boot-logo'].src }, color: Color4.White() }}
      />
    </UiEntity>
  )
}

/** A menu screen's ornate title plate, parked in the gutter strip where
 * GameLogo sits on non-menu screens (physical top in the portrait grip). */
export function MenuTitle(props: { k: string }) {
  const art = LABELS[props.k]
  if (!art) return null
  const w = 150
  const h = Math.min(500, Math.round((w * art.h) / art.w))
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { left: -185, top: 0 },
        width: 170,
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        pointerFilter: 'none'
      }}
    >
      <UiEntity
        uiTransform={{ width: w, height: h, pointerFilter: 'none' }}
        uiBackground={{ textureMode: 'stretch', texture: { src: art.src }, uvs: art.uvs, color: Color4.White() }}
      />
    </UiEntity>
  )
}

/** A number as stacked digit images, reading physically left-to-right. */
export function Digits(props: {
  value: number
  w: number
  tint?: Color4
  key?: string | number
  tight?: boolean
  across?: boolean
}) {
  const chars = String(Math.max(0, Math.floor(props.value))).split('')
  const gap = props.tight ? -Math.round(props.w * 0.2) : 0
  return (
    <UiEntity uiTransform={{ flexDirection: props.across ? 'row' : 'column-reverse', alignItems: 'center' }}>
      {chars.map((c, i) => (
        <Img key={i} k={`d${c}`} w={props.w} tint={props.tint} margin={gap} />
      ))}
    </UiEntity>
  )
}

function PlusMark(props: { s: number; tint?: Color4 }) {
  const s = props.s
  const t = Math.max(5, Math.round(s * 0.22))
  const tint = props.tint ?? gold
  return (
    <UiEntity
      uiTransform={{
        width: s,
        height: s,
        alignItems: 'center',
        justifyContent: 'center',
        margin: { top: 2, bottom: 2 }
      }}
    >
      <UiEntity uiTransform={{ positionType: 'absolute', width: t, height: s }} uiBackground={{ color: tint }} />
      <UiEntity uiTransform={{ positionType: 'absolute', width: s, height: t }} uiBackground={{ color: tint }} />
    </UiEntity>
  )
}

/** +N as a gain, reading physically left-to-right. */
export function Gain(props: { value: number; w: number; tint?: Color4 }) {
  return (
    <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center' }}>
      <PlusMark s={Math.round(props.w * 0.4)} tint={props.tint} />
      <Digits value={props.value} w={props.w} tint={props.tint} tight />
    </UiEntity>
  )
}

export function Stars(props: { count: number; w?: number; burst?: boolean; key?: string | number }) {
  const fx = props.burst ? starBurstFx() : undefined
  const shown = fx && fx.active ? fx.shown : props.count
  const items = [] as number[]
  const w = props.w ?? 14
  for (let i = 0; i < shown; i++) items.push(i)
  return (
    <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center' }}>
      {items.map((i) => {
        const newest = !!(fx && fx.popping && i === shown - 1)
        const grow = newest ? Math.round(w * 0.55 * fx.pop) : 0
        return (
          <UiEntity
            key={i}
            uiTransform={{
              width: w + grow,
              height: w + grow,
              margin: 1,
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Img k="star" w={w + grow} tint={gold} margin={0} />
            {newest && fx.sparks ? (
              <UiEntity
                uiTransform={{
                  positionType: 'absolute',
                  position: { left: -w, top: -w },
                  width: w * 3 + grow,
                  height: w * 3 + grow,
                  pointerFilter: 'none'
                }}
                uiBackground={{
                  textureMode: 'stretch',
                  texture: { src: sparksSheet() },
                  uvs: fx.sparksUvs,
                  color: Color4.create(1, 0.92, 0.55, 1)
                }}
              />
            ) : null}
          </UiEntity>
        )
      })}
    </UiEntity>
  )
}

/** Number + word. Default reads "40 coins". `wordFirst` reads "HP 23". */
export function Stat(props: {
  value: number
  word: string
  tint?: Color4
  key?: string | number
  w?: number
  wordFirst?: boolean
}) {
  const w = props.w ?? 22
  const value = <Digits value={props.value} w={w} tint={props.tint ?? cream} />
  const word = <Img k={props.word} w={Math.round(w * 0.82)} tint={muted} margin={4} />
  return (
    <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: { left: 4, right: 4 } }}>
      {props.wordFirst ? word : value}
      {props.wordFirst ? value : word}
    </UiEntity>
  )
}

export function Notice() {
  if (!game.notice) return null
  return (
    <UiEntity
      uiTransform={{
        flexDirection: 'column-reverse',
        alignItems: 'center',
        alignSelf: 'flex-start',
        margin: { left: 8, top: 10 }
      }}
    >
      <Img k={game.notice} w={24} tint={gold} />
      {game.noticeArg ? <Img k={game.noticeArg} w={24} tint={cream} /> : null}
    </UiEntity>
  )
}

export function FillBar(props: { frac: number; w: number; h: number; fill: Color4; track?: Color4 }) {
  const filled = Math.max(0, Math.min(props.h, Math.round(props.frac * props.h)))
  return (
    <UiEntity
      uiTransform={{
        width: props.w,
        height: props.h,
        flexDirection: 'column',
        justifyContent: 'flex-end'
      }}
      uiBackground={{ color: props.track ?? ink }}
    >
      <UiEntity uiTransform={{ width: '100%', height: filled }} uiBackground={{ color: props.fill }} />
    </UiEntity>
  )
}

export function SlotChrome(props: {
  size: number
  empty?: boolean
  lit?: boolean
  hall?: string
  onTap: () => void
  /** Stable id (e.g. the owned uid) enables the pressed-in tap effect. */
  pid?: string
  children?: ReactEcs.JSX.Component[] | ReactEcs.JSX.Component
  key?: string | number
}) {
  // Pressing sinks the content deeper into the frame (padding grows inward).
  const amt = props.pid ? pressAmt(props.pid) : 0
  const pad = (props.lit ? 7 : 3) + Math.round(props.size * 0.04 * amt)
  const frame = props.lit ? gold : Color4.create(0.82, 0.62, 0.28, 0.5)
  return (
    <UiEntity
      uiTransform={{
        width: props.size,
        height: props.size,
        alignItems: 'center',
        justifyContent: 'center',
        padding: pad,
        margin: 3
      }}
      uiBackground={{ color: props.pid ? pressTint(props.pid, frame) : frame }}
      onMouseDown={props.pid ? press(props.pid, tap(props.onTap)) : tap(props.onTap)}
    >
      <UiEntity
        uiTransform={{
          width: '100%',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        uiBackground={
          props.hall
            ? { textureMode: 'stretch', texture: { src: props.hall }, color: Color4.White() }
            : { color: props.empty ? Color4.create(0.08, 0.05, 0.06, 0.88) : ink }
        }
      >
        {props.children}
      </UiEntity>
    </UiEntity>
  )
}

/** A player name as stacked letter glyphs, reading physically left-to-right. */
export function NameTag(props: { name: string; w: number; tint?: Color4; key?: string | number }) {
  const chars = props.name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 10)
    .split('')
  if (chars.length === 0) chars.push('x')
  return (
    <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center' }}>
      {chars.map((c, i) => (
        <Img key={i} k={c >= '0' && c <= '9' ? `d${c}` : `g${c}`} w={props.w} tint={props.tint ?? cream} margin={0} />
      ))}
    </UiEntity>
  )
}

/** Full-bleed hall backdrop for the multiplayer screens. */
export function MpBackdrop(props: { k: string }) {
  const nodes = Backdrop({ label: props.k, pass: true })
  return nodes[0] ?? null
}

export function charArt(id: string) {
  return LABELS[`char-${id}`] ?? LABELS['char-ash-hound'] ?? LABELS['char-foe-ogre']
}

export function Face(props: {
  id: string
  w: number | `${number}%`
  h?: number | `${number}%`
  fallback?: number
  tint?: Color4
  margin?: { left?: number; top?: number; right?: number; bottom?: number }
  /** Prefer the standalone 1024px portrait over the atlas's 128px face.
   * For big draws (hero card at 560 units) the small face blurs. */
  hi?: boolean
  /** Sample the hero's combat sheet instead of the face atlas: for screens
   * that have the sheet bound anyway (the fight) and want its 256px cell. */
  sheet?: boolean
}) {
  const sheet = props.hi ? null : props.sheet ? idlePoster(props.id) : facePoster(props.id)
  const art = !sheet ? charArt(props.id) : undefined
  if (!sheet && !art) return props.fallback ? <Img k={props.id} w={props.fallback} /> : null
  return (
    <UiEntity
      uiTransform={{ width: props.w, height: props.h ?? props.w, margin: props.margin }}
      uiBackground={{
        textureMode: 'stretch',
        texture: { src: sheet ? sheet.src : art!.src },
        uvs: sheet ? sheet.uvs : undefined,
        color: props.tint ?? Color4.White()
      }}
    />
  )
}

const HALO_TEX = 'images/hud/tut-ring.png'

/** Soft gold halo of light, breathing slowly: the tutorial ring blown up
 * behind a ceremony title (LEVEL UP). Absolute and centered in a `w`x`h`
 * parent; put it before the art so it draws underneath. The ring is round, so
 * the landscape-grip UV turn is harmless. */
export function Halo(props: { w: number; h: number; scale?: number }) {
  const size = Math.round(Math.max(props.w, props.h) * (props.scale ?? 1.9))
  const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 650)
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: Math.round((props.h - size) / 2), left: Math.round((props.w - size) / 2) },
        width: size,
        height: size,
        pointerFilter: 'none'
      }}
      uiBackground={{
        textureMode: 'stretch',
        texture: { src: HALO_TEX },
        color: Color4.create(1, 0.8, 0.38, 0.32 + 0.28 * pulse)
      }}
    />
  )
}

/** Icon button. `hit` grows the tappable box past the icon (negative margins
 * keep the flex footprint at `w`, so layouts don't shift) — mobile thumbs need
 * ~84 stage units to make the 44pt touch-target minimum. */
export function CardBtn(props: { k: string; w: number; hit?: number; tint?: Color4; onTap?: () => void }) {
  const hit = Math.max(props.w, props.hit ?? props.w)
  const bleed = -Math.round((hit - props.w) / 2)
  const id = `card:${props.k}`
  return (
    <UiEntity
      uiTransform={{
        width: hit,
        height: hit,
        margin: bleed,
        alignItems: 'center',
        justifyContent: 'center'
      }}
      onMouseDown={press(id, props.onTap)}
    >
      <Img k={props.k} w={props.w - pressShrink(id, props.w)} tint={pressTint(id, props.tint)} margin={0} />
    </UiEntity>
  )
}

export function Plate(props: { k: string; w: number; h: number; onTap?: () => void }) {
  const info = LABELS[props.k]
  if (!info) return null
  // The image sinks inside a fixed hit box so pressing never shifts layout.
  // Gate on onTap: decorative plates share keys with live ones (`continue`).
  const id = `plate:${props.k}`
  const amt = props.onTap ? pressAmt(id) : 0
  return (
    <UiEntity
      uiTransform={{
        width: props.w,
        height: props.h,
        alignItems: 'center',
        justifyContent: 'center',
        margin: 4
      }}
      onMouseDown={press(id, tap(props.onTap))}
    >
      <UiEntity
        uiTransform={{
          width: props.w - Math.round(props.w * 0.08 * amt),
          height: props.h - Math.round(props.h * 0.08 * amt),
          pointerFilter: 'none'
        }}
        uiBackground={{
          textureMode: 'stretch',
          texture: { src: info.src },
          uvs: info.uvs,
          color: props.onTap ? pressTint(id) : Color4.White()
        }}
      />
    </UiEntity>
  )
}

// ---- DRY widgets -------------------------------------------------------------

/** Full-bleed backdrop. `label` looks up LABELS; `src` paints a hall/dynamic sheet. */
export function Backdrop(props: {
  label?: string
  src?: string
  dim?: number
  tint?: Color4
  veil?: Color4
  pass?: boolean
  veilPass?: boolean
}): ReactEcs.JSX.Element[] {
  const art: { src: string; uvs?: number[] } | undefined = props.src
    ? { src: props.src }
    : props.label
      ? LABELS[props.label]
      : undefined
  const veilColor = props.veil ?? (props.dim !== undefined ? Color4.create(0.02, 0.01, 0.02, props.dim) : undefined)
  const nodes: ReactEcs.JSX.Element[] = []
  if (art) {
    nodes.push(
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { top: 0, left: 0 },
          width: '100%',
          height: '100%',
          ...(props.pass ? PASS : {})
        }}
        uiBackground={{
          textureMode: 'stretch',
          texture: { src: art.src },
          uvs: art.uvs,
          color: props.tint ?? Color4.White()
        }}
      />
    )
  }
  if (veilColor) {
    nodes.push(
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { top: 0, left: 0 },
          width: '100%',
          height: '100%',
          ...(props.veilPass === false ? {} : PASS)
        }}
        uiBackground={{ color: veilColor }}
      />
    )
  }
  return nodes
}

const SELECT_TEX = 'images/hud/select-frame.png'
// the frame line sits 44/256 in from the texture edge; slice just past it so
// the straight runs stretch and the rounded corners keep their shape
const SELECT_SLICE = 0.36
const SELECT_INSET = 44 / 256

/** The card selection marker: a rounded gold frame with light bleeding off
 * it, breathing slowly, laid over a `w`x`h` box and reaching `reach` beyond
 * it. Nine-sliced, so it fits any card; absolute, so it costs no layout. */
export function SelectFrame(props: { w: number; h: number; reach?: number }) {
  const reach = props.reach ?? 14
  // The texture's own line is inset from its edge; overshoot by that inset
  // (in the on-screen scale of the slice) so the line lands `reach` outside.
  const pad = reach + Math.round(SELECT_INSET * 100)
  const pulse = 0.8 + 0.2 * Math.sin(Date.now() / 260)
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: -pad, left: -pad },
        width: props.w + pad * 2,
        height: props.h + pad * 2,
        ...PASS
      }}
      uiBackground={{
        textureMode: 'nine-slices',
        texture: { src: SELECT_TEX },
        textureSlices: { top: SELECT_SLICE, left: SELECT_SLICE, right: SELECT_SLICE, bottom: SELECT_SLICE },
        color: Color4.create(1, 1, 1, pulse)
      }}
    />
  )
}

/** Party-tile frame in a fixed-size wrap; `selected` lays the gold SelectFrame
 * over it. Omit `wrap` for a bare framed tile (NFT teasers). */
export function PartyTile(props: {
  w: number
  wrap?: number
  margin?: number
  selected?: boolean
  frameTint?: Color4
  onTap?: () => void
  children?: ReactEcs.JSX.Component[] | ReactEcs.JSX.Component
  key?: string | number
}) {
  const frame = LABELS['party-tile']
  if (!frame) return null
  const h = Math.round((props.w * frame.h) / frame.w)
  const margin = props.margin ?? 2
  const tile = (
    <UiEntity
      uiTransform={
        props.wrap === undefined
          ? { width: props.w, height: h, margin, alignItems: 'center', justifyContent: 'center' }
          : { width: props.w, height: h, alignItems: 'center', justifyContent: 'center' }
      }
      uiBackground={{
        textureMode: 'stretch',
        texture: { src: frame.src },
        uvs: frame.uvs,
        color: props.frameTint ?? Color4.White()
      }}
      onMouseDown={props.wrap === undefined ? props.onTap : undefined}
    >
      {props.children}
      {props.selected ? <SelectFrame w={props.w} h={h} reach={6} /> : null}
    </UiEntity>
  )
  if (props.wrap === undefined) return tile
  return (
    <UiEntity
      uiTransform={{
        width: props.w + props.wrap,
        height: h + props.wrap,
        margin,
        alignItems: 'center',
        justifyContent: 'center'
      }}
      onMouseDown={props.onTap}
    >
      {tile}
    </UiEntity>
  )
}

const AURA_TEX = 'images/hud/aura.png'

/** Rarity as a soft radial glow of light behind a hero face (not a fill: the
 * card art stays visible). Absolute, centred on (`cx`, `cy`) in the parent. */
export function RarityAura(props: { rarity: Rarity; size: number; cx: number; cy: number; alpha?: number }) {
  const glow = rarityGlow(props.rarity)
  const half = Math.round(props.size / 2)
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: props.cy - half, left: props.cx - half },
        width: props.size,
        height: props.size,
        ...PASS
      }}
      uiBackground={{
        textureMode: 'stretch',
        texture: { src: AURA_TEX },
        color: Color4.create(glow.r, glow.g, glow.b, props.alpha ?? 0.9)
      }}
    />
  )
}

/** The star rank on a slim dark ribbon along the phone-bottom edge (canvas
 * right) of a card, edged in the rarity color. Absolute; draw it *after* the
 * face so it always reads. `h` is the card height, `inset` the frame margin. */
export function RarityRibbon(props: {
  rarity: Rarity
  stars: number
  h: number
  inset: number
  band: number
  starW: number
}) {
  const glow = rarityGlow(props.rarity)
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: props.inset, right: props.inset },
        width: props.band,
        height: props.h - props.inset * 2,
        flexDirection: 'column-reverse',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: Color4.create(glow.r, glow.g, glow.b, 0.85),
        borderRadius: 4,
        ...PASS
      }}
      uiBackground={{ color: Color4.create(0.05, 0.03, 0.03, 0.78) }}
    >
      <Stars count={props.stars} w={props.starW} />
    </UiEntity>
  )
}

/** "LV n" for another player (lobbies, trade, gift list, roster). Hidden while
 * the server hasn't published their level yet (0). */
export function LevelBadge(props: { level: number; w?: number; tint?: Color4; key?: string | number }) {
  if (props.level <= 0) return null
  const w = props.w ?? 11
  return (
    <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', ...PASS }}>
      <Img k="lv" w={w} tint={props.tint ?? xpBlue} margin={1} />
      <Digits value={props.level} w={w + 2} tint={props.tint ?? xpBlue} tight />
    </UiEntity>
  )
}

/** Party-seat / party-seat-empty frame + absolute Face + optional NameTag. */
export function SeatCard(props: {
  empty: boolean
  h: number
  faceId?: string
  face: number
  faceLeft: number
  faceFallback?: number
  name?: string
  nameW?: number
  nameLeft?: number
  nameBox?: number
  /** Lays the gold SelectFrame over the card. */
  selected?: boolean
  frameTint?: Color4
  onTap?: () => void
  /** Drawn beneath the face (e.g. RarityAura); `children` draw over it. */
  under?: ReactEcs.JSX.Component[] | ReactEcs.JSX.Component
  children?: ReactEcs.JSX.Component[] | ReactEcs.JSX.Component
}) {
  const frame = LABELS[props.empty ? 'party-seat-empty' : 'party-seat']
  if (!frame) return null
  const w = Math.round((props.h * frame.w) / frame.h)
  const inner = (
    <UiEntity
      uiTransform={{ width: w, height: props.h }}
      uiBackground={{
        textureMode: 'stretch',
        texture: { src: frame.src },
        uvs: frame.uvs,
        color: props.frameTint ?? Color4.White()
      }}
    >
      {props.under}
      {props.faceId ? (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { left: props.faceLeft, top: Math.round((props.h - props.face) / 2) },
            width: props.face,
            height: props.face,
            pointerFilter: 'none'
          }}
        >
          <Face id={props.faceId} w="100%" h="100%" fallback={props.faceFallback} />
        </UiEntity>
      ) : null}
      {props.name ? (
        // name glyphs over the baked banner (physical top of the card)
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { left: props.nameLeft ?? 0, top: 0 },
            width: props.nameBox ?? 22,
            height: '100%',
            alignItems: 'center',
            justifyContent: 'center',
            pointerFilter: 'none'
          }}
        >
          <NameTag name={props.name} w={props.nameW ?? 9} tint={gold} />
        </UiEntity>
      ) : null}
      {props.children}
      {props.selected ? <SelectFrame w={w} h={props.h} reach={8} /> : null}
    </UiEntity>
  )
  return (
    <UiEntity
      uiTransform={{
        width: w + 8,
        height: props.h + 8,
        margin: 3,
        alignItems: 'center',
        justifyContent: 'center'
      }}
      onMouseDown={props.onTap}
    >
      {inner}
    </UiEntity>
  )
}

/** Warm gold plate for primary actions (CLAIM, JOIN, PLAY AGAIN). */
export const btnGold = Color4.create(0.34, 0.21, 0.07, 0.92)
/** Neutral dark plate for secondary actions (LEAVE, CANCEL). */
export const btnDark = Color4.create(0.1, 0.07, 0.08, 0.85)

/** A word-label button: a flat plate `w`x`h` (canvas units) carrying a label
 * strip, with the shared press shrink/dim. `disabled` greys it out and eats
 * the tap. Plates are laid out like any other box: for a button that reads
 * physically wide, make `h` the long side (the strip runs along canvas y). */
export function LabelBtn(props: {
  k: string
  id: string
  w: number
  h: number
  labelW: number
  bg?: Color4
  labelTint?: Color4
  disabled?: boolean
  margin?: number | { top?: number; bottom?: number; left?: number; right?: number }
  onTap?: () => void
}) {
  const id = `lbl:${props.id}`
  const shrink = pressShrink(id, props.w)
  const bg = props.disabled ? Color4.create(0.1, 0.07, 0.08, 0.5) : (props.bg ?? btnGold)
  const tint = props.disabled ? muted : (props.labelTint ?? cream)
  return (
    <UiEntity
      uiTransform={{
        width: props.w,
        height: props.h,
        margin: props.margin ?? 4,
        alignItems: 'center',
        justifyContent: 'center'
      }}
      onMouseDown={props.disabled || !props.onTap ? undefined : press(id, tap(props.onTap))}
    >
      <UiEntity
        uiTransform={{
          width: props.w - shrink,
          height: props.h - Math.round((shrink * props.h) / props.w),
          alignItems: 'center',
          justifyContent: 'center',
          pointerFilter: 'none'
        }}
        uiBackground={{ color: pressTint(id, bg) }}
      >
        <Img k={props.k} w={props.labelW} tint={tint} margin={0} />
      </UiEntity>
    </UiEntity>
  )
}

export function SlashCount(props: {
  at: number
  of: number
  w: number
  slashW: number
  atTint: Color4
  ofTint: Color4
  slashTint?: Color4
  margin?: number | { left?: number }
}) {
  return (
    <UiEntity
      uiTransform={
        props.margin !== undefined
          ? { flexDirection: 'column-reverse', alignItems: 'center', margin: props.margin }
          : { flexDirection: 'column-reverse', alignItems: 'center' }
      }
    >
      <Digits value={props.at} w={props.w} tint={props.atTint} tight />
      <Img k="road-slash" w={props.slashW} tint={props.slashTint ?? props.atTint} margin={2} />
      <Digits value={props.of} w={props.w} tint={props.ofTint} tight />
    </UiEntity>
  )
}
