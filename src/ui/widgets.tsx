import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { tap } from '../game/audio'
import { game } from '../game/store'
import { idlePoster, sparksSheet, starBurstFx } from './flipbook'
import { press, pressAmt, pressShrink, pressTint } from './fx/press'
import { LABELS } from './labels.gen'
import { cream, gold, ink, muted, PASS } from './theme'

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
  /** Prefer the standalone 1024px portrait over the sheet's 512px idle cell.
   * For big draws (hero card at 560 units) the sheet cell blurs; small faces
   * should stay on the sheet, which is already bound for battle anyway. */
  hi?: boolean
}) {
  const sheet = props.hi ? null : idlePoster(props.id)
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

/** Icon button. `hit` grows the tappable box past the icon (negative margins
 * keep the flex footprint at `w`, so layouts don't shift) — mobile thumbs need
 * ~84 stage units to make the 44pt touch-target minimum. */
export function CardBtn(props: { k: string; w: number; hit?: number; onTap?: () => void }) {
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
      <Img k={props.k} w={props.w - pressShrink(id, props.w)} tint={pressTint(id)} margin={0} />
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

/** Gold glow wrap + party-tile frame. Omit `wrap` for a bare framed tile (NFT teasers). */
export function PartyTile(props: {
  w: number
  wrap?: number
  margin?: number
  glow?: Color4
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
      uiBackground={{ color: props.glow ?? Color4.create(0, 0, 0, 0) }}
      onMouseDown={props.onTap}
    >
      {tile}
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
  glow?: Color4
  frameTint?: Color4
  onTap?: () => void
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
    </UiEntity>
  )
  const wrap = {
    width: w + 8,
    height: props.h + 8,
    margin: 3,
    alignItems: 'center' as const,
    justifyContent: 'center' as const
  }
  if (props.glow !== undefined) {
    return (
      <UiEntity uiTransform={wrap} uiBackground={{ color: props.glow }} onMouseDown={props.onTap}>
        {inner}
      </UiEntity>
    )
  }
  return (
    <UiEntity uiTransform={wrap} onMouseDown={props.onTap}>
      {inner}
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
