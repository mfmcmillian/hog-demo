import { Color4 } from '@dcl/sdk/math'
import ReactEcs from '@dcl/sdk/react-ecs'
import { UiEntity } from './ui'
import { tap } from '../game/audio'
import { ROADS } from '../game/quests'
import { game } from '../game/store'
import { BOSS_ATTACKS_PER_DAY, BOSS_TOP, BossEntry, DAY_MS } from '../mp/protocol'
import { bossAttack, bossSecondsLeft, bossView, getMyAddress, getMyName, myBoss, presentPlayers } from '../mp/session'
import { AvatarBust } from './avatar'
import { BattleRank } from './battle'
import { press, pressTint } from './fx/press'
import './labels.boss.gen'
import './labels.hall.gen' // your-rank / rank-hash / unranked / hall-first
import { LABELS } from './labels.gen'
import { cream, danger, gold, good, muted, PASS, xpBlue } from './theme'
import { Backdrop, Digits, Face, FillBar, Img, LabelBtn, LevelBadge, NameTag, Notice, SlashCount } from './widgets'

// ---- The World Boss lair ----------------------------------------------------------
//
// One warlord the whole realm hits. A canvas row is a phone column. Two pages
// share the hall's tab rail along the physical top: THE LAIR (the warlord,
// its pool and clock, your attacks and the ATTACK plate) and the DAMAGE
// BOARD (the round's top ten and the payout table). Everything here is
// server-published (mp/views.bossView); an attack in progress swaps the whole
// screen for the regular battle ranks fed by the server's private snapshots,
// with the shared pool draining live along the physical bottom.

const tabDark = Color4.create(0.06, 0.04, 0.05, 0.7)
const tabLit = Color4.create(0.28, 0.17, 0.06, 0.85)
const rowDark = Color4.create(0.08, 0.05, 0.06, 0.66)
const rowTop = Color4.create(0.32, 0.2, 0.07, 0.7)
const rowMine = Color4.create(0.16, 0.24, 0.42, 0.72)
const bandDark = Color4.create(0.05, 0.03, 0.04, 0.6)
const poolRed = Color4.create(0.62, 0.14, 0.12, 1)
const liveGreen = Color4.create(0.28, 0.85, 0.35, 1)
const MEDAL_TINTS = [gold, Color4.create(0.78, 0.78, 0.85, 1), Color4.create(0.8, 0.52, 0.28, 1)]

type BossTab = 'lair' | 'board'
const TABS: BossTab[] = ['lair', 'board']
const TAB_LABEL: Record<BossTab, string> = { lair: 'boss-tab-lair', board: 'boss-tab-board' }
const TAB_W = 66 // phone-tall
const TAB_H = 250 // phone-wide
/** Keep the rail clear of the chrome's BACK plaque (see hall.tsx). */
const TAB_CLEAR = 100

/** The clash floor of the road this warlord guards: the lair's backdrop. */
function lairFloor(defId: string): string {
  const road = ROADS.find((entry) => entry.boss === defId)
  return LABELS[`map-clash-${road?.id ?? 'q1'}`] ? `map-clash-${road?.id ?? 'q1'}` : 'map-cave'
}

/** The server publishes the best name it has, which for a wallet it never saw
 * an avatar for is the wallet itself; fill in whoever is here with us. */
function entryName(entry: BossEntry): string {
  if (!/^0x[0-9a-f]{4}/i.test(entry.name)) return entry.name
  const address = entry.address.toLowerCase()
  if (address === getMyAddress()) return getMyName()
  return presentPlayers.get(address) ?? entry.name
}

/** A phone-horizontal line of things, centered on its own axis. */
function Line(props: { children?: ReactEcs.JSX.Component[] | ReactEcs.JSX.Component; pass?: boolean }) {
  return (
    <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', ...(props.pass ? PASS : {}) }}>
      {props.children}
    </UiEntity>
  )
}

/** Room along the phone's width (inside a Line). */
function Across(props: { w: number }) {
  return <UiEntity uiTransform={{ width: props.w, ...PASS }} />
}

