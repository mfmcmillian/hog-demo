import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { tap } from '../game/audio'
import { DEBUG } from '../game/debug'
import { goHome } from '../game/menu'
import { lockNav } from '../game/nav'
import { game } from '../game/store'
import { getMyAddress, mySeat, riftReady, riftSit, riftView } from '../mp/session'
import { BattleRank } from './battle'
import { LABELS } from './labels.gen'
import { HeroPickStrip } from './panels'
import { cream, danger, gold, good, muted, panelDim } from './theme'
import { Digits, Face, Gain, GameLogo, Img, MpBackdrop, NameTag, Notice } from './widgets'

// ---- the rift ------------------------------------------------------------------

const RIFT_PIP_FRAC = [0.08, 0.23, 0.38, 0.53, 0.68, 0.84]

function RiftSeats() {
  const pub = riftView.pub
  const seatArt = LABELS['rift-seat']
  const seatW = 252
  const seatH = seatArt ? Math.round((seatW * seatArt.h) / seatArt.w) : 106
  const slots = [0, 1, 2, 3]
  return (
    <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', justifyContent: 'center' }}>
      {slots.map((i) => {
        const seat = pub.seats[i]
        const ready = LABELS[seat?.ready ? 'rift-ready-on' : 'rift-ready-off']
        return (
          <UiEntity
            key={i}
            uiTransform={{ height: 150, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
          >
            <UiEntity
              uiTransform={{ width: seatW, height: seatH, alignItems: 'center', justifyContent: 'center' }}
              uiBackground={
                seatArt
                  ? {
                      textureMode: 'stretch',
                      texture: { src: seatArt.src },
                      color: seat ? Color4.White() : Color4.create(1, 1, 1, 0.55)
                    }
                  : { color: panelDim }
              }
            >
              {seat ? (
                <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                  <Face id={seat.defId} w={110} h={110} />
                  <NameTag name={seat.name} w={18} tint={cream} />
                </UiEntity>
              ) : (
                <Img k="empty-seat" w={14} tint={muted} />
              )}
            </UiEntity>
            {seat && ready ? (
              <UiEntity
                uiTransform={{ width: 40, height: 112, margin: { left: 2 } }}
                uiBackground={{ textureMode: 'stretch', texture: { src: ready.src }, color: Color4.White() }}
              />
            ) : null}
          </UiEntity>
        )
      })}
    </UiEntity>
  )
}

/** The 1..5 + BOSS strip, with a gold marker on the active floor in battle. */
function RiftFloorTrack(props: { floor?: number }) {
  const art = LABELS['rift-floors']
  if (!art) return null
  const w = 150
  const h = Math.round((w * art.h) / art.w)
  const marker = props.floor ? RIFT_PIP_FRAC[Math.max(0, Math.min(5, props.floor - 1))] : undefined
  return (
    <UiEntity
      uiTransform={{ width: w, height: h, alignSelf: 'center' }}
      uiBackground={{ textureMode: 'stretch', texture: { src: art.src }, color: Color4.White() }}
    >
      {marker !== undefined ? (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { bottom: `${Math.round(marker * 100)}%`, left: '30%' },
            width: Math.round(w * 0.4),
            height: 6
          }}
          uiBackground={{ color: gold }}
        />
      ) : null}
    </UiEntity>
  )
}

