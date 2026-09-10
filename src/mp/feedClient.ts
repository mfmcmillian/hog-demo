import { engine } from '@dcl/sdk/ecs'
import { getMyAddress } from './identity'
import { FEED_TOAST_S, FeedEvent, FeedMsg, FeedPub, emptyFeed } from './protocol'
import { MpFeedState, room } from './transport'

// Client side of the realm feed: mirrors the server's ring buffer (the hall's
// REALM NEWS page), queues fresh lines as toasts, and reports the handful of
// moments only the client witnesses (pack pulls, roads, warlords, levels,
// the streak) for the server to check and broadcast.

export const feedView: { pub: FeedPub; revision: number } = { pub: emptyFeed(), revision: -1 }

/** Personal lines addressed to me (hall pushes, ghost news), newest last. */
export const myFeed: FeedEvent[] = []
const MY_FEED_KEEP = 12

/** Toasts waiting their turn; only `live` is on screen. */
const queue: FeedEvent[] = []
const QUEUE_MAX = 3
let live: { event: FeedEvent; t: number } | undefined
/** Highest public seq already seen, so history from before we connected
 * fills the hall page but never toasts. */
let seqSeen = -1

function sendFeed(msg: FeedMsg): void {
  room.send('feedMsg', { json: JSON.stringify(msg) })
}

/** A legendary or mythic hero just joined my collection (any source). */
export function feedPull(defId: string): void {
  sendFeed({ type: 'pull', defId })
}

/** I just cleared my n-th road. */
export function feedRoad(n: number): void {
  sendFeed({ type: 'road', n })
}

/** I just felled a realm warlord on the overworld. */
export function feedWarlord(defId: string): void {
  sendFeed({ type: 'warlord', defId })
}

/** My account just crossed an announced level. */
export function feedLevel(n: number): void {
  sendFeed({ type: 'level', n })
}

/** Day 7 of the login streak, claimed. */
export function feedStreak(): void {
  sendFeed({ type: 'streak' })
}

function enqueue(event: FeedEvent): void {
  queue.push(event)
  while (queue.length > QUEUE_MAX) queue.shift()
}

/** The toast on screen right now, with its fade alpha; undefined when quiet. */
export function feedToast(): { event: FeedEvent; alpha: number } | undefined {
  if (!live) return undefined
  const fadeIn = Math.min(1, (FEED_TOAST_S - live.t) / 0.35)
  const fadeOut = Math.min(1, live.t / 0.6)
  return { event: live.event, alpha: Math.min(fadeIn, fadeOut) }
}

export function setupFeedClient(): void {
  room.onMessage('feedUpdate', (data) => {
    if (data.address !== getMyAddress()) return
    let event: FeedEvent
    try {
      event = JSON.parse(data.json) as FeedEvent
    } catch {
      return
    }
    myFeed.push(event)
    while (myFeed.length > MY_FEED_KEEP) myFeed.shift()
    enqueue(event)
  })
}

export function tickFeedMirror(dt: number): void {
  for (const [, state] of engine.getEntitiesWith(MpFeedState)) {
    if (state.revision === feedView.revision) break
    feedView.revision = state.revision
    try {
      feedView.pub = JSON.parse(state.json) as FeedPub
    } catch {
      break
    }
    const events = feedView.pub.events
    const me = getMyAddress()
    if (seqSeen === -1) {
      // First snapshot: history, not news.
      seqSeen = events.length > 0 ? events[events.length - 1].seq : 0
    } else {
      for (const event of events) {
        if (event.seq <= seqSeen) continue
        seqSeen = event.seq
        // My own doings are not news to me (the screens already celebrate them).
        if (event.address !== me) enqueue(event)
      }
    }
    break
  }

  if (live) {
    live.t -= dt
    if (live.t <= 0) live = undefined
  }
  if (!live && queue.length > 0) live = { event: queue.shift()!, t: FEED_TOAST_S }
}
