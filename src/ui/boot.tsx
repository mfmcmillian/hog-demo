import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { tap } from '../game/audio'
import { boot, enterGame } from '../game/boot'
import { press, pressShrink, pressTint } from './fx/press'
import { LABELS } from './labels.gen'
import { ink, PASS } from './theme'
import { Backdrop, Digits } from './widgets'

// ---- boot ---------------------------------------------------------------------
// Runic gold ring (texture) with eight ember dots chasing around its band and
// the live load percent in the middle. DCL UI has no rotation transform, so the
// spin is faked with per-dot alpha phase.
function Spinner(props: { size: number; tint: Color4; fade: Color4; percent: number }) {
  const n = 8
  const s = props.size
  const dot = Math.max(6, Math.round(s * 0.1))
  // dots ride the dark band of the ring art (band radius = 118/320 of the image)
  const r = s * (118 / 320)
  const t = (Date.now() % 900) / 900
  const dots: ReactEcs.JSX.Element[] = []
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2
    const phase = (1 + i / n - t) % 1
    const a = 0.1 + 0.9 * (1 - phase)
    dots.push(
      <UiEntity
        key={i}
        uiTransform={{
          positionType: 'absolute',
          position: {
            top: Math.round(s / 2 + Math.sin(ang) * r - dot / 2),
            left: Math.round(s / 2 + Math.cos(ang) * r - dot / 2)
          },
          width: dot,
          height: dot
        }}
        uiBackground={{
          color: Color4.create(props.tint.r, props.tint.g, props.tint.b, a)
        }}
      />
    )
  }
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: (540 - s) / 2, left: -(s + 18) },
        width: s,
        height: s,
        alignItems: 'center',
        justifyContent: 'center',
        ...PASS
      }}
    >
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { top: 0, left: 0 },
          width: s,
          height: s
        }}
        uiBackground={{
          textureMode: 'stretch',
          texture: { src: 'images/boot/spin-ring-a.png' },
          color: props.fade
        }}
      />
      {dots}
      <Digits value={props.percent} w={20} tint={props.tint} tight={true} />
    </UiEntity>
  )
}

// Eased display progress so the bar glides instead of jumping chunk to chunk.
let shownFrac = 0
let shownTick = 0

// Unbound textures render as the tint color (white), so hold the art at black
// until its file has landed, then fade up. Kills the white flash at boot.
function artFade() {
  return boot.artAt ? Math.min(1, (Date.now() - boot.artAt) / 500) : 0
}

/** Full-bleed ink + keyart on the real canvas, behind the stage-pinned boot UI. */
export function LoadingBackdrop() {
  const fade = artFade()
  const artTint = Color4.create(fade, fade, fade, 1)
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 0, left: 0 },
        width: '100%',
        height: '100%'
      }}
      uiBackground={{ color: ink }}
    >
      {Backdrop({ label: 'boot-keyart', tint: artTint, dim: 0.34, veilPass: false })}
    </UiEntity>
  )
}

export function LoadingScreen() {
  // Real fetch progress, capped by the minimum-hold ramp: locally everything is
  // cached so raw progress is instantly 100%; the gate keeps the bar sweeping.
  const rawFrac = boot.total > 0 ? boot.loaded / boot.total : 0
  const frac = Math.min(rawFrac, boot.gate)
  const now = Date.now()
  const dt = Math.min(0.1, (now - (shownTick || now)) / 1000)
  shownTick = now
  shownFrac += (frac - shownFrac) * Math.min(1, dt * 9)
  const logo = LABELS['boot-logo']
  const startBtn = LABELS['boot-start']
  const ember = Color4.create(0.96, 0.72, 0.28, 1)
  const fade = artFade()
  const artTint = Color4.create(fade, fade, fade, 1)
  // Positioned boot furniture in stage coordinates (the backdrop is separate,
  // full-bleed, in LoadingBackdrop). PASS so taps reach only the start button.
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 0, left: 0 },
        width: '100%',
        height: '100%',
        ...PASS
      }}
    >
      {logo ? (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 70, left: 150 },
            width: 300,
            height: 600
          }}
          uiBackground={{
            textureMode: 'stretch',
            texture: { src: logo.src },
            uvs: logo.uvs,
            color: artTint
          }}
        />
      ) : null}
      {boot.filled && startBtn ? (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 160, left: 1180 },
            width: 150,
            height: 400,
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onMouseDown={press(
            'boot:start',
            tap(() => enterGame())
          )}
        >
          <UiEntity
            uiTransform={{
              width: 150 - pressShrink('boot:start', 150),
              height: 400 - pressShrink('boot:start', 400),
              pointerFilter: 'none'
            }}
            uiBackground={{
              textureMode: 'stretch',
              texture: { src: startBtn.src },
              uvs: startBtn.uvs,
              color: pressTint('boot:start')
            }}
          />
        </UiEntity>
      ) : (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 90, left: 1252 },
            width: 96,
            height: 540,
            ...PASS
          }}
        >
          <UiEntity
            uiTransform={{
              positionType: 'absolute',
              position: { top: 0, left: 16 },
              width: 64,
              height: 540
            }}
            uiBackground={{
              textureMode: 'stretch',
              texture: { src: 'images/boot/bar-frame-a.png' },
              color: artTint
            }}
          />
          {(() => {
            // frame art has a 16-virtual-px inset to its glass track
            const trackH = 540 - 32
            const hFill = Math.max(0, Math.min(trackH, Math.round(shownFrac * trackH)))
            const tipY = 16 + (trackH - hFill)
            const pulse = 0.62 + 0.38 * Math.sin(Date.now() / 160)
            return (
              <UiEntity uiTransform={{ width: '100%', height: '100%', ...PASS }}>
                {hFill > 2 ? (
                  <UiEntity
                    uiTransform={{
                      positionType: 'absolute',
                      position: { top: tipY, left: 32 },
                      width: 32,
                      height: hFill
                    }}
                    uiBackground={{
                      textureMode: 'stretch',
                      texture: { src: 'images/boot/bar-fill-a.png' },
                      color: artTint
                    }}
                  />
                ) : null}
                <UiEntity
                  uiTransform={{
                    positionType: 'absolute',
                    position: { top: tipY - 28, left: 20 },
                    width: 56,
                    height: 56
                  }}
                  uiBackground={{
                    textureMode: 'stretch',
                    texture: { src: 'images/boot/bar-head-a.png' },
                    color: Color4.create(1, 1, 1, pulse * fade)
                  }}
                />
              </UiEntity>
            )
          })()}
          <Spinner size={120} tint={ember} fade={artTint} percent={Math.round(shownFrac * 100)} />
        </UiEntity>
      )}
      {boot.filled && LABELS['version'] ? (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 328, left: 1340 },
            width: 22,
            height: 64
          }}
          uiBackground={{
            textureMode: 'stretch',
            texture: { src: LABELS['version'].src },
            color: Color4.create(1, 1, 1, 0.55)
          }}
        />
      ) : null}
    </UiEntity>
  )
}

// Solid black cover over the whole screen at boot; holds until the boot art has
// downloaded, then dissolves. Gives the fade-from-black entry instead of any flash.
export function BootFade() {
  // Long enough to outlast the explorer's own loading curtain, so the player
  // actually sees the tail of the fade when the scene is revealed.
  const HOLD_MS = 600
  const FADE_MS = 1800
  const since = boot.artAt ? Date.now() - boot.artAt - HOLD_MS : 0
  const alpha = boot.artAt ? 1 - Math.min(1, Math.max(0, since) / FADE_MS) : 1
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
