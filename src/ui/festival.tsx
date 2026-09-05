import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { DAY_MS } from '../mp/protocol'
import { canGiftToday, festView, gift, giftSend, presentPlayers } from '../mp/session'
import { chestOpenSheet, giftFx, loopSparksUvs, sparksSheet, stopGiftFx } from './flipbook'
import { press, pressShrink, pressTint } from './fx/press'
import { LABELS } from './labels.gen'
import { ChestStage, ModalScrim } from './panels'
import { cream, danger, gold, muted, panelDim } from './theme'
import { Backdrop, Digits, Face, Gain, Img, MenuTitle, NameTag, SlashCount } from './widgets'

/** Time left in the festival window on the kit's hourglass plate. */
function FestCountdown() {
  const plate = LABELS['fest-plate']
  if (!plate) return null
  const left = Math.max(0, festView.pub.endsAt - Date.now())
  const days = Math.floor(left / DAY_MS)
  const hours = Math.floor((left % DAY_MS) / (60 * 60 * 1000))
  const w = 66
  const h = Math.round((w * plate.h) / plate.w)
  return (
    <UiEntity
      uiTransform={{
        width: w,
        height: h,
        flexDirection: 'column-reverse',
        alignItems: 'center',
        justifyContent: 'center',
        margin: 4,
        padding: { top: Math.round(h * 0.18), bottom: 10 }
      }}
      uiBackground={{ textureMode: 'stretch', texture: { src: plate.src }, uvs: plate.uvs, color: Color4.White() }}
    >
      <Img k="ends-in" w={24} tint={cream} margin={5} />
      <Digits value={days} w={30} tint={gold} tight />
      <NameTag name="d" w={26} tint={gold} />
      <UiEntity uiTransform={{ height: 10 }} />
      <Digits value={hours} w={30} tint={gold} tight />
      <NameTag name="h" w={26} tint={gold} />
    </UiEntity>
  )
}

/** Shared realm goal: everyone's rift floors fill one bar. */
function FestGoalPanel() {
  const panel = LABELS['fest-panel']
  const barFrame = LABELS['fest-bar-frame']
  const barFill = LABELS['fest-bar-fill']
  if (!panel) return null
  const pub = festView.pub
  const frac = pub.target > 0 ? Math.min(1, pub.count / pub.target) : 0
  const done = pub.done || frac >= 1
  const barW = 54 // physical bar height
  const barH = 560 // physical bar length
  const pad = 8
  return (
    <UiEntity
      uiTransform={{
        width: 268,
        height: 700,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        margin: 4,
        padding: 14
      }}
      uiBackground={{ textureMode: 'stretch', texture: { src: panel.src }, uvs: panel.uvs, color: Color4.White() }}
    >
      <Img k="fest-realm-goal" w={42} tint={Color4.White()} margin={3} />
      <Img k="fest-goal-hint" w={22} tint={muted} margin={2} />
      <SlashCount at={pub.count} of={pub.target} w={32} slashW={26} atTint={gold} ofTint={cream} margin={2} />
      <UiEntity uiTransform={{ width: barW, height: barH, margin: 4 }}>
        {barFrame ? (
          <UiEntity
            uiTransform={{
              positionType: 'absolute',
              position: { top: 0, left: 0 },
              width: '100%',
              height: '100%',
              pointerFilter: 'none'
            }}
            uiBackground={{
              textureMode: 'stretch',
              texture: { src: barFrame.src },
              uvs: barFrame.uvs,
              color: Color4.White()
            }}
          />
        ) : null}
        {barFill && frac > 0 ? (
          <UiEntity
            uiTransform={{
              positionType: 'absolute',
              position: { bottom: pad, left: pad },
              width: barW - pad * 2,
              height: Math.round((barH - pad * 2) * frac),
              pointerFilter: 'none'
            }}
            uiBackground={{
              textureMode: 'stretch',
              texture: { src: barFill.src },
              uvs: barFill.uvs,
              color: Color4.White()
            }}
          />
        ) : null}
        {done ? (
          <UiEntity
            uiTransform={{
              positionType: 'absolute',
              position: { top: -20, left: -20 },
              width: barW + 40,
              height: barH + 40,
              pointerFilter: 'none'
            }}
            uiBackground={{
              textureMode: 'stretch',
              texture: { src: sparksSheet() },
              uvs: loopSparksUvs(),
              color: Color4.create(1, 0.9, 0.6, 0.9)
            }}
          />
        ) : null}
      </UiEntity>
      {/* the promised spoils: a crown chest for every contributor */}
      <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: 2 }}>
        <Img k="road-laurel" w={44} tint={done ? gold : Color4.White()} margin={4} />
        <Img k="crate-crown" w={56} tint={Color4.White()} margin={4} />
      </UiEntity>
      <Img k="fest-reward-hint" w={22} tint={done ? gold : muted} margin={2} />
    </UiEntity>
  )
}

