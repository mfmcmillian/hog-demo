import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { tap } from '../game/audio'
import { getDef, statsOf, xpProgress } from '../game/familiars'
import { cycleHeroCard, heroCardRoster } from '../game/menu'
import { findOwned, game } from '../game/store'
import { OwnedFamiliar, Rarity } from '../game/types'
import { revealBurstSheet, revealBurstUvs, revealFx, skipReveal } from './flipbook'
import { cardBackArt, hallArt } from './halls'
import { LABELS } from './labels.gen'
import { cream, gold, panelDim, PASS } from './theme'
import { Backdrop, CardBtn, Face, Img, Stars, Stat } from './widgets'

function PlaqueLine(props: { children?: ReactEcs.JSX.Component[] | ReactEcs.JSX.Component }) {
  return (
    <UiEntity
      uiTransform={{
        width: '20%',
        height: '100%',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        padding: { top: 20 }
      }}
    >
      {props.children}
    </UiEntity>
  )
}

/** Full hero card: hall, face, plaque. BACK lives in ScreenChrome. */
export function HeroCardScreen() {
  const owned = findOwned(game.inspectUid)
  if (!owned) return null
  const def = getDef(owned.defId)
  const revealing = !!game.reveal
  const fx = revealFx(def.rarity)
  if (revealing && !fx.ready) return <HeroCardReveal owned={owned} fx={fx} />
  return (
    <UiEntity uiTransform={{ width: '100%', height: '100%', ...PASS }}>
      <HeroCardBody owned={owned} />
      {revealing ? null : <CycleArrows />}
    </UiEntity>
  )
}

/** Prev/next hero on the card's physical sides (canvas bottom = phone left). */
function CycleArrows() {
  if (heroCardRoster().length < 2) return null
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 0, left: 0 },
        width: '100%',
        height: '100%',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: { top: 4, bottom: 4 },
        ...PASS
      }}
    >
      <CardBtn k="sel-arrow-right" w={76} hit={96} onTap={tap(() => cycleHeroCard(1))} />
      <CardBtn k="sel-arrow-left" w={76} hit={96} onTap={tap(() => cycleHeroCard(-1))} />
    </UiEntity>
  )
}

function RevealSwirl(props: { rarity: Rarity; scale: number }) {
  const uvs = revealBurstUvs(props.rarity)
  if (!uvs) return null
  const pad = -((props.scale - 1) / 2) * 100
  const box = `${props.scale * 100}%` as `${number}%`
  const inset = `${pad}%` as `${number}%`
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: inset, left: inset },
        width: box,
        height: box,
        pointerFilter: 'none'
      }}
      uiBackground={{
        textureMode: 'stretch',
        texture: { src: revealBurstSheet() },
        uvs,
        color: Color4.White()
      }}
    />
  )
}

function HeroCardReveal(props: { owned: OwnedFamiliar; fx: ReturnType<typeof revealFx> }) {
  const back = cardBackArt()
  const fx = props.fx
  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%'
      }}
      onMouseDown={() => skipReveal()}
    >
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { top: 0, left: 0 },
          width: '100%',
          height: '100%',
          pointerFilter: 'none'
        }}
        uiBackground={{ color: Color4.create(0.02, 0.01, 0.02, 0.72 + fx.glow * 0.12) }}
      />
      {fx.showBurst ? <RevealSwirl rarity={getDef(props.owned.defId).rarity} scale={fx.rayScale} /> : null}
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { top: `${fx.top}%`, left: `${fx.left}%` },
          width: `${fx.w}%`,
          height: `${fx.h}%`,
          pointerFilter: 'none'
        }}
      >
        {fx.showFace ? (
          <HeroCardBody owned={props.owned} swirl={false} />
        ) : (
          <UiEntity
            uiTransform={{ width: '100%', height: '100%' }}
            uiBackground={{
              textureMode: 'stretch',
              texture: { src: back.src },
              color: Color4.create(1, 0.92 + fx.glow * 0.08, 0.7 + fx.glow * 0.3, 1)
            }}
          />
        )}
      </UiEntity>
      {fx.flash > 0.02 ? (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 0, left: 0 },
            width: '100%',
            height: '100%',
            pointerFilter: 'none'
          }}
          uiBackground={{ color: Color4.create(1, 0.88, 0.45, fx.flash * 0.5) }}
        />
      ) : null}
    </UiEntity>
  )
}

