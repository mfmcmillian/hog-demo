import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { isNftHero } from '../game/familiars'
import { game } from '../game/store'
import { OwnedFamiliar } from '../game/types'
import { dropRaySheet, revealBurstSheet, sparksSheet } from './flipbook'
import { press, pressShrink, pressTint } from './fx/press'
import { LABELS, LabelInfo } from './labels.gen'
import { cream, gold, panelDim } from './theme'
import { Face, Img, NameTag, SlotChrome } from './widgets'

function tradeables(): OwnedFamiliar[] {
  // NFT wearable-gated heroes stay with the wearables - never on the table.
  return game.collection.filter((owned) => !owned.isHero && !isNftHero(owned.defId))
}

const PICK_WINDOW = 4
let pickShift = 0

/**
 * One entry per hero like the party bench - no dupe faces. Trade offers your
 * spare copy (lowest stars/level); the rift fields your best one.
 */
function pickerPool(withHero: boolean): OwnedFamiliar[] {
  const pool = withHero ? game.collection : tradeables()
  const byDef = new Map<string, OwnedFamiliar>()
  for (const owned of pool) {
    const kept = byDef.get(owned.defId)
    if (!kept) {
      byDef.set(owned.defId, owned)
      continue
    }
    const better = owned.stars !== kept.stars ? owned.stars > kept.stars : owned.level > kept.level
    // withHero = rift (keep the strongest copy); otherwise trade (keep the spare).
    if (withHero === better) byDef.set(owned.defId, owned)
  }
  return [...byDef.values()]
}

/** Physical bottom strip of party-bench style hero tiles; tap = pick, arrows page. */
export function HeroPickStrip(props: {
  hint: string
  selectedUid?: string
  onPick: (uid: string) => void
  withHero?: boolean
}) {
  const pool = pickerPool(props.withHero === true)
  const maxShift = Math.max(0, pool.length - PICK_WINDOW)
  if (pickShift > maxShift) pickShift = maxShift
  if (pickShift < 0) pickShift = 0
  const cards = pool.slice(pickShift, pickShift + PICK_WINDOW)
  const canPage = pool.length > PICK_WINDOW
  return (
    <UiEntity uiTransform={{ height: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
      <UiEntity uiTransform={{ width: 26, height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <Img k={props.hint} w={18} tint={gold} margin={0} />
      </UiEntity>
      <PagedColumn
        show={canPage}
        leftK="sel-arrow-left"
        rightK="sel-arrow-right"
        boxW={52}
        boxH={52}
        imgW={48}
        leftTint={pickShift > 0 ? Color4.White() : Color4.create(1, 1, 1, 0.3)}
        rightTint={pickShift < maxShift ? Color4.White() : Color4.create(1, 1, 1, 0.3)}
        onLeft={() => (pickShift -= 1)}
        onRight={() => (pickShift += 1)}
      >
        {cards.map((owned) => {
          const lit = owned.uid === props.selectedUid
          return (
            <SlotChrome
              key={owned.uid}
              pid={owned.uid}
              size={lit ? 148 : 132}
              lit={lit}
              onTap={() => props.onPick(owned.uid)}
            >
              <Face id={owned.defId} w="100%" h="100%" fallback={28} />
            </SlotChrome>
          )
        })}
      </PagedColumn>
    </UiEntity>
  )
}

type ChestFxView = {
  jx: number
  jy: number
  grow: number
  glow: number
  flash: number
  swirlUvs: number[]
  raysAlpha: number
  raysUvs: number[]
  sparks: boolean
  sparksUvs: number[]
  chestUvs: number[]
}

/** Layered chest ceremony: swirl glow → rays → lid sheet → sparks → white flash. */
export function ChestStage(props: {
  fx: ChestFxView
  stage: number
  margin: number
  light: Color4
  chestSrc?: string
  chestUvs?: number[]
  chestSize?: number
}) {
  const fx = props.fx
  const stage = props.stage
  const light = props.light
  const chestSize = props.chestSize ?? stage + fx.grow
  const chestOff = Math.round((stage - chestSize) / 2)
  return (
    <UiEntity uiTransform={{ width: stage, height: stage, margin: props.margin }}>
      {/* light rays wheel behind the crate at the burst */}
      {fx.raysAlpha > 0 ? (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { left: -35, top: -35 },
            width: stage + 70,
            height: stage + 70,
            pointerFilter: 'none'
          }}
          uiBackground={{
            textureMode: 'stretch',
            texture: { src: dropRaySheet() },
            uvs: fx.raysUvs,
            color: Color4.create(light.r, light.g, light.b, fx.raysAlpha)
          }}
        />
      ) : null}
      {/* colored swirl glows up through the shake, blows out at the burst */}
      {fx.glow > 0 ? (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { left: -25, top: -25 },
            width: stage + 50,
            height: stage + 50,
            pointerFilter: 'none'
          }}
          uiBackground={{
            textureMode: 'stretch',
            texture: { src: revealBurstSheet() },
            uvs: fx.swirlUvs,
            color: Color4.create(light.r, light.g, light.b, 0.9 * fx.glow)
          }}
        />
      ) : null}
      {props.chestSrc ? (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { left: chestOff + fx.jx, top: chestOff + fx.jy },
            width: chestSize,
            height: chestSize,
            pointerFilter: 'none'
          }}
          uiBackground={{
            textureMode: 'stretch',
            texture: { src: props.chestSrc },
            uvs: props.chestUvs,
            color: Color4.White()
          }}
        />
      ) : null}
      {/* ember sparks fly over the crate */}
      {fx.sparks ? (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { left: -25, top: -25 },
            width: stage + 50,
            height: stage + 50,
            pointerFilter: 'none'
          }}
          uiBackground={{
            textureMode: 'stretch',
            texture: { src: sparksSheet() },
            uvs: fx.sparksUvs,
            color: Color4.create(1, 0.95, 0.85, 1)
          }}
        />
      ) : null}
      {fx.flash > 0 ? (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { left: -40, top: -40 },
            width: stage + 80,
            height: stage + 80,
            pointerFilter: 'none'
          }}
          uiBackground={{ color: Color4.create(1, 1, 1, fx.flash) }}
        />
      ) : null}
    </UiEntity>
  )
}

