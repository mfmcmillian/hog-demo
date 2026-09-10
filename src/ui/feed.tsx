import { Color4 } from '@dcl/sdk/math'
import ReactEcs from '@dcl/sdk/react-ecs'
import { UiEntity } from './ui'
import { getDef } from '../game/familiars'
import { OW_REALMS, OwRealmId } from '../game/owdefs'
import { ROADS } from '../game/quests'
import { game } from '../game/store'
import { getMyAddress } from '../mp/identity'
import { feedToast, feedView, myFeed } from '../mp/feedClient'
import { FeedEvent, FEED_PERSONAL } from '../mp/protocol'
import { AvatarBust, GHOST_CAST } from './avatar'
import './labels.feed.gen'
import { LABELS } from './labels.gen'
import { cream, gold, muted, PASS, xpBlue } from './theme'
import { Digits, Face, Img, NameTag } from './widgets'

// The realm feed on screen: a toast that slides fresh lines along the
// physical bottom edge (home, hub, map...), and the hall's REALM NEWS page
// listing the last while of everyone's doings plus your personal lines.
// Every line is the same shape - who | verb | what - built from the existing
// label strips, faces and name glyphs, so no new art per event.

const plateDark = Color4.create(0.05, 0.03, 0.04, 0.8)
const plateGold = Color4.create(0.22, 0.16, 0.03, 0.82)
const plateBlue = Color4.create(0.05, 0.08, 0.16, 0.84)

function fade(c: Color4, a: number): Color4 {
  return Color4.create(c.r, c.g, c.b, c.a * a)
}

function realmKey(realm: string): string | undefined {
  return OW_REALMS[realm as OwRealmId]?.nameKey
}

function roadKey(n: number): string | undefined {
  return ROADS[Math.max(0, Math.min(ROADS.length, n) - 1)]?.id
}

/** The verb strip and the subject after it, per kind. Personal kinds flip:
 * the verb speaks to you and the other party's name follows. */
function verbOf(event: FeedEvent): string {
  switch (event.kind) {
    case 'enter':
      return 'feed-entered'
    case 'pull':
      return 'feed-found'
    case 'road':
      return 'feed-cleared'
    case 'raid':
      return 'feed-raid-won'
    case 'duel':
      return 'feed-defeated'
    case 'warlord':
      return 'feed-felled'
    case 'level':
      return 'feed-reached'
    case 'streak':
      return 'feed-streak'
    case 'ghostduel':
      return 'feed-beat-ghost'
    case 'boss':
      return 'feed-boss-hit'
    case 'bossfell':
      return 'feed-boss-fell'
    case 'record':
      return 'feed-ghost-fell'
    case 'ghostraid':
      return 'feed-raided-with'
    case 'passed':
      return 'feed-passed-you'
  }
}

