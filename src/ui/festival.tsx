import { Color4 } from '@dcl/sdk/math'
import ReactEcs from '@dcl/sdk/react-ecs'
import { UiEntity } from './ui'
import {
  DAILY_BONUS,
  DailyReward,
  STREAK_REWARDS,
  canClaimBonus,
  canClaimLogin,
  canClaimTask,
  claimBonus,
  claimLogin,
  claimTask,
  dailyClaimable,
  earnedStreak,
  msToNextDay,
  nextStreakDay,
  streakBroken,
  taskDone,
  taskPaid,
  taskProgress,
  todaysTasks
} from '../game/daily'
import { tap } from '../game/audio'
import { goDailyTask } from '../game/nav'
import { game } from '../game/store'
import { tipShowing } from '../game/tutorial'
import { DAILY_STREAK_LEN, DAY_MS } from '../mp/protocol'
import { canGiftToday, festView, gift, giftSend, levelOf, presentPlayers } from '../mp/session'
import { chestOpenSheet, giftFx, loopSparksUvs, sparksSheet, stopGiftFx } from './flipbook'
import { press, pressShrink, pressTint } from './fx/press'
import './labels.daily.gen'
import './labels.boss.gen' // boss-spoils / boss-felled on the spoils chest
import './labels.hall.gen' // rank-hash
import { LABELS } from './labels.gen'
import { ChestStage, ModalScrim } from './panels'
import { cream, danger, gold, muted, panelDim } from './theme'
import {
  Backdrop,
  btnDark,
  Digits,
  Face,
  Gain,
  Img,
  LabelBtn,
  LevelBadge,
  MenuTitle,
  NameTag,
  Notice,
  SlashCount
} from './widgets'

// ---- daily hooks ---------------------------------------------------------------------

/** Panel extent across the phone (720 stage less the margins). */
const PANEL_H = 700
/** Phone-horizontal room inside a panel after its padding. */
const PANEL_INNER = PANEL_H - 24
const slotEarned = Color4.create(0.32, 0.2, 0.07, 0.8)
const slotToday = Color4.create(0.82, 0.62, 0.28, 0.3)
const slotFuture = Color4.create(0.08, 0.05, 0.06, 0.6)
const rowDark = Color4.create(0.08, 0.05, 0.06, 0.62)
const rowLit = Color4.create(0.32, 0.2, 0.07, 0.62)
const tabDark = Color4.create(0.06, 0.04, 0.05, 0.7)
const tabLit = Color4.create(0.28, 0.17, 0.06, 0.85)

/** What a reward holds, as icons reading physically left-to-right. */
function RewardIcons(props: { reward: DailyReward; w: number; dim?: boolean }) {
  const tint = props.dim ? muted : Color4.White()
  const num = props.dim ? muted : gold
  const packK = `crate-${props.reward.pack ?? 'ember'}` // the shop's chest art
  return (
    <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center' }}>
      <Img k="icon-coins" w={props.w} tint={tint} margin={1} />
      <Digits value={props.reward.coins} w={Math.round(props.w * 0.62)} tint={num} tight />
      {props.reward.pack ? <Img k={packK} w={Math.round(props.w * 1.15)} tint={tint} margin={2} /> : null}
      {props.reward.refill ? <Img k="icon-bolt" w={props.w} tint={tint} margin={2} /> : null}
    </UiEntity>
  )
}

/** Seven day cards sit across the phone (column-reverse), so each card's
 * phone-wide extent (height) is the panel's inner room split seven ways. */
const DAY_CARD_H = Math.floor((PANEL_INNER - 7 * 4) / 7)
const DAY_CARD_W = 156

/** One day on the 7-day streak track, reading top-to-bottom on the phone:
 * day number, the prize art, the coin count. Earned days sit on lit leather,
 * today's card gets a gold frame, days ahead are dimmed. */