/** Room down the phone's height (inside a band). */
function Down(props: { h: number }) {
  return <UiEntity uiTransform={{ height: props.h, ...PASS }} />
}

// ---- tabs ------------------------------------------------------------------------

function BossTabBtn(props: { key?: string; tab: BossTab }) {
  const live = bossView.tab === props.tab
  const id = `boss:tab-${props.tab}`
  return (
    <UiEntity
      uiTransform={{ width: TAB_W, height: TAB_H, margin: { top: 5, bottom: 5 }, flexDirection: 'row' }}
      onMouseDown={
        live
          ? undefined
          : press(
              id,
              tap(() => {
                bossView.tab = props.tab
              })
            )
      }
    >
      <UiEntity
        uiTransform={{
          flexGrow: 1,
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          pointerFilter: 'none'
        }}
        uiBackground={{ color: pressTint(id, live ? tabLit : tabDark) }}
      >
        <Img k={TAB_LABEL[props.tab]} w={30} tint={live ? gold : muted} margin={0} />
      </UiEntity>
      <UiEntity
        uiTransform={{ width: 5, height: '100%', pointerFilter: 'none' }}
        uiBackground={{ color: live ? gold : Color4.create(0, 0, 0, 0) }}
      />
    </UiEntity>
  )
}

function BossTabs() {
  return (
    <UiEntity
      uiTransform={{
        width: TAB_W,
        height: '100%',
        flexDirection: 'column-reverse',
        alignItems: 'center',
        justifyContent: 'center',
        margin: { right: 8 },
        padding: { bottom: TAB_CLEAR }
      }}
    >
      {TABS.map((tab) => (
        <BossTabBtn key={tab} tab={tab} />
      ))}
    </UiEntity>
  )
}

// ---- the lair page -----------------------------------------------------------------

/** The warlord's portrait with its name, tier, kills and live attackers beside it. */
function Warlord() {
  const pub = bossView.pub
  return (
    <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center' }}>
      <Face id={pub.defId} w={340} h={340} hi />
      <Across w={18} />
      <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center' }}>
        <Img k={pub.defId} w={38} tint={gold} margin={2} />
        <Down h={14} />
        <Line>
          <Img k="tier" w={28} tint={muted} margin={2} />
          <Across w={10} />
          <Digits value={pub.tier} w={44} tint={cream} tight />
        </Line>
        <Down h={14} />
        <Line>
          <Img k="boss-kills" w={24} tint={muted} margin={2} />
          <Across w={10} />
          <Digits value={pub.kills} w={36} tint={cream} tight />
        </Line>
        {pub.fighting > 0 ? (
          <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'flex-start', ...PASS }}>
            <Down h={14} />
            <Line>
              <Img k="dot" w={14} tint={liveGreen} margin={2} />
              <Across w={8} />
              <Digits value={pub.fighting} w={32} tint={cream} tight />
              <Across w={10} />
              <Img k="boss-fighting" w={24} tint={muted} margin={2} />
            </Line>
          </UiEntity>
        ) : null}
      </UiEntity>
    </UiEntity>
  )
}

/** The shared pool: its figure over a wide red bar. */
function Pool(props: { barH: number; labelW: number; digitW: number; barW: number }) {
  const pub = bossView.pub
  const frac = pub.maxHp > 0 ? pub.hp / pub.maxHp : 0
  return (
    <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center' }}>
      <Line>
        <Img k="world-hp" w={props.labelW} tint={muted} margin={2} />
        <Across w={14} />
        <Digits value={pub.hp} w={props.digitW} tint={cream} tight />
        <Img k="road-slash" w={Math.round(props.digitW * 0.6)} tint={muted} margin={3} />
        <Digits value={pub.maxHp} w={Math.round(props.digitW * 0.7)} tint={muted} tight />
      </Line>
      <Down h={10} />
      <FillBar frac={frac} w={props.barW} h={props.barH} fill={poolRed} />
    </UiEntity>
  )
}

