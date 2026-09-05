import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { tap } from '../game/audio'
import { DEBUG } from '../game/debug'
import { goHome } from '../game/menu'
import { lockNav } from '../game/nav'
import { game } from '../game/store'
import { partyUnits } from '../game/party'
import {
  DUEL_ENERGY_COST,
  DUEL_MODES,
  DUEL_SEATS,
  DuelMode,
  DuelRank,
  DuelSeat,
  RIFT_ENERGY_COST,
  RiftSeat
} from '../mp/protocol'
import {
  activeDuel,
  duelReady,
  duelSit,
  fz,
  getMyAddress,
  myDuelPickFaces,
  myDuelSeat,
  mySeat,
  riftReady,
  riftSit,
  riftView
} from '../mp/session'
import { BattleRank } from './battle'
import { press, pressShrink, pressTint } from './fx/press'
import { cardBackArt } from './halls'
import './labels.duel.gen'
import { LABELS } from './labels.gen'
import { HeroPickStrip } from './panels'
import { cream, danger, gold, good, muted, panelDim } from './theme'
import { Digits, Face, Gain, Img, MenuTitle, MpBackdrop, NameTag, Notice } from './widgets'

// ---- the friendzone (raids + duels) ----------------------------------------------

const RIFT_PIP_FRAC = [0.08, 0.23, 0.38, 0.53, 0.68, 0.84]

/** One lobby seat plate's contents: who sits there and which faces they field. */
type SeatRow = { name: string; ready: boolean; defIds: string[] }

function riftRow(seat: RiftSeat): SeatRow {
  return { name: seat.name, ready: seat.ready, defIds: [seat.defId] }
}

/** Duel picks arrive sealed (empty hands) while the ring is in the lobby: my
 * own seat draws my locally remembered hand, a rival's shows card backs. */