/** Daily gift bay: the ribbon chest, SEND, and the sender's blessing toast. */
function FestGiftPanel() {
  const panel = LABELS['fest-panel']
  const chest = LABELS['fest-gift']
  const send = LABELS['fest-send']
  if (!panel) return null
  const can = canGiftToday()
  return (
    <UiEntity
      uiTransform={{
        width: 268,
        height: 700,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        margin: 4,
        padding: 14
      }}
      uiBackground={{ textureMode: 'stretch', texture: { src: panel.src }, uvs: panel.uvs, color: Color4.White() }}
    >
      <Img k="fest-daily-gift" w={42} tint={Color4.White()} margin={3} />
      <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: 2 }}>
        <Img k="fest-gift-hint" w={22} tint={muted} margin={2} />
        <UiEntity uiTransform={{ height: 12 }} />
        <Img k="fest-gift-hint2" w={22} tint={muted} margin={2} />
      </UiEntity>
      <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', justifyContent: 'center' }}>
        {chest ? (
          <UiEntity
            uiTransform={{ width: 132, height: Math.round((132 * chest.h) / chest.w), margin: 8 }}
            uiBackground={{
              textureMode: 'stretch',
              texture: { src: chest.src },
              uvs: chest.uvs,
              color: can ? Color4.White() : muted
            }}
          />
        ) : null}
        {send ? (
          <UiEntity
            uiTransform={{
              width: 102,
              height: Math.round((102 * send.h) / send.w),
              margin: 8,
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onMouseDown={press('fest:send', () => {
              if (!can) return
              if (presentPlayers.size === 0) {
                gift.blocked = 'gone'
                gift.blockedAge = 0
                return
              }
              gift.picking = true
            })}
          >
            <UiEntity
              uiTransform={{
                width: 102 - pressShrink('fest:send', 102),
                height: Math.round(((102 - pressShrink('fest:send', 102)) * send.h) / send.w),
                pointerFilter: 'none'
              }}
              uiBackground={{
                textureMode: 'stretch',
                texture: { src: send.src },
                uvs: send.uvs,
                color: pressTint('fest:send', can ? Color4.White() : muted)
              }}
            />
          </UiEntity>
        ) : null}
      </UiEntity>
      {gift.blessing > 0 ? (
        <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: 2 }}>
          <Img k="gift-sent" w={26} tint={gold} margin={3} />
          <Img k="icon-coins" w={30} tint={Color4.White()} margin={2} />
          <Gain value={gift.blessing} w={26} tint={gold} />
        </UiEntity>
      ) : !can ? (
        <Img k="gift-sent" w={24} tint={muted} margin={2} />
      ) : gift.blocked === 'gone' ? (
        <Img k="no-travelers" w={24} tint={danger} margin={2} />
      ) : null}
    </UiEntity>
  )
}