function DayCard(props: { key?: number; day: number; earned: boolean; today: boolean }) {
  const reward = STREAK_REWARDS[props.day - 1]
  const dim = !props.earned && !props.today
  const icon = dim ? muted : Color4.White()
  const num = dim ? muted : gold
  const bg = props.earned ? slotEarned : props.today ? slotToday : slotFuture
  return (
    <UiEntity
      uiTransform={{
        width: DAY_CARD_W,
        height: DAY_CARD_H,
        margin: 2,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        ...(props.today ? { borderWidth: 3, borderColor: gold } : {})
      }}
      uiBackground={{ color: bg }}
    >
      <Digits value={props.day} w={20} tint={props.today ? gold : props.earned ? cream : muted} tight />
      <UiEntity uiTransform={{ width: 6 }} />
      <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center' }}>
        <Img k="icon-coins" w={40} tint={icon} margin={1} />
        {reward.pack ? <Img k={`crate-${reward.pack}`} w={46} tint={icon} margin={1} /> : null}
        {reward.refill ? <Img k="icon-bolt" w={36} tint={icon} margin={1} /> : null}
      </UiEntity>
      <UiEntity uiTransform={{ width: 4 }} />
      <Digits value={reward.coins} w={22} tint={num} tight />
    </UiEntity>
  )
}

/** Daily rewards: the 7-day streak track and today's CLAIM. */
function DailyRewardsPanel() {
  const panel = LABELS['fest-panel']
  if (!panel) return null
  const can = canClaimLogin()
  const earned = earnedStreak()
  const next = nextStreakDay()
  const lost = can && streakBroken()
  return (
    <UiEntity
      uiTransform={{
        width: 520,
        height: PANEL_H,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-evenly',
        margin: 4,
        padding: 12
      }}
      uiBackground={{ textureMode: 'stretch', texture: { src: panel.src }, uvs: panel.uvs, color: Color4.White() }}
    >
      <Img k="daily-rewards" w={50} tint={gold} margin={4} />
      <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center' }}>
        <Img k="streak" w={30} tint={cream} margin={3} />
        <UiEntity uiTransform={{ width: 10 }} />
        <Digits value={earned} w={34} tint={gold} tight />
        <UiEntity uiTransform={{ width: 20 }} />
        <Img k="day" w={26} tint={muted} margin={2} />
        <Digits value={can ? next : earned} w={30} tint={can ? gold : muted} tight />
      </UiEntity>
      <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', justifyContent: 'center' }}>
        {STREAK_REWARDS.map((_, i) => (
          <DayCard key={i} day={i + 1} earned={i + 1 <= earned} today={can && i + 1 === next} />
        ))}
      </UiEntity>
      {can ? (
        <LabelBtn k="claim" id="daily:login" w={84} h={300} labelW={42} onTap={() => claimLogin()} />
      ) : (
        <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center' }}>
          <Img k="claimed" w={32} tint={gold} margin={3} />
          <UiEntity uiTransform={{ width: 14 }} />
          <Img k="come-back-tomorrow" w={28} tint={muted} margin={3} />
        </UiEntity>
      )}
      <Img k={lost ? 'streak-lost' : 'streak-hint'} w={24} tint={lost ? danger : muted} margin={4} />
    </UiEntity>
  )
}

/** One task line: what to do | progress | pay | CLAIM (or claimed). */
function TaskRow(props: { key?: number; slot: number }) {
  const def = todaysTasks()[props.slot]
  const done = taskDone(props.slot)
  const paid = taskPaid(props.slot)
  const claimable = canClaimTask(props.slot)
  const n = taskProgress(props.slot)
  return (
    <UiEntity
      uiTransform={{
        width: TASK_W,
        height: TASK_H,
        margin: 3,
        flexDirection: 'column-reverse',
        alignItems: 'center',
        justifyContent: 'flex-start',
        padding: { top: 8, bottom: 8 }
      }}
      uiBackground={{ color: claimable ? rowLit : rowDark }}
    >
      <Img k={`task-${def.id}`} w={34} tint={paid ? muted : cream} margin={4} />
      <UiEntity uiTransform={{ flexGrow: 1 }} />
      <SlashCount at={n} of={def.target} w={28} slashW={22} atTint={done ? gold : cream} ofTint={muted} margin={2} />
      <UiEntity uiTransform={{ width: 12 }} />
      <Img k="icon-coins" w={32} tint={paid ? muted : Color4.White()} margin={1} />
      <Digits value={def.coins} w={22} tint={paid ? muted : gold} tight />
      <UiEntity uiTransform={{ width: 12 }} />
      {claimable ? (
        <LabelBtn
          k="claim"
          id={`daily:task${props.slot}`}
          w={TASK_BTN_W}
          h={TASK_BTN_H}
          labelW={32}
          margin={2}
          onTap={() => claimTask(props.slot)}
        />
      ) : paid ? (
        <UiEntity
          uiTransform={{ width: TASK_BTN_W, height: TASK_BTN_H, alignItems: 'center', justifyContent: 'center', margin: 2 }}
        >
          <Img k="claimed" w={22} tint={muted} margin={0} />
        </UiEntity>
      ) : (
        // Not done yet: GO jumps straight to where this task gets done.
        <LabelBtn
          k="task-go"
          id={`daily:go${props.slot}`}
          w={TASK_BTN_W}
          h={TASK_BTN_H}
          labelW={34}
          bg={btnDark}
          labelTint={gold}
          margin={2}
          onTap={() => goDailyTask(def.id)}
        />
      )}
    </UiEntity>
  )
}

