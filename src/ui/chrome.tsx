import { InputAction, inputSystem } from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { ScreenInsetArea, UiEntity } from '@dcl/sdk/react-ecs'
import { DEBUG } from '../game/debug'
import { back, primary, shiftFromPad } from '../game/nav'
import { owPadDir, setPadDir, type OwDir } from '../game/overworld'
import { game } from '../game/store'
import { backPointerShowing } from '../game/tutorial'
import { canvasV } from './canvas'
import { revealReady } from './flipbook'
import { press, pressShrink, pressTint } from './fx/press'
import { LABELS } from './labels.gen'
import { bindSrcs } from './preload'
import { PASS, STAGE_H, STAGE_W } from './theme'
import { TutPointer } from './tutorial'
import { CardBtn, Img } from './widgets'

let padFlash = ''
let padFlashUntil = 0

/** In the overworld the pad is hold-to-walk; elsewhere a tap shifts menus. */
function padDown(dir: OwDir) {
  padFlash = dir
  padFlashUntil = Date.now() + 220
  if (game.phase === 'overworld') {
    setPadDir(dir)
    return
  }
  shiftFromPad(dir === 'right' || dir === 'down' ? 1 : -1)
}

/** Finger slid onto another quadrant while still pressed: switch direction. */
function padDrag(dir: OwDir) {
  if (game.phase !== 'overworld') return
  if (!inputSystem.isPressed(InputAction.IA_POINTER)) return
  padFlash = dir
  padFlashUntil = Date.now() + 220
  setPadDir(dir)
}

function padUp() {
  if (game.phase === 'overworld') setPadDir('')
}

const PAD = 236
const HUD_BTN = 140
const PAD_HIT = Math.round(PAD * 0.35)
const PAD_EDGE = Math.round(PAD * 0.04)
const PAD_MID = Math.round((PAD - PAD_HIT) / 2)

function PadHit(props: { dir: OwDir; top: number; left: number }) {
  const lit = owPadDir() === props.dir || (padFlash === props.dir && Date.now() < padFlashUntil)
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: props.top, left: props.left },
        width: PAD_HIT,
        height: PAD_HIT
      }}
      uiBackground={{ color: lit ? Color4.create(0.82, 0.62, 0.28, 0.42) : Color4.create(0, 0, 0, 0.02) }}
      onMouseDown={() => padDown(props.dir)}
      onMouseEnter={() => padDrag(props.dir)}
      onMouseUp={() => padUp()}
    />
  )
}

/** `ghost`: the overworld pad sits over the painting, so the disc is mostly
 * see-through at rest and firms up only while a direction is held. */
function Dpad(props: { ghost?: boolean } = {}) {
  const disc = LABELS['pad-disc']
  const held = owPadDir() !== ''
  const alpha = props.ghost ? (held ? 0.7 : 0.38) : 1
  return (
    <UiEntity uiTransform={{ width: PAD, height: PAD }}>
      {disc ? (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 0, left: 0 },
            width: PAD,
            height: PAD,
            pointerFilter: 'none'
          }}
          uiBackground={{
            textureMode: 'stretch',
            texture: { src: disc.src },
            uvs: disc.uvs,
            color: Color4.create(1, 1, 1, alpha)
          }}
        />
      ) : null}
      <PadHit dir="right" top={PAD_EDGE} left={PAD_MID} />
      <PadHit dir="up" top={PAD_MID} left={PAD_EDGE} />
      <PadHit dir="down" top={PAD_MID} left={PAD - PAD_HIT - PAD_EDGE} />
      <PadHit dir="left" top={PAD - PAD_HIT - PAD_EDGE} left={PAD_MID} />
    </UiEntity>
  )
}

/** Walking pad for the overworld: same spot PlayHud anchors its pad, shown
 * even while the full HUD stays off. */
export function OverworldHud() {
  if (game.phase !== 'overworld') return null
  return (
    <ScreenInsetArea uiTransform={PASS}>
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { top: '4%', right: '1%' },
          width: 268,
          height: '82%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: { top: 4 }
        }}
      >
        <Dpad ghost />
      </UiEntity>
    </ScreenInsetArea>
  )
}

function HudBtn(props: { k: string; onTap: () => void }) {
  // `hud:` prefix keeps PlayHud's back button distinct from MenuBack's.
  const id = `hud:${props.k}`
  return (
    <UiEntity
      uiTransform={{
        width: HUD_BTN,
        height: HUD_BTN,
        alignItems: 'center',
        justifyContent: 'center'
      }}
      onMouseDown={press(id, props.onTap)}
    >
      <Img k={props.k} w={HUD_BTN - pressShrink(id, HUD_BTN)} tint={pressTint(id)} margin={0} />
    </UiEntity>
  )
}

export function PlayHud() {
  // Edge-anchored to the real canvas (not the stage) and kept inside the
  // hardware safe area so the pad clears the home-indicator edge.
  return (
    <ScreenInsetArea uiTransform={PASS}>
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { top: '4%', right: '1%' },
          width: 268,
          height: '82%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: { top: 4, bottom: 4 }
        }}
      >
        <Dpad />
        <HudBtn k="btn-back" onTap={() => back()} />
        <HudBtn k="btn-action" onTap={() => primary()} />
      </UiEntity>
    </ScreenInsetArea>
  )
}

function showsMenuBack() {
  if (game.phase === 'heroCard' && game.reveal && !revealReady()) return false
  switch (game.phase) {
    case 'start':
    case 'home':
    case 'battle':
    case 'banner':
    case 'report':
    case 'credits':
      return false
    default:
      return true
  }
}