function Subject(props: { event: FeedEvent; s: number; a: number }) {
  const { event, s, a } = props
  const tint = fade(cream, a)
  const goldT = fade(gold, a)
  switch (event.kind) {
    case 'enter': {
      const key = realmKey(event.arg ?? '')
      return key ? <Img k={key} w={Math.round(13 * s)} tint={goldT} margin={3} /> : null
    }
    case 'pull':
      return (
        <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', ...PASS }}>
          <Face id={event.arg ?? ''} w={Math.round(28 * s)} h={Math.round(28 * s)} tint={Color4.create(1, 1, 1, a)} />
          <UiEntity uiTransform={{ width: 4 }} />
          <Img k={event.arg ? rarityOf(event.arg) : 'legendary'} w={Math.round(12 * s)} tint={goldT} margin={2} />
        </UiEntity>
      )
    case 'road': {
      const key = roadKey(event.n ?? 1)
      return key ? <Img k={key} w={Math.round(13 * s)} tint={goldT} margin={3} /> : null
    }
    case 'warlord':
    case 'bossfell':
      return (
        <Face id={event.arg ?? ''} w={Math.round(28 * s)} h={Math.round(28 * s)} tint={Color4.create(1, 1, 1, a)} />
      )
    case 'boss':
      // the boss's face, then the damage figure in gold
      return (
        <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', ...PASS }}>
          <Face id={event.arg ?? ''} w={Math.round(28 * s)} h={Math.round(28 * s)} tint={Color4.create(1, 1, 1, a)} />
          <UiEntity uiTransform={{ width: 4 }} />
          <Digits value={event.n ?? 0} w={Math.round(13 * s)} tint={goldT} tight />
        </UiEntity>
      )
    case 'level':
      return <Digits value={event.n ?? 0} w={Math.round(15 * s)} tint={fade(xpBlue, a)} tight />
    case 'duel':
      return <NameTag name={event.arg ?? ''} w={Math.round(12 * s)} tint={tint} />
    case 'ghostduel':
      return (
        <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', ...PASS }}>
          <NameTag name={event.arg ?? ''} w={Math.round(12 * s)} tint={fade(GHOST_CAST, a / GHOST_CAST.a)} />
          <UiEntity uiTransform={{ width: 4 }} />
          <Img k="ghost" w={Math.round(10 * s)} tint={fade(muted, a)} margin={2} />
        </UiEntity>
      )
    case 'record':
      return <NameTag name={event.name} w={Math.round(12 * s)} tint={tint} />
    case 'ghostraid':
      return (
        <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', ...PASS }}>
          <NameTag name={event.name} w={Math.round(12 * s)} tint={tint} />
          <UiEntity uiTransform={{ width: 6 }} />
          <Img k="icon-coins" w={Math.round(16 * s)} tint={Color4.create(1, 1, 1, a)} margin={1} />
          <Digits value={event.n ?? 0} w={Math.round(13 * s)} tint={goldT} tight />
        </UiEntity>
      )
    case 'passed':
      return <Img k={`board-${event.arg ?? 'level'}`} w={Math.round(13 * s)} tint={goldT} margin={3} />
    default:
      return null
  }
}

function rarityOf(defId: string): string {
  // The label keys match the rarity ids (only legendary+ ever reaches the feed).
  try {
    return getDef(defId).rarity
  } catch {
    return 'legendary'
  }
}

/** The "who" of a line: their walker and name, or the YOURS tag on personal lines. */
function Who(props: { event: FeedEvent; s: number; a: number }) {
  const { event, s, a } = props
  if (FEED_PERSONAL.indexOf(event.kind) >= 0) {
    return <Img k="feed-yours" w={Math.round(9 * s)} tint={fade(xpBlue, a)} margin={2} />
  }
  return (
    <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', ...PASS }}>
      <AvatarBust address={event.address} w={Math.round(30 * s)} cast={Color4.create(1, 1, 1, a)} margin={2} />
      <NameTag name={event.name} w={Math.round(12 * s)} tint={fade(cream, a)} />
    </UiEntity>
  )
}

/** who | verb | what, reading physically left-to-right. `s` scales the
 * glyphs; `a` fades everything. Personal lines lead with the verb. */
export function FeedLine(props: { event: FeedEvent; s?: number; a?: number; key?: string | number }) {
  const { event } = props
  const s = props.s ?? 1
  const a = props.a ?? 1
  return (
    <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', ...PASS }}>
      <Who event={event} s={s} a={a} />
      <UiEntity uiTransform={{ width: 6 }} />
      <Img k={verbOf(event)} w={Math.round(10 * s)} tint={fade(muted, a)} margin={2} />
      <UiEntity uiTransform={{ width: 6 }} />
      <Subject event={event} s={s} a={a} />
    </UiEntity>
  )
}

/** Phases where a passing toast would fight the screen (fights, ceremonies, stories). */
const QUIET = new Set<typeof game.phase>(['intro', 'start', 'battle', 'banner', 'report', 'heroCard', 'credits'])

/** A fresh feed line hanging along the physical bottom edge of the well. */
export function FeedToast() {
  const toast = feedToast()
  if (!toast || QUIET.has(game.phase)) return null
  const personal = FEED_PERSONAL.indexOf(toast.event.kind) >= 0
  const plate = personal
    ? plateBlue
    : toast.event.kind === 'pull' || toast.event.kind === 'warlord' || toast.event.kind === 'bossfell'
      ? plateGold
      : plateDark
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { right: 14, top: 0 },
        width: 74,
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        ...PASS
      }}
    >
      <UiEntity
        uiTransform={{
          width: 74,
          padding: { top: 16, bottom: 16, left: 6, right: 6 },
          flexDirection: 'column-reverse',
          alignItems: 'center',
          justifyContent: 'center',
          ...PASS
        }}
        uiBackground={{ color: fade(plate, toast.alpha) }}
      >
        <FeedLine event={toast.event} s={1.25} a={toast.alpha} />
      </UiEntity>
    </UiEntity>
  )
}