/** Task column (and the bonus column) dimensions: phone-tall x phone-wide. */
const TASK_W = 98
const TASK_H = PANEL_INNER - 20
const TASK_BTN_W = 72
const TASK_BTN_H = 132

/** Today's three tasks, the all-done bonus, and the reroll clock. */
function DailyTasksPanel() {
  const panel = LABELS['fest-panel']
  if (!panel) return null
  const bonusCan = canClaimBonus()
  const bonusPaid = !bonusCan && todaysTasks().every((_, i) => taskPaid(i))
  const left = msToNextDay()
  const hours = Math.floor(left / (60 * 60 * 1000))
  const mins = Math.floor((left % (60 * 60 * 1000)) / 60000)
  return (
    <UiEntity
      uiTransform={{
        width: 640,
        height: PANEL_H,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-evenly',
        margin: 4,
        padding: 12
      }}
      uiBackground={{ textureMode: 'stretch', texture: { src: panel.src }, uvs: panel.uvs, color: Color4.White() }}
    >
      <Img k="daily-tasks" w={50} tint={gold} margin={4} />
      {todaysTasks().map((_, i) => (
        <TaskRow key={i} slot={i} />
      ))}
      <UiEntity
        uiTransform={{
          width: TASK_W,
          height: TASK_H,
          margin: 3,
          flexDirection: 'column-reverse',
          alignItems: 'center',
          justifyContent: 'flex-start',
          padding: { top: 8, bottom: 8 }
        }}
        uiBackground={{ color: bonusCan ? rowLit : rowDark }}
      >
        <Img k="all-done-bonus" w={34} tint={bonusPaid ? muted : gold} margin={4} />
        <UiEntity uiTransform={{ flexGrow: 1 }} />
        <RewardIcons reward={DAILY_BONUS} w={32} dim={bonusPaid} />
        <UiEntity uiTransform={{ width: 12 }} />
        {bonusCan ? (
          <LabelBtn
            k="claim"
            id="daily:bonus"
            w={TASK_BTN_W}
            h={TASK_BTN_H}
            labelW={32}
            margin={2}
            onTap={() => claimBonus()}
          />
        ) : bonusPaid ? (
          <UiEntity
            uiTransform={{ width: TASK_BTN_W, height: TASK_BTN_H, alignItems: 'center', justifyContent: 'center', margin: 2 }}
          >
            <Img k="claimed" w={22} tint={muted} margin={0} />
          </UiEntity>
        ) : (
          <UiEntity uiTransform={{ width: TASK_BTN_W, height: TASK_BTN_H, margin: 2 }} />
        )}
      </UiEntity>
      <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center' }}>
        <Img k="new-tasks-in" w={24} tint={muted} margin={3} />
        <UiEntity uiTransform={{ width: 10 }} />
        <Digits value={hours} w={28} tint={cream} tight />
        <NameTag name="h" w={24} tint={muted} />
        <UiEntity uiTransform={{ width: 8 }} />
        <Digits value={mins} w={28} tint={cream} tight />
        <NameTag name="m" w={24} tint={muted} />
      </UiEntity>
    </UiEntity>
  )
}

// ---- the festival -----------------------------------------------------------------------

