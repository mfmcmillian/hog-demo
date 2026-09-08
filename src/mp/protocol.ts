import type { BattleState, OwnedFamiliar, TipId } from '../game/types'

// Typed payloads carried as JSON strings inside the transport messages, so the
// registered schemas stay tiny and stable (same pattern as DecentraCraft).

export const MP_VERSION = 1

/** Energy cap at account level 1; it grows with level (game/level.ts energyCapFor). */
export const ENERGY_MAX = 30
/** Clock-driven refill: one energy per this interval while under the cap
 * (empty to full in three hours) - the reason to come back later today. */
export const ENERGY_REGEN_MS = 6 * 60 * 1000

/** Everything a wallet owns; the server persists this per player. */
export type PlayerSave = {
  v: number
  collection: OwnedFamiliar[]
  party: string[]
  heroUid: string
  coins: number
  energy: number
  /** Wall-clock ms the regen counter last ticked from (0 = start fresh). */
  energyAt?: number
  cleared: number
  floorAt: Record<string, number>
  /** Ascension tier per road (1..MAX_STARS); missing road = tier 1. */
  roadStar?: Record<string, number>
  soundOn: boolean
  musicOn: boolean
  /** UTC day index of the last daily gift sent (0 = never). */
  giftDay: number
  /** First-press tutorial tips this account has dismissed. */
  tutSeen?: Partial<Record<TipId, boolean>>
  /** Card uids acquired but never yet seen on the party bench (PARTY badge). */
  fresh?: string[]
  /** Intro story already watched (or skipped). */
  intro?: boolean
  /** Road/final/epilogue stories already watched (see STORY_IDS). */
  stories?: string[]
  /** Gates of Antrom beaten (the first-win jackpot is spent). */
  finalWon?: boolean
  /** Opened overworld chest ids and one-shot talk flags. */
  owFlags?: string[]
  /** Key items found on the overworld (reed-lamp, ...). */
  owItems?: string[]
  /** Login streak + today's task board (see game/daily.ts). */
  daily?: DailyState
  /** Account XP (see game/level.ts). Missing = save predates levels; the
   * client back-fills it from roads and cards on load. */
  axp?: number
}

export function emptySave(): PlayerSave {
  return {
    v: MP_VERSION,
    collection: [],
    party: ['', '', '', ''],
    heroUid: '',
    coins: 0,
    energy: 0,
    energyAt: 0,
    cleared: 0,
    floorAt: {},
    roadStar: {},
    soundOn: true,
    musicOn: true,
    giftDay: 0,
    tutSeen: {},
    fresh: [],
    intro: false,
    stories: [],
    finalWon: false,
    owFlags: [],
    owItems: [],
    daily: emptyDaily(),
    axp: 0
  }
}

// --- Daily (events page) -------------------------------------------------------

/** Days in one login-streak cycle; day 7 pays the big prize, then it loops. */
export const DAILY_STREAK_LEN = 7
/** Task slots rolled per UTC day. */
export const DAILY_TASK_SLOTS = 3

export type DailyState = {
  /** UTC day index the login reward was last claimed (0 = never). */
  claimDay: number
  /** Consecutive days claimed, 1..DAILY_STREAK_LEN; broken by a skipped day. */
  streak: number
  /** UTC day index the task board below was rolled for. */
  taskDay: number
  /** Progress per task slot (task ids come from the day, see rollDailyTasks). */
  taskN: number[]
  /** Slots whose reward was already collected. */
  taskPaid: boolean[]
  /** The all-three bonus was collected for taskDay. */
  bonusPaid: boolean
}

export function emptyDaily(): DailyState {
  return {
    claimDay: 0,
    streak: 0,
    taskDay: 0,
    taskN: new Array<number>(DAILY_TASK_SLOTS).fill(0),
    taskPaid: new Array<boolean>(DAILY_TASK_SLOTS).fill(false),
    bonusPaid: false
  }
}

/** Clamp a stored/incoming daily block into shape (server sanitize + client apply). */
export function sanitizeDaily(raw: unknown): DailyState {
  const out = emptyDaily()
  if (!raw || typeof raw !== 'object') return out
  const row = raw as Partial<DailyState>
  const day = (value: unknown) => Math.max(0, Math.min(1e6, Math.floor(Number(value) || 0)))
  out.claimDay = day(row.claimDay)
  out.streak = Math.max(0, Math.min(DAILY_STREAK_LEN, Math.floor(Number(row.streak) || 0)))
  out.taskDay = day(row.taskDay)
  for (let i = 0; i < DAILY_TASK_SLOTS; i++) {
    out.taskN[i] = Math.max(0, Math.min(99, Math.floor(Number(Array.isArray(row.taskN) ? row.taskN[i] : 0) || 0)))
    out.taskPaid[i] = Array.isArray(row.taskPaid) && row.taskPaid[i] === true
  }
  out.bonusPaid = row.bonusPaid === true
  return out
}