function RiftLobby() {
  const pub = riftView.pub
  const seat = mySeat()
  const enter = LABELS['rift-enter']
  const canReady = !!seat
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
      <UiEntity
        uiTransform={{
          width: 140,
          height: '100%',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Img k="rift-title" w={104} tint={Color4.White()} margin={0} />
        <Img k="multiplayer-raid" w={16} tint={gold} margin={4} />
      </UiEntity>
      <UiEntity uiTransform={{ width: 48, height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <Img k="rift-ribbon" w={40} tint={Color4.White()} margin={0} />
      </UiEntity>
      <RiftSeats />
      <UiEntity uiTransform={{ width: 170, height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <RiftFloorTrack />
      </UiEntity>
      <UiEntity
        uiTransform={{
          width: 150,
          height: '100%',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {enter ? (
          <UiEntity
            uiTransform={{ width: 130, height: Math.round((130 * enter.h) / enter.w) }}
            uiBackground={{
              textureMode: 'stretch',
              texture: { src: enter.src },
              color: canReady ? (seat?.ready ? gold : Color4.White()) : Color4.create(1, 1, 1, 0.4)
            }}
            onMouseDown={canReady ? tap(() => riftReady(!seat!.ready)) : undefined}
          />
        ) : null}
        <Img k="rift-energy" w={56} tint={Color4.White()} margin={6} />
      </UiEntity>
      {!seat && pub.seats.length < 4 ? (
        <HeroPickStrip
          hint="take-seat"
          withHero={true}
          onPick={(uid) => {
            if (!DEBUG.unlimitedEnergy && game.energy < 5) {
              game.notice = 'no-coin'
              return
            }
            riftSit(uid)
          }}
        />
      ) : null}
      <Notice />
    </UiEntity>
  )
}

function RiftBattle() {
  const pub = riftView.pub
  const b = pub.battle
  const seated = !!mySeat()
  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%',
        flexDirection: 'row',
        alignItems: 'stretch',
        justifyContent: 'center'
      }}
    >
      {b ? <BattleRank units={b.foe} actingUid={b.actingUid} hp={danger} /> : null}
      <UiEntity
        uiTransform={{
          width: 70,
          height: '100%',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Digits value={pub.floor} w={20} tint={gold} />
        {!seated ? <Img k="watching" w={16} tint={muted} margin={8} /> : null}
      </UiEntity>
      {b ? <BattleRank units={b.you} actingUid={b.actingUid} hp={good} /> : null}
      <UiEntity uiTransform={{ width: 120, height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <RiftFloorTrack floor={pub.floor} />
      </UiEntity>
    </UiEntity>
  )
}

function RiftEnd() {
  const pub = riftView.pub
  const won = pub.phase === 'won'
  const seated = !!mySeat()
  const mine = seated ? pub.rewards?.find((reward) => reward.address === getMyAddress()) : undefined
  const dismiss = () => {
    goHome()
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
      <UiEntity uiTransform={{ width: 220, height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        {seated ? (
          <Img k={won ? 'win' : 'lose'} w={190} tint={Color4.White()} margin={0} />
        ) : (
          <Img k="watching" w={36} tint={muted} margin={0} />
        )}
      </UiEntity>
      {won && pub.rewards ? (
        <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
          <Img k="spoils" w={30} tint={gold} margin={6} />
          <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center' }}>
            {pub.rewards.map((reward, i) => {
              const seat = pub.seats.find((entry) => entry.address === reward.address)
              return (
                <UiEntity key={i} uiTransform={{ width: 96, flexDirection: 'row', alignItems: 'center', margin: 4 }}>
                  <NameTag name={seat?.name ?? reward.address.slice(0, 6)} w={16} tint={cream} />
                  <UiEntity
                    uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: { left: 4 } }}
                  >
                    <Img k="icon-coins" w={22} tint={Color4.White()} margin={1} />
                    <Digits value={reward.coins} w={16} tint={gold} />
                  </UiEntity>
                  <UiEntity
                    uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: { left: 4 } }}
                  >
                    <Img k="xp" w={22} tint={cream} margin={1} />
                    <Gain value={reward.xp} w={14} tint={gold} />
                  </UiEntity>
                  {reward.dropDefId ? <Face id={reward.dropDefId} w={54} h={54} /> : null}
                </UiEntity>
              )
            })}
          </UiEntity>
        </UiEntity>
      ) : null}
      {mine?.dropDefId ? (
        <UiEntity
          uiTransform={{
            width: 120,
            height: '100%',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row'
          }}
        >
          <Face id={mine.dropDefId} w={104} h={104} />
        </UiEntity>
      ) : null}
      <UiEntity uiTransform={{ width: 60, height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <NameTag name={'continue'} w={14} tint={muted} />
      </UiEntity>
    </UiEntity>
  )
}

export function RiftScreen() {
  const pub = riftView.pub
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
      <MpBackdrop k="map-rift" />
      {pub.phase === 'lobby' ? <RiftLobby /> : pub.phase === 'battle' ? <RiftBattle /> : <RiftEnd />}
      <GameLogo />
    </UiEntity>
  )
}
