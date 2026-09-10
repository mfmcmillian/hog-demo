import { Color4 } from '@dcl/sdk/math'
import ReactEcs from '@dcl/sdk/react-ecs'
import { UiEntity } from './ui'
import { tap } from '../game/audio'
import { BOARD_IDS, BOARD_TOP, BoardEntry, BoardId } from '../mp/protocol'
import { boardsView, getMyAddress, getMyName, hall, myBoardRank, presentPlayers } from '../mp/session'
import { HallTab } from '../mp/views'
import { AvatarBust } from './avatar'
import { FeedPanel } from './feed'
import { press, pressTint } from './fx/press'
import './labels.hall.gen'
import { LABELS } from './labels.gen'
import { cream, gold, muted, PASS, xpBlue } from './theme'
import { Backdrop, Digits, Img, LevelBadge, NameTag, Notice } from './widgets'

// ---- The Hall of Heroes -----------------------------------------------------------
//
// Four leaderboards on one wall. A canvas row is a phone column: the board
// tabs run along the physical top, the ranked list fills the middle reading
// top-to-bottom, and "your rank" sits along the physical bottom. Everything
// here is server-published (mp/views.boardsView); nothing is computed locally.

const tabDark = Color4.create(0.06, 0.04, 0.05, 0.7)
const tabLit = Color4.create(0.28, 0.17, 0.06, 0.85)
const rowDark = Color4.create(0.08, 0.05, 0.06, 0.66)
const rowTop = Color4.create(0.32, 0.2, 0.07, 0.7)
const rowMine = Color4.create(0.16, 0.24, 0.42, 0.72)
const MEDAL_TINTS = [gold, Color4.create(0.78, 0.78, 0.85, 1), Color4.create(0.8, 0.52, 0.28, 1)]

/** The word strip that names each page, and the unit drawn by a board's number. */
const BOARD_LABEL: Record<HallTab, string> = {
  level: 'board-level',
  roads: 'board-roads',
  raids: 'board-raids',
  duels: 'board-duels',
  news: 'feed-title'
}
/** The pages along the physical top: the four boards, then the realm news. */
const HALL_TABS: HallTab[] = [...BOARD_IDS, 'news']
const BOARD_UNIT: Record<BoardId, string> = {
  level: 'lv',
  roads: 'board-roads',
  raids: 'board-raids',
  duels: 'wins'
}

const TAB_W = 66 // phone-tall
const TAB_H = 118 // phone-wide
/** The chrome's BACK plaque sits at the canvas bottom-left (phone top-left),
 * 96px tall over an 18px inset, in this same corner: keep the tab rail clear
 * of it (the well is inset 36px, so 96 + 18 - 36 + a little breathing room). */
const TAB_CLEAR = 100