function MenuBack() {
  if (!showsMenuBack()) return null
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { bottom: 18, left: 22 },
        width: 96,
        height: 96
      }}
    >
      <CardBtn k="btn-back" w={96} onTap={() => back()} />
      {/* onboarding: recruit seated, point home (tip lands 13,66 from anchor) */}
      {backPointerShowing() ? <TutPointer left={48 - 13} top={48 - 66} /> : null}
    </UiEntity>
  )
}

export function ScreenChrome(props: { children?: ReactEcs.JSX.Component[] | ReactEcs.JSX.Component }) {
  const frame = LABELS['screen-frame']
  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        ...PASS
      }}
    >
      <UiEntity uiTransform={{ width: '94%', height: '90%', ...PASS }}>{props.children}</UiEntity>
      {frame ? (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 0, left: 0 },
            width: '100%',
            height: '100%',
            pointerFilter: 'none'
          }}
          uiBackground={{
            textureMode: 'stretch',
            texture: { src: frame.src },
            uvs: frame.uvs,
            color: Color4.White()
          }}
        />
      ) : null}
      <MenuBack />
    </UiEntity>
  )
}

export function PreloadTiles() {
  // Bind only the current screen plus one tap away. Binding every sheet at
  // boot is what made phones fall over as the world grew.
  const srcs = bindSrcs()
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: -6, left: -6 },
        width: 2,
        height: 2
      }}
    >
      {srcs.map((src) => (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            width: 2,
            height: 2
          }}
          uiBackground={{
            textureMode: 'stretch',
            texture: { src },
            color: Color4.White()
          }}
        />
      ))}
    </UiEntity>
  )
}

// Quick dip-to-black on every phase change: the screen swap happens behind a
// black cover that then fades out, so cuts read as transitions and any late
// texture binds on the incoming screen are hidden.
let lastPhase = ''
let phaseAt = 0

export function PhaseFade() {
  if (game.phase !== lastPhase) {
    // First phase after boot arrives under BootFade; no extra dip for it.
    phaseAt = lastPhase === '' ? 0 : Date.now()
    lastPhase = game.phase
  }
  const FADE_MS = 400
  const alpha = phaseAt ? 1 - Math.min(1, (Date.now() - phaseAt) / FADE_MS) : 0
  if (alpha <= 0) return null
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 0, left: 0 },
        width: '100%',
        height: '100%',
        ...PASS
      }}
      uiBackground={{ color: Color4.create(0, 0, 0, alpha) }}
    />
  )
}

/** DEBUG.showCanvasInfo: live canvas / stage / safe-area numbers (plain
 * landscape text, dev-only) plus a gold outline of the fixed stage, to verify
 * responsive behavior at different window aspect ratios and on device. */
export function CanvasReadout() {
  if (!DEBUG.showCanvasInfo) return null
  const f = (n: number) => Math.round(n)
  const box = (r: { top: number; left: number; right: number; bottom: number }) =>
    `${f(r.top)}/${f(r.left)}/${f(r.right)}/${f(r.bottom)}`
  const text =
    `canvas ${canvasV.pxW}x${canvasV.pxH}px dpr ${canvasV.dpr}\n` +
    `virtual ${f(canvasV.w)}x${f(canvasV.h)} gutters ${f(canvasV.gutterX)},${f(canvasV.gutterY)}\n` +
    `inset t/l/r/b ${box(canvasV.inset)}\n` +
    `hud t/l/r/b ${box(canvasV.hud)}`
  return (
    <UiEntity
      uiTransform={{ width: '100%', height: '100%', positionType: 'absolute', position: { top: 0, left: 0 }, ...PASS }}
    >
      {/* stage outline: four gold hairlines around the centered 1600x720 box */}
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { top: canvasV.gutterY, left: canvasV.gutterX },
          width: STAGE_W,
          height: 2,
          ...PASS
        }}
        uiBackground={{ color: Color4.create(0.82, 0.62, 0.28, 0.9) }}
      />
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { top: canvasV.gutterY + STAGE_H - 2, left: canvasV.gutterX },
          width: STAGE_W,
          height: 2,
          ...PASS
        }}
        uiBackground={{ color: Color4.create(0.82, 0.62, 0.28, 0.9) }}
      />
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { top: canvasV.gutterY, left: canvasV.gutterX },
          width: 2,
          height: STAGE_H,
          ...PASS
        }}
        uiBackground={{ color: Color4.create(0.82, 0.62, 0.28, 0.9) }}
      />
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { top: canvasV.gutterY, left: canvasV.gutterX + STAGE_W - 2 },
          width: 2,
          height: STAGE_H,
          ...PASS
        }}
        uiBackground={{ color: Color4.create(0.82, 0.62, 0.28, 0.9) }}
      />
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { top: 6, left: 6 },
          width: 460,
          height: 110,
          padding: 8,
          ...PASS
        }}
        uiBackground={{ color: Color4.create(0, 0, 0, 0.72) }}
        uiText={{ value: text, fontSize: 16, textAlign: 'top-left' }}
      />
    </UiEntity>
  )
}

const AD_SRCS = ['images/ads/koa-c.png', 'images/ads/decentracraft-c.png']
const AD_ROTATE_MS = 8000

/** Fake 2010 mobile banner hugging the physical bottom (real canvas right
 * edge, whatever the device aspect). Deliberately NOT inset-wrapped: shifting
 * it inward would crowd the stage's right gutter (the party BENCH tab), and a
 * fake ad under the gesture bar is period-authentic anyway. */
export function AdBanner() {
  if (!DEBUG.showAds) return null
  const src = AD_SRCS[Math.floor(Date.now() / AD_ROTATE_MS) % AD_SRCS.length]
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { right: 0, top: 0 },
        width: 116,
        height: '100%',
        pointerFilter: 'none'
      }}
      uiBackground={{
        textureMode: 'stretch',
        texture: { src },
        color: Color4.White()
      }}
    />
  )
}
