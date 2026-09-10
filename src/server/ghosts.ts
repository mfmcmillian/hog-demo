import { executeTask } from '@dcl/sdk/ecs'
import { Storage } from '@dcl/sdk/server'
import { levelForXp } from '../game/level'
import { DuelFighter, DuelMode, GHOST_PREFIX, PlayerSave } from '../mp/protocol'
import { ServerCtx } from './ctx'
import { FeedApi } from './feed'

// Ghosts: snapshots of real players' picks, kept so the friendzone is never
// empty. A duelist sitting alone can call a ghost across the ring; a raid
// that starts short fills its seats with ghost allies. The server already
// simulates every fight from saves, so the absent owner is never needed -
// they just hear about it (feed) and, for raids, get a cut of the spoils on
// their next arrival.

const GHOSTS_KEY = 'hog-ghosts-v1'
/** Most recent snapshot per wallet, this many wallets deep. */
const GHOST_KEEP = 20

export type Ghost = {
  address: string
  name: string
  /** Account level when snapped (the ring shows it; matching prefers it). */
  level: number
  at: number
  /** 1v1 champion, if they ever dueled 1v1. */
  champion?: DuelFighter
  /** Full party, if they ever dueled 4v4 or raided (raids take the first). */
  party?: DuelFighter[]
}

type Owed = { coins: number; with: string[] }

type GhostStore = { ghosts: Ghost[]; owed: Record<string, Owed> }

/**
 * Founding ghosts: the realm's own folk, so a brand-new World has rivals on
 * day one. Real ghosts are always preferred; these only fill when there are
 * none (or too few for a raid).
 */
const FOUNDERS: Ghost[] = [
  {
    address: `${GHOST_PREFIX}founder-elder`,
    name: 'The Elder',
    level: 6,
    at: 0,
    champion: { uid: 'f-elder-1', defId: 'hallwarden', stars: 2, level: 6 },
    party: [
      { uid: 'f-elder-1', defId: 'hallwarden', stars: 2, level: 6 },
      { uid: 'f-elder-2', defId: 'lamp-imp', stars: 1, level: 5 },
      { uid: 'f-elder-3', defId: 'moor-crow', stars: 1, level: 5 },
      { uid: 'f-elder-4', defId: 'ash-hound', stars: 1, level: 4 }
    ]
  },
  {
    address: `${GHOST_PREFIX}founder-hunter`,
    name: 'The Hunter',
    level: 9,
    at: 0,
    champion: { uid: 'f-hunter-1', defId: 'crowmark', stars: 2, level: 8 },
    party: [
      { uid: 'f-hunter-1', defId: 'crowmark', stars: 2, level: 8 },
      { uid: 'f-hunter-2', defId: 'grave-pike', stars: 1, level: 7 },
      { uid: 'f-hunter-3', defId: 'kite', stars: 1, level: 6 },
      { uid: 'f-hunter-4', defId: 'blaze', stars: 2, level: 6 }
    ]
  },
  {
    address: `${GHOST_PREFIX}founder-seer`,
    name: 'The Seer',
    level: 13,
    at: 0,
    champion: { uid: 'f-seer-1', defId: 'sigil-witch', stars: 3, level: 11 },
    party: [
      { uid: 'f-seer-1', defId: 'sigil-witch', stars: 3, level: 11 },
      { uid: 'f-seer-2', defId: 'oath-knight', stars: 1, level: 9 },
      { uid: 'f-seer-3', defId: 'veil-sister', stars: 2, level: 8 },
      { uid: 'f-seer-4', defId: 'rook', stars: 2, level: 7 }
    ]
  }
]

export type GhostsApi = {
  /** Snapshot a duelist's picks (called when a duel actually starts). */
  snapDuelist: (address: string, mode: DuelMode, heroes: DuelFighter[]) => void
  /** Snapshot a raider's party from their save (called when a raid starts). */
  snapRaider: (address: string, save: PlayerSave) => void
  /** A ghost opponent for `mode`, never the asker's own; undefined if none. */
  pickDuel: (mode: DuelMode, exclude: string) => Ghost | undefined
  /** How many ghosts could answer a call in this ring right now. */
  countDuel: (mode: DuelMode, exclude: string) => number
  /** Up to `count` ghost raiders, none of the given wallets. */
  pickRaiders: (exclude: string[], count: number) => Ghost[]
  /** A ghost's heroes raided: owe the owner coins (paid when they next arrive). */
  owe: (ghostAddress: string, coins: number, withName: string) => void
  /** Arrival hook: pay what this wallet is owed and tell them. */
  payOwed: (address: string) => void
  /** Wallet behind a ghost seat address ('' for founders). */
  ownerOf: (ghostAddress: string) => string
}

