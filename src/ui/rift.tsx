import { Color4 } from '@dcl/sdk/math'
import ReactEcs from '@dcl/sdk/react-ecs'
import { UiEntity } from './ui'
import { tap } from '../game/audio'
import { DEBUG } from '../game/debug'
import { acceptFzInvite, enterArena, lockNav } from '../game/nav'
import { game } from '../game/store'
import { partyUnits } from '../game/party'
import {
  Arena,
  DUEL_ENERGY_COST,
  DUEL_MODES,
  DUEL_SEATS,
  DuelMode,
  DuelSeat,
  RIFT_ENERGY_COST,
  RIFT_GHOST_FILL,
  RIFT_SEATS,
  RiftSeat
} from '../mp/protocol'
import {
  activeDuel,
  currentArena,
  duelGhost,
  duelReady,
  duelRequeue,
  duelSit,
  duelViews,
  fz,
  fzDecline,
  fzInvite,
  fzInviteLeft,
  getMyAddress,
  levelOf,
  myDuelPickFaces,
  myDuelPickUid,
  myDuelSeat,
  mySeat,
  presentPlayers,
  riftReady,
  riftRequeue,
  riftSit,
  riftView
} from '../mp/session'
import { AvatarBust, GHOST_CAST } from './avatar'
import { BattleRank } from './battle'
import { press, pressShrink, pressTint } from './fx/press'
import { cardBackArt } from './halls'
import './labels.duel.gen'
import './labels.feed.gen'
import { LABELS } from './labels.gen'
import { HeroPickStrip, ModalScrim } from './panels'
import { cream, danger, gold, good, muted, panelDim, PASS } from './theme'
import {
  btnDark,
  Digits,
  Face,
  Gain,
  Img,
  LabelBtn,
  LevelBadge,
  MenuTitle,
  MpBackdrop,
  NameTag,
  Notice,
  SlashCount
} from './widgets'

// ---- the friendzone (arena hub -> raid room / duel rings) ---------------------------
//
// Flow: the hub lists every room with live occupancy and state; JOIN drops you
// into that room's lobby (sit -> ready -> 3-2-1 -> fight -> spoils), where
// PLAY AGAIN re-seats you when the room reopens and LEAVE returns to the hub.

const RIFT_PIP_FRAC = [0.08, 0.23, 0.38, 0.53, 0.68, 0.84]

const chipOpen = Color4.create(0.12, 0.34, 0.16, 0.85)
const chipBattle = Color4.create(0.5, 0.12, 0.12, 0.85)
const chipCount = Color4.create(0.62, 0.45, 0.16, 0.85)
const chipWait = Color4.create(0.2, 0.15, 0.16, 0.85)

type RoomStatus = { k: 'lobby-open' | 'in-battle' | 'starting-in' | 'reopens-in'; n?: number; bg: Color4 }

/** One line on a room's state, for the hub cards and lobby headers. */
function roomStatus(phase: string, startIn?: number, resetIn?: number): RoomStatus {
  if (phase === 'lobby') {
    return startIn !== undefined ? { k: 'starting-in', n: startIn, bg: chipCount } : { k: 'lobby-open', bg: chipOpen }
  }
  if (phase === 'battle') return { k: 'in-battle', bg: chipBattle }
  return { k: 'reopens-in', n: resetIn, bg: chipWait }
}

/** A colored status chip: OPEN / IN BATTLE / STARTING IN n / REOPENS IN n. */
function StatusChip(props: { status: RoomStatus; w?: number }) {
  const w = props.w ?? 16
  return (
    <UiEntity
      uiTransform={{
        flexDirection: 'column-reverse',
        alignItems: 'center',
        justifyContent: 'center',
        padding: { top: 8, bottom: 8, left: 5, right: 5 },
        margin: 3
      }}
      uiBackground={{ color: props.status.bg }}
    >
      <Img k={props.status.k} w={w} tint={cream} margin={0} />
      {props.status.n !== undefined ? (
        <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: { top: 6 } }}>
          <Digits value={props.status.n} w={Math.round(w * 1.2)} tint={gold} tight />
        </UiEntity>
      ) : null}
    </UiEntity>
  )
}

/** READY n/m for a lobby: how many of the seated have pressed ENTER, over a
 * row of seat pips - green ready, gold seated, dark empty - so the room's
 * state reads at a glance without counting. */
function ReadyCount(props: { seats: { ready: boolean }[]; slots: number; big?: boolean }) {
  const total = props.seats.length
  const ready = props.seats.filter((seat) => seat.ready).length
  const all = total > 0 && ready === total
  const s = props.big ? 1.45 : 1
  const pip = Math.round(16 * s)
  return (
    <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', margin: 3 }}>
      <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center' }}>
        <Img k="ready" w={Math.round(18 * s)} tint={all ? gold : cream} margin={3} />
        <UiEntity uiTransform={{ width: 8 }} />
        <SlashCount
          at={ready}
          of={total}
          w={Math.round(22 * s)}
          slashW={Math.round(18 * s)}
          atTint={all ? gold : cream}
          ofTint={muted}
        />
      </UiEntity>
      <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: { left: 6 } }}>
        {Array.from({ length: props.slots }, (_, i) => {
          const seat = props.seats[i]
          const color = !seat ? pipEmpty : seat.ready ? pipReady : pipSeated
          return <UiEntity key={i} uiTransform={{ width: pip, height: pip, margin: 3 }} uiBackground={{ color }} />
        })}
      </UiEntity>
    </UiEntity>
  )
}

const pipReady = Color4.create(0.28, 0.85, 0.35, 1)
const pipSeated = Color4.create(0.82, 0.62, 0.28, 1)
const pipEmpty = Color4.create(0.08, 0.05, 0.06, 0.7)