/** One board tab: the label plate, a gold rule under the live one. */
function BoardTab(props: { key?: string; board: HallTab }) {
  const live = hall.tab === props.board
  const id = `hall:tab-${props.board}`
  return (
    <UiEntity
      uiTransform={{ width: TAB_W, height: TAB_H, margin: { top: 5, bottom: 5 }, flexDirection: 'row' }}
      onMouseDown={
        live
          ? undefined
          : press(
              id,
              tap(() => {
                hall.tab = props.board
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
        <Img k={BOARD_LABEL[props.board]} w={props.board === 'news' ? 22 : 28} tint={live ? gold : muted} margin={0} />
      </UiEntity>
      <UiEntity
        uiTransform={{ width: 5, height: '100%', pointerFilter: 'none' }}
        uiBackground={{ color: live ? gold : Color4.create(0, 0, 0, 0) }}
      />
    </UiEntity>
  )
}

function BoardTabs() {
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
      {HALL_TABS.map((board) => (
        <BoardTab key={board} board={board} />
      ))}
    </UiEntity>
  )
}

/** The server publishes the best name it has, which for a wallet it never saw
 * an avatar for is the wallet itself. Whoever is in the scene with us we know
 * by name locally, so fill those in here. */
function entryName(entry: BoardEntry): string {
  if (!/^0x[0-9a-f]{4}/i.test(entry.name)) return entry.name
  const address = entry.address.toLowerCase()
  if (address === getMyAddress()) return getMyName()
  return presentPlayers.get(address) ?? entry.name
}

/** One ranked name, a physical row: laurel/rank | name + level | the stat.
 * The top three sit on lit leather under a tinted laurel; your own row is
 * picked out in the level blue. */
function BoardRow(props: { key?: number; rank: number; entry: BoardEntry; board: BoardId; mine: boolean }) {
  const top3 = props.rank <= 3
  const laurel = LABELS['road-laurel']
  const w = top3 ? 72 : 56
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
        uiTransform={{ width: top3 ? 62 : 42, height: top3 ? 62 : 42, alignItems: 'center', justifyContent: 'center' }}
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
      <UiEntity uiTransform={{ height: 10 }} />
      {/* their walker, as it looks in the overworld; strangers fall back to the default */}
      <AvatarBust address={props.entry.address.toLowerCase()} w={top3 ? 54 : 42} margin={0} />
      <UiEntity uiTransform={{ height: 6 }} />
      <NameTag name={entryName(props.entry)} w={top3 ? 30 : 24} tint={props.rank === 1 ? gold : cream} />
      {props.board === 'level' ? null : (
        <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', ...PASS }}>
          <UiEntity uiTransform={{ height: 8 }} />
          <LevelBadge level={props.entry.level} w={top3 ? 13 : 11} />
        </UiEntity>
      )}
      <UiEntity uiTransform={{ flexGrow: 1 }} />
      <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center' }}>
        <Digits value={props.entry.value} w={top3 ? 30 : 24} tint={gold} tight />
        <Img
          k={BOARD_UNIT[props.board]}
          w={top3 ? 22 : 18}
          tint={props.board === 'level' ? xpBlue : cream}
          margin={3}
        />
      </UiEntity>
    </UiEntity>
  )
}

/** The ranked list for the live board, top-to-bottom on the phone. */
function BoardList() {
  const board = hall.tab === 'news' ? 'level' : hall.tab
  const rows = boardsView.pub.boards[board] ?? []
  const me = getMyAddress().toLowerCase()
  return (
    <UiEntity
      uiTransform={{
        flexGrow: 1,
        height: '92%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: rows.length === 0 ? 'center' : 'flex-start',
        padding: 10,
        margin: { top: 6, bottom: 6 }
      }}
      uiBackground={{ color: Color4.create(0.05, 0.03, 0.04, 0.6) }}
    >
      {rows.length === 0 ? (
        <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center' }}>
          <Img k="hall-empty" w={30} tint={cream} margin={4} />
          <UiEntity uiTransform={{ width: 12 }} />
          <Img k="hall-first" w={24} tint={gold} margin={4} />
        </UiEntity>
      ) : (
        rows
          .slice(0, BOARD_TOP)
          .map((entry, i) => (
            <BoardRow key={i} rank={i + 1} entry={entry} board={board} mine={entry.address.toLowerCase() === me} />
          ))
      )}
    </UiEntity>
  )
}

/** Where you stand on the live board, along the physical bottom edge. */
function YourRank() {
  const rank = myBoardRank(getMyAddress(), hall.tab === 'news' ? 'level' : hall.tab)
  return (
    <UiEntity
      uiTransform={{
        width: 70,
        height: '100%',
        flexDirection: 'column-reverse',
        alignItems: 'center',
        justifyContent: 'center',
        margin: { left: 6 }
      }}
    >
      <Img k="your-rank" w={22} tint={muted} margin={3} />
      <UiEntity uiTransform={{ width: 14 }} />
      {rank > 0 ? (
        <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center' }}>
          <Img k="rank-hash" w={22} tint={gold} margin={0} />
          <Digits value={rank} w={34} tint={gold} tight />
        </UiEntity>
      ) : (
        <Img k="unranked" w={22} tint={muted} margin={3} />
      )}
    </UiEntity>
  )
}

/** The hall's title down the gutter strip, where the other screens hang
 * their ornate plates (widgets.MenuTitle). */
function HallTitle() {
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
      <Img k="hall-title" w={60} tint={gold} margin={4} />
      <UiEntity uiTransform={{ width: 16, ...PASS }} />
      <Img k="hall-hint" w={20} tint={muted} margin={4} />
    </UiEntity>
  )
}

export function HallScreen() {
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
      {Backdrop({ label: 'map-hall-of-heroes', dim: 0.42, pass: true })}
      <BoardTabs />
      {hall.tab === 'news' ? <FeedPanel /> : <BoardList />}
      {hall.tab === 'news' ? null : <YourRank />}
      <Notice />
      <HallTitle />
    </UiEntity>
  )
}
