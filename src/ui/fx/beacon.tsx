import { Color4 } from '@dcl/sdk/math'
import ReactEcs from '@dcl/sdk/react-ecs'
import { UiEntity } from '../ui'
import { loopSparksUvs } from './ambient'
import { sparksSheet } from './reveal'
import { getIdleTime } from './sheets'

// The quest beacon: the burst of light that marks the next place to go on the
// overworld. Its colour is baked into the textures (tools/gen-beacon.ps1) -
// the old version tinted a white sparks flipbook gold at runtime, and on the
// mobile explorer that tint got lost, so players saw a small white sparkle
// while the elder talked about "the light".

export const BEACON_SRC = 'images/hud/beacon.png'
export const BEACON_SHAFT_SRC = 'images/hud/beacon-shaft.png'

/**
 * A `size`x`size` box holding the breathing gold burst with animated glints
 * on top. `beacon` adds a soft shaft of light rising from it (physically up =
 * canvas -x) - the first-steps mode, until the elder has been met. Absolute
 * when `left`/`top` are given (centred on that box), else fills its parent.
 */
export function BeaconLight(props: { size: number; beacon?: boolean; left?: number; top?: number; key?: string }) {
  const t = getIdleTime()
  const breathe = 0.5 + 0.5 * Math.sin(t * 2.6)
  const bob = Math.sin(t * 2.2) * 4 // physically up/down = canvas left/right
  const size = props.size
  // the burst swells a touch and never dims below 0.85
  const burst = Math.round(size * (1.4 + 0.12 * breathe))
  const burstAlpha = 0.85 + 0.15 * breathe
  const glint = Math.round(size * 0.9)
  const shaftW = Math.round(size * 3.2)
  const shaftH = Math.round(size * 1.3)
  const abs = props.left !== undefined && props.top !== undefined
  return (
    <UiEntity
      uiTransform={{
        positionType: abs ? 'absolute' : 'relative',
        position: abs ? { left: props.left! - bob, top: props.top! } : undefined,
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        pointerFilter: 'none'
      }}
    >
      {props.beacon ? (
        // the shaft: ends at the tile's centre, fades as it rises
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { left: Math.round(size / 2) - shaftW, top: Math.round((size - shaftH) / 2) },
            width: shaftW,
            height: shaftH,
            pointerFilter: 'none'
          }}
          uiBackground={{
            textureMode: 'stretch',
            texture: { src: BEACON_SHAFT_SRC },
            color: Color4.create(1, 1, 1, 0.55 + 0.25 * breathe)
          }}
        />
      ) : null}
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { left: Math.round((size - burst) / 2), top: Math.round((size - burst) / 2) },
          width: burst,
          height: burst,
          pointerFilter: 'none'
        }}
        uiBackground={{
          textureMode: 'stretch',
          texture: { src: BEACON_SRC },
          color: Color4.create(1, 1, 1, burstAlpha)
        }}
      />
      {/* glints: the sparks flipbook, tinted deep gold so a lost tint still can't read white */}
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { left: Math.round((size - glint) / 2), top: Math.round((size - glint) / 2) },
          width: glint,
          height: glint,
          pointerFilter: 'none'
        }}
        uiBackground={{
          textureMode: 'stretch',
          texture: { src: sparksSheet() },
          uvs: loopSparksUvs(),
          color: Color4.create(1, 0.72, 0.25, 0.9)
        }}
      />
    </UiEntity>
  )
}
