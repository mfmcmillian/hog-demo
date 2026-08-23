import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { tap } from '../game/audio'
import { endCredits } from '../game/intro'
import { game } from '../game/store'
import './labels.credits.gen'
import { LABELS } from './labels.gen'
import { cream, gold, muted } from './theme'
import { Backdrop, Face, Img } from './widgets'

// ---- credits roll -----------------------------------------------------------------
// Logo strolls up first and parks in the home-page GameLogo slot (left: -185,
// past the chrome inset). Then the name crawl enters from the phone bottom
// and is culled at the inner lip of the screen frame — DCL has no overflow
// clip, so cells that would cross that lip are simply not drawn.

const WARLORDS = ['moor-ogre', 'thorn-queen', 'crimson-abbot', 'ashen-regent']

/** Same wrapper as GameLogo on the home screen. */
const LOGO_PARK_LEFT = -185
const LOGO_BOX_W = 170
const LOGO_W = 160
const LOGO_H = 320
/** Enter from just past the phone-bottom (canvas right) of the chrome well. */
const LOGO_START_LEFT = 980
const LOGO_SECS = 2.4

/** Inner-frame lip: cells at or left of this would draw over the bezel. */
const FRAME_LIP = 8
const VIEW_RIGHT = 1400
const ROLL_START = 1180
const ROLL_SPEED = 90
const ROLL_DELAY = LOGO_SECS + 0.35
const HOLD_SECS = 1.8

type Cell =
  | { kind: 'gap'; w: number }
  | { kind: 'cast'; w: number }
  | { kind: 'line'; k: string; h: number; tint: Color4; w: number }

function line(k: string, h: number, tint: Color4): Cell {
  return { kind: 'line', k, h, tint, w: h + 22 }
}

const ROLL: Cell[] = [
  { kind: 'gap', w: 50 },
  line('credits-created', 20, muted),
  line('credits-matt', 40, gold),
  { kind: 'gap', w: 70 },
  line('credits-role', 20, muted),
  line('credits-matt', 30, cream),
  { kind: 'gap', w: 70 },
  line('credits-voice', 20, muted),
  line('credits-eleven', 28, cream),
  { kind: 'gap', w: 70 },
  line('credits-art', 20, muted),
  line('credits-art2', 24, cream),
  { kind: 'gap', w: 70 },
  line('credits-built', 20, muted),
  line('credits-sdk', 26, cream),
  { kind: 'gap', w: 70 },
  line('credits-for', 20, muted),
  line('credits-regenesis', 30, gold),
  line('credits-buildathon', 26, gold),
  { kind: 'gap', w: 100 },
  line('credits-starring', 20, muted),
  line('credits-warlords', 24, cream),
  { kind: 'gap', w: 16 },
  { kind: 'cast', w: 130 },
  { kind: 'gap', w: 100 },
  line('credits-tale', 24, cream),
  line('credits-thanks', 30, gold),
  { kind: 'gap', w: 60 },
  line('credits-fire', 24, cream),
  { kind: 'gap', w: 50 }
]

const CONTENT_W = ROLL.reduce((sum, cell) => sum + cell.w, 0)
const ROLL_EXIT = ROLL_DELAY + (ROLL_START + CONTENT_W - FRAME_LIP) / ROLL_SPEED

function easeOut(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return 1 - (1 - x) * (1 - x) * (1 - x)
}

function logoLeft(elapsed: number): number {
  const t = easeOut(elapsed / LOGO_SECS)
  return Math.round(LOGO_START_LEFT + (LOGO_PARK_LEFT - LOGO_START_LEFT) * t)
}

function CellView(props: { cell: Cell; left: number; key?: number }) {
  const cell = props.cell
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { left: props.left, top: 0 },
        width: cell.w,
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: cell.kind === 'cast' ? 'column-reverse' : 'row',
        pointerFilter: 'none'
      }}
    >
      {cell.kind === 'line' ? <Img k={cell.k} w={cell.h} tint={cell.tint} margin={0} /> : null}
      {cell.kind === 'cast'
        ? WARLORDS.map((id) => (
            <UiEntity key={id} uiTransform={{ width: 104, height: 104, margin: 5, pointerFilter: 'none' }}>
              <Face id={id} w={104} h={104} />
            </UiEntity>
          ))
        : null}
    </UiEntity>
  )
}

function CreditRoll(props: { elapsed: number }) {
  const rollElapsed = Math.max(0, props.elapsed - ROLL_DELAY)
  const origin = Math.round(ROLL_START - ROLL_SPEED * rollElapsed)
  const nodes = [] as { cell: Cell; left: number; key: number }[]
  let x = origin
  for (let i = 0; i < ROLL.length; i++) {
    const cell = ROLL[i]
    const left = x
    x += cell.w
    // Hide anything that would cross the frame lip or is still off the bottom.
    if (cell.kind === 'gap') continue
    if (left < FRAME_LIP || left >= VIEW_RIGHT) continue
    nodes.push({ cell, left, key: i })
  }
  return (
    <UiEntity uiTransform={{ width: '100%', height: '100%', pointerFilter: 'none' }}>
      {nodes.map((node) => (
        <CellView key={node.key} cell={node.cell} left={node.left} />
      ))}
    </UiEntity>
  )
}

function ParkedLogo(props: { elapsed: number }) {
  const src = LABELS['boot-logo']?.src
  if (!src) return null
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { left: logoLeft(props.elapsed), top: 0 },
        width: LOGO_BOX_W,
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        pointerFilter: 'none'
      }}
    >
      <UiEntity
        uiTransform={{ width: LOGO_W, height: LOGO_H, pointerFilter: 'none' }}
        uiBackground={{ textureMode: 'stretch', texture: { src }, color: Color4.White() }}
      />
    </UiEntity>
  )
}

export function CreditsScreen() {
  if (!game.creditsAt) game.creditsAt = Date.now()
  const elapsed = Math.max(0, (Date.now() - game.creditsAt) / 1000)
  if (elapsed > ROLL_EXIT + HOLD_SECS && Date.now() - game.creditsAt >= 800) {
    endCredits()
    return null
  }
  return (
    <UiEntity uiTransform={{ width: '100%', height: '100%' }} onMouseDown={tap(() => endCredits())}>
      {Backdrop({ src: 'images/story/story-epilogue-2.png', dim: 0.8, pass: true })}
      <CreditRoll elapsed={elapsed} />
      <ParkedLogo elapsed={elapsed} />
    </UiEntity>
  )
}
