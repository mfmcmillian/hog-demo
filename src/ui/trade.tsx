import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { open } from '../game/nav'
import { game } from '../game/store'
import {
  getMyName,
  presentPlayers,
  trade,
  tradeAccept,
  tradeDecline,
  tradeInvite,
  tradeLock,
  tradeOffer,
  tradeSides
} from '../mp/session'
import { LABELS } from './labels.gen'
import { HeroPickStrip, TravelerPlate } from './panels'
import { cream, danger, gold, good, muted, panelDim } from './theme'
import { Digits, Face, GameLogo, Img, MpBackdrop, NameTag, Notice } from './widgets'

// ---- multiplayer: trade + rift -------------------------------------------------

/** One side of the trade table: banner + offer card + lock plate. */
function TradeSide(props: { mine: boolean }) {
  const sides = tradeSides()
  const offer = props.mine ? sides.mine : sides.theirs
  const locked = props.mine ? sides.myLock : sides.theirLock
  const name = props.mine ? getMyName() || 'you' : sides.themName
  const banner = LABELS['trade-name']
  const card = LABELS['trade-card']
  const lock = LABELS[locked ? 'trade-lock-on' : 'trade-lock-off']
  const cardW = 330
  const cardH = card ? Math.round((cardW * card.h) / card.w) : 206
  return (
    <UiEntity uiTransform={{ height: 292, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
      {banner ? (
        <UiEntity
          uiTransform={{ width: 44, height: 235, alignItems: 'center', justifyContent: 'center', margin: { right: 2 } }}
          uiBackground={{ textureMode: 'stretch', texture: { src: banner.src }, color: Color4.White() }}
        >
          <NameTag name={name} w={22} tint={props.mine ? gold : cream} />
        </UiEntity>
      ) : null}
      <UiEntity
        uiTransform={{ width: cardW, height: cardH, alignItems: 'center', justifyContent: 'center' }}
        uiBackground={
          card ? { textureMode: 'stretch', texture: { src: card.src }, color: Color4.White() } : { color: panelDim }
        }
      >
        {offer ? (
          <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
            <Face id={offer.defId} w={190} h={190} />
            <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: { left: 4 } }}>
              <Img k={offer.defId} w={20} tint={cream} />
              <Digits value={offer.level} w={18} tint={gold} />
            </UiEntity>
          </UiEntity>
        ) : (
          <Img k="empty-seat" w={18} tint={muted} />
        )}
      </UiEntity>
      {lock ? (
        <UiEntity
          uiTransform={{ width: 64, height: 190, margin: { left: 4 } }}
          uiBackground={{
            textureMode: 'stretch',
            texture: { src: lock.src },
            color: props.mine || locked ? Color4.White() : Color4.create(1, 1, 1, 0.45)
          }}
          onMouseDown={props.mine && offer ? () => tradeLock(!locked) : undefined}
        />
      ) : null}
    </UiEntity>
  )
}

/** Rows of travelers in the scene to invite. */
function TradePartnerList() {
  const people = [...presentPlayers.entries()]
  if (trade.sentTo) {
    return (
      <UiEntity
        uiTransform={{ height: '100%', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
      >
        <Img k="waiting" w={30} tint={gold} />
        <NameTag name={presentPlayers.get(trade.sentTo) ?? trade.sentTo.slice(0, 8)} w={24} tint={cream} />
      </UiEntity>
    )
  }
  if (people.length === 0) {
    return (
      <UiEntity
        uiTransform={{ height: '100%', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
      >
        <Img k="no-travelers" w={26} tint={muted} />
      </UiEntity>
    )
  }
  return (
    <UiEntity uiTransform={{ height: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
      {people.slice(0, 5).map(([address, name]) => (
        <TravelerPlate key={address} name={name} tint={cream} onTap={() => tradeInvite(address)}>
          <Img k="invite" w={24} tint={gold} />
        </TravelerPlate>
      ))}
      {trade.closed ? <Img k="cancelled" w={20} tint={danger} margin={8} /> : null}
    </UiEntity>
  )
}

export function TradeScreen() {
  const sides = tradeSides()
  const swap = LABELS['trade-swap']
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
      <MpBackdrop k="map-trade" />
      <UiEntity uiTransform={{ width: 120, height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <Img k="trade-title" w={110} tint={Color4.White()} margin={0} />
      </UiEntity>
      {trade.table ? (
        <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', justifyContent: 'center' }}>
          <TradeSide mine={true} />
          <TradeSide mine={false} />
          {swap ? (
            <UiEntity
              uiTransform={{
                positionType: 'absolute',
                position: { top: '44%', left: 175 },
                width: 84,
                height: 78,
                pointerFilter: 'none'
              }}
              uiBackground={{ textureMode: 'stretch', texture: { src: swap.src }, color: Color4.White() }}
            />
          ) : null}
        </UiEntity>
      ) : (
        <TradePartnerList />
      )}
      {trade.table ? (
        <HeroPickStrip hint="offer-card" selectedUid={sides.mine?.uid} onPick={(uid) => tradeOffer(uid)} />
      ) : null}
      <Notice />
      <GameLogo />
    </UiEntity>
  )
}

/** Incoming trade invite toast; rendered over every screen. */
export function TradeInviteToast() {
  const invite = trade.invite
  if (!invite || game.phase === 'battle' || game.phase === 'rift' || game.phase === 'start') return null
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: '30%', right: 40 },
        width: 96,
        height: 460,
        flexDirection: 'column-reverse',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      uiBackground={{ color: Color4.create(0.05, 0.03, 0.05, 0.92) }}
    >
      <NameTag name={invite.name} w={22} tint={gold} />
      <Img k="wants-trade" w={20} tint={cream} margin={6} />
      <UiEntity
        uiTransform={{ width: 60, height: 130, alignItems: 'center', justifyContent: 'center', margin: 4 }}
        uiBackground={{ color: good }}
        onMouseDown={() => {
          tradeAccept()
          if (game.phase === 'home') open('trade')
        }}
      >
        <Img k="accept" w={22} tint={cream} />
      </UiEntity>
      <UiEntity
        uiTransform={{ width: 60, height: 130, alignItems: 'center', justifyContent: 'center', margin: 4 }}
        uiBackground={{ color: danger }}
        onMouseDown={() => tradeDecline()}
      >
        <Img k="decline" w={22} tint={cream} />
      </UiEntity>
    </UiEntity>
  )
}