function agoParts(at: number): { k: string; n?: number } {
  const mins = Math.max(0, Math.floor((Date.now() - at) / 60000))
  if (mins < 1) return { k: 'feed-now' }
  if (mins < 60) return { k: 'feed-ago-m', n: mins }
  const hours = Math.floor(mins / 60)
  if (hours < 24) return { k: 'feed-ago-h', n: hours }
  return { k: 'feed-ago-d', n: Math.floor(hours / 24) }
}

function Ago(props: { at: number; s?: number }) {
  const ago = agoParts(props.at)
  const s = props.s ?? 1
  return (
    <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', ...PASS }}>
      {ago.n !== undefined ? <Digits value={ago.n} w={Math.round(11 * s)} tint={muted} tight /> : null}
      <Img k={ago.k} w={Math.round(8 * s)} tint={muted} margin={2} />
    </UiEntity>
  )
}

/** Glyph scale on the news page: the same size as the leaderboard rows. */
const ROW_S = 1.9

/** One row of the hall's news page, two lines physically stacked so the
 * glyphs can run at leaderboard size: who and when above, what below. */
function FeedRow(props: { event: FeedEvent; key?: string | number }) {
  const personal = FEED_PERSONAL.indexOf(props.event.kind) >= 0
  const mine = !personal && props.event.address === getMyAddress()
  return (
    <UiEntity
      uiTransform={{
        width: 104,
        height: '96%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        margin: 3,
        padding: { top: 10, bottom: 10, left: 6, right: 6 },
        ...(personal ? { borderWidth: 2, borderColor: xpBlue } : {})
      }}
      uiBackground={{
        color: personal ? plateBlue : mine ? Color4.create(0.32, 0.2, 0.07, 0.55) : Color4.create(0.1, 0.07, 0.08, 0.6)
      }}
    >
      {/* line 1: who ... when */}
      <UiEntity
        uiTransform={{
          height: '100%',
          flexDirection: 'column-reverse',
          alignItems: 'center',
          margin: { bottom: 4 },
          ...PASS
        }}
      >
        <Who event={props.event} s={ROW_S} a={1} />
        <UiEntity uiTransform={{ flexGrow: 1, ...PASS }} />
        <Ago at={props.event.at} s={1.5} />
      </UiEntity>
      {/* line 2: verb, subject */}
      <UiEntity uiTransform={{ height: '100%', flexDirection: 'column-reverse', alignItems: 'center', ...PASS }}>
        <UiEntity uiTransform={{ width: 4 }} />
        <Img k={verbOf(props.event)} w={Math.round(10 * ROW_S)} tint={cream} margin={2} />
        <UiEntity uiTransform={{ width: 8 }} />
        <Subject event={props.event} s={ROW_S} a={1} />
      </UiEntity>
    </UiEntity>
  )
}

/** The hall's REALM NEWS page: your personal lines first, then the realm's
 * last doings, newest first; the quiet plate when nothing has happened. */
export function FeedPanel() {
  const personal = [...myFeed].reverse().slice(0, 3)
  const realm = [...feedView.pub.events].reverse()
  // Ten rows of 110 fill the panel's ~1200; more would spill past its edge.
  const rows = [...personal, ...realm].slice(0, 10)
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
          <Img k="feed-empty" w={30} tint={cream} margin={4} />
          <UiEntity uiTransform={{ width: 12 }} />
          <Img k="feed-hint" w={20} tint={muted} margin={4} />
        </UiEntity>
      ) : (
        rows.map((event, i) => <FeedRow key={`${event.seq}-${i}`} event={event} />)
      )}
    </UiEntity>
  )
}

/** Guard so the label module import above is never tree-shaken. */
export const FEED_UI_READY = !!LABELS
