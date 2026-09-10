import { engine, executeTask } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'
import { Storage } from '@dcl/sdk/server'
import { BOSS_IDS, getDef } from '../game/familiars'
import { ROADS } from '../game/quests'
import {
  FEED_LEVELS,
  FEED_MAX,
  FEED_PERSONAL,
  FEED_REALMS,
  FeedEvent,
  FeedKind,
  FeedMsg,
  FeedPub,
  giftDayOf
} from '../mp/protocol'
import { FEED_SYNC_ID, MpFeedState, room } from '../mp/transport'
import { ServerCtx } from './ctx'

// The realm feed: "Sigilwitch cleared Crow Road", "Matt found a mythic",
// "Rook entered the Reed Crypt". A ring buffer of the last FEED_MAX public
// events on one synced entity, persisted, so a player arriving in an empty
// World still sees that other people were here an hour ago. Personal lines
// (your ghost fell, someone passed you on a board) go to one wallet only.
//
// Most events are raised by the server itself (raids, duels, realm entries,
// ghosts, boards). The few that only the client sees - a pack pull, a road
// cleared, a warlord felled, a level milestone, the streak - arrive as
// FeedMsg and are checked against what the server knows before they post.

const FEED_KEY = 'hog-feed-v1'
/** Minimum gap between any two public posts by one wallet. */
const POST_GAP_MS = 3000
/** Minimum gap between two arrival lines by one wallet (walking is chatty). */
const ENTER_GAP_MS = 45 * 1000

export type FeedApi = {
  /** Public line for everyone. Returns the event, or undefined if dropped. */
  post: (kind: FeedKind, address: string, extra?: { arg?: string; n?: number; name?: string }) => FeedEvent | undefined
  /** Personal line for one wallet (never enters the public buffer). */
  postTo: (address: string, kind: FeedKind, extra?: { arg?: string; n?: number; name?: string }) => void
  /** Realm-arrival hook for the overworld server. */
  entered: (address: string, realm: string) => void
}

