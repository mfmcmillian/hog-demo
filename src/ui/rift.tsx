import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { tap } from '../game/audio'
import { DEBUG } from '../game/debug'
import { goHome } from '../game/menu'
import { lockNav } from '../game/nav'
import { game } from '../game/store'
import { partyUnits } from '../game/party'
import { DUEL_ENERGY_COST, DUEL_MODES, DUEL_SEATS, DuelMode, DuelSeat, RIFT_ENERGY_COST, RiftSeat } from '../mp/protocol'
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
import { cardBackArt } from './halls'
import './labels.duel.gen'
import { LABELS } from './labels.gen'
import { HeroPickStrip } from './panels'
import { cream, danger, gold, good, muted, panelDim } from './theme'
import { Digits, Face, Gain, GameLogo, Img, MpBackdrop, NameTag, Notice } from './widgets'

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
                    <UiEntity key={f}>
                      {id ? <Face id={id} w={faceW} h={faceW} /> : <MysteryCard w={faceW} />}
                    </UiEntity>
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

/** Top duelists of the active ring, on the festival plate so names read. */
function DuelLadder() {
  const ladder = activeDuel().ladder
  const panel = LABELS['fest-panel']
  return (
    <UiEntity
      uiTransform={{
        width: 220,
        height: 640,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12
      }}
      uiBackground={
        panel
          ? { textureMode: 'stretch', texture: { src: panel.src }, color: Color4.White() }
          : { color: panelDim }
      }
    >
      <Img k="leaderboard" w={40} tint={gold} margin={6} />
      {ladder.length === 0 ? (
        <Img k="no-travelers" w={28} tint={cream} margin={4} />
      ) : (
        <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center' }}>
          {ladder.map((entry, i) => (
            <UiEntity key={i} uiTransform={{ width: 110, flexDirection: 'row', alignItems: 'center', margin: 4 }}>
              <NameTag name={entry.name} w={28} tint={i === 0 ? gold : cream} />
              <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: { left: 6 } }}>
                <Digits value={entry.wins} w={28} tint={gold} tight />
                <Img k="wins" w={24} tint={cream} margin={2} />
              </UiEntity>
            </UiEntity>
          ))}
        </UiEntity>
      )}
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
        <Img k="rift-title" w={120} tint={Color4.White()} margin={0} />
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
        <DuelLadder />
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
            uiTransform={{ width: 168, height: Math.round((168 * enter.h) / enter.w) }}
            uiBackground={{
              textureMode: 'stretch',
              texture: { src: enter.src },
              color: canReady ? (seat?.ready ? gold : Color4.White()) : Color4.create(1, 1, 1, 0.55)
            }}
            onMouseDown={canReady ? tap(() => duelReady(mode, !seat!.ready)) : undefined}
          />
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
  const won = pub.winner === getMyAddress()
  const victor = pub.seats.find((seat) => seat.address === pub.winner)
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
      <UiEntity
        uiTransform={{
          width: 200,
          height: '100%',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Img k="victor" w={26} tint={gold} margin={4} />
        {victor?.heroes[0] ? <Face id={victor.heroes[0].defId} w={90} h={90} /> : null}
        {victor ? <NameTag name={victor.name} w={20} tint={gold} /> : null}
      </UiEntity>
      {pub.rewards ? (
        <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
          <Img k="spoils" w={30} tint={gold} margin={6} />
          <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center' }}>
            {pub.rewards.map((reward, i) => {
              const seat = pub.seats.find((entry) => entry.address === reward.address)
              return (
                <UiEntity key={i} uiTransform={{ width: 96, flexDirection: 'row', alignItems: 'center', margin: 4 }}>
                  <NameTag name={seat?.name ?? reward.address.slice(0, 6)} w={16} tint={cream} />
                  {reward.coins > 0 ? (
                    <UiEntity
                      uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: { left: 4 } }}
                    >
                      <Img k="icon-coins" w={22} tint={Color4.White()} margin={1} />
                      <Digits value={reward.coins} w={16} tint={gold} />
                    </UiEntity>
                  ) : null}
                  <UiEntity
                    uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: { left: 4 } }}
                  >
                    <Img k="xp" w={22} tint={cream} margin={1} />
                    <Gain value={reward.xp} w={14} tint={gold} />
                  </UiEntity>
                </UiEntity>
              )
            })}
          </UiEntity>
        </UiEntity>
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
        })}
      >
        <Img k="raids" w={56} tint={fz.tab === 'raids' ? gold : cream} margin={0} />
      </UiEntity>
      <UiEntity
        uiTransform={{ padding: 10, margin: 6, alignItems: 'center', justifyContent: 'center' }}
        onMouseDown={tap(() => {
          fz.tab = 'duels'
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
      <FzTabs />
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
      <GameLogo />
    </UiEntity>
  )
}
