import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { tap } from '../game/audio'
import { game } from '../game/store'
import { advanceTip, TIPS } from '../game/tutorial'
import { villagerSheet, villagerTalkUvs } from './flipbook'
import './labels.tut.gen'
import { ModalScrim, TalkPanel } from './panels'
import { cream, gold, muted } from './theme'
import { Img, SlashCount } from './widgets'

// First-press tutorial overlay: the screen underneath stays visible but dims,
// the elder's quest dialog explains it page by page, and an animated pointer
// (ported from Antrom3's TutorialPointer) hovers over the element the page is
// talking about. Tap anywhere to advance; the last tap dismisses.

/** Pointers are parked for now; flip on to aim the cluster per TIPS page. */
const POINTERS_ON = false

const POINTER_SHEET = 'images/hud/tut-pointer.png'
const RING_TEX = 'images/hud/tut-ring.png'
const POINTER_FRAME_MS = 110

function pointerUvs(): number[] {
  const frame = Math.floor(Date.now() / POINTER_FRAME_MS) % 9
  const col = frame % 3
  const row = Math.floor(frame / 3)
  const u0 = col / 3
  const u1 = (col + 1) / 3
  const v0 = 1 - (row + 1) / 3
  const v1 = 1 - row / 3
  return [u0, v0, u0, v1, u1, v1, u1, v0]
}

/**
 * Bobbing cursor + expanding ripple ring + pulsing halo, all Date.now-driven
 * (the UI redraws every frame). No mouse handlers anywhere, so taps fall
 * through to the scrim and still advance the dialog. The cursor sheet is
 * pre-rotated like every other hog asset, so its tip sits at the lower-left
 * of the quad in landscape (upper-left in the portrait grip).
 *
 * The cursor tip lands 13px right and 66px down from the given position, so
 * to aim at a point, anchor at (x - 13, y - 66). Exported for one-off uses
 * outside the tip overlay (the home GO-button pointer).
 */
export function TutPointer(props: { left: number | `${number}%`; top: number | `${number}%` }) {
  const t = (Date.now() % 1000) / 1000
  const ringPx = 40 + t * 84
  const ringAlpha = (1 - t) * 0.85
  const haloPulse = 0.5 + 0.5 * Math.sin(Date.now() / 520)
  const haloPx = 130 + haloPulse * 36
  const haloAlpha = 0.22 + haloPulse * 0.18
  const bob = Math.sin(Date.now() / 240) * 5

  const cursorPx = 84
  // Rotated cursor tip: ~16% in from the landscape left, ~79% down the quad.
  const tipX = cursorPx * 0.16
  const tipY = cursorPx * 0.79

  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { left: props.left, top: props.top },
        width: 230,
        height: 190,
        pointerFilter: 'none'
      }}
    >
      {/* soft pulsing halo centered on the cursor tip */}
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { top: tipY - haloPx / 2, left: tipX - haloPx / 2 },
          width: haloPx,
          height: haloPx,
          pointerFilter: 'none'
        }}
        uiBackground={{
          textureMode: 'stretch',
          texture: { src: RING_TEX },
          color: Color4.create(1, 0.78, 0.3, haloAlpha)
        }}
      />
      {/* expanding ripple ring centered on the cursor tip */}
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { top: tipY - ringPx / 2, left: tipX - ringPx / 2 },
          width: ringPx,
          height: ringPx,
          pointerFilter: 'none'
        }}
        uiBackground={{
          textureMode: 'stretch',
          texture: { src: RING_TEX },
          color: Color4.create(1, 0.86, 0.4, ringAlpha)
        }}
      />
      {/* animated cursor, bobbing along its pointing axis */}
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { top: bob, left: bob },
          width: cursorPx,
          height: cursorPx,
          pointerFilter: 'none'
        }}
        uiBackground={{ textureMode: 'stretch', texture: { src: POINTER_SHEET }, uvs: pointerUvs() }}
      />
    </UiEntity>
  )
}

export function TutorialOverlay() {
  if (!game.tutTip) return null
  const pages = TIPS[game.tutTip]
  const page = pages[Math.min(game.tutPage, pages.length - 1)]
  const next = tap(() => advanceTip())
  // "tap to continue" breathes so the next step is obvious
  const hintAlpha = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(Date.now() / 400))
  return (
    <ModalScrim alpha={0.72} onMouseDown={next}>
      {/* dialog band in the home party-strip slot: lower third of the phone */}
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { left: '64%', top: 0 },
          width: 300,
          height: '100%'
        }}
      >
        <TalkPanel width="100%" height="100%" onMouseDown={next}>
          {/* framed elder portrait, phone-left (same chrome as FireTalk) */}
          <UiEntity
            uiTransform={{
              width: 156,
              height: 156,
              margin: { bottom: 14 },
              alignItems: 'center',
              justifyContent: 'center',
              pointerFilter: 'none'
            }}
            uiBackground={{ color: Color4.create(0.62, 0.46, 0.2, 1) }}
          >
            <UiEntity
              uiTransform={{
                width: 148,
                height: 148,
                alignItems: 'center',
                justifyContent: 'center',
                pointerFilter: 'none'
              }}
              uiBackground={{ color: Color4.create(0.09, 0.07, 0.06, 1) }}
            >
              <UiEntity
                uiTransform={{ width: 140, height: 140, pointerFilter: 'none' }}
                uiBackground={{
                  textureMode: 'stretch',
                  texture: { src: villagerSheet() },
                  uvs: villagerTalkUvs(),
                  color: Color4.White()
                }}
              />
            </UiEntity>
          </UiEntity>
          {/* the page's lines, phone-right of the portrait */}
          <UiEntity
            uiTransform={{
              flexGrow: 1,
              width: '100%',
              flexDirection: 'row',
              alignItems: 'flex-end',
              justifyContent: 'center',
              padding: { bottom: 20, left: 10, right: 10 },
              pointerFilter: 'none'
            }}
          >
            {page.lines.map((k, i) => (
              <Img key={i} k={k} w={21} tint={cream} margin={5} />
            ))}
            {/* footer: page count + breathing continue hint */}
            <UiEntity
              uiTransform={{
                flexDirection: 'column-reverse',
                alignItems: 'center',
                justifyContent: 'center',
                margin: { left: 8 },
                pointerFilter: 'none'
              }}
            >
              {pages.length > 1 ? (
                <SlashCount at={game.tutPage + 1} of={pages.length} w={16} slashW={13} atTint={gold} ofTint={muted} />
              ) : null}
              <UiEntity uiTransform={{ height: 14, pointerFilter: 'none' }} />
              <Img k="tut-continue" w={14} tint={Color4.create(gold.r, gold.g, gold.b, hintAlpha)} margin={0} />
            </UiEntity>
          </UiEntity>
        </TalkPanel>
      </UiEntity>
      {POINTERS_ON && page.pointer ? <TutPointer left={page.pointer.left} top={page.pointer.top} /> : null}
    </ModalScrim>
  )
}
