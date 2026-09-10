import { engine, executeTask } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'
import { Storage } from '@dcl/sdk/server'
import { levelForXp } from '../game/level'
import { BOARD_IDS, BOARD_TOP, BoardEntry, BoardId, BoardsPub, PlayerSave } from '../mp/protocol'
import { BOARDS_SYNC_ID, MpBoardsState } from '../mp/transport'
import { ServerCtx } from './ctx'
import { FeedApi } from './feed'

/** One wallet's standing, kept for every player the hall has ever seen. */
type Row = {
  name: string
  /** Account XP (the level board sorts on this; level is derived). */
  xp: number
  /** Roads cleared, and the sum of ascension tiers across them (tie-break). */
  cleared: number
  stars: number
  /** Rift raids won (any seat). */
  raids: number
  /** Duel wins across both rings (mirrors the duel ladders). */
  wins: number
}

type BoardsStore = Record<string, Row>

/**
 * The Hall of Heroes: four persisted leaderboards (level, roads, raids,
 * duels) built from the saves the server holds. Rows refresh every few
 * seconds for everyone present, raid and duel wins bump straight in, and the
 * top of each board plus every present player's rank is published on one
 * synced entity. Persisted under its own key so standings outlive restarts
 * and players who have left.
 */
export function setupBoards(
  ctx: ServerCtx,
  deps: { duelWins: () => Record<string, { name: string; wins: number }>; feed: FeedApi }
): { bumpRaid: (address: string) => void; bumpWin: (address: string) => void } {
  const BOARDS_KEY = 'hog-boards-v1'
  const entity = engine.addEntity()
  let revision = 0
  let store: BoardsStore = {}
  /** Storage round-trip confirmed; until then standings are session-only. */
  let ready = false
  /** A row changed since the last publish / persist. */
  let dirty = false
  let lastPresence = ''
  /** Each present player's ranks at the last publish, so a slip is noticed
   * and they hear who passed them (hall push over the personal feed). */
  const lastRanks = new Map<string, Record<BoardId, number>>()

  MpBoardsState.create(entity, { json: JSON.stringify(emptyPub()), revision })
  syncEntity(entity, [MpBoardsState.componentId], BOARDS_SYNC_ID)

  function emptyPub(): BoardsPub {
    return { boards: { level: [], roads: [], raids: [], duels: [] }, ranks: {} }
  }

  /** A name that is really just a wallet (the nameFor fallback, or a client
   * that never learned the avatar's name). Never let one of these replace a
   * real name in the store. */
  function addressish(name: string): boolean {
    return !name || /^0x[0-9a-f]{4}/i.test(name)
  }

  /** The best name we have for a row: the avatar's real name whenever the
   * server knows it, else whatever the row already carries. */
  function bestName(address: string, current: string): string {
    const known = ctx.displayNames.get(address)
    if (known && !addressish(known)) return known
    return current
  }

  function rowFor(address: string): Row {
    const row = store[address] ?? { name: bestName(address, ''), xp: 0, cleared: 0, stars: 0, raids: 0, wins: 0 }
    store[address] = row
    return row
  }

  /** Pull the save-derived stats into a present player's row. */
  function refresh(address: string, save: PlayerSave): void {
    const row = rowFor(address)
    const name = bestName(address, row.name)
    const xp = Math.max(row.xp, Math.floor(save.axp ?? 0))
    const cleared = Math.max(row.cleared, save.cleared)
    let stars = 0
    for (const tier of Object.values(save.roadStar ?? {})) stars += Math.max(0, Math.floor(tier))
    stars = Math.max(row.stars, stars)
    if (row.name === name && row.xp === xp && row.cleared === cleared && row.stars === stars) return
    row.name = name
    row.xp = xp
    row.cleared = cleared
    row.stars = stars
    dirty = true
  }

  /** The duel ladders are the source of truth for wins; fold them in. */
  function syncWins(): void {
    const wins = deps.duelWins()
    for (const address of Object.keys(wins)) {
      const row = rowFor(address)
      if (row.wins !== wins[address].wins) {
        row.wins = wins[address].wins
        dirty = true
      }
      // the ladder remembers the name from when they sat down; take it if ours is missing
      if (addressish(row.name) && !addressish(wins[address].name)) {
        row.name = wins[address].name
        dirty = true
      }
    }
  }

  function sorted(board: BoardId): [string, Row][] {
    const rows = Object.entries(store)
    switch (board) {
      case 'level':
        return rows.filter(([, row]) => row.xp > 0).sort((a, b) => b[1].xp - a[1].xp)
      case 'roads':
        return rows
          .filter(([, row]) => row.cleared > 0)
          .sort((a, b) => b[1].cleared - a[1].cleared || b[1].stars - a[1].stars || b[1].xp - a[1].xp)
      case 'raids':
        return rows.filter(([, row]) => row.raids > 0).sort((a, b) => b[1].raids - a[1].raids || b[1].xp - a[1].xp)
      case 'duels':
        return rows.filter(([, row]) => row.wins > 0).sort((a, b) => b[1].wins - a[1].wins || b[1].xp - a[1].xp)
    }
  }

  function valueOf(board: BoardId, row: Row): number {
    switch (board) {
      case 'level':
        return levelForXp(row.xp)
      case 'roads':
        return row.cleared
      case 'raids':
        return row.raids
      case 'duels':
        return row.wins
    }
  }

  function buildPub(): BoardsPub {
    const pub = emptyPub()
    for (const board of BOARD_IDS) {
      const order = sorted(board)
      pub.boards[board] = order.slice(0, BOARD_TOP).map(([address, row]): BoardEntry => ({
        address,
        name: row.name || ctx.nameFor(address),
        level: levelForXp(row.xp),
        value: valueOf(board, row)
      }))
      for (const address of ctx.present) {
        const at = order.findIndex(([who]) => who === address)
        const ranks = (pub.ranks[address] ??= { level: 0, roads: 0, raids: 0, duels: 0 })
        ranks[board] = at < 0 ? 0 : at + 1
      }
    }
    return pub
  }

  /** Someone present slipped a rung: tell them who now stands just above. */
  function pushSlips(pub: BoardsPub): void {
    for (const address of ctx.present) {
      const now = pub.ranks[address]
      if (!now) continue
      const before = lastRanks.get(address)
      if (before) {
        for (const board of BOARD_IDS) {
          const was = before[board]
          const is = now[board]
          if (was <= 0 || is <= was) continue
          const above = sorted(board)[is - 2]
          if (!above) continue
          const [who, row] = above
          deps.feed.postTo(address, 'passed', { name: row.name || ctx.nameFor(who), arg: board })
        }
      }
      lastRanks.set(address, { ...now })
    }
    for (const address of lastRanks.keys()) if (!ctx.present.has(address)) lastRanks.delete(address)
  }

  function publish(): void {
    revision += 1
    const pub = buildPub()
    pushSlips(pub)
    const state = MpBoardsState.getMutable(entity)
    state.json = JSON.stringify(pub)
    state.revision = revision
  }

  function persist(): void {
    if (!ready) return
    try {
      // Storage.set resolves false on a failed PUT (it does not reject).
      Storage.set(BOARDS_KEY, JSON.stringify(store))
        .then((ok) => {
          if (!ok) console.log('[Server] boards persist failed: storage set returned false')
        })
        .catch((error: unknown) => {
          console.log(`[Server] boards persist failed: ${error}`)
        })
    } catch (error) {
      console.log(`[Server] boards persist failed: ${error}`)
    }
  }

  executeTask(async () => {
    try {
      const raw = await Storage.get<string>(BOARDS_KEY)
      if (raw) {
        const stored = JSON.parse(raw) as BoardsStore
        if (stored && typeof stored === 'object') {
          // Stored rows win over anything scored in the seconds before the read.
          for (const [address, row] of Object.entries(stored)) {
            const live = store[address]
            // Prefer whichever side has a real name (old rows may hold a wallet).
            const name = !addressish(row.name ?? '') ? row.name : !addressish(live?.name ?? '') ? live!.name : ''
            store[address] = {
              name: bestName(address, name),
              xp: Math.max(row.xp ?? 0, live?.xp ?? 0),
              cleared: Math.max(row.cleared ?? 0, live?.cleared ?? 0),
              stars: Math.max(row.stars ?? 0, live?.stars ?? 0),
              raids: Math.max(row.raids ?? 0, live?.raids ?? 0),
              wins: Math.max(row.wins ?? 0, live?.wins ?? 0)
            }
          }
        }
      }
      ready = true
      // A missing key resolves null (no throw): seed it so the write path is
      // proven at boot and restarts stop re-reading an absent key.
      if (!raw) persist()
    } catch (error) {
      console.log(`[Server] boards load failed: ${error}`)
    }
    syncWins()
    dirty = true
  })

  let wait = 0
  engine.addSystem((dt) => {
    wait += dt
    if (wait < 3) return
    wait = 0
    for (const address of ctx.present) {
      const save = ctx.saves.get(address)
      if (save && ctx.isSaveReady(address)) refresh(address, save)
    }
    syncWins()
    // Ranks are published per present player, so a changed roster republishes too.
    const presence = [...ctx.present].sort().join(',')
    if (!dirty && presence === lastPresence) return
    lastPresence = presence
    if (dirty) persist()
    dirty = false
    publish()
  })

  return {
    bumpRaid(address: string): void {
      rowFor(address).raids += 1
      dirty = true
    },
    bumpWin(address: string): void {
      rowFor(address).wins += 1
      dirty = true
    }
  }
}
