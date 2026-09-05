import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { advanceBanner } from '../game/campaign'
import { lockNav } from '../game/nav'
import { FLOORS } from '../game/quests'
import { leaveResult } from '../game/roads'
import { game } from '../game/store'
import { XpLine } from '../game/types'
import { reportFx } from './flipbook'
import { BattleField } from './battle'
import { LABELS } from './labels.gen'
import { cream, gold, good, muted } from './theme'
import { Backdrop, Digits, Face, FillBar, Gain, GameLogo, Img, MenuTitle, NameTag, Plate, Stars } from './widgets'

export function BannerScreen() {
  const b = game.battle
  if (!b || !b.winner) return null
  const win = b.winner === 'you'
  return (
    <BattleField>
      <UiEntity
        uiTransform={{
          width: '100%',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        onMouseDown={() => {
          advanceBanner()
          lockNav()
        }}
      >
        <Plate
          k={win ? 'win' : 'lose'}
          w={300}
          h={620}
          onTap={() => {
            advanceBanner()
            lockNav()
          }}
        />
        {/* physically below the banner: same continue plaque as the report */}
        <UiEntity uiTransform={{ margin: { left: 110 }, pointerFilter: 'none' }}>
          <Plate k="continue" w={56} h={240} />
        </UiEntity>
      </UiEntity>
      <GameLogo />
    </BattleField>
  )
}

/** Thin gold hairline between summary sections (reads physically vertical). */
function SummaryRule() {
  return (
    <UiEntity
      uiTransform={{ width: '58%', height: 2, margin: 8 }}
      uiBackground={{ color: Color4.create(0.82, 0.62, 0.28, 0.5) }}
    />
  )
}

function MiniPips(props: { here: number }) {
  const marks = [] as number[]
  for (let i = 1; i <= FLOORS; i++) marks.push(i)
  return (
    <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: 4 }}>
      {marks.map((n) => {
        const here = n === props.here
        const size = here || n === FLOORS ? 11 : 7
        return (
          <UiEntity
            key={n}
            uiTransform={{ width: size, height: size, margin: 2 }}
            uiBackground={{ color: here || n === FLOORS ? gold : muted }}
          />
        )
      })}
    </UiEntity>
  )
}

function xpStatGain(line: XpLine) {
  return {
    hp: line.levels * 3,
    atk: Math.max(1, Math.floor(line.levelAfter * 1.2) - Math.floor(line.levelBefore * 1.2))
  }
}

function XpRow(props: { line: XpLine; solo?: boolean; key?: string }) {
  const fx = reportFx(props.line)
  const burst = fx.burst
  const gain = xpStatGain(props.line)
  const solo = !!props.solo
  const face = solo ? 110 + Math.round(14 * burst) : 72 + Math.round(10 * burst)
  const tint = burst > 0 ? Color4.create(1, 0.88 + 0.12 * burst, 0.6 + 0.4 * burst, 1) : Color4.White()
  return (
    <UiEntity
      uiTransform={{
        width: solo ? 280 : 116,
        height: '88%',
        alignSelf: 'center',
        flexDirection: solo ? 'row' : 'column-reverse',
        alignItems: 'center',
        justifyContent: 'center',
        padding: solo ? 8 : 4,
        margin: 5
      }}
      uiBackground={{
        color: fx.showSeal ? Color4.create(0.32, 0.2, 0.07, 0.55) : Color4.create(0.09, 0.06, 0.08, 0.6)
      }}
    >
      <Face id={props.line.defId} w={face} h={face} tint={tint} margin={solo ? { left: 6 } : undefined} />
      <UiEntity
        uiTransform={{
          flexDirection: 'column-reverse',
          alignItems: 'center',
          margin: solo ? { left: 8, right: 8 } : { top: 4, bottom: 4 }
        }}
      >
        {fx.showSeal ? (
          <Img k="icon-level" w={Math.round((solo ? 48 : 40) + (solo ? 14 : 12) * burst)} tint={Color4.White()} />
        ) : null}
        <Img k="level" w={Math.round((solo ? 44 : 40) + (solo ? 8 : 6) * burst)} tint={fx.showSeal ? gold : cream} />
        <Digits
          value={fx.level}
          w={Math.round((solo ? 56 : 48) + (solo ? 10 : 8) * burst)}
          tint={fx.showSeal ? gold : cream}
          tight
        />
      </UiEntity>
      <FillBar
        frac={fx.bar}
        w={solo ? 24 : 22}
        h={solo ? 220 : 170}
        fill={burst > 0.15 ? gold : Color4.create(0.25, 0.45, 0.75, 1)}
      />
      {fx.showStats && gain.hp > 0 ? (
        <UiEntity
          uiTransform={{
            flexDirection: 'column-reverse',
            alignItems: 'center',
            margin: solo ? { left: 12 } : { top: 6 }
          }}
        >
          <Img k="hp" w={solo ? 36 : 32} tint={good} />
          <Digits value={gain.hp} w={solo ? 44 : 36} tint={good} tight />
          <Img k="atk" w={solo ? 36 : 32} tint={gold} />
          <Digits value={gain.atk} w={solo ? 44 : 36} tint={gold} tight />
        </UiEntity>
      ) : null}
    </UiEntity>
  )
}

