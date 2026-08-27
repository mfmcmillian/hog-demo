import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { ScreenInsetArea, UiEntity } from '@dcl/sdk/react-ecs'
import { boot } from '../game/boot'
import { DEBUG } from '../game/debug'
import { back, primary, shiftFromPad } from '../game/nav'
import { game } from '../game/store'
import { backPointerShowing } from '../game/tutorial'
import { revealReady } from './flipbook'
import { LABELS } from './labels.gen'
import { CRITICAL_SRCS, PRELOAD_SRCS } from './preload'
import { PASS } from './theme'
import { TutPointer } from './tutorial'
import { CardBtn, Img } from './widgets'

let padFlash = ''
let padFlashUntil = 0

function tapPad(dir: string, delta: number) {
  padFlash = dir
  padFlashUntil = Date.now() + 220
  shiftFromPad(delta)
}

const PAD = 236
const HUD_BTN = 140
const PAD_HIT = Math.round(PAD * 0.35)
const PAD_EDGE = Math.round(PAD * 0.04)
const PAD_MID = Math.round((PAD - PAD_HIT) / 2)

function PadHit(props: { dir: string; top: number; left: number; onTap: () => void }) {
  const lit = padFlash === props.dir && Date.now() < padFlashUntil
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: props.top, left: props.left },
        width: PAD_HIT,
        height: PAD_HIT
      }}
      uiBackground={{ color: lit ? Color4.create(0.82, 0.62, 0.28, 0.42) : Color4.create(0, 0, 0, 0.02) }}
      onMouseDown={props.onTap}
    />
  )
}

function Dpad() {
  const disc = LABELS['pad-disc']
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
            color: Color4.White()
          }}
        />
      ) : null}
      <PadHit dir="right" top={PAD_EDGE} left={PAD_MID} onTap={() => tapPad('right', 1)} />
      <PadHit dir="up" top={PAD_MID} left={PAD_EDGE} onTap={() => tapPad('up', -1)} />
      <PadHit dir="down" top={PAD_MID} left={PAD - PAD_HIT - PAD_EDGE} onTap={() => tapPad('down', 1)} />
      <PadHit dir="left" top={PAD - PAD_HIT - PAD_EDGE} left={PAD_MID} onTap={() => tapPad('left', -1)} />
    </UiEntity>
  )
}

function HudBtn(props: { k: string; onTap: () => void }) {
  return (
    <UiEntity
      uiTransform={{
        width: HUD_BTN,
        height: HUD_BTN,
        alignItems: 'center',
        justifyContent: 'center'
      }}
      onMouseDown={props.onTap}
    >
      <Img k={props.k} w={HUD_BTN} tint={Color4.White()} margin={0} />
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
            color: Color4.White()
          }}
        />
      ) : null}
      <MenuBack />
    </UiEntity>
  )
}

export function PreloadTiles() {
  // During the boot bar only the critical set binds, so bandwidth goes to
  // what the start screen needs. Once the bar fills (player is reading the
  // oath screen) the rest of the tiles mount and warm the remaining sheets.
  const srcs = boot.filled ? PRELOAD_SRCS : CRITICAL_SRCS
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

const AD_SRCS = ['images/ads/koa-c.png', 'images/ads/decentracraft-c.png']
const AD_ROTATE_MS = 8000

/** Fake 2010 mobile banner hugging the physical bottom (real canvas right
 * edge, whatever the device aspect), inside the hardware safe area so it
 * clears the home indicator. */
export function AdBanner() {
  if (!DEBUG.showAds) return null
  const src = AD_SRCS[Math.floor(Date.now() / AD_ROTATE_MS) % AD_SRCS.length]
  return (
    <ScreenInsetArea uiTransform={PASS}>
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
    </ScreenInsetArea>
  )
}