/** Time left in the festival window on the kit's hourglass plate. */
function FestCountdown() {
  const plate = LABELS['fest-plate']
  if (!plate) return null
  const left = Math.max(0, festView.pub.endsAt - Date.now())
  const days = Math.floor(left / DAY_MS)
  const hours = Math.floor((left % DAY_MS) / (60 * 60 * 1000))
  const w = 100
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
      <Img k="ends-in" w={34} tint={cream} margin={6} />
      <Digits value={days} w={44} tint={gold} tight />
      <NameTag name="d" w={36} tint={gold} />
      <UiEntity uiTransform={{ height: 14 }} />
      <Digits value={hours} w={44} tint={gold} tight />
      <NameTag name="h" w={36} tint={gold} />
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
  const barW = 74 // physical bar height
  const barH = PANEL_H - 64 // physical bar length
  const pad = 10
  return (
    <UiEntity
      uiTransform={{
        width: 460,
        height: PANEL_H,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        margin: 4,
        padding: 14
      }}
      uiBackground={{ textureMode: 'stretch', texture: { src: panel.src }, uvs: panel.uvs, color: Color4.White() }}
    >
      <Img k="fest-realm-goal" w={60} tint={Color4.White()} margin={4} />
      <Img k="fest-goal-hint" w={30} tint={muted} margin={3} />
      <SlashCount at={pub.count} of={pub.target} w={44} slashW={36} atTint={gold} ofTint={cream} margin={3} />
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
      <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: 4 }}>
        <Img k="road-laurel" w={64} tint={done ? gold : Color4.White()} margin={4} />
        <Img k="crate-crown" w={80} tint={Color4.White()} margin={4} />
      </UiEntity>
      <Img k="fest-reward-hint" w={30} tint={done ? gold : muted} margin={3} />
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
  const sendW = 140 - pressShrink('fest:send', 140)
  return (
    <UiEntity
      uiTransform={{
        width: 460,
        height: PANEL_H,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        margin: 4,
        padding: 14
      }}
      uiBackground={{ textureMode: 'stretch', texture: { src: panel.src }, uvs: panel.uvs, color: Color4.White() }}
    >
      <Img k="fest-daily-gift" w={60} tint={Color4.White()} margin={4} />
      <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: 3 }}>
        <Img k="fest-gift-hint" w={30} tint={muted} margin={2} />
        <UiEntity uiTransform={{ height: 14 }} />
        <Img k="fest-gift-hint2" w={30} tint={muted} margin={2} />
      </UiEntity>
      <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', justifyContent: 'center' }}>
        {chest ? (
          <UiEntity
            uiTransform={{ width: 180, height: Math.round((180 * chest.h) / chest.w), margin: 10 }}
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
              width: 140,
              height: Math.round((140 * send.h) / send.w),
              margin: 10,
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
                width: sendW,
                height: Math.round((sendW * send.h) / send.w),
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
        <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: 3 }}>
          <Img k="gift-sent" w={34} tint={gold} margin={3} />
          <Img k="icon-coins" w={40} tint={Color4.White()} margin={2} />
          <Gain value={gift.blessing} w={34} tint={gold} />
        </UiEntity>
      ) : !can ? (
        <Img k="gift-sent" w={32} tint={muted} margin={3} />
      ) : gift.blocked === 'gone' ? (
        <Img k="no-travelers" w={32} tint={danger} margin={3} />
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
      buttons
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
          padding: 24,
          pointerFilter: 'block' // not a cancel; no handler, so the plates below get the click (desktop)
        }}
        uiBackground={
          panel
            ? { textureMode: 'stretch', texture: { src: panel.src }, uvs: panel.uvs, color: Color4.White() }
            : { color: panelDim }
        }
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
            <UiEntity uiTransform={{ width: 6 }} />
            <LevelBadge level={levelOf(address)} w={14} />
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

const FEST_PAGES = 2

/** Which page is showing. While the events tip runs, follow it: its first two
 * pages point at the dailies, the last two at the realm goal and gift. */
function festPage(): number {
  if (tipShowing() && game.tutTip === 'events') return game.tutPage >= 2 ? 1 : 0
  return Math.max(0, Math.min(FEST_PAGES - 1, game.festPage))
}