export function setupGhosts(ctx: ServerCtx, feed: FeedApi): GhostsApi {
  let store: GhostStore = { ghosts: [], owed: {} }
  let ready = false
  let dirty = false

  function persist(): void {
    if (!ready || !dirty) return
    dirty = false
    try {
      Storage.set(GHOSTS_KEY, JSON.stringify(store))
        .then((ok) => {
          if (!ok) console.log('[Server] ghosts persist failed: storage set returned false')
        })
        .catch((error: unknown) => {
          console.log(`[Server] ghosts persist failed: ${error}`)
        })
    } catch (error) {
      console.log(`[Server] ghosts persist failed: ${error}`)
    }
  }

  function levelOf(address: string): number {
    const save = ctx.saves.get(address)
    return save ? levelForXp(save.axp ?? 0) : 1
  }

  function upsert(address: string, patch: Partial<Ghost>): void {
    const name = ctx.nameFor(address)
    const existing = store.ghosts.find((ghost) => ghost.address === address)
    const next: Ghost = {
      ...(existing ?? { address, name, level: 1, at: 0 }),
      ...patch,
      name: /^0x[0-9a-f]{4}/i.test(name) && existing ? existing.name : name,
      level: levelOf(address),
      at: Date.now()
    }
    store.ghosts = [next, ...store.ghosts.filter((ghost) => ghost.address !== address)].slice(0, GHOST_KEEP)
    dirty = true
    persist()
  }

  function snapDuelist(address: string, mode: DuelMode, heroes: DuelFighter[]): void {
    if (address.startsWith(GHOST_PREFIX) || heroes.length === 0) return
    if (mode === '1v1') upsert(address, { champion: heroes[0] })
    else upsert(address, { party: heroes.slice(0, 4) })
  }

  function snapRaider(address: string, save: PlayerSave): void {
    if (address.startsWith(GHOST_PREFIX)) return
    const party: DuelFighter[] = []
    for (const uid of save.party) {
      const card = save.collection.find((owned) => owned.uid === uid)
      if (card) party.push({ uid: card.uid, defId: card.defId, stars: card.stars, level: card.level })
    }
    if (party.length === 0) return
    upsert(address, { party })
  }

  function candidates(mode: DuelMode | 'raid', exclude: string[]): Ghost[] {
    const fits = (ghost: Ghost) =>
      mode === '1v1'
        ? !!ghost.champion
        : mode === '4v4'
          ? (ghost.party?.length ?? 0) >= 4
          : (ghost.party?.length ?? 0) >= 1
    const real = store.ghosts.filter((ghost) => exclude.indexOf(ghost.address) < 0 && fits(ghost))
    return real.length > 0 ? real : FOUNDERS.filter(fits)
  }

  /** Prefer rivals near the asker's level: shuffle the closest five. */
  function nearest(pool: Ghost[], level: number): Ghost[] {
    return pool
      .map((ghost) => ({ ghost, d: Math.abs(ghost.level - level) + Math.random() * 3 }))
      .sort((a, b) => a.d - b.d)
      .map((entry) => entry.ghost)
  }

  function pickDuel(mode: DuelMode, exclude: string): Ghost | undefined {
    const pool = nearest(candidates(mode, [exclude]), levelOf(exclude))
    if (pool.length === 0) return undefined
    const top = pool.slice(0, 5)
    return top[Math.floor(Math.random() * top.length)]
  }

  function countDuel(mode: DuelMode, exclude: string): number {
    return candidates(mode, [exclude]).length
  }

  function pickRaiders(exclude: string[], count: number): Ghost[] {
    if (count <= 0) return []
    const level = exclude.reduce((sum, address) => sum + levelOf(address), 0) / Math.max(1, exclude.length)
    const real = store.ghosts.filter((ghost) => exclude.indexOf(ghost.address) < 0 && (ghost.party?.length ?? 0) >= 1)
    const pool = nearest(real, level).slice(0, count)
    if (pool.length < count) {
      for (const founder of FOUNDERS) {
        if (pool.length >= count) break
        pool.push(founder)
      }
    }
    return pool
  }

  function ownerOf(ghostAddress: string): string {
    const owner = ghostAddress.startsWith(GHOST_PREFIX) ? ghostAddress.slice(GHOST_PREFIX.length) : ghostAddress
    return owner.startsWith('founder-') ? '' : owner
  }

  function owe(ghostAddress: string, coins: number, withName: string): void {
    const owner = ownerOf(ghostAddress)
    if (!owner || coins <= 0) return
    const owed = (store.owed[owner] ??= { coins: 0, with: [] })
    owed.coins += coins
    if (owed.with.indexOf(withName) < 0) owed.with = [...owed.with, withName].slice(-5)
    dirty = true
    persist()
    // Owner is here right now: settle at once.
    if (ctx.present.has(owner) && ctx.isSaveReady(owner)) payOwed(owner)
  }

  function payOwed(address: string): void {
    const owed = store.owed[address]
    if (!owed || owed.coins <= 0) return
    const save = ctx.saves.get(address)
    if (!save || !ctx.isSaveReady(address)) return
    save.coins += owed.coins
    ctx.persistSave(address)
    ctx.pushSave(address)
    feed.postTo(address, 'ghostraid', { name: owed.with[owed.with.length - 1] ?? 'a traveler', n: owed.coins })
    delete store.owed[address]
    dirty = true
    persist()
  }

  executeTask(async () => {
    try {
      const raw = await Storage.get<string>(GHOSTS_KEY)
      if (raw) {
        const stored = JSON.parse(raw) as Partial<GhostStore>
        const ghosts = Array.isArray(stored.ghosts)
          ? stored.ghosts.filter((ghost) => ghost && typeof ghost.address === 'string')
          : []
        // Anything snapped before the read wins over its stored copy.
        const live = new Set(store.ghosts.map((ghost) => ghost.address))
        store.ghosts = [...store.ghosts, ...ghosts.filter((ghost) => !live.has(ghost.address))].slice(0, GHOST_KEEP)
        const owed = stored.owed && typeof stored.owed === 'object' ? stored.owed : {}
        for (const [address, entry] of Object.entries(owed)) {
          const mine = (store.owed[address] ??= { coins: 0, with: [] })
          mine.coins += Math.max(0, Math.floor(Number(entry?.coins) || 0))
          mine.with = [...mine.with, ...(Array.isArray(entry?.with) ? entry.with : [])].slice(-5)
        }
      }
      ready = true
      dirty = true
      persist()
      // Anyone who arrived before the read settled is owed now.
      for (const address of ctx.present) payOwed(address)
    } catch (error) {
      console.log(`[Server] ghosts load failed: ${error}`)
    }
  })

  return { snapDuelist, snapRaider, pickDuel, countDuel, pickRaiders, owe, payOwed, ownerOf }
}