/** Column-reverse page of tiles with left/right arrows above and below. */
export function PagedColumn(props: {
  show: boolean
  leftK: string
  rightK: string
  boxW: number
  boxH: number
  imgW: number
  leftTint?: Color4
  rightTint?: Color4
  onLeft?: () => void
  onRight?: () => void
  children?: ReactEcs.JSX.Component[] | ReactEcs.JSX.Component
}) {
  return (
    <UiEntity
      uiTransform={{
        height: '96%',
        flexDirection: 'column-reverse',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      {props.show ? (
        <UiEntity
          uiTransform={{ width: props.boxW, height: props.boxH, alignItems: 'center', justifyContent: 'center' }}
          onMouseDown={press(`page:${props.leftK}`, props.onLeft)}
        >
          <Img
            k={props.leftK}
            w={props.imgW - pressShrink(`page:${props.leftK}`, props.imgW)}
            tint={pressTint(`page:${props.leftK}`, props.leftTint)}
            margin={0}
          />
        </UiEntity>
      ) : null}
      {props.children}
      {props.show ? (
        <UiEntity
          uiTransform={{ width: props.boxW, height: props.boxH, alignItems: 'center', justifyContent: 'center' }}
          onMouseDown={press(`page:${props.rightK}`, props.onRight)}
        >
          <Img
            k={props.rightK}
            w={props.imgW - pressShrink(`page:${props.rightK}`, props.imgW)}
            tint={pressTint(`page:${props.rightK}`, props.rightTint)}
            margin={0}
          />
        </UiEntity>
      ) : null}
    </UiEntity>
  )
}

export function ModalScrim(props: {
  children?: ReactEcs.JSX.Component[] | ReactEcs.JSX.Component
  alpha?: number
  color?: Color4
  left?: number
  flexDirection?: 'row'
  justifyContent?: 'center' | 'flex-start'
  onMouseDown?: () => void
}) {
  const transform: {
    positionType: 'absolute'
    position: { top: number; left: number }
    width: '100%'
    height: '100%'
    alignItems: 'center'
    justifyContent: 'center' | 'flex-start'
    flexDirection?: 'row'
  } = {
    positionType: 'absolute',
    position: { top: 0, left: props.left ?? 0 },
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: props.justifyContent ?? 'center'
  }
  if (props.flexDirection) transform.flexDirection = props.flexDirection
  return (
    <UiEntity
      uiTransform={transform}
      uiBackground={{ color: props.color ?? Color4.create(0.02, 0.01, 0.02, props.alpha ?? 0.86) }}
      onMouseDown={props.onMouseDown}
    >
      {props.children}
    </UiEntity>
  )
}

/** Leather dialog frame. Portrait and lines stay with the caller as children. */
export function TalkPanel(props: {
  width: number | `${number}%`
  height: number | `${number}%`
  padding?: number
  onMouseDown?: () => void
  children?: ReactEcs.JSX.Component[] | ReactEcs.JSX.Component
}) {
  return (
    <UiEntity
      uiTransform={
        props.padding !== undefined
          ? {
              width: props.width,
              height: props.height,
              flexDirection: 'column-reverse',
              alignItems: 'center',
              justifyContent: 'flex-start',
              padding: props.padding
            }
          : {
              width: props.width,
              height: props.height,
              flexDirection: 'column-reverse',
              alignItems: 'center',
              justifyContent: 'flex-start'
            }
      }
      uiBackground={{
        textureMode: 'stretch',
        texture: { src: 'images/hud/panel-leather-a.png' },
        color: Color4.White()
      }}
      onMouseDown={props.onMouseDown}
    >
      {props.children}
    </UiEntity>
  )
}

function VerdictBtn(props: {
  id: string
  art: LabelInfo
  w: number
  margin: number
  tint?: Color4
  onTap?: () => void
}) {
  const dw = pressShrink(props.id, props.w)
  const w = props.w - dw
  return (
    <UiEntity
      uiTransform={{
        width: props.w,
        height: Math.round((props.w * props.art.h) / props.art.w),
        margin: props.margin,
        alignItems: 'center',
        justifyContent: 'center'
      }}
      onMouseDown={press(props.id, props.onTap)}
    >
      <UiEntity
        uiTransform={{ width: w, height: Math.round((w * props.art.h) / props.art.w), pointerFilter: 'none' }}
        uiBackground={{
          textureMode: 'stretch',
          texture: { src: props.art.src },
          uvs: props.art.uvs,
          color: pressTint(props.id, props.tint)
        }}
      />
    </UiEntity>
  )
}

export function AcceptDecline(props: {
  w: number
  margin: number
  acceptTint?: Color4
  onAccept?: () => void
  onDecline?: () => void
}) {
  const accept = LABELS['shop-accept']
  const decline = LABELS['shop-decline']
  return (
    <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center' }}>
      {accept ? (
        <VerdictBtn
          id="accept"
          art={accept}
          w={props.w}
          margin={props.margin}
          tint={props.acceptTint}
          onTap={props.onAccept}
        />
      ) : null}
      {decline ? (
        <VerdictBtn id="decline" art={decline} w={props.w} margin={props.margin} onTap={props.onDecline} />
      ) : null}
    </UiEntity>
  )
}

/** 74×420 trade-name plate. Extra children sit under the name with a spacer. */
export function TravelerPlate(props: {
  name: string
  tint?: Color4
  onTap?: () => void
  children?: ReactEcs.JSX.Component[] | ReactEcs.JSX.Component
  key?: string | number
}) {
  const plate = LABELS['trade-name']
  const tag = <NameTag name={props.name} w={24} tint={props.tint ?? cream} />
  return (
    <UiEntity
      uiTransform={{
        width: 74,
        height: 420,
        alignItems: 'center',
        justifyContent: 'center',
        margin: 4
      }}
      uiBackground={
        plate
          ? { textureMode: 'stretch', texture: { src: plate.src }, uvs: plate.uvs, color: Color4.White() }
          : { color: panelDim }
      }
      onMouseDown={props.onTap}
    >
      {props.children ? (
        <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center' }}>
          {tag}
          <UiEntity uiTransform={{ width: 30, height: 8 }} />
          {props.children}
        </UiEntity>
      ) : (
        tag
      )}
    </UiEntity>
  )
}