/** One page tab. A canvas row is a phone column: the label plate on top, a
 * gold rule under the live tab. `alert` adds a gold dot when the page has
 * something to collect. */
function PageTab(props: { k: string; page: number; alert: boolean }) {
  const live = festPage() === props.page
  const id = `fest:tab${props.page}`
  return (
    <UiEntity
      uiTransform={{ width: TAB_W, height: TAB_H, margin: { top: 6, bottom: 6 }, flexDirection: 'row' }}
      onMouseDown={
        live
          ? undefined
          : press(
              id,
              tap(() => {
                game.festPage = props.page
              })
            )
      }
    >
      <UiEntity
        uiTransform={{
          flexGrow: 1,
          height: '100%',
          flexDirection: 'column-reverse',
          alignItems: 'center',
          justifyContent: 'center',
          pointerFilter: 'none'
        }}
        uiBackground={{ color: pressTint(id, live ? tabLit : tabDark) }}
      >
        <Img k={props.k} w={30} tint={live ? gold : muted} margin={0} />
        {props.alert && !live ? (
          <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', pointerFilter: 'none' }}>
            <UiEntity uiTransform={{ width: 12, pointerFilter: 'none' }} />
            <Img k="dot" w={16} tint={gold} margin={0} />
          </UiEntity>
        ) : null}
      </UiEntity>
      <UiEntity
        uiTransform={{ width: 5, height: '100%', pointerFilter: 'none' }}
        uiBackground={{ color: live ? gold : Color4.create(0, 0, 0, 0) }}
      />
    </UiEntity>
  )
}

const TAB_W = 66 // phone-tall
const TAB_H = 300 // phone-wide

/** The two page tabs along the physical top of the hall. */
function PageTabs() {
  return (
    <UiEntity
      uiTransform={{
        width: TAB_W,
        height: '100%',
        flexDirection: 'column-reverse',
        alignItems: 'center',
        justifyContent: 'center',
        margin: { right: 8 }
      }}
    >
      <PageTab k="page-dailies" page={0} alert={dailyClaimable()} />
      <PageTab k="page-realm" page={1} alert={canGiftToday() && presentPlayers.size > 0} />
    </UiEntity>
  )
}

/** The events hall, two pages under a tab bar: the dailies first (streak
 * rewards, task board — the reasons to come back), then the realm page (the
 * week's shared goal with its countdown, and the daily gift bay). */
export function FestivalScreen() {
  const page = festPage()
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
      <PageTabs />
      {page === 0 ? (
        <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
          <DailyRewardsPanel />
          <DailyTasksPanel />
        </UiEntity>
      ) : (
        <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
          <FestCountdown />
          <FestGoalPanel />
          <FestGiftPanel />
        </UiEntity>
      )}
      <GiftPicker />
      <Notice />
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
        {got.goal ? (
          // The realm goal's crown chest: the goal's own title, no sender.
          <Img k="fest-realm-goal" w={42} tint={Color4.White()} margin={4} />
        ) : got.boss !== undefined ? (
          // World boss spoils: the week's rank it paid, or the kill bonus.
          <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center' }}>
            <Img k="boss-spoils" w={34} tint={gold} margin={4} />
            <UiEntity uiTransform={{ width: 10 }} />
            {got.boss > 0 ? (
              <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center' }}>
                <Img k="rank-hash" w={24} tint={cream} margin={0} />
                <Digits value={got.boss} w={34} tint={cream} tight />
              </UiEntity>
            ) : (
              <Img k="boss-felled" w={24} tint={cream} margin={4} />
            )}
          </UiEntity>
        ) : (
          <Img k="fest-gift-from" w={30} tint={gold} margin={4} />
        )}
        {got.goal || got.boss !== undefined ? null : <NameTag name={got.name} w={26} tint={cream} />}
      </UiEntity>
      <ChestStage fx={fx} stage={330} margin={8} light={light} chestSrc={sheet} chestUvs={fx.chestUvs} />
      {fx.settled ? (
        <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: 6 }}>
          {got.coins > 0 ? <Img k="icon-coins" w={34} tint={Color4.White()} margin={3} /> : null}
          {got.coins > 0 ? <Gain value={got.coins} w={28} tint={gold} /> : null}
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