/** Pick who gets today's gift, from everyone else in the hall. */
function GiftPicker() {
  if (!gift.picking) return null
  const panel = LABELS['fest-panel']
  const ring = LABELS['road-ring']
  const chest = LABELS['fest-gift']
  const cancel = LABELS['fest-cancel']
  const list = [...presentPlayers.entries()].slice(0, 4)
  return (
    <ModalScrim
      alpha={0.86}
      flexDirection="row"
      onMouseDown={() => {
        gift.picking = false
      }}
    >
      <UiEntity
        uiTransform={{
          width: 660,
          height: 740,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24
        }}
        uiBackground={
          panel
            ? { textureMode: 'stretch', texture: { src: panel.src }, uvs: panel.uvs, color: Color4.White() }
            : { color: panelDim }
        }
        onMouseDown={() => {}}
      >
        <Img k="fest-send-a-gift" w={44} tint={gold} margin={5} />
        <Img k="choose-a-player" w={26} tint={cream} margin={3} />
        {list.map(([address, name]) => (
          <UiEntity
            key={address}
            uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', justifyContent: 'center', margin: 8 }}
            onMouseDown={() => giftSend(address)}
          >
            {ring ? (
              <UiEntity
                uiTransform={{ width: 74, height: 74, margin: { bottom: 8 } }}
                uiBackground={{
                  textureMode: 'stretch',
                  texture: { src: ring.src },
                  uvs: ring.uvs,
                  color: Color4.White()
                }}
              />
            ) : null}
            <NameTag name={name} w={30} tint={cream} />
            {chest ? (
              <UiEntity
                uiTransform={{ width: 44, height: Math.round((44 * chest.h) / chest.w), margin: { top: 8 } }}
                uiBackground={{ textureMode: 'stretch', texture: { src: chest.src }, uvs: chest.uvs, color: gold }}
              />
            ) : null}
          </UiEntity>
        ))}
        {cancel ? (
          <UiEntity
            uiTransform={{
              width: 76,
              height: Math.round((76 * cancel.h) / cancel.w),
              margin: 10,
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onMouseDown={press('fest:cancel', () => {
              gift.picking = false
            })}
          >
            <UiEntity
              uiTransform={{
                width: 76 - pressShrink('fest:cancel', 76),
                height: Math.round(((76 - pressShrink('fest:cancel', 76)) * cancel.h) / cancel.w),
                pointerFilter: 'none'
              }}
              uiBackground={{
                textureMode: 'stretch',
                texture: { src: cancel.src },
                uvs: cancel.uvs,
                color: pressTint('fest:cancel')
              }}
            />
          </UiEntity>
        ) : null}
      </UiEntity>
    </ModalScrim>
  )
}

/** The festival hall: countdown, realm goal, daily gift. */
export function FestivalScreen() {
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
      {Backdrop({ label: 'map-settings', dim: 0.55, pass: true })}
      <FestCountdown />
      <FestGoalPanel />
      <FestGiftPanel />
      <GiftPicker />
      <MenuTitle k="fest-banner" />
    </UiEntity>
  )
}

/** Full-screen ribbon-chest ceremony when someone sends you a gift. */
export function GiftCeremony() {
  const got = gift.received
  if (!got) return null
  const fx = giftFx()
  const sheet = chestOpenSheet('gift')
  const light = Color4.create(1, 0.78, 0.35, 1)
  return (
    <ModalScrim
      alpha={0.9}
      flexDirection="row"
      onMouseDown={() => {
        // Dismiss once the lid is open (or if the fx clock never started).
        if (fx.active && !fx.settled) return
        gift.received = undefined
        stopGiftFx()
      }}
    >
      <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: 6 }}>
        <Img k="fest-gift-from" w={30} tint={gold} margin={4} />
        <NameTag name={got.name} w={26} tint={cream} />
      </UiEntity>
      <ChestStage fx={fx} stage={330} margin={8} light={light} chestSrc={sheet} chestUvs={fx.chestUvs} />
      {fx.settled ? (
        <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: 6 }}>
          <Img k="icon-coins" w={34} tint={Color4.White()} margin={3} />
          <Gain value={got.coins} w={28} tint={gold} />
          {got.dropDefId ? (
            <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: { top: 10 } }}>
              <Face id={got.dropDefId} w={92} h={92} />
            </UiEntity>
          ) : null}
        </UiEntity>
      ) : (
        <UiEntity uiTransform={{ width: 40, height: 40 }} />
      )}
      {fx.settled ? <NameTag name={'continue'} w={14} tint={muted} /> : null}
    </ModalScrim>
  )
}