function HeroCardBody(props: { owned: OwnedFamiliar; swirl?: boolean }) {
  const owned = props.owned
  const def = getDef(owned.defId)
  const stats = statsOf(owned)
  const hall = hallArt(owned.defId)
  const xp = xpProgress(owned)
  const plaque = LABELS['plaque-stats']
  const seated = game.party.includes(owned.uid)
  const fx = revealFx(def.rarity)
  const swirl = props.swirl !== false && !!game.reveal && fx.showBurst
  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%',
        flexDirection: 'row',
        alignItems: 'center'
      }}
    >
      {Backdrop({ src: hall.src, pass: true, veil: Color4.create(0.04, 0.02, 0.03, 0.28) })}
      {swirl ? <RevealSwirl rarity={def.rarity} scale={fx.rayScale} /> : null}

      <UiEntity uiTransform={{ width: 140, height: '100%' }}>
        <UiEntity
          uiTransform={{
            width: '100%',
            height: '100%',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            pointerFilter: 'none'
          }}
        >
          <Img k={def.rarity} w={28} tint={gold} />
          <Img k={owned.defId} w={44} tint={cream} />
          <Stars count={owned.stars} w={18} burst={!!game.reveal} />
          {seated ? <Img k="oath" w={16} tint={gold} /> : null}
        </UiEntity>
      </UiEntity>

      <UiEntity
        uiTransform={{
          flexGrow: 1,
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Face id={owned.defId} w={560} h={560} fallback={72} margin={{ left: -80 }} />
      </UiEntity>

      <UiEntity
        uiTransform={{
          width: 360,
          height: '92%',
          flexDirection: 'row',
          alignItems: 'stretch',
          margin: { right: 32 },
          padding: { top: 28, bottom: 28, left: 20, right: 20 }
        }}
        uiBackground={
          plaque ? { textureMode: 'stretch', texture: { src: plaque.src }, color: Color4.White() } : { color: panelDim }
        }
      >
        <PlaqueLine>
          <Stat value={stats.hp} word="hp" tint={cream} w={36} wordFirst />
        </PlaqueLine>
        <PlaqueLine>
          <Stat value={stats.atk} word="atk" tint={cream} w={36} wordFirst />
        </PlaqueLine>
        <PlaqueLine>
          <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center' }}>
            <Img k={def.role} w={30} tint={cream} />
            <Img k={def.skill} w={30} tint={gold} margin={4} />
          </UiEntity>
        </PlaqueLine>
        <PlaqueLine>
          <Stat value={owned.level} word="level" tint={gold} w={36} wordFirst />
        </PlaqueLine>
        <UiEntity
          uiTransform={{
            width: '20%',
            height: '100%',
            flexDirection: 'column',
            alignItems: 'center'
          }}
        >
          <UiEntity
            uiTransform={{
              width: 16,
              flexGrow: 1,
              flexDirection: 'column-reverse',
              margin: { top: 18 }
            }}
            uiBackground={{ color: Color4.create(0.05, 0.03, 0.03, 0.9) }}
          >
            <UiEntity
              uiTransform={{
                width: '100%',
                height: `${Math.min(100, Math.round(xp.frac * 100))}%`
              }}
              uiBackground={{ color: Color4.create(0.86, 0.55, 0.18, 1) }}
            />
          </UiEntity>
          <UiEntity uiTransform={{ width: 16, height: 136 }} />
        </UiEntity>
      </UiEntity>
    </UiEntity>
  )
}
