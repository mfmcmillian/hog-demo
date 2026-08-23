import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { skipBattle } from '../game/campaign'
import { game } from '../game/store'
import { BattleUnit } from '../game/types'
import {
  dmgPops,
  foeLungeAmt,
  heroPoster,
  idleMotion,
  posterDrive,
  posterPunch,
  shownHp,
  skillFxUvs,
  SKILL_FX_KINDS,
  SKILL_FX_SRC,
  unitHit,
  unitSkillFx
} from './flipbook'
import { LABELS } from './labels.gen'
import { cream, danger, gold, good, muted } from './theme'
import { Backdrop, charArt, Digits, FillBar, Gain, GameLogo, Img, NameTag, Plate, Stars } from './widgets'

function ArenaPoster(props: {
  src: string
  uvs?: number[]
  size: number
  grow: number
  nudgeLeft: number
  nudgeTop: number
  dim?: boolean
}) {
  const grow = props.grow
  return (
    <UiEntity uiTransform={{ width: props.size, height: props.size }}>
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: {
            top: -Math.round(grow / 2) + props.nudgeTop,
            left: -Math.round(grow / 2) + props.nudgeLeft
          },
          width: props.size + grow,
          height: props.size + grow
        }}
        uiBackground={{
          textureMode: 'stretch',
          texture: { src: props.src },
          uvs: props.uvs,
          color: props.dim ? muted : Color4.White()
        }}
      />
    </UiEntity>
  )
}

function ArenaHp(props: { unit: BattleUnit; fill: Color4; h?: number; w?: number }) {
  const hp = shownHp(props.unit.uid, props.unit.hp)
  const frac = props.unit.maxHp > 0 ? hp / props.unit.maxHp : 0
  const barH = props.h ?? 200
  const barW = props.w ?? 22
  const dead = hp <= 0
  return (
    // 'row' stacks physically top-to-bottom in the portrait grip: the bar
    // group first, the level tag physically underneath it.
    <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', margin: 4 }}>
      <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center' }}>
        <FillBar frac={frac} w={barW} h={barH} fill={dead ? muted : props.fill} />
        <Digits value={Math.max(0, hp)} w={Math.max(14, Math.round(barW * 0.85))} tint={dead ? muted : cream} />
      </UiEntity>
      {props.unit.level ? (
        <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: { left: 4 } }}>
          <NameTag name={`lv${props.unit.level}`} w={Math.max(13, Math.round(barW * 0.8))} tint={dead ? muted : gold} />
        </UiEntity>
      ) : null}
    </UiEntity>
  )
}

function SkillFlash(props: { uid: string; size: number }) {
  const kind = unitSkillFx(props.uid)
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 0, left: 0 },
        width: props.size,
        height: props.size
      }}
    >
      {SKILL_FX_KINDS.map((k) => (
        <UiEntity
          key={k}
          uiTransform={{
            positionType: 'absolute',
            width: '100%',
            height: '100%'
          }}
          uiBackground={{
            textureMode: 'stretch',
            texture: { src: SKILL_FX_SRC[k] },
            uvs: skillFxUvs(),
            color: kind === k ? Color4.White() : Color4.create(1, 1, 1, 0)
          }}
        />
      ))}
    </UiEntity>
  )
}

function DmgPopLayer(props: { uid: string; incoming: boolean }) {
  const hits = dmgPops().filter((pop) => pop.uid === props.uid)
  if (!hits.length) return null
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 0, left: 0 },
        width: '100%',
        height: '100%'
      }}
    >
      {hits.map((pop) => {
        const fade = Math.max(0, 1 - pop.t * pop.t)
        const punch = Math.max(0, 1 - pop.t * 2.4)
        const lift = -Math.round(120 * pop.t)
        const sway = ((pop.id % 3) - 1) * 26
        const w = Math.round(52 + 16 * punch)
        const tint = props.incoming ? Color4.create(1, 0.18, 0.08, fade) : Color4.create(1, 0.96, 0.22, fade)
        const outline = Color4.create(0.06, 0.02, 0.03, fade)
        return (
          <UiEntity
            key={pop.id}
            uiTransform={{
              positionType: 'absolute',
              position: { top: 110 + sway, left: 72 + lift },
              padding: 8,
              alignItems: 'center',
              justifyContent: 'center'
            }}
            uiBackground={{ color: Color4.create(0.04, 0.01, 0.02, fade * 0.62) }}
          >
            <UiEntity
              uiTransform={{
                positionType: 'absolute',
                position: { top: 3, left: 3 }
              }}
            >
              <Digits value={pop.amount} w={w} tint={outline} tight />
            </UiEntity>
            <Digits value={pop.amount} w={w} tint={tint} tight />
          </UiEntity>
        )
      })}
    </UiEntity>
  )
}

