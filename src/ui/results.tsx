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
import { cream, gold, good, muted } from './theme'
import { Backdrop, Digits, Face, FillBar, Gain, GameLogo, Img, NameTag, Plate, Stars } from './widgets'

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

function RewardCol(props: { children?: ReactEcs.JSX.Component[] | ReactEcs.JSX.Component; width?: number }) {
  return (
    <UiEntity
      uiTransform={{
        width: props.width ?? 140,
        height: '100%',
        flexDirection: 'column-reverse',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 8
      }}
    >
      {props.children}
    </UiEntity>
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
        width: solo ? 280 : 108,
        height: '100%',
        flexDirection: solo ? 'row' : 'column-reverse',
        alignItems: 'center',
        justifyContent: 'center',
        padding: solo ? 8 : 4
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
      {Backdrop({ label: 'map-cave', tint: Color4.create(0.35, 0.3, 0.32, 1) })}
      <RewardCol width={200}>
        <Plate k={win ? 'win' : 'lose'} w={180} h={440} />
      </RewardCol>
      <RewardCol width={140}>
        <Img k="xp" w={88} tint={Color4.White()} />
        <Gain value={fxXp} w={56} tint={gold} />
      </RewardCol>
      {lines.length === 1 ? <XpRow line={lines[0]} solo /> : lines.map((line) => <XpRow key={line.uid} line={line} />)}
      <RewardCol width={160}>
        <Img k="icon-coins" w={64} tint={Color4.White()} />
        <Digits value={coinGain} w={56} tint={gold} tight />
        <Img k="coins" w={40} tint={muted} />
        {win && b.kin && b.kinCoins ? (
          <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: { top: 14 } }}>
            <Img k="oathkin-bonus" w={22} tint={gold} margin={3} />
            <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center' }}>
              <Gain value={b.kinCoins} w={26} tint={gold} />
              <UiEntity uiTransform={{ height: 6 }} />
              <NameTag name={`x${b.kin}`} w={20} tint={cream} />
            </UiEntity>
          </UiEntity>
        ) : null}
      </RewardCol>
      {floor > 0 ? (
        <RewardCol width={130}>
          <Img k="the-road" w={48} tint={gold} />
          <Digits value={floor} w={48} tint={gold} tight />
          <MiniPips here={floor} />
        </RewardCol>
      ) : null}
      {game.ascendedStar > 0 ? (
        <RewardCol width={120}>
          <Img k="road-ascends" w={22} tint={gold} />
          <Stars count={game.ascendedStar} w={18} />
          {game.oathStar > 0 ? (
            <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: { top: 12 } }}>
              <Img k="oath-ascends" w={18} tint={cream} />
              <Stars count={game.oathStar} w={13} />
            </UiEntity>
          ) : null}
        </RewardCol>
      ) : null}
      <UiEntity
        uiTransform={{
          width: 110,
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Plate k="continue" w={64} h={280} />
      </UiEntity>
      <GameLogo />
    </UiEntity>
  )
}