/** How long this round's board has left (rounds are three days). */
function WeekClock() {
  const left = Math.max(0, bossView.pub.endsAt - Date.now())
  const days = Math.floor(left / DAY_MS)
  const hours = Math.floor((left % DAY_MS) / (60 * 60 * 1000))
  return (
    <Line>
      <Img k="boss-ends-in" w={26} tint={muted} margin={2} />
      <Across w={14} />
      <Digits value={days} w={44} tint={gold} tight />
      <NameTag name="d" w={32} tint={gold} />
      <Across w={14} />
      <Digits value={hours} w={44} tint={gold} tight />
      <NameTag name="h" w={32} tint={gold} />
    </Line>
  )
}

/** Attacks left today, your best hit and rank, and the ATTACK plate. */
function YourBand() {
  const you = myBoss()
  const fighting = !!bossView.fight
  const spent = you.left <= 0
  const blocked = bossView.blocked
  return (
    <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center' }}>
      <Line>
        <Img k="attacks-left" w={26} tint={muted} margin={2} />
        <Across w={16} />
        <SlashCount
          at={you.left}
          of={BOSS_ATTACKS_PER_DAY}
          w={50}
          slashW={30}
          atTint={spent ? muted : gold}
          ofTint={muted}
        />
      </Line>
      <Down h={12} />
      <Line>
        <Img k="your-best" w={26} tint={muted} margin={2} />
        <Across w={14} />
        <Digits value={you.best} w={50} tint={you.best > 0 ? gold : muted} tight />
        <Across w={30} />
        <Img k="your-rank" w={26} tint={muted} margin={2} />
        <Across w={12} />
        {you.rank > 0 ? (
          <Line>
            <Img k="rank-hash" w={30} tint={gold} margin={0} />
            <Digits value={you.rank} w={50} tint={gold} tight />
          </Line>
        ) : (
          <Img k="unranked" w={26} tint={muted} margin={2} />
        )}
      </Line>
      <Down h={18} />
      <LabelBtn
        k="attack"
        id="boss-attack"
        w={150}
        h={500}
        labelW={74}
        disabled={spent || fighting}
        onTap={() => bossAttack()}
      />
      <Down h={6} />
      {blocked === 'busy' ? (
        <Img k="boss-busy" w={24} tint={danger} margin={2} />
      ) : blocked === 'party' ? (
        <Img k="boss-party" w={24} tint={danger} margin={2} />
      ) : spent ? (
        <Img k="no-attacks" w={24} tint={muted} margin={2} />
      ) : (
        <Img k="boss-minute" w={24} tint={muted} margin={2} />
      )}
    </UiEntity>
  )
}

function LairPage() {
  return (
    <UiEntity
      uiTransform={{
        flexGrow: 1,
        height: '96%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 10,
        margin: { top: 6, bottom: 6 }
      }}
      uiBackground={{ color: bandDark }}
    >
      <Warlord />
      <UiEntity uiTransform={{ flexGrow: 1, ...PASS }} />
      <Pool barH={640} barW={40} labelW={28} digitW={36} />
      <Down h={22} />
      <WeekClock />
      <UiEntity uiTransform={{ flexGrow: 1, ...PASS }} />
      <YourBand />
      <UiEntity uiTransform={{ flexGrow: 1, ...PASS }} />
    </UiEntity>
  )
}

// ---- the damage board page -----------------------------------------------------------