/** The room card on the hub: who is in, what state it's in, JOIN or SPECTATE. */
function ArenaCard(props: { arena: Arena }) {
  const panel = LABELS['fest-panel']
  const raid = props.arena === 'raid'
  const pub = props.arena === 'raid' ? riftView.pub : duelViews[props.arena].pub
  const max = raid ? RIFT_SEATS : DUEL_SEATS
  const status = roomStatus(pub.phase, pub.startIn, pub.resetIn)
  const joinable = pub.phase === 'lobby'
  const seats = Array.from({ length: max }, (_, i) => pub.seats[i])
  // JOIN sits you down on the way in (SPECTATE just shows the room).
  const enter = () => enterArena(props.arena)
  return (
    <UiEntity
      uiTransform={{
        width: 320,
        height: 600,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        margin: 4,
        padding: 14
      }}
      uiBackground={
        panel
          ? { textureMode: 'stretch', texture: { src: panel.src }, uvs: panel.uvs, color: Color4.White() }
          : { color: panelDim }
      }
    >
      <Img k={raid ? 'arena-raid' : `duel-${props.arena}`} w={30} tint={gold} margin={4} />
      <Img k={raid ? 'coop-hint' : props.arena === '1v1' ? 'pvp-hint' : 'pvp4-hint'} w={14} tint={muted} margin={2} />
      <StatusChip status={status} />
      {/* the seats, physically left-to-right: faces for raiders, names for duelists */}
      <UiEntity
        uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', justifyContent: 'center', margin: 4 }}
      >
        {seats.map((seat, i) => (
          <UiEntity
            key={i}
            uiTransform={{ width: 58, height: 58, margin: 3, alignItems: 'center', justifyContent: 'center' }}
            uiBackground={{
              color: seat
                ? seat.ghost
                  ? Color4.create(0.12, 0.2, 0.32, 0.55)
                  : Color4.create(0.32, 0.2, 0.07, 0.6)
                : Color4.create(0.08, 0.05, 0.06, 0.5)
            }}
          >
            {seat ? (
              raid ? (
                <Face id={(seat as RiftSeat).defId} w={52} h={52} tint={seat.ghost ? GHOST_CAST : undefined} />
              ) : seat.ghost ? (
                <Img k="ghost" w={10} tint={GHOST_CAST} margin={0} />
              ) : (
                <AvatarBust address={seat.address} w={48} margin={0} />
              )
            ) : (
              <Img k="empty-seat" w={9} tint={muted} margin={0} />
            )}
          </UiEntity>
        ))}
      </UiEntity>
      <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: 2 }}>
        <Img k="seated" w={13} tint={muted} margin={3} />
        <UiEntity uiTransform={{ width: 8 }} />
        <SlashCount at={pub.seats.length} of={max} w={18} slashW={14} atTint={cream} ofTint={muted} />
      </UiEntity>
      <LabelBtn
        k={joinable ? 'join' : 'spectate'}
        id={`hub:${props.arena}`}
        w={44}
        h={190}
        labelW={joinable ? 24 : 17}
        bg={joinable ? undefined : btnDark}
        onTap={enter}
      />
    </UiEntity>
  )
}

