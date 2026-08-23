import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { playCancel, tap } from '../game/audio'
import { focused, setCursor } from '../game/nav'
import { PACKS, PackDef } from '../game/packs'
import { cancelPack, confirmPack, openPendingChest, requestPack } from '../game/shop'
import { game } from '../game/store'
import { chestFx, chestOpenSheet, chestWobble } from './flipbook'
import { LABELS } from './labels.gen'
import { AcceptDecline, ChestStage, ModalScrim } from './panels'
import { danger, gold, muted } from './theme'
import { Backdrop, Digits, GameLogo, Img, Notice } from './widgets'

/** Gem pips on the pack cards: rarity color + count, like the approved mock. */
const SHOP_GEMS: Record<string, { gem: string; count: number }> = {
  ember: { gem: 'shop-gem-red', count: 1 },
  vow: { gem: 'shop-gem-blue', count: 2 },
  crown: { gem: 'shop-gem-purple', count: 3 }
}

/** The colored light each chest bursts open with. */
const PACK_LIGHT: Record<string, Color4> = {
  ember: Color4.create(1, 0.52, 0.22, 1),
  vow: Color4.create(0.42, 0.64, 1, 1),
  crown: Color4.create(0.85, 0.5, 1, 1)
}

/** Cost plate from the kit with the coin count overlaid. */
function CostPlate(props: { cost: number; afford: boolean; w?: number }) {
  const plate = LABELS['shop-cost-plate']
  const w = props.w ?? 46
  if (!plate) return null
  return (
    <UiEntity
      uiTransform={{
        width: w,
        height: Math.round((w * plate.h) / plate.w),
        alignItems: 'center',
        justifyContent: 'center',
        margin: 3,
        flexDirection: 'column-reverse'
      }}
      uiBackground={{ textureMode: 'stretch', texture: { src: plate.src }, color: Color4.White() }}
    >
      <Img k="icon-coins" w={Math.round(w * 0.52)} tint={props.afford ? Color4.White() : muted} margin={2} />
      <Digits value={props.cost} w={Math.round(w * 0.44)} tint={props.afford ? gold : danger} />
    </UiEntity>
  )
}

/** One vertical chest card, framed by the kit card art. */
function PackBay(props: { pack: PackDef; index: number; key?: string | number }) {
  const art = LABELS[props.pack.art]
  const lit = focused(props.index)
  const afford = game.coins >= props.pack.cost
  const frame = LABELS[lit ? 'shop-card-lit' : 'shop-card']
  const gems = SHOP_GEMS[props.pack.id]
  const cardW = lit ? 240 : 208 // physical width (landscape height)
  const cardH = Math.round(cardW * 1.7) // frame aspect 512:301
  return (
    <UiEntity
      uiTransform={{
        width: cardH,
        height: cardW,
        margin: { top: 5, bottom: 5 },
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16
      }}
      onMouseDown={tap(() => {
        setCursor(props.index)
        requestPack(props.pack.id)
      })}
    >
      {frame ? (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 0, left: 0 },
            width: '100%',
            height: '100%',
            pointerFilter: 'none'
          }}
          uiBackground={{ textureMode: 'stretch', texture: { src: frame.src }, color: Color4.White() }}
        />
      ) : null}
      <Img k={`shop-name-${props.pack.id}`} w={40} tint={Color4.White()} margin={2} />
      {art ? (
        <UiEntity
          uiTransform={{
            width: lit ? 150 : 130,
            height: lit ? 150 : 130,
            // Compensated margins: the focused crate rattles without
            // shoving its plate and cost siblings around.
            margin: lit
              ? (() => {
                  const wob = chestWobble()
                  return { left: 4 + wob.jx, right: 4 - wob.jx, top: wob.jy, bottom: -wob.jy }
                })()
              : 4
          }}
          uiBackground={{ textureMode: 'stretch', texture: { src: art.src }, color: afford ? Color4.White() : muted }}
        />
      ) : null}
      <CostPlate cost={props.pack.cost} afford={afford} w={lit ? 44 : 40} />
      {gems ? (
        <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center' }}>
          {Array.from({ length: gems.count }, (_, i) => (
            <Img key={i} k={gems.gem} w={20} tint={Color4.White()} margin={1} />
          ))}
        </UiEntity>
      ) : null}
    </UiEntity>
  )
}