/** One ranked name, a physical row: laurel/rank | walker + name + level | best hit. */
function DamageRow(props: { key?: number; rank: number; entry: BossEntry; mine: boolean }) {
  const top3 = props.rank <= 3
  const laurel = LABELS['road-laurel']
  const w = top3 ? 92 : 74
  return (
    <UiEntity
      uiTransform={{
        width: w,
        height: '96%',
        flexDirection: 'column-reverse',
        alignItems: 'center',
        justifyContent: 'flex-start',
        margin: 3,
        padding: { top: 12, bottom: 12 },
        ...(props.mine ? { borderWidth: 2, borderColor: xpBlue } : {})
      }}
      uiBackground={{ color: props.mine ? rowMine : top3 ? rowTop : rowDark }}
    >
      <UiEntity
        uiTransform={{ width: top3 ? 80 : 62, height: top3 ? 80 : 62, alignItems: 'center', justifyContent: 'center' }}
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
        <Digits value={props.rank} w={top3 ? 26 : 22} tint={top3 ? cream : muted} tight />
      </UiEntity>
      <Across w={10} />
      <AvatarBust address={props.entry.address.toLowerCase()} w={top3 ? 68 : 56} margin={0} />
      <Across w={8} />
      <NameTag name={entryName(props.entry)} w={top3 ? 34 : 28} tint={props.rank === 1 ? gold : cream} />
      <Line pass>
        <Across w={8} />
        <LevelBadge level={props.entry.level} w={top3 ? 16 : 13} />
      </Line>
      <UiEntity uiTransform={{ flexGrow: 1 }} />
      <Line>
        <Digits value={props.entry.best} w={top3 ? 42 : 34} tint={gold} tight />
        <Img k="dmg" w={top3 ? 26 : 20} tint={cream} margin={4} />
      </Line>
    </UiEntity>
  )
}

/** The payout table: everyone who attacked is paid, the top a little better. */
function Rewards() {
  return (
    <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', margin: { left: 10 }, ...PASS }}>
      <Img k="boss-rewards" w={20} tint={muted} margin={2} />
      <Down h={12} />
      <Img k="reward-1" w={22} tint={gold} margin={2} />
      <Down h={6} />
      <Img k="reward-top3" w={22} tint={cream} margin={2} />
      <Down h={6} />
      <Img k="reward-top10" w={22} tint={cream} margin={2} />
      <Down h={6} />
      <Img k="reward-all" w={22} tint={cream} margin={2} />
    </UiEntity>
  )
}

function BoardPage() {
  const rows = bossView.pub.board
  const me = getMyAddress().toLowerCase()
  return (
    <UiEntity
      uiTransform={{
        flexGrow: 1,
        height: '96%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start',
        padding: 10,
        margin: { top: 6, bottom: 6 }
      }}
      uiBackground={{ color: bandDark }}
    >
      <UiEntity
        uiTransform={{
          flexGrow: 1,
          height: '100%',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: rows.length === 0 ? 'center' : 'flex-start'
        }}
      >
        {rows.length === 0 ? (
          <Line>
            <Img k="boss-empty" w={32} tint={cream} margin={4} />
            <Across w={16} />
            <Img k="hall-first" w={28} tint={gold} margin={4} />
          </Line>
        ) : (
          rows
            .slice(0, BOSS_TOP)
            .map((entry, i) => (
              <DamageRow key={i} rank={i + 1} entry={entry} mine={entry.address.toLowerCase() === me} />
            ))
        )}
      </UiEntity>
      <Rewards />
    </UiEntity>
  )
}

/** The lair's title down the gutter strip, where the other screens hang theirs. */
function BossTitle() {
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { left: -185, top: 0 },
        width: 170,
        height: '100%',
        flexDirection: 'column-reverse',
        alignItems: 'center',
        justifyContent: 'center',
        ...PASS
      }}
    >
      <Img k="boss-title" w={60} tint={gold} margin={4} />
      <UiEntity uiTransform={{ width: 16, ...PASS }} />
      <Img k="boss-hint" w={20} tint={muted} margin={4} />
    </UiEntity>
  )
}

// ---- the fight ---------------------------------------------------------------------

/** My attack: the server-simulated fight on the regular battle ranks (the same
 * widgets, swings and damage pops as the roads and the rift), the minute and
 * the running damage figure between them, the realm's pool draining along
 * the physical bottom. */