function duelRow(seat: DuelSeat, mode: DuelMode): SeatRow {
  let defIds = seat.heroes.map((hero) => hero.defId)
  if (defIds.length === 0) {
    const mine = seat.address === getMyAddress() ? myDuelPickFaces(mode) : []
    defIds = mine.length > 0 ? mine : new Array<string>(mode === '1v1' ? 1 : 4).fill('')
  }
  return { name: seat.name, ready: seat.ready, defIds }
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
                      color: seat || props.brightEmpty ? Color4.White() : Color4.create(1, 1, 1, 0.55)
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
                    <UiEntity key={f}>{id ? <Face id={id} w={faceW} h={faceW} /> : <MysteryCard w={faceW} />}</UiEntity>
                  ))}
                  <NameTag name={seat.name} w={props.nameW ?? 18} tint={cream} />
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
        <Img k="multiplayer-raid" w={16} tint={gold} margin={4} />
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
        <Img k="rift-energy" w={56} tint={Color4.White()} margin={6} />
      </UiEntity>
      {!seat && pub.seats.length < 4 ? (
        <HeroPickStrip
          hint="join-raid"
          withHero={true}
          onPick={(uid) => {
            if (!DEBUG.unlimitedEnergy && game.energy < RIFT_ENERGY_COST) {
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

/** WIN/LOSE plaque wreathed in a faint gold laurel on a win, or the muted
 * spectator tag — same verdict treatment as the campaign battle report.
 * Spectators also get the reopen countdown: NEXT RAID/DUEL | seconds. */
function EndVerdict(props: { won: boolean; seated: boolean; nextIn?: number; nextWord?: string }) {
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
        <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', justifyContent: 'center' }}>
          <Img k="watching" w={36} tint={muted} margin={0} />
          {props.nextIn !== undefined ? (
            <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: 10 }}>
              <NameTag name={props.nextWord ?? 'next'} w={16} tint={cream} />
              <UiEntity uiTransform={{ height: 8 }} />
              <Digits value={props.nextIn} w={26} tint={gold} />
            </UiEntity>
          ) : null}
        </UiEntity>
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
      uiBackground={{ color: props.mine ? Color4.create(0.32, 0.2, 0.07, 0.55) : Color4.create(0.1, 0.07, 0.08, 0.6) }}
    >
      <NameTag name={props.name} w={18} tint={props.mine ? gold : cream} />
      <UiEntity uiTransform={{ flexGrow: 1 }} />
      {props.coins !== undefined && props.coins > 0 ? (
        <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: 4 }}>
          <Img k="icon-coins" w={24} tint={Color4.White()} margin={1} />
          <Digits value={props.coins} w={18} tint={gold} tight />
        </UiEntity>
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
      <EndVerdict won={won} seated={seated} nextIn={seated ? undefined : pub.resetIn} nextWord="next raid" />
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
      <UiEntity uiTransform={{ width: 60, height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <NameTag name={'continue'} w={14} tint={muted} />
      </UiEntity>
    </UiEntity>
  )
}

// ---- duels ------------------------------------------------------------------------

/** 1V1 | 4V4 picker, stacked under the friendzone title. The active mode sits
 * on a translucent gold chip so the selection reads at a glance. */
function DuelModeToggle() {
  return (
    <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', justifyContent: 'center' }}>
      {DUEL_MODES.map((mode) => {
        const active = fz.duelMode === mode
        return (
          <UiEntity
            key={mode}
            uiTransform={{ padding: 10, margin: 6, alignItems: 'center', justifyContent: 'center' }}
            uiBackground={active ? { color: Color4.create(0.82, 0.62, 0.28, 0.3) } : undefined}
            onMouseDown={tap(() => {
              fz.duelMode = mode
            })}
          >
            <Img k={`duel-${mode}`} w={56} tint={active ? gold : Color4.White()} margin={0} />
          </UiEntity>
        )
      })}
    </UiEntity>
  )
}

/** Opens the full-screen win-ladder board; sits where the crammed panel was. */
function LeaderboardBtn() {
  const panel = LABELS['fest-panel']
  const id = 'duel:board'
  return (
    <UiEntity
      uiTransform={{
        width: 150,
        height: 280,
        alignItems: 'center',
        justifyContent: 'center'
      }}
      onMouseDown={press(
        id,
        tap(() => {
          fz.board = true
        })
      )}
    >
      <UiEntity
        uiTransform={{
          width: 150 - pressShrink(id, 150),
          height: 280 - pressShrink(id, 280),
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 10,
          pointerFilter: 'none'
        }}
        uiBackground={
          panel
            ? { textureMode: 'stretch', texture: { src: panel.src }, uvs: panel.uvs, color: pressTint(id) }
            : { color: pressTint(id, panelDim) }
        }
      >
        <Img k="leaderboard" w={36} tint={gold} margin={4} />
      </UiEntity>
    </UiEntity>
  )
}

const MEDAL_TINTS = [gold, Color4.create(0.78, 0.78, 0.85, 1), Color4.create(0.8, 0.52, 0.28, 1)]

/** One ranked entry, a physical row: medal/rank | name | win count. */
function LadderRow(props: { key?: number; rank: number; entry: DuelRank }) {
  const top3 = props.rank <= 3
  const laurel = LABELS['road-laurel']
  return (
    <UiEntity
      uiTransform={{
        width: top3 ? 74 : 56,
        height: '94%',
        flexDirection: 'column-reverse',
        alignItems: 'center',
        justifyContent: 'flex-start',
        margin: 3,
        padding: { top: 14, bottom: 14 }
      }}
      uiBackground={{ color: top3 ? Color4.create(0.32, 0.2, 0.07, 0.62) : Color4.create(0.1, 0.07, 0.08, 0.6) }}
    >
      <UiEntity
        uiTransform={{ width: top3 ? 64 : 44, height: top3 ? 64 : 44, alignItems: 'center', justifyContent: 'center' }}
        uiBackground={
          top3 && laurel
            ? {
                textureMode: 'stretch',
                texture: { src: laurel.src },
                uvs: laurel.uvs,
                color: MEDAL_TINTS[props.rank - 1]
              }
            : undefined
        }
      >
        <Digits value={props.rank} w={top3 ? 20 : 16} tint={top3 ? cream : muted} tight />
      </UiEntity>
      <UiEntity uiTransform={{ height: 16 }} />
      <NameTag name={props.entry.name} w={top3 ? 32 : 26} tint={props.rank === 1 ? gold : cream} />
      <UiEntity uiTransform={{ flexGrow: 1 }} />
      <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center' }}>
        <Digits value={props.entry.wins} w={top3 ? 32 : 26} tint={gold} tight />
        <Img k="wins" w={top3 ? 26 : 22} tint={cream} margin={3} />
      </UiEntity>
    </UiEntity>
  )
}

/** The win-ladder board as its own full screen: the ornate LEADERBOARD plate
 * takes the gutter strip (swapped in by RiftScreen), a 1V1|4V4 tab rail sits
 * on the physical top edge, and the ranked list fills the rest — the top three
 * take a tinted laurel. Tapping anywhere outside the tabs goes back. */
function LeaderboardScreen() {
  const ladder = activeDuel().ladder
  const close = tap(() => {
    fz.board = false
  })
  return (
    <UiEntity
      uiTransform={{
        flexGrow: 1,
        height: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      onMouseDown={close}
    >
      {/* ring tabs on the physical top edge, mirroring FzTabs */}
      <UiEntity
        uiTransform={{
          width: 100,
          height: '100%',
          flexDirection: 'column-reverse',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {DUEL_MODES.map((mode) => {
          const active = fz.duelMode === mode
          return (
            <UiEntity
              key={mode}
              uiTransform={{ padding: 10, margin: 6, alignItems: 'center', justifyContent: 'center' }}
              uiBackground={active ? { color: Color4.create(0.82, 0.62, 0.28, 0.3) } : undefined}
              onMouseDown={tap(() => {
                fz.duelMode = mode
              })}
            >
              <Img k={`duel-${mode}`} w={52} tint={active ? gold : cream} margin={0} />
            </UiEntity>
          )
        })}
      </UiEntity>
      {/* ranked list, physically top-to-bottom */}
      <UiEntity
        uiTransform={{
          flexGrow: 1,
          height: '92%',
          alignSelf: 'center',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: ladder.length === 0 ? 'center' : 'flex-start',
          padding: 10,
          margin: { top: 6, bottom: 6 }
        }}
        uiBackground={{ color: Color4.create(0.05, 0.03, 0.04, 0.55) }}
      >
        {ladder.length === 0 ? (
          <Img k="no-travelers" w={30} tint={cream} margin={4} />
        ) : (
          ladder.slice(0, 12).map((entry, i) => <LadderRow key={i} rank={i + 1} entry={entry} />)
        )}
      </UiEntity>
      {/* tap-to-return hint on the physical bottom, like the end screens */}
      <UiEntity uiTransform={{ width: 56, height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <NameTag name={'continue'} w={14} tint={muted} />
      </UiEntity>
    </UiEntity>
  )
}

function DuelLobby() {
  const pub = activeDuel()
  const mode = fz.duelMode
  const seat = myDuelSeat()
  const enter = LABELS['rift-enter']
  const canReady = !!seat
  const cost = DUEL_ENERGY_COST[mode]
  // One instruction at a time, tracking exactly where the player is in the
  // sit -> ready -> wait flow, so the lobby always says what to do next.
  const hintK = !seat
    ? pub.seats.length < DUEL_SEATS
      ? mode === '1v1'
        ? 'pick-your-champion'
        : 'tap-join-party'
      : undefined // spectating a full lobby: nothing for them to do
    : !seat.ready
      ? 'tap-enter-ready'
      : pub.seats.length < DUEL_SEATS
        ? 'awaiting-foe'
        : 'foe-not-ready'
  const sitParty = () => {
    if (partyUnits().length < 4) {
      game.notice = 'need-four'
      return
    }
    if (!DEBUG.unlimitedEnergy && game.energy < cost) {
      game.notice = 'no-coin'
      return
    }
    duelSit('4v4')
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
    >
      <UiEntity
        uiTransform={{
          width: 150,
          height: '100%',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Img k="player-vs-player" w={36} tint={gold} margin={6} />
        <DuelModeToggle />
      </UiEntity>
      <SeatColumn
        rows={pub.seats.map((entry) => duelRow(entry, mode))}
        slots={DUEL_SEATS}
        emptyW={mode === '4v4' && !seat ? 48 : 36}
        seatW={400}
        rowH={320}
        nameW={28}
        readyW={56}
        brightEmpty
        emptyK={mode === '4v4' && !seat ? 'join-duel' : 'empty-seat'}
        onEmptyTap={mode === '4v4' && !seat ? sitParty : undefined}
      />
      <UiEntity
        uiTransform={{
          width: 240,
          height: '100%',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {hintK ? <Img k={hintK} w={36} tint={gold} margin={4} /> : null}
        <LeaderboardBtn />
      </UiEntity>
      <UiEntity
        uiTransform={{
          width: 180,
          height: '100%',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {enter ? (
          <UiEntity
            uiTransform={{
              width: 168,
              height: Math.round((168 * enter.h) / enter.w),
              alignItems: 'center',
              justifyContent: 'center'
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
                width: 168 - pressShrink('duel:ready', 168),
                height: Math.round(((168 - pressShrink('duel:ready', 168)) * enter.h) / enter.w),
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
        <Img k={mode === '1v1' ? 'duel-cost' : 'duel-cost4'} w={36} tint={cream} margin={6} />
      </UiEntity>
      {!seat && pub.seats.length < DUEL_SEATS && mode === '1v1' ? (
        <HeroPickStrip
          hint="join-duel"
          withHero={true}
          onPick={(uid) => {
            if (!DEBUG.unlimitedEnergy && game.energy < cost) {
              game.notice = 'no-coin'
              return
            }
            duelSit('1v1', uid)
          }}
        />
      ) : null}
      <Notice />
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
        <NameTag name={nameFoe} w={20} tint={cream} />
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
        <NameTag name={nameYou} w={20} tint={cream} />
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
      <EndVerdict won={won} seated={seated} nextIn={seated ? undefined : pub.resetIn} nextWord="next duel" />
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
      <UiEntity uiTransform={{ width: 60, height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <NameTag name={'continue'} w={14} tint={muted} />
      </UiEntity>
    </UiEntity>
  )
}

// ---- the friendzone shell ----------------------------------------------------------

/** RAIDS | DUELS rail on the physical top edge of the friendzone. */
function FzTabs() {
  return (
    <UiEntity
      uiTransform={{
        width: 100,
        height: '100%',
        flexDirection: 'column-reverse',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <UiEntity
        uiTransform={{ padding: 10, margin: 6, alignItems: 'center', justifyContent: 'center' }}
        onMouseDown={tap(() => {
          fz.tab = 'raids'
          fz.board = false
        })}
      >
        <Img k="raids" w={56} tint={fz.tab === 'raids' ? gold : cream} margin={0} />
      </UiEntity>
      <UiEntity
        uiTransform={{ padding: 10, margin: 6, alignItems: 'center', justifyContent: 'center' }}
        onMouseDown={tap(() => {
          fz.tab = 'duels'
          fz.board = false
        })}
      >
        <Img k="duels" w={56} tint={fz.tab === 'duels' ? gold : cream} margin={0} />
      </UiEntity>
    </UiEntity>
  )
}

export function RiftScreen() {
  const raidPub = riftView.pub
  const duelPub = activeDuel()
  const board = fz.tab === 'duels' && duelPub.phase === 'lobby' && fz.board
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
      {board ? null : <FzTabs />}
      {board ? (
        <LeaderboardScreen />
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
      <MenuTitle k={board ? 'board-banner' : 'rift-title'} />
    </UiEntity>
  )
}