export function ReportScreen() {
  const b = game.battle
  if (!b || !b.winner) return null
  const win = b.winner === 'you'
  const floor = game.run?.floor ?? 0
  const coinGain = win ? b.coins : 0
  const lines = game.xpLines
  const fxXp = lines[0] ? reportFx(lines[0]).xp : game.lastXp
  const dismiss = () => {
    leaveResult()
    lockNav()
  }
  const laurel = LABELS['road-laurel']
  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      onMouseDown={dismiss}
    >
      {Backdrop({ label: 'map-cave', tint: Color4.create(0.35, 0.3, 0.32, 1), dim: 0.3 })}
      {/* the verdict, wreathed in a faint gold laurel on a win */}
      <UiEntity uiTransform={{ width: 230, height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <UiEntity
          uiTransform={{
            width: 330,
            height: 330,
            alignItems: 'center',
            justifyContent: 'center',
            pointerFilter: 'none'
          }}
          uiBackground={
            win && laurel
              ? {
                  textureMode: 'stretch',
                  texture: { src: laurel.src },
                  uvs: laurel.uvs,
                  color: Color4.create(1, 0.85, 0.5, 0.3)
                }
              : undefined
          }
        >
          <Plate k={win ? 'win' : 'lose'} w={180} h={440} />
        </UiEntity>
      </UiEntity>
      {/* one framed strip for the spoils: XP, coins, road progress, ascension */}
      <UiEntity
        uiTransform={{
          width: 150,
          height: '88%',
          alignSelf: 'center',
          flexDirection: 'column-reverse',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 8
        }}
        uiBackground={{ color: Color4.create(0.05, 0.03, 0.04, 0.55) }}
      >
        <Img k="xp" w={56} tint={Color4.White()} />
        <Gain value={fxXp} w={40} tint={gold} />
        <SummaryRule />
        <Img k="icon-coins" w={50} tint={Color4.White()} />
        <Digits value={coinGain} w={40} tint={gold} tight />
        <Img k="coins" w={28} tint={muted} />
        {win && b.kin && b.kinCoins ? (
          <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: { top: 8 } }}>
            <Img k="oathkin-bonus" w={20} tint={gold} margin={3} />
            <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center' }}>
              <Gain value={b.kinCoins} w={24} tint={gold} />
              <UiEntity uiTransform={{ height: 6 }} />
              <NameTag name={`x${b.kin}`} w={18} tint={cream} />
            </UiEntity>
          </UiEntity>
        ) : null}
        {floor > 0 ? <SummaryRule /> : null}
        {floor > 0 ? (
          <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center' }}>
            <Img k="the-road" w={40} tint={gold} />
            <Digits value={floor} w={40} tint={gold} tight />
            <MiniPips here={floor} />
          </UiEntity>
        ) : null}
        {game.ascendedStar > 0 ? <SummaryRule /> : null}
        {game.ascendedStar > 0 ? (
          <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center' }}>
            <Img k="road-ascends" w={20} tint={gold} />
            <Stars count={game.ascendedStar} w={16} />
            {game.oathStar > 0 ? (
              <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: { top: 8 } }}>
                <Img k="oath-ascends" w={16} tint={cream} />
                <Stars count={game.oathStar} w={12} />
              </UiEntity>
            ) : null}
          </UiEntity>
        ) : null}
      </UiEntity>
      {/* the party, one card per hero, lighting up gold as level-ups land */}
      <UiEntity
        uiTransform={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          margin: { left: 6, right: 6 }
        }}
      >
        {lines.length === 1 ? (
          <XpRow line={lines[0]} solo />
        ) : (
          lines.map((line) => <XpRow key={line.uid} line={line} />)
        )}
      </UiEntity>
      <UiEntity
        uiTransform={{
          width: 100,
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Plate k="continue" w={60} h={260} />
      </UiEntity>
      <MenuTitle k="report-banner" />
    </UiEntity>
  )
}