export function setupFeed(ctx: ServerCtx): FeedApi {
  const entity = engine.addEntity()
  let revision = 0
  let seq = 0
  const pub: FeedPub = { events: [] }
  /** Storage round-trip confirmed; until then the buffer is session-only. */
  let ready = false
  let publishWait = 0
  let dirty = false
  let persistWait = 0
  let persistDirty = false

  const lastPostAt = new Map<string, number>()
  const lastEnterAt = new Map<string, number>()
  const lastRealm = new Map<string, string>()
  /** Highest client-reported milestone per wallet, so replays can't re-post. */
  const lastRoad = new Map<string, number>()
  const lastLevel = new Map<string, number>()
  const lastStreakDay = new Map<string, number>()
  /** Legendary pulls per wallet per day, so a whale can't paper the feed. */
  const pullsToday = new Map<string, { day: number; n: number }>()

  MpFeedState.create(entity, { json: JSON.stringify(pub), revision })
  syncEntity(entity, [MpFeedState.componentId], FEED_SYNC_ID)

  function publish(): void {
    revision += 1
    const state = MpFeedState.getMutable(entity)
    state.json = JSON.stringify(pub)
    state.revision = revision
    dirty = false
    publishWait = 0.3
  }

  function persist(): void {
    if (!ready) return
    persistDirty = false
    try {
      Storage.set(FEED_KEY, JSON.stringify({ seq, events: pub.events }))
        .then((ok) => {
          if (!ok) console.log('[Server] feed persist failed: storage set returned false')
        })
        .catch((error: unknown) => {
          console.log(`[Server] feed persist failed: ${error}`)
        })
    } catch (error) {
      console.log(`[Server] feed persist failed: ${error}`)
    }
  }

  function make(kind: FeedKind, address: string, extra?: { arg?: string; n?: number; name?: string }): FeedEvent {
    seq += 1
    const event: FeedEvent = { seq, at: Date.now(), kind, address, name: extra?.name ?? ctx.nameFor(address) }
    if (extra?.arg !== undefined) event.arg = extra.arg
    if (extra?.n !== undefined) event.n = extra.n
    return event
  }

  function post(
    kind: FeedKind,
    address: string,
    extra?: { arg?: string; n?: number; name?: string }
  ): FeedEvent | undefined {
    if (FEED_PERSONAL.indexOf(kind) >= 0) return undefined
    const now = Date.now()
    if (now - (lastPostAt.get(address) ?? 0) < POST_GAP_MS) return undefined
    lastPostAt.set(address, now)
    const event = make(kind, address, extra)
    pub.events.push(event)
    while (pub.events.length > FEED_MAX) pub.events.shift()
    dirty = true
    persistDirty = true
    return event
  }

  function postTo(address: string, kind: FeedKind, extra?: { arg?: string; n?: number; name?: string }): void {
    const event = make(kind, address, extra)
    room.send('feedUpdate', { address, json: JSON.stringify(event) })
  }

  function entered(address: string, realm: string): void {
    if (lastRealm.get(address) === realm) return
    lastRealm.set(address, realm)
    if (FEED_REALMS.indexOf(realm) < 0) return
    const now = Date.now()
    if (now - (lastEnterAt.get(address) ?? 0) < ENTER_GAP_MS) return
    if (post('enter', address, { arg: realm })) lastEnterAt.set(address, now)
  }

  // Client-reported moments, sanity-checked against the save the server holds.
  room.onMessage('feedMsg', (data, context) => {
    if (!context) return
    const sender = context.from.toLowerCase()
    if (!sender || !ctx.present.has(sender)) return
    let msg: FeedMsg
    try {
      msg = JSON.parse(data.json) as FeedMsg
    } catch {
      return
    }
    const save = ctx.saves.get(sender)
    if (msg.type === 'pull') {
      let rarity = ''
      try {
        rarity = getDef(msg.defId).rarity
      } catch {
        return
      }
      if (rarity !== 'legendary' && rarity !== 'mythic') return
      const day = giftDayOf(Date.now())
      const count = pullsToday.get(sender)
      const n = count && count.day === day ? count.n : 0
      if (n >= 6) return
      pullsToday.set(sender, { day, n: n + 1 })
      post('pull', sender, { arg: msg.defId })
      return
    }
    if (msg.type === 'road') {
      const n = Math.floor(Number(msg.n) || 0)
      if (n < 1 || n > ROADS.length) return
      // The save push may lag the fight by a second; allow exactly one ahead.
      if (save && n > save.cleared + 1) return
      if (n <= (lastRoad.get(sender) ?? (save ? save.cleared - 1 : 0))) return
      lastRoad.set(sender, n)
      post('road', sender, { n })
      return
    }
    if (msg.type === 'warlord') {
      try {
        getDef(msg.defId)
      } catch {
        return
      }
      if (BOSS_IDS.indexOf(msg.defId) < 0) return
      post('warlord', sender, { arg: msg.defId })
      return
    }
    if (msg.type === 'level') {
      const n = Math.floor(Number(msg.n) || 0)
      if (FEED_LEVELS.indexOf(n) < 0) return
      if (n <= (lastLevel.get(sender) ?? 0)) return
      lastLevel.set(sender, n)
      post('level', sender, { n })
      return
    }
    if (msg.type === 'streak') {
      const day = giftDayOf(Date.now())
      if (day - (lastStreakDay.get(sender) ?? 0) < 6) return
      lastStreakDay.set(sender, day)
      post('streak', sender)
    }
  })

  executeTask(async () => {
    try {
      const raw = await Storage.get<string>(FEED_KEY)
      if (raw) {
        const stored = JSON.parse(raw) as { seq?: number; events?: FeedEvent[] }
        const events = Array.isArray(stored.events) ? stored.events : []
        // Stored history first, then whatever posted in the seconds before the read.
        const live = pub.events.slice()
        pub.events = [...events.filter(valid), ...live].slice(-FEED_MAX)
        seq = Math.max(seq, Math.floor(Number(stored.seq) || 0), ...pub.events.map((event) => event.seq))
        dirty = true
      }
      ready = true
      if (!raw) persist()
    } catch (error) {
      console.log(`[Server] feed load failed: ${error}`)
    }
  })

  function valid(event: FeedEvent): boolean {
    return (
      !!event &&
      typeof event.kind === 'string' &&
      typeof event.address === 'string' &&
      typeof event.name === 'string' &&
      typeof event.at === 'number' &&
      FEED_PERSONAL.indexOf(event.kind) < 0
    )
  }

  engine.addSystem((dt) => {
    publishWait -= dt
    if (dirty && publishWait <= 0) publish()
    persistWait -= dt
    if (persistDirty && persistWait <= 0) {
      persistWait = 5
      persist()
    }
  })

  return { post, postTo, entered }
}