/** The friendzone landing: every room at a glance, plus who's in the hall. */
function ArenaHub() {
  return (
    <UiEntity
      uiTransform={{
        flexGrow: 1,
        height: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <UiEntity uiTransform={{ width: 80, height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <Img k="choose-your-arena" w={22} tint={gold} margin={0} />
      </UiEntity>
      <ArenaCard arena="raid" />
      <ArenaCard arena="1v1" />
      <ArenaCard arena="4v4" />
      <UiEntity
        uiTransform={{
          width: 70,
          height: '100%',
          flexDirection: 'column-reverse',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Img k="players-online" w={14} tint={muted} margin={3} />
        <UiEntity uiTransform={{ width: 8 }} />
        <Digits value={presentPlayers.size + 1} w={20} tint={cream} tight />
      </UiEntity>
    </UiEntity>
  )
}

/** Pick a traveler to invite into the room you're in (same look as the gift picker). */
function InvitePicker() {
  if (!fz.inviting) return null
  const panel = LABELS['fest-panel']
  const ring = LABELS['road-ring']
  const cancel = LABELS['fest-cancel']
  const list = [...presentPlayers.entries()].slice(0, 5)
  const close = () => {
    fz.inviting = false
  }
  return (
    <ModalScrim alpha={0.86} flexDirection="row" buttons onMouseDown={close}>
      <UiEntity
        uiTransform={{
          width: 830,
          height: 740,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          pointerFilter: 'block'
        }}
        uiBackground={
          panel
            ? { textureMode: 'stretch', texture: { src: panel.src }, uvs: panel.uvs, color: Color4.White() }
            : { color: panelDim }
        }
      >
        <Img k="invite" w={50} tint={gold} margin={6} />
        <Img k={list.length > 0 ? 'choose-a-player' : 'no-travelers'} w={32} tint={cream} margin={4} />
        {list.map(([address, name]) => (
          <UiEntity
            key={address}
            uiTransform={{
              flexDirection: 'column-reverse',
              alignItems: 'center',
              justifyContent: 'center',
              margin: 10
            }}
            onMouseDown={tap(() => fzInvite(address))}
          >
            {ring ? (
              <UiEntity
                uiTransform={{
                  width: 96,
                  height: 96,
                  margin: { bottom: 10 },
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                uiBackground={{
                  textureMode: 'stretch',
                  texture: { src: ring.src },
                  uvs: ring.uvs,
                  color: Color4.White()
                }}
              >
                <AvatarBust address={address} w={70} margin={0} />
              </UiEntity>
            ) : null}
            <NameTag name={name} w={38} tint={cream} />
            <UiEntity uiTransform={{ width: 8 }} />
            <LevelBadge level={levelOf(address)} w={18} />
          </UiEntity>
        ))}
        {cancel ? (
          <UiEntity
            uiTransform={{
              width: 92,
              height: Math.round((92 * cancel.h) / cancel.w),
              margin: 10,
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onMouseDown={press('fz:cancel', close)}
          >
            <UiEntity
              uiTransform={{
                width: 92 - pressShrink('fz:cancel', 92),
                height: Math.round(((92 - pressShrink('fz:cancel', 92)) * cancel.h) / cancel.w),
                pointerFilter: 'none'
              }}
              uiBackground={{
                textureMode: 'stretch',
                texture: { src: cancel.src },
                uvs: cancel.uvs,
                color: pressTint('fz:cancel')
              }}
            />
          </UiEntity>
        ) : null}
      </UiEntity>
    </ModalScrim>
  )
}

/** INVITE plate for a seated player while seats are free, with the SENT flash. */
function InviteBtn() {
  if (fz.sentFlash > 0) return <Img k="invite-sent" w={15} tint={gold} margin={4} />
  return (
    <LabelBtn
      k="invite"
      id="fz:invite"
      w={40}
      h={150}
      labelW={18}
      bg={btnDark}
      disabled={presentPlayers.size === 0}
      onTap={() => {
        fz.inviting = true
      }}
    />
  )
}

/** Everyone's ready: the 3-2-1 over the lobby. Taps still reach ENTER below
 * (un-readying cancels the countdown on the server). */
function StartingOverlay(props: { startIn?: number }) {
  if (props.startIn === undefined) return null
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 0, left: 0 },
        width: '100%',
        height: '100%',
        flexDirection: 'column-reverse',
        alignItems: 'center',
        justifyContent: 'center',
        ...PASS
      }}
      uiBackground={{ color: Color4.create(0.02, 0.01, 0.02, 0.45) }}
    >
      <Img k="starting-in" w={36} tint={gold} margin={6} />
      <UiEntity uiTransform={{ width: 16 }} />
      <Digits value={props.startIn} w={120} tint={cream} tight />
    </UiEntity>
  )
}

/** The spoils screen's actions: the reopen clock everyone sees, PLAY AGAIN for
 * participants (re-seats when the room reopens), LEAVE back to the hub. */
function EndButtons(props: { arena: Arena; seated: boolean; resetIn?: number }) {
  const raid = props.arena === 'raid'
  const queued = fz.requeue?.arena === props.arena
  return (
    <UiEntity
      uiTransform={{
        width: 150,
        height: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: 6 }}>
        <Img k={raid ? 'next-raid-in' : 'next-duel-in'} w={14} tint={muted} margin={3} />
        <UiEntity uiTransform={{ width: 8 }} />
        <Digits value={props.resetIn ?? 0} w={26} tint={gold} tight />
      </UiEntity>
      {props.seated ? (
        queued ? (
          <Img k="queued-again" w={14} tint={gold} margin={6} />
        ) : (
          <LabelBtn
            k="play-again"
            id="fz:again"
            w={50}
            h={230}
            labelW={24}
            onTap={() => (raid ? riftRequeue() : duelRequeue(props.arena as DuelMode))}
          />
        )
      ) : null}
      <LabelBtn
        k="leave"
        id="fz:leave"
        w={44}
        h={160}
        labelW={22}
        bg={btnDark}
        onTap={() => {
          fz.requeue = undefined
          fz.tab = 'hub'
          lockNav()
        }}
      />
    </UiEntity>
  )
}

/** Someone pinged me from a room: accept lands me in that lobby. Hidden while
 * fighting or mid-ceremony, and while I'm already looking at that room. */
export function FzInviteToast() {
  const invite = fz.invite
  const p = game.phase
  if (
    !invite ||
    p === 'battle' ||
    p === 'banner' ||
    p === 'report' ||
    p === 'start' ||
    p === 'intro' ||
    p === 'credits'
  ) {
    return null
  }
  if (p === 'rift' && fz.tab !== 'hub' && currentArena() === invite.arena) return null
  const panel = LABELS['fest-panel']
  const raid = invite.arena === 'raid'
  const barLen = 400
  // A centered card, not a sliver on the edge: who, what, and two big
  // answers, with the invite's remaining life draining along the bottom.
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 0, left: 0 },
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        ...PASS
      }}
    >
      <UiEntity
        uiTransform={{
          width: 250,
          height: 560,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 18
        }}
        uiBackground={
          panel
            ? { textureMode: 'stretch', texture: { src: panel.src }, uvs: panel.uvs, color: Color4.White() }
            : { color: Color4.create(0.05, 0.03, 0.05, 0.96) }
        }
      >
        <Img k="invites-you" w={26} tint={gold} margin={4} />
        <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: 4 }}>
          <NameTag name={invite.name} w={26} tint={cream} />
        </UiEntity>
        <Img k={raid ? 'raid-invite' : 'duel-invite'} w={14} tint={muted} margin={2} />
        <Img k={raid ? 'arena-raid' : `duel-${invite.arena}`} w={24} tint={gold} margin={6} />
        <Img
          k={raid ? 'coop-hint' : invite.arena === '1v1' ? 'pvp-hint' : 'pvp4-hint'}
          w={12}
          tint={muted}
          margin={2}
        />
        <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: 6 }}>
          <LabelBtn k="accept" id="fz:accept" w={56} h={190} labelW={24} bg={good} onTap={() => acceptFzInvite()} />
          <LabelBtn k="decline" id="fz:decline" w={56} h={190} labelW={22} bg={btnDark} onTap={() => fzDecline()} />
        </UiEntity>
        {/* time left before the invite lapses */}
        <UiEntity
          uiTransform={{ width: 6, height: barLen, margin: 4, flexDirection: 'column-reverse' }}
          uiBackground={{ color: Color4.create(0.08, 0.05, 0.06, 0.7) }}
        >
          <UiEntity
            uiTransform={{ width: '100%', height: Math.round(barLen * fzInviteLeft()) }}
            uiBackground={{ color: gold }}
          />
        </UiEntity>
      </UiEntity>
    </UiEntity>
  )
}