function BossFight() {
  const fight = bossView.fight
  const b = fight?.battle
  if (!fight || !b) return null
  const secs = bossSecondsLeft()
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
      <BattleRank units={b.foe} actingUid={b.actingUid} hp={danger} />
      <UiEntity
        uiTransform={{
          width: 150,
          height: '100%',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          ...PASS
        }}
      >
        <Img k="time-left" w={26} tint={muted} margin={2} />
        <Down h={8} />
        <Digits value={secs} w={72} tint={secs <= 10 ? danger : gold} tight />
        <Down h={36} />
        <Img k="dealt" w={26} tint={muted} margin={2} />
        <Down h={8} />
        <Digits value={fight.dealt} w={52} tint={cream} tight />
      </UiEntity>
      <BattleRank units={b.you} actingUid={b.actingUid} hp={good} />
      <UiEntity
        uiTransform={{
          width: 150,
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          ...PASS
        }}
      >
        <Pool barH={560} barW={34} labelW={24} digitW={30} />
      </UiEntity>
    </UiEntity>
  )
}

/** The verdict of my last attack, over the lair: what I dealt, whether it is
 * my new best, where that puts me, and the felled banner when the realm's
 * pool ran dry on my blow. Tap anywhere to clear it. */
function BossVerdict() {
  const result = bossView.result
  if (!result) return null
  const you = myBoss()
  const laurel = LABELS['road-laurel']
  const newBest = result.dealt > 0 && result.dealt >= result.best
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 0, left: 0 },
        width: '100%',
        height: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      uiBackground={{ color: Color4.create(0.02, 0.01, 0.02, 0.82) }}
      onMouseDown={() => {
        bossView.result = undefined
        game.battle = undefined
      }}
    >
      <UiEntity
        uiTransform={{
          width: 440,
          height: '100%',
          flexDirection: 'column-reverse',
          alignItems: 'center',
          justifyContent: 'center',
          ...PASS
        }}
      >
        {result.kill ? (
          <UiEntity
            uiTransform={{
              width: 340,
              height: 340,
              flexDirection: 'column-reverse',
              alignItems: 'center',
              justifyContent: 'center',
              ...PASS
            }}
            uiBackground={
              laurel
                ? { textureMode: 'stretch', texture: { src: laurel.src }, uvs: laurel.uvs, color: gold }
                : undefined
            }
          >
            <Img k="boss-felled" w={52} tint={cream} margin={4} />
            <Across w={10} />
            <Img k="boss-rises" w={24} tint={gold} margin={2} />
          </UiEntity>
        ) : null}
        {result.wiped && !result.kill ? <Img k="party-fell" w={34} tint={danger} margin={4} /> : null}
        <Across w={16} />
        <Img k="dealt" w={32} tint={muted} margin={2} />
        <Across w={8} />
        <Digits value={result.dealt} w={84} tint={gold} tight />
        {newBest ? (
          <Line pass>
            <Across w={10} />
            <Img k="new-best" w={28} tint={xpBlue} margin={2} />
          </Line>
        ) : null}
        <Across w={24} />
        {result.rank > 0 ? (
          <Line pass>
            <Img k="your-rank" w={26} tint={muted} margin={2} />
            <Across w={10} />
            <Img k="rank-hash" w={32} tint={gold} margin={0} />
            <Digits value={result.rank} w={56} tint={gold} tight />
          </Line>
        ) : null}
        <Across w={28} />
        {you.left > 0 ? (
          <LabelBtn
            k="boss-again"
            id="boss-again"
            w={110}
            h={420}
            labelW={44}
            onTap={() => {
              game.battle = undefined
              bossAttack()
            }}
          />
        ) : (
          <Img k="no-attacks" w={24} tint={muted} margin={2} />
        )}
        <Across w={12} />
        <NameTag name="continue" w={20} tint={muted} />
      </UiEntity>
    </UiEntity>
  )
}

export function BossScreen() {
  const pub = bossView.pub
  const fighting = !!bossView.fight
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
      {Backdrop({ label: lairFloor(pub.defId), dim: fighting ? 0.2 : 0.5, pass: true })}
      {fighting ? (
        <BossFight />
      ) : (
        <UiEntity
          uiTransform={{
            width: '100%',
            height: '100%',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            padding: { left: 4, right: 4 }
          }}
        >
          <BossTabs />
          {bossView.tab === 'board' ? <BoardPage /> : <LairPage />}
        </UiEntity>
      )}
      <BossVerdict />
      <Notice />
      <BossTitle />
    </UiEntity>
  )
}