function rankPosterSize(count: number) {
  if (count <= 1) return 300
  if (count === 2) return 230
  if (count === 3) return 170
  return 140
}

function RankFighter(props: { key?: string; unit: BattleUnit; count: number; acting: boolean; hp: Color4 }) {
  const unit = props.unit
  const dead = shownHp(unit.uid, unit.hp) <= 0
  const size = rankPosterSize(props.count)
  const sheet = heroPoster(unit.defId, props.acting)
  const art = !sheet ? charArt(unit.defId) : undefined
  const face = sheet ?? (art ? { src: art.src } : undefined)
  const idle = props.acting ? idleMotion() : { grow: 0, sway: 0, lift: 0 }
  const hasSheet = !!sheet
  const drive = props.acting && hasSheet ? posterDrive() : 0
  const punch = props.acting && hasSheet ? posterPunch() : 0
  const hit = unitHit(unit.uid)
  const lunge = props.acting && unit.side === 'foe' && !hasSheet ? foeLungeAmt() : 0
  const grow = props.acting
    ? Math.round(18 * punch + idle.grow + Math.max(0, drive) * 0.25 + 14 * lunge - 8 * hit)
    : Math.round(-6 * hit)
  const nudgeLeft =
    unit.side === 'you'
      ? -Math.round(drive) - Math.round(10 * hit) - Math.round(idle.lift)
      : Math.round(drive) + Math.round(22 * lunge) - Math.round(12 * hit)
  const nudgeTop = Math.round(idle.sway) + Math.round(6 * hit)
  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: `${Math.round(100 / Math.max(1, props.count))}%`,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <UiEntity uiTransform={{ width: size, height: size, positionType: 'relative' }}>
        {face ? (
          <ArenaPoster
            src={face.src}
            uvs={'uvs' in face ? face.uvs : undefined}
            size={size}
            grow={grow}
            nudgeLeft={nudgeLeft}
            nudgeTop={nudgeTop}
            dim={dead}
          />
        ) : null}
        <SkillFlash uid={unit.uid} size={size} />
        <DmgPopLayer uid={unit.uid} incoming={unit.side === 'you'} />
      </UiEntity>
      <ArenaHp unit={unit} fill={props.hp} h={Math.round(size * 0.62)} w={size <= 170 ? 14 : 18} />
    </UiEntity>
  )
}

export function BattleRank(props: { units: BattleUnit[]; actingUid: string; hp: Color4 }) {
  return (
    <UiEntity
      uiTransform={{
        width: 430,
        height: '100%',
        flexDirection: 'column-reverse',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      {props.units.map((unit) => (
        <RankFighter
          key={unit.uid}
          unit={unit}
          count={props.units.length}
          acting={unit.uid === props.actingUid}
          hp={props.hp}
        />
      ))}
    </UiEntity>
  )
}

function clashFloor() {
  const roadId = game.run?.roadId ?? 'q1'
  return LABELS[`map-clash-${roadId}`] ?? LABELS['map-cave']
}

export function BattleField(props: { children?: ReactEcs.JSX.Component[] | ReactEcs.JSX.Component }) {
  const floor = clashFloor()
  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%',
        flexDirection: 'row',
        alignItems: 'stretch'
      }}
    >
      {floor ? Backdrop({ src: floor.src }) : null}
      {props.children}
    </UiEntity>
  )
}

export function BattleScreen() {
  const b = game.battle
  if (!b) return null
  const floor = game.run?.floor ?? 0
  return (
    <BattleField>
      <BattleRank units={b.foe} actingUid={b.actingUid} hp={danger} />
      <UiEntity
        uiTransform={{
          width: 70,
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {floor > 0 ? (
          <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center' }}>
            <Digits value={floor} w={20} tint={gold} />
            <UiEntity uiTransform={{ height: 8 }} />
            <Stars count={game.run?.star ?? 1} w={11} />
          </UiEntity>
        ) : (
          <Img k="the-clash" w={36} tint={gold} />
        )}
      </UiEntity>
      <BattleRank units={b.you} actingUid={b.actingUid} hp={good} />
      <UiEntity
        uiTransform={{
          width: 80,
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        onMouseDown={() => skipBattle()}
      >
        <Plate k="skip" w={52} h={180} onTap={() => skipBattle()} />
      </UiEntity>
      {/* oathkin nearby: their presence bonus, pinned to the physical bottom */}
      {b.kin && b.kinCoins ? (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { right: 16, top: '38%' },
            flexDirection: 'column-reverse',
            alignItems: 'center',
            pointerFilter: 'none'
          }}
        >
          <Img k="oathkin-bonus" w={16} tint={gold} margin={3} />
          <Img k="icon-coins" w={20} tint={Color4.White()} margin={2} />
          <Gain value={b.kinCoins} w={16} tint={gold} />
        </UiEntity>
      ) : null}
      <GameLogo />
    </BattleField>
  )
}