/** Whichever of two daily blocks is further along, slot by slot: newer day
 * wins outright; on the same day progress and payouts only move forward. */
export function mergeDaily(a: DailyState, b: DailyState): DailyState {
  const out = emptyDaily()
  const login = a.claimDay >= b.claimDay ? a : b
  out.claimDay = login.claimDay
  out.streak = login.streak
  if (a.taskDay !== b.taskDay) {
    const board = a.taskDay > b.taskDay ? a : b
    out.taskDay = board.taskDay
    out.taskN = board.taskN.slice()
    out.taskPaid = board.taskPaid.slice()
    out.bonusPaid = board.bonusPaid
    return out
  }
  out.taskDay = a.taskDay
  for (let i = 0; i < DAILY_TASK_SLOTS; i++) {
    out.taskN[i] = Math.max(a.taskN[i] ?? 0, b.taskN[i] ?? 0)
    out.taskPaid[i] = a.taskPaid[i] === true || b.taskPaid[i] === true
  }
  out.bonusPaid = a.bonusPaid || b.bonusPaid
  return out
}

// --- Trading -------------------------------------------------------------------

export type TradeMsg =
  | { type: 'invite'; to: string }
  | { type: 'accept'; from: string }
  | { type: 'decline'; from: string }
  | { type: 'offer'; uid: string }
  | { type: 'lock'; locked: boolean }
  | { type: 'cancel' }

/** Live table state the server pushes to both parties. */
export type TradeTable = {
  a: string
  b: string
  nameA: string
  nameB: string
  offerA?: OwnedFamiliar
  offerB?: OwnedFamiliar
  lockA: boolean
  lockB: boolean
}

export type TradeUpdate =
  | { type: 'invite'; from: string; name: string }
  | { type: 'state'; table: TradeTable }
  | { type: 'done'; receivedUid: string }
  | { type: 'closed'; reason: 'declined' | 'cancelled' | 'left' | 'failed' }

// --- The Rift ------------------------------------------------------------------

export const RIFT_FLOORS = 6 // 5 floors + the boss
export const RIFT_SEATS = 4
export const RIFT_ENERGY_COST = 5
/** Seconds between everyone readying up and the fight actually starting, so
 * the room gets a visible 3-2-1 and a last chance to bail (rift + duels). */
export const LOBBY_COUNTDOWN_S = 3

export type RiftMsg =
  | { type: 'sit'; heroUid: string }
  | { type: 'leave' }
  | { type: 'ready'; ready: boolean }
  /** Ping another present traveler to come raid (relayed as an FzUpdate). */
  | { type: 'invite'; to: string }

export type RiftSeat = {
  address: string
  name: string
  uid: string
  defId: string
  stars: number
  level: number
  ready: boolean
}

export type RiftReward = { address: string; coins: number; xp: number; dropDefId?: string; dropUid?: string }

/** The whole rift room as one synced JSON snapshot. */
export type RiftPub = {
  phase: 'lobby' | 'battle' | 'won' | 'lost'
  seats: RiftSeat[]
  floor: number
  battle?: BattleState
  rewards?: RiftReward[]
  /** Seconds until the end plaque clears and the lobby reopens (won/lost only). */
  resetIn?: number
  /** Everyone is ready: seconds until the raid kicks off (lobby only). */
  startIn?: number
}

export function emptyRift(): RiftPub {
  return { phase: 'lobby', seats: [], floor: 1 }
}

// --- Duels ---------------------------------------------------------------------

/** 1v1 = champion vs champion; 4v4 = full party vs full party. Two players either way. */
export const DUEL_MODES = ['1v1', '4v4'] as const
export type DuelMode = (typeof DUEL_MODES)[number]

export const DUEL_SEATS = 2
export const DUEL_ENERGY_COST: Record<DuelMode, number> = { '1v1': 2, '4v4': 4 }
export const DUEL_WIN_COINS: Record<DuelMode, number> = { '1v1': 60, '4v4': 100 }
/** XP per fighter, so the 4v4 winner spreads it across the party. */
export const DUEL_WIN_XP: Record<DuelMode, number> = { '1v1': 40, '4v4': 20 }
export const DUEL_LOSS_XP: Record<DuelMode, number> = { '1v1': 12, '4v4': 6 }
export const DUEL_LADDER_TOP = 5

export type DuelMsg =
  | { type: 'sit'; mode: DuelMode; heroUid?: string } // 4v4 seats your party; no heroUid
  | { type: 'leave'; mode: DuelMode }
  | { type: 'ready'; mode: DuelMode; ready: boolean }
  /** Challenge another present traveler to this ring (relayed as an FzUpdate). */
  | { type: 'invite'; mode: DuelMode; to: string }

export type DuelFighter = { uid: string; defId: string; stars: number; level: number }

export type DuelSeat = {
  address: string
  name: string
  ready: boolean
  /** One champion in 1v1; the seated party in 4v4. */
  heroes: DuelFighter[]
}

export type DuelRank = { name: string; wins: number }