/** One lobby seat plate's contents: who sits there and which faces they field. */
type SeatRow = { name: string; address: string; ready: boolean; defIds: string[]; ghost?: boolean }

function riftRow(seat: RiftSeat): SeatRow {
  return { name: seat.name, address: seat.address, ready: seat.ready, defIds: [seat.defId], ghost: seat.ghost }
}

/** Duel picks arrive sealed (empty hands) while the ring is in the lobby: my
 * own seat draws my locally remembered hand, a rival's shows card backs. */
function duelRow(seat: DuelSeat, mode: DuelMode): SeatRow {
  let defIds = seat.heroes.map((hero) => hero.defId)
  if (defIds.length === 0) {
    const mine = seat.address === getMyAddress() ? myDuelPickFaces(mode) : []
    defIds = mine.length > 0 ? mine : new Array<string>(mode === '1v1' ? 1 : 4).fill('')
  }
  return { name: seat.name, address: seat.address, ready: seat.ready, defIds, ghost: seat.ghost }
}

/** A face-down card: a rival's sealed pick, revealed when the fight starts. */
function MysteryCard(props: { w: number }) {
  const back = cardBackArt()
  return (
    <UiEntity
      uiTransform={{ width: props.w, height: Math.round((props.w * back.h) / back.w) }}
      uiBackground={{ textureMode: 'stretch', texture: { src: back.src }, color: Color4.White() }}
    />
  )
}