/** AAA chest confirmation: dim the shop, show the crate, ask ACCEPT/DECLINE.
 * ACCEPT starts the flipbook ceremony (shake -> colored burst) and the actual
 * purchase fires when the ceremony finishes, flowing into the card reveal. */
function PackConfirm() {
  const pack = PACKS.find((entry) => entry.id === game.pendingPack)
  if (!pack) return null
  const fx = chestFx()
  if (fx.done) {
    confirmPack() // opens the chest for real; the hero card reveal takes over
    return null
  }
  const art = LABELS[pack.art]
  const frame = LABELS['shop-card']
  const afford = game.coins >= pack.cost
  const gems = SHOP_GEMS[pack.id]
  const light = PACK_LIGHT[pack.id] ?? gold
  // painted lid-opening flipbook; falls back to the static crate art
  const sheet = chestOpenSheet(pack.id)
  const chestSrc = sheet ?? art?.src
  return (
    <ModalScrim
      alpha={0.85}
      onMouseDown={() => {
        if (!fx.active) {
          playCancel()
          cancelPack()
        }
      }}
    >
      <UiEntity
        uiTransform={{
          width: 820,
          height: 620,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 30
        }}
        onMouseDown={() => {}}
      >
        {frame ? (
          <UiEntity
            uiTransform={{
              positionType: 'absolute',
              position: { top: 0, left: 0 },
              width: '100%',
              height: '100%',
              pointerFilter: 'none'
            }}
            uiBackground={{ textureMode: 'stretch', texture: { src: frame.src }, color: Color4.White() }}
          />
        ) : null}
        <Img k="shop-open-chest" w={66} tint={Color4.White()} margin={4} />
        <ChestStage
          fx={fx}
          stage={370}
          margin={4}
          light={light}
          chestSrc={chestSrc}
          chestUvs={sheet ? fx.chestUvs : undefined}
          chestSize={308 + fx.grow}
        />
        <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center' }}>
          <Img k={`shop-name-${pack.id}`} w={54} tint={Color4.White()} margin={3} />
          {gems
            ? Array.from({ length: gems.count }, (_, i) => (
                <Img key={i} k={gems.gem} w={26} tint={Color4.White()} margin={1} />
              ))
            : null}
          <CostPlate cost={pack.cost} afford={afford} w={58} />
        </UiEntity>
        {!fx.active ? (
          <AcceptDecline
            w={82}
            margin={10}
            acceptTint={afford ? Color4.White() : muted}
            onAccept={tap(() => {
              if (afford) openPendingChest()
            })}
            onDecline={() => {
              playCancel()
              cancelPack()
            }}
          />
        ) : (
          <UiEntity uiTransform={{ width: 82, height: 255, margin: 10 }} />
        )}
      </UiEntity>
    </ModalScrim>
  )
}

export function ShopScreen() {
  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      {Backdrop({ label: 'map-shop' })}
      {LABELS['shop-title'] ? (
        <UiEntity
          uiTransform={{
            width: 156,
            height: 386,
            margin: { left: 12, right: 4 }
          }}
          uiBackground={{
            textureMode: 'stretch',
            texture: { src: LABELS['shop-title'].src },
            color: Color4.White()
          }}
        />
      ) : null}
      {LABELS['shop-chip'] ? (
        <UiEntity
          uiTransform={{
            width: 54,
            height: 118,
            flexDirection: 'column-reverse',
            alignItems: 'center',
            justifyContent: 'center',
            margin: { left: 4, right: 8 }
          }}
          uiBackground={{ textureMode: 'stretch', texture: { src: LABELS['shop-chip'].src }, color: Color4.White() }}
        >
          <Img k="icon-coins" w={26} tint={Color4.White()} margin={1} />
          <Digits value={game.coins} w={22} tint={gold} />
        </UiEntity>
      ) : null}
      <UiEntity
        uiTransform={{
          flexDirection: 'column-reverse',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {PACKS.map((pack, i) => (
          <PackBay key={pack.id} pack={pack} index={i} />
        ))}
      </UiEntity>
      <PackConfirm />
      {/* physically lower on screen: landscape right = portrait bottom */}
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { right: 80, top: '40%' },
          pointerFilter: 'none'
        }}
      >
        <Notice />
      </UiEntity>
      <GameLogo />
    </UiEntity>
  )
}