/** One duel ring (per mode) as one synced JSON snapshot. */
export type DuelPub = {
  mode: DuelMode
  phase: 'lobby' | 'battle' | 'done'
  seats: DuelSeat[]
  battle?: BattleState
  /** Winning wallet once the duel is done. */
  winner?: string
  rewards?: RiftReward[]
  /** Top duelists of this mode, persisted across restarts. */
  ladder: DuelRank[]
  /** Seconds until the verdict clears and the ring reopens (done only). */
  resetIn?: number
  /** Both duelists ready: seconds until the fight kicks off (lobby only). */
  startIn?: number
}

export function emptyDuel(mode: DuelMode): DuelPub {
  return { mode, phase: 'lobby', seats: [], ladder: [] }
}

// --- Hall of Heroes (leaderboards) ---------------------------------------------------

/** The four boards on the hall's wall. */
export const BOARD_IDS = ['level', 'roads', 'raids', 'duels'] as const
export type BoardId = (typeof BOARD_IDS)[number]

/** Rows shown per board. */
export const BOARD_TOP = 10

/** One ranked wallet: who they are, their account level, and the board's stat
 * (level board: account XP; roads: roads cleared; raids: rift raids won;
 * duels: total duel wins across both rings). */
export type BoardEntry = { address: string; name: string; level: number; value: number }

/** The hall as one synced JSON snapshot: the top rows of each board, plus the
 * 1-based rank of every player currently in the scene on each board (0 =
 * unranked - nothing scored there yet), so the wall can say "your rank" even
 * when you are far below the top. */
export type BoardsPub = {
  boards: Record<BoardId, BoardEntry[]>
  ranks: Record<string, Record<BoardId, number>>
}

export function emptyBoards(): BoardsPub {
  return { boards: { level: [], roads: [], raids: [], duels: [] }, ranks: {} }
}

// --- Friendzone invites ----------------------------------------------------------

/** Which room an invite points at: the co-op rift or one of the duel rings. */
export type Arena = 'raid' | DuelMode

/** Server -> one wallet: a traveler wants you in their room. */
export type FzUpdate = { type: 'invite'; from: string; name: string; arena: Arena }

// --- Festival ------------------------------------------------------------------

export const FEST_TARGET = 200 // rift floors the realm must clear this window
export const FEST_GIFT_COINS = 120
export const FEST_BLESS_COINS = 40
/** Some days the gift chest also holds a hero card (ember-tier roll). */
export const FEST_GIFT_CARD_CHANCE = 0.2
export const DAY_MS = 24 * 60 * 60 * 1000

/** The festival runs in rolling week-long windows (UTC weeks). When one ends
 * the tally, contributors and claims reset and the next begins at once, so
 * the hall is never a dead event: whoever plays this week can still earn the
 * crown chest. */
export const FEST_WEEK_MS = 7 * DAY_MS

/** Window id stamped on the stored state and reward claims. */
export function festWindowOf(now: number): number {
  return Math.floor(now / FEST_WEEK_MS)
}

export function festEndsAt(window: number): number {
  return (window + 1) * FEST_WEEK_MS
}

export function giftDayOf(now: number): number {
  return Math.floor(now / DAY_MS)
}

/** The public festival state everyone sees. */
export type FestPub = {
  week: number
  count: number
  target: number
  endsAt: number
  done: boolean
}

export function emptyFest(now: number = Date.now()): FestPub {
  const week = festWindowOf(now)
  return { week, count: 0, target: FEST_TARGET, endsAt: festEndsAt(week), done: false }
}

// --- Overworld -----------------------------------------------------------------

/** Client -> server overworld intents. Positions are tile-committed steps. */
export type OwMsg =
  | { type: 'move'; realm: string; gx: number; gy: number; facing: string }
  | { type: 'leave' }
  | { type: 'slay'; key: string }

export type OwPlayerPub = { address: string; name: string; realm: string; gx: number; gy: number; facing: string }
export type OwMonsterPub = { key: string; id: string; realm: string; gx: number; gy: number }
/** Most recent monster kill, so everyone sees who opened the path. */
export type OwSlayPub = { seq: number; address: string; name: string; id: string; key: string }

/** Everyone on the overworld maps + the live wilds monsters, as one snapshot. */
export type OwPub = { players: OwPlayerPub[]; monsters: OwMonsterPub[]; slay?: OwSlayPub }

export function emptyOw(): OwPub {
  return { players: [], monsters: [] }
}

/** Seconds until a slain wilds monster respawns at its spawn tile. */
export const OW_MONSTER_RESPAWN_S = 90

export type GiftMsg = { type: 'send'; to: string }

export type GiftUpdate =
  | { type: 'received'; name: string; coins: number; dropDefId?: string; dropUid?: string }
  /** The realm goal's crown chest landed in your collection: play the ceremony. */
  | { type: 'goal'; dropDefId: string; dropUid: string }
  | { type: 'sent'; coins: number }
  | { type: 'blocked'; reason: 'daily' | 'gone' }