/** The lobby seat column: filled plates for sitters, dim plates for the rest. */
function SeatColumn(props: {
  rows: (SeatRow | undefined)[]
  slots: number
  emptyW?: number
  seatW?: number
  rowH?: number
  nameW?: number
  readyW?: number
  /** Account-level badge size under the name. */
  badgeW?: number
  /** Duel lobby: keep empty plates bright so they read across the rift art. */
  brightEmpty?: boolean
  /** Label drawn on empty plates ('empty-seat' unless the plate is an action). */
  emptyK?: string
  /** Makes empty plates tappable (4v4: tap a seat to field your party). */
  onEmptyTap?: () => void
}) {
  const seatArt = LABELS['rift-seat']
  const seatW = props.seatW ?? 252
  const seatH = seatArt ? Math.round((seatW * seatArt.h) / seatArt.w) : 106
  const slots = Array.from({ length: props.slots }, (_, i) => i)
  return (
    <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', justifyContent: 'center' }}>
      {slots.map((i) => {
        const seat = props.rows[i]
        const ready = LABELS[seat?.ready ? 'rift-ready-on' : 'rift-ready-off']
        // A full party shrinks its faces to share the plate's long side.
        const faceW = seat && seat.defIds.length > 1 ? Math.round(seatW * 0.19) : Math.round(seatW * 0.44)
        const readyW = props.readyW ?? 40
        return (
          <UiEntity
            key={i}
            uiTransform={{
              height: props.rowH ?? 150,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <UiEntity
              uiTransform={{ width: seatW, height: seatH, alignItems: 'center', justifyContent: 'center' }}
              uiBackground={
                seatArt
                  ? {
                      textureMode: 'stretch',
                      texture: { src: seatArt.src },
                      uvs: seatArt.uvs,
                      // A ghost's plate is moonlit and see-through.
                      color: seat?.ghost
                        ? GHOST_CAST
                        : seat || props.brightEmpty
                          ? Color4.White()
                          : Color4.create(1, 1, 1, 0.55)
                    }
                  : { color: panelDim }
              }
              onMouseDown={!seat && props.onEmptyTap ? tap(props.onEmptyTap) : undefined}
            >
              {seat ? (
                // Faces and name share the plate's long (row) axis: a lone
                // champion sits big, a full party lines up its four heroes.
                <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                  {seat.defIds.map((id, f) => (
                    <UiEntity key={f}>
                      {id ? (
                        <Face id={id} w={faceW} h={faceW} tint={seat.ghost ? GHOST_CAST : undefined} />
                      ) : (
                        <MysteryCard w={faceW} />
                      )}
                    </UiEntity>
                  ))}
                  <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', ...PASS }}>
                    {seat.ghost ? null : (
                      <AvatarBust address={seat.address} w={Math.round((props.nameW ?? 18) * 2.2)} margin={2} />
                    )}
                    <NameTag name={seat.name} w={props.nameW ?? 18} tint={seat.ghost ? GHOST_CAST : cream} />
                  </UiEntity>
                  <UiEntity uiTransform={{ height: 6 }} />
                  {seat.ghost ? (
                    <Img k="ghost" w={props.badgeW ?? 12} tint={GHOST_CAST} margin={1} />
                  ) : (
                    <LevelBadge level={levelOf(seat.address)} w={props.badgeW ?? 12} />
                  )}
                </UiEntity>
              ) : (
                <Img
                  k={props.emptyK ?? 'empty-seat'}
                  w={props.emptyW ?? 14}
                  tint={props.onEmptyTap ? gold : props.brightEmpty ? cream : muted}
                />
              )}
            </UiEntity>
            {seat && ready ? (
              <UiEntity
                uiTransform={{
                  width: readyW,
                  height: Math.round((readyW * ready.h) / ready.w),
                  margin: { left: 2 }
                }}
                uiBackground={{
                  textureMode: 'stretch',
                  texture: { src: ready.src },
                  uvs: ready.uvs,
                  color: Color4.White()
                }}
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
      uiBackground={{ textureMode: 'stretch', texture: { src: art.src }, uvs: art.uvs, color: Color4.White() }}
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

/** How many spoils-paying wins the seated player has left today: n pips in
 * gold, or the spent line once they are gone. Nothing while unseated. */
function SpoilsLeft(props: { left?: number }) {
  if (props.left === undefined) return null
  if (props.left <= 0) return <Img k="spoils-spent" w={12} tint={muted} margin={3} />
  return (
    <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: 3 }}>
      <Digits value={props.left} w={18} tint={gold} tight />
      <UiEntity uiTransform={{ width: 6 }} />
      <Img k="spoils-left" w={11} tint={muted} margin={2} />
    </UiEntity>
  )
}

function RiftLobby() {
  const pub = riftView.pub
  const seat = mySeat()
  const enter = LABELS['rift-enter']
  const canReady = !!seat
  const readyCount = pub.seats.filter((entry) => entry.ready).length
  const full = pub.seats.length >= RIFT_SEATS
  // One instruction at a time, tracking exactly where the player is in the
  // sit -> ready -> wait flow, so the lobby always says what to do next.
  const hintK = !seat
    ? full
      ? undefined // spectating a full lobby: nothing for them to do
      : 'pick-your-champion'
    : !seat.ready
      ? 'tap-enter-ready'
      : readyCount < pub.seats.length
        ? 'waiting-for-allies'
        : undefined
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
      {/* room header: title, live state chip, READY n/m, and what to do next */}
      <UiEntity
        uiTransform={{
          width: 190,
          height: '100%',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Img k="arena-raid" w={26} tint={gold} margin={4} />
        <Img k="coop-hint" w={13} tint={muted} margin={2} />
        <StatusChip status={roomStatus(pub.phase, pub.startIn, pub.resetIn)} />
        <ReadyCount seats={pub.seats} slots={RIFT_SEATS} />
        {hintK ? <Img k={hintK} w={24} tint={gold} margin={6} /> : null}
        {seat && !full ? <InviteBtn /> : null}
        {seat && !full && fz.sentFlash <= 0 ? <Img k="invite-hint" w={12} tint={muted} margin={2} /> : null}
        {/* short-handed: the raid still goes - ghost allies take the empty seats */}
        {seat && pub.seats.length < RIFT_GHOST_FILL ? (
          <Img k="ghost-allies" w={12} tint={GHOST_CAST} margin={2} />
        ) : null}
      </UiEntity>
      <UiEntity uiTransform={{ width: 48, height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <Img k="rift-ribbon" w={40} tint={Color4.White()} margin={0} />
      </UiEntity>
      <SeatColumn rows={pub.seats.map(riftRow)} slots={4} />
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
            uiTransform={{
              width: 130,
              height: Math.round((130 * enter.h) / enter.w),
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onMouseDown={
              canReady
                ? press(
                    'rift:ready',
                    tap(() => riftReady(!seat!.ready))
                  )
                : undefined
            }
          >
            <UiEntity
              uiTransform={{
                width: 130 - pressShrink('rift:ready', 130),
                height: Math.round(((130 - pressShrink('rift:ready', 130)) * enter.h) / enter.w),
                pointerFilter: 'none'
              }}
              uiBackground={{
                textureMode: 'stretch',
                texture: { src: enter.src },
                uvs: enter.uvs,
                color: pressTint(
                  'rift:ready',
                  canReady ? (seat?.ready ? gold : Color4.White()) : Color4.create(1, 1, 1, 0.4)
                )
              }}
            />
          </UiEntity>
        ) : null}
        {/* raids are free; what is rationed is the spoils (RAID_SPOILS_PER_DAY) */}
        <Img k="raid-free" w={20} tint={gold} margin={4} />
        <SpoilsLeft left={seat?.spoils} />
      </UiEntity>
      {/* unseated with room: pick to sit; seated but not ready: pick to swap */}
      {(!seat && pub.seats.length < 4) || (seat && !seat.ready) ? (
        <HeroPickStrip
          hint={seat ? 'swap-hero' : 'join-raid'}
          withHero={true}
          selectedUid={seat?.uid}
          onPick={(uid) => {
            if (seat) {
              if (uid !== seat.uid) riftSit(uid)
              return
            }
            if (RIFT_ENERGY_COST > 0 && !DEBUG.unlimitedEnergy && game.energy < RIFT_ENERGY_COST) {
              game.notice = 'no-energy'
              return
            }
            riftSit(uid)
          }}
        />
      ) : null}
      <Notice />
      <StartingOverlay startIn={pub.startIn} />
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

/** WIN/LOSE plaque wreathed in a faint gold laurel on a win, or the muted
 * spectator tag — same verdict treatment as the campaign battle report.
 * The reopen countdown and the PLAY AGAIN / LEAVE actions live in EndButtons. */
function EndVerdict(props: { won: boolean; seated: boolean }) {
  const laurel = LABELS['road-laurel']
  return (
    <UiEntity uiTransform={{ width: 230, height: '100%', alignItems: 'center', justifyContent: 'center' }}>
      {props.seated ? (
        <UiEntity
          uiTransform={{
            width: 300,
            height: 300,
            alignItems: 'center',
            justifyContent: 'center',
            pointerFilter: 'none'
          }}
          uiBackground={
            props.won && laurel
              ? {
                  textureMode: 'stretch',
                  texture: { src: laurel.src },
                  uvs: laurel.uvs,
                  color: Color4.create(1, 0.85, 0.5, 0.3)
                }
              : undefined
          }
        >
          <Img k={props.won ? 'win' : 'lose'} w={190} tint={Color4.White()} margin={0} />
        </UiEntity>
      ) : (
        <Img k="watching" w={36} tint={muted} margin={0} />
      )}
    </UiEntity>
  )
}

/** One traveler's spoils, a dark card reading physically left-to-right:
 * name | coins | xp | drop. Your own card takes the warm gold tint. */
function SpoilsRow(props: {
  key?: number
  name: string
  coins?: number
  xp: number
  dropDefId?: string
  mine?: boolean
  ghost?: boolean
}) {
  return (
    <UiEntity
      uiTransform={{
        width: props.dropDefId ? 80 : 66,
        height: '92%',
        alignSelf: 'center',
        flexDirection: 'column-reverse',
        alignItems: 'center',
        justifyContent: 'flex-start',
        margin: 4,
        padding: { top: 14, bottom: 14 }
      }}
      uiBackground={{
        color: props.mine
          ? Color4.create(0.32, 0.2, 0.07, 0.55)
          : props.ghost
            ? Color4.create(0.1, 0.16, 0.26, 0.5)
            : Color4.create(0.1, 0.07, 0.08, 0.6)
      }}
    >
      <NameTag name={props.name} w={18} tint={props.mine ? gold : props.ghost ? GHOST_CAST : cream} />
      {props.ghost ? <Img k="ghost" w={9} tint={GHOST_CAST} margin={2} /> : null}
      <UiEntity uiTransform={{ flexGrow: 1 }} />
      {props.coins !== undefined && props.coins > 0 ? (
        <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: 4 }}>
          <Img k="icon-coins" w={24} tint={Color4.White()} margin={1} />
          <Digits value={props.coins} w={18} tint={gold} tight />
        </UiEntity>
      ) : props.mine && props.coins === 0 ? (
        // won, but today's spoils are spent: no purse, xp still lands
        <Img k="spoils-spent" w={9} tint={muted} margin={3} />
      ) : null}
      <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: 4 }}>
        <Img k="xp" w={24} tint={cream} margin={1} />
        <Gain value={props.xp} w={16} tint={gold} />
      </UiEntity>
      {props.dropDefId ? <Face id={props.dropDefId} w={56} h={56} /> : null}
    </UiEntity>
  )
}

/** The framed panel holding everyone's SpoilsRows, headed by the SPOILS tag. */
function SpoilsPanel(props: { children?: ReactEcs.JSX.Component[] | ReactEcs.JSX.Component }) {
  return (
    <UiEntity
      uiTransform={{
        height: '80%',
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 10,
        margin: { left: 4, right: 4 }
      }}
      uiBackground={{ color: Color4.create(0.05, 0.03, 0.04, 0.55) }}
    >
      <Img k="spoils" w={26} tint={gold} margin={4} />
      {props.children}
    </UiEntity>
  )
}

function RiftEnd() {
  const pub = riftView.pub
  const won = pub.phase === 'won'
  const seated = !!mySeat()
  const me = getMyAddress()
  const mine = seated ? pub.rewards?.find((reward) => reward.address === me) : undefined
  const frame = LABELS['party-tile']
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
      <EndVerdict won={won} seated={seated} />
      {won && pub.rewards ? (
        <SpoilsPanel>
          {pub.rewards.map((reward, i) => {
            const seat = pub.seats.find((entry) => entry.address === reward.address)
            return (
              <SpoilsRow
                key={i}
                name={seat?.name ?? reward.address.slice(0, 6)}
                coins={reward.coins}
                xp={reward.xp}
                dropDefId={reward.dropDefId}
                mine={reward.address === me}
                ghost={seat?.ghost}
              />
            )
          })}
        </SpoilsPanel>
      ) : null}
      {/* your recruit, blown up in the same ornate tile as the bench */}
      {mine?.dropDefId && frame ? (
        <UiEntity
          uiTransform={{
            width: 170,
            height: '100%',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row'
          }}
        >
          <UiEntity
            uiTransform={{
              width: 150,
              height: Math.round((150 * frame.h) / frame.w),
              alignItems: 'center',
              justifyContent: 'center',
              pointerFilter: 'none'
            }}
            uiBackground={{
              textureMode: 'stretch',
              texture: { src: frame.src },
              uvs: frame.uvs,
              color: Color4.White()
            }}
          >
            <Face id={mine.dropDefId} w={116} h={116} />
          </UiEntity>
        </UiEntity>
      ) : null}
      <EndButtons arena="raid" seated={seated} resetIn={pub.resetIn} />
    </UiEntity>
  )
}

// ---- duels ------------------------------------------------------------------------

/** 1V1 | 4V4 tabs under the PLAYER VS PLAYER title: two thumb-sized chips
 * side by side on the phone, the live ring on lit leather with a gold rule. */
function DuelModeToggle() {
  return (
    <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', justifyContent: 'center' }}>
      {DUEL_MODES.map((mode) => {
        const active = fz.duelMode === mode
        const id = `duel:mode-${mode}`
        return (
          <UiEntity
            key={mode}
            uiTransform={{ width: 78, height: 250, margin: 5, flexDirection: 'row' }}
            onMouseDown={
              active
                ? undefined
                : press(
                    id,
                    tap(() => {
                      fz.duelMode = mode
                    })
                  )
            }
          >
            <UiEntity
              uiTransform={{ flexGrow: 1, height: '100%', alignItems: 'center', justifyContent: 'center', ...PASS }}
              uiBackground={{
                color: pressTint(
                  id,
                  active ? Color4.create(0.28, 0.17, 0.06, 0.85) : Color4.create(0.06, 0.04, 0.05, 0.7)
                )
              }}
            >
              <Img k={`duel-${mode}`} w={44} tint={active ? gold : muted} margin={0} />
            </UiEntity>
            <UiEntity
              uiTransform={{ width: 5, height: '100%', ...PASS }}
              uiBackground={{ color: active ? gold : Color4.create(0, 0, 0, 0) }}
            />
          </UiEntity>
        )
      })}
    </UiEntity>
  )
}

/** The duel lobby, reading down the phone in four bands sized for thumbs:
 *
 *   header  - PLAYER VS PLAYER, the 1V1 | 4V4 tabs, and the room's state chip
 *             beside READY n/m (one phone row, so the header stays short)
 *   seats   - two tall plates side by side; a free plate is the action: JOIN
 *             for an unseated 4v4 party, INVITE for a seated player waiting
 *             on a foe (the SENT flash lands there too)
 *   action  - the one thing to do next in gold, the big ENTER, the cost line
 *   picks   - the hero strip while there is a champion to choose or swap
 */
function DuelLobby() {
  const pub = activeDuel()
  const mode = fz.duelMode
  const seat = myDuelSeat()
  const enter = LABELS['rift-enter']
  const canReady = !!seat
  const cost = DUEL_ENERGY_COST[mode]
  const full = pub.seats.length >= DUEL_SEATS
  // One instruction at a time, tracking exactly where the player is in the
  // sit -> ready -> wait flow, so the lobby always says what to do next.
  const hintK = !seat
    ? !full
      ? mode === '1v1'
        ? 'pick-your-champion'
        : 'tap-join-party'
      : undefined // spectating a full lobby: nothing for them to do
    : !seat.ready
      ? 'tap-enter-ready'
      : !full
        ? 'awaiting-foe'
        : 'foe-not-ready'
  const sitParty = () => {
    if (partyUnits().length < 4) {
      game.notice = 'need-four'
      return
    }
    if (cost > 0 && !DEBUG.unlimitedEnergy && game.energy < cost) {
      game.notice = 'no-energy'
      return
    }
    duelSit('4v4')
  }
  // What the empty plate says and does: JOIN (4v4, unseated), INVITE (seated,
  // someone to ask), the SENT flash, FIGHT A GHOST (seated, nobody else in the
  // realm, a ghost on file for this mode), or just an empty seat.
  const joinPlate = mode === '4v4' && !seat
  const invitePlate = !!seat && !full && presentPlayers.size > 0
  const ghostsOnFile = (pub.ghosts ?? 0) > 0
  const ghostPlate = !!seat && !full && !invitePlate && ghostsOnFile
  const emptyK = joinPlate
    ? 'join-duel'
    : invitePlate
      ? fz.sentFlash > 0
        ? 'invite-sent'
        : 'invite'
      : ghostPlate
        ? 'fight-a-ghost'
        : 'empty-seat'
  const summonGhost = () => duelGhost(mode)
  const onEmptyTap = joinPlate
    ? sitParty
    : invitePlate && fz.sentFlash <= 0
      ? () => {
          fz.inviting = true
        }
      : ghostPlate
        ? summonGhost
        : undefined
  // Someone is online but you would rather not wait: the ghost button sits in
  // the action band next to ENTER.
  const ghostBtn = !!seat && !full && ghostsOnFile && !ghostPlate
  const ghostSeated = pub.seats.some((entry) => entry.ghost)
  const ENTER_W = 184
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
      {/* header band */}
      <UiEntity
        uiTransform={{
          width: 230,
          height: '100%',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Img k="player-vs-player" w={40} tint={gold} margin={4} />
        <DuelModeToggle />
        <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', justifyContent: 'center' }}>
          <StatusChip status={roomStatus(pub.phase, pub.startIn, pub.resetIn)} w={24} />
          <UiEntity uiTransform={{ width: 14 }} />
          <ReadyCount seats={pub.seats} slots={DUEL_SEATS} big />
        </UiEntity>
      </UiEntity>
      {/* seats band */}
      <SeatColumn
        rows={pub.seats.map((entry) => duelRow(entry, mode))}
        slots={DUEL_SEATS}
        emptyW={emptyK === 'empty-seat' ? 40 : 52}
        seatW={420}
        rowH={320}
        nameW={34}
        readyW={64}
        badgeW={16}
        brightEmpty
        emptyK={emptyK}
        onEmptyTap={onEmptyTap}
      />
      {/* action band: the instruction, ENTER, what it costs */}
      <UiEntity
        uiTransform={{
          width: 300,
          height: '100%',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {hintK ? <Img k={hintK} w={44} tint={gold} margin={6} /> : null}
        {enter ? (
          <UiEntity
            uiTransform={{
              width: ENTER_W,
              height: Math.round((ENTER_W * enter.h) / enter.w),
              alignItems: 'center',
              justifyContent: 'center',
              margin: 4
            }}
            onMouseDown={
              canReady
                ? press(
                    'duel:ready',
                    tap(() => duelReady(mode, !seat!.ready))
                  )
                : undefined
            }
          >
            <UiEntity
              uiTransform={{
                width: ENTER_W - pressShrink('duel:ready', ENTER_W),
                height: Math.round(((ENTER_W - pressShrink('duel:ready', ENTER_W)) * enter.h) / enter.w),
                pointerFilter: 'none'
              }}
              uiBackground={{
                textureMode: 'stretch',
                texture: { src: enter.src },
                uvs: enter.uvs,
                color: pressTint(
                  'duel:ready',
                  canReady ? (seat?.ready ? gold : Color4.White()) : Color4.create(1, 1, 1, 0.55)
                )
              }}
            />
          </UiEntity>
        ) : null}
        {ghostBtn ? (
          <LabelBtn
            k="fight-a-ghost"
            id="duel:ghost"
            w={44}
            h={190}
            labelW={30}
            bg={Color4.create(0.12, 0.2, 0.34, 0.92)}
            labelTint={GHOST_CAST}
            margin={4}
            onTap={summonGhost}
          />
        ) : null}
        {ghostSeated ? <Img k="ghost-hint" w={14} tint={GHOST_CAST} margin={2} /> : null}
        <Img k="duel-free" w={30} tint={gold} margin={6} />
      </UiEntity>
      {/* 1v1: unseated with room picks a champion; seated-not-ready swaps it */}
      {mode === '1v1' && ((!seat && pub.seats.length < DUEL_SEATS) || (seat && !seat.ready)) ? (
        <HeroPickStrip
          hint={seat ? 'swap-hero' : 'join-duel'}
          withHero={true}
          selectedUid={seat ? myDuelPickUid('1v1') : undefined}
          onPick={(uid) => {
            if (seat) {
              if (uid !== myDuelPickUid('1v1')) duelSit('1v1', uid)
              return
            }
            if (cost > 0 && !DEBUG.unlimitedEnergy && game.energy < cost) {
              game.notice = 'no-energy'
              return
            }
            duelSit('1v1', uid)
          }}
        />
      ) : null}
      <Notice />
      <StartingOverlay startIn={pub.startIn} />
    </UiEntity>
  )
}

function DuelBattle() {
  const pub = activeDuel()
  const b = pub.battle
  const seated = !!myDuelSeat()
  // Seat order is battle order: seats[0] fights on 'you', seats[1] on 'foe'.
  const nameYou = pub.seats[0]?.name ?? ''
  const nameFoe = pub.seats[1]?.name ?? ''
  const ghostYou = !!pub.seats[0]?.ghost
  const ghostFoe = !!pub.seats[1]?.ghost
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
      <UiEntity uiTransform={{ width: 60, height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <NameTag name={nameFoe} w={20} tint={ghostFoe ? GHOST_CAST : cream} />
        {ghostFoe ? <Img k="ghost" w={10} tint={GHOST_CAST} margin={3} /> : null}
      </UiEntity>
      {b ? <BattleRank units={b.foe} actingUid={b.actingUid} hp={danger} /> : null}
      <UiEntity
        uiTransform={{
          width: 90,
          height: '100%',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Img k={`duel-${pub.mode}`} w={26} tint={gold} margin={4} />
        {!seated ? <Img k="watching" w={16} tint={muted} margin={8} /> : null}
      </UiEntity>
      {b ? <BattleRank units={b.you} actingUid={b.actingUid} hp={good} /> : null}
      <UiEntity uiTransform={{ width: 60, height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <NameTag name={nameYou} w={20} tint={ghostYou ? GHOST_CAST : cream} />
        {ghostYou ? <Img k="ghost" w={10} tint={GHOST_CAST} margin={3} /> : null}
      </UiEntity>
    </UiEntity>
  )
}

function DuelEnd() {
  const pub = activeDuel()
  const seated = !!myDuelSeat()
  const me = getMyAddress()
  const won = pub.winner === me
  const victor = pub.seats.find((seat) => seat.address === pub.winner)
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
    >
      <EndVerdict won={won} seated={seated} />
      {/* the victor's podium: champion's face on a gold laurel, name in gold */}
      <UiEntity
        uiTransform={{
          width: 210,
          height: '100%',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Img k="victor" w={26} tint={gold} margin={4} />
        <UiEntity
          uiTransform={{
            width: 150,
            height: 150,
            alignItems: 'center',
            justifyContent: 'center',
            pointerFilter: 'none'
          }}
          uiBackground={
            laurel
              ? {
                  textureMode: 'stretch',
                  texture: { src: laurel.src },
                  uvs: laurel.uvs,
                  color: Color4.create(1, 0.85, 0.5, 0.85)
                }
              : undefined
          }
        >
          {victor?.heroes[0] ? <Face id={victor.heroes[0].defId} w={96} h={96} /> : null}
        </UiEntity>
        {victor ? <NameTag name={victor.name} w={20} tint={gold} /> : null}
      </UiEntity>
      {pub.rewards ? (
        <SpoilsPanel>
          {pub.rewards.map((reward, i) => {
            const seat = pub.seats.find((entry) => entry.address === reward.address)
            return (
              <SpoilsRow
                key={i}
                name={seat?.name ?? reward.address.slice(0, 6)}
                coins={reward.coins}
                xp={reward.xp}
                mine={reward.address === me}
              />
            )
          })}
        </SpoilsPanel>
      ) : null}
      <EndButtons arena={pub.mode} seated={seated} resetIn={pub.resetIn} />
    </UiEntity>
  )
}

// ---- the friendzone shell ----------------------------------------------------------

/** The hub lists the rooms; a room shows its lobby, fight, or spoils. BACK
 * (chrome) steps room -> hub -> home, see nav.back. */
export function RiftScreen() {
  const raidPub = riftView.pub
  const duelPub = activeDuel()
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
      {fz.tab === 'hub' ? (
        <ArenaHub />
      ) : (
        <UiEntity uiTransform={{ flexGrow: 1, height: '100%' }}>
          {fz.tab === 'raids' ? (
            raidPub.phase === 'lobby' ? (
              <RiftLobby />
            ) : raidPub.phase === 'battle' ? (
              <RiftBattle />
            ) : (
              <RiftEnd />
            )
          ) : duelPub.phase === 'lobby' ? (
            <DuelLobby />
          ) : duelPub.phase === 'battle' ? (
            <DuelBattle />
          ) : (
            <DuelEnd />
          )}
        </UiEntity>
      )}
      <InvitePicker />
      <MenuTitle k="rift-title" />
    </UiEntity>
  )
}
