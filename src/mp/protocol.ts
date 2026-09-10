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
  /** Settings > appearance: the walker's skin/hair the player picked. Missing
   * = draw from their DCL avatar. */
  look?: LookChoice
  /** Armor suits bought from the tailor (ARMORS ids, 1-based). */
  armory?: number[]
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
/** Raids cost nothing: the friendzone is where you go when the energy bar
 * is empty, not what it blocks. Spoils are capped instead (RAID_SPOILS_PER_DAY). */
export const RIFT_ENERGY_COST = 0
/** Raid wins that pay coins and a card roll per UTC day; later wins pay XP
 * and a rung on the raids board only, so free raids are not a card farm. */
export const RAID_SPOILS_PER_DAY = 3
/** Empty seats filled by ghost allies when the raid starts (see server/ghosts). */
export const RIFT_GHOST_FILL = 3
/** Coins owed to a ghost's owner each time their heroes raid in their absence. */
export const GHOST_ALLY_COINS = 30
/** Share of the duel purse a win over a ghost pays (ghosts are always available). */
export const GHOST_DUEL_COIN_FRAC = 0.5
/** Ghost seats carry this prefix on their address so no wallet can collide. */
export const GHOST_PREFIX = 'ghost:'

export function isGhostAddress(address: string): boolean {
  return address.startsWith(GHOST_PREFIX)
}
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
  /** A ghost ally: another player's hero, fielded by the server while they are away. */
  ghost?: boolean
  /** Spoils-paying wins this wallet has left today (RAID_SPOILS_PER_DAY). */
  spoils?: number
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
/** Duels are free: they pay XP and a ladder rung, nothing farmable. */
export const DUEL_ENERGY_COST: Record<DuelMode, number> = { '1v1': 0, '4v4': 0 }
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
  /** Seated and alone: have the server seat a ghost (an absent rival's heroes). */
  | { type: 'ghost'; mode: DuelMode }

export type DuelFighter = { uid: string; defId: string; stars: number; level: number }

export type DuelSeat = {
  address: string
  name: string
  ready: boolean
  /** One champion in 1v1; the seated party in 4v4. */
  heroes: DuelFighter[]
  /** A ghost: a snapshot of an absent player's picks, fought by the server. */
  ghost?: boolean
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
  /** Ghosts the server can seat in this ring right now (0 hides the plate). */
  ghosts?: number
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

// --- Realm feed -------------------------------------------------------------------

/** Events the ring buffer keeps; late arrivals see the last few hours of life. */
export const FEED_MAX = 30
/** Seconds a feed toast hangs on screen. */
export const FEED_TOAST_S = 4.5

/**
 * What happened. Public kinds ride the synced ring buffer for everyone;
 * personal kinds are addressed to one wallet over feedUpdate (hall pushes).
 *   enter    - `arg` realm id             (server-detected on overworld moves)
 *   pull     - `arg` defId, legendary+    (client-reported, rarity checked)
 *   road     - `n` roads cleared          (client-reported, monotonic)
 *   raid     - won a rift raid            (server)
 *   duel     - `arg` = the loser's name   (server)
 *   warlord  - `arg` defId                (client-reported, known warlord)
 *   level    - `n` account level, 10/20/..(client-reported, monotonic)
 *   streak   - day 7 of the login streak  (client-reported, once a week)
 *   ghostduel- `arg` = the ghost's name   (server: beat an absent rival's heroes)
 *   boss     - `n` damage, `arg` defId    (server: a new realm-best hit on the world boss)
 *   bossfell - `arg` defId, `n` tier      (server: the realm felled the world boss)
 * personal:
 *   record   - `name` beat your ghost
 *   ghostraid- `name` raided with your heroes; `n` coins owed
 *   passed   - `name` passed you on board `arg`
 */
export type FeedKind =
  | 'enter'
  | 'pull'
  | 'road'
  | 'raid'
  | 'duel'
  | 'warlord'
  | 'level'
  | 'streak'
  | 'ghostduel'
  | 'boss'
  | 'bossfell'
  | 'record'
  | 'ghostraid'
  | 'passed'

export type FeedEvent = {
  seq: number
  /** Wall-clock ms. */
  at: number
  kind: FeedKind
  address: string
  name: string
  arg?: string
  n?: number
}

/** Personal kinds only reach the wallet they concern. */
export const FEED_PERSONAL: FeedKind[] = ['record', 'ghostraid', 'passed']

export type FeedPub = { events: FeedEvent[] }

export function emptyFeed(): FeedPub {
  return { events: [] }
}

// ---- looks ---------------------------------------------------------------------------

/** How many wallets' looks the server remembers (most recently seen win). */
export const LOOKS_MAX = 240

/** One avatar look, packed: body shape letter, skin and hair as 6-digit hex,
 * and a trailing 1 when the player picked it themselves (settings >
 * appearance), which then beats whatever their DCL avatar reports. */
export type PackedLook = [
  body: 'm' | 'f',
  skinHex: string,
  hairHex: string,
  chosen?: 0 | 1,
  outfit?: number,
  armor?: number
]

/** A player-chosen look, kept in their save. Hex without '#'; `outfit`
 * indexes OUTFITS (the tailor's rack); `armor` is 1-based into ARMORS (0 /
 * missing = none) and must be in the save's `armory`. */
export type LookChoice = { skin: string; hair: string; body?: 'm' | 'f'; outfit?: number; armor?: number }

/** The tailor's armor stand: suits (with helms) bought with coins, worn over
 * the tunic and hair. `armor` in a look is index + 1
 * (images/chars/player-walk-arm-<k>.png). Keep the order in step with
 * ARMORS in tools/split-walk-layers.py. */
export const ARMORS: { hex: string; name: string; cost: number }[] = [
  { hex: '7a5230', name: 'arm-leather', cost: 200 },
  { hex: '8a8f99', name: 'arm-chain', cost: 500 },
  { hex: 'c4ccd8', name: 'arm-steel', cost: 1000 },
  { hex: '4a3a5e', name: 'arm-shadow', cost: 2000 },
  { hex: 'd9a83a', name: 'arm-royal', cost: 3500 }
]

/** A wearable armor id: 1..ARMORS.length. */
export function validArmor(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= ARMORS.length
}

/** Owned armor ids, deduped and in range. */
export function cleanArmory(raw: unknown): number[] {
  const out: number[] = []
  for (const id of Array.isArray(raw) ? raw.slice(0, ARMORS.length * 2) : []) {
    if (validArmor(id) && out.indexOf(id) < 0) out.push(id)
  }
  return out
}

/** The tailor's rack: tunic dyes, one baked walk sheet each
 * (images/chars/player-walk-fit-<k>.png). Index 0 is the painted villager blue.
 * Hex is the dye at full light, for swatches; `name` is its label strip. */
export const OUTFITS: { hex: string; name: string }[] = [
  { hex: '2d4d71', name: 'fit-villager' },
  { hex: '3f7a3a', name: 'fit-ranger' },
  { hex: 'a8322b', name: 'fit-crimson' },
  { hex: '6a3aa8', name: 'fit-royal' },
  { hex: 'c9962e', name: 'fit-gilded' },
  { hex: '3a3a42', name: 'fit-shadow' }
]

export function validOutfit(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < OUTFITS.length
}

/** Settings > appearance swatches, light to deep. */
export const SKIN_TONES = ['f6dcc8', 'edbd94', 'e0a877', 'c68642', 'a56a3a', '8d5524', '5c3a1e', '3b2314']
/** Settings > appearance swatches: naturals, then a few dyes. */
export const HAIR_COLORS = [
  '1a1210',
  '4a2c17',
  '8c5429',
  'b8763a',
  'd9a441',
  'ece0b8',
  'b0342a',
  '9a9fa8',
  '3b6fd6',
  'a83fb8'
]

export function sanitizeLook(raw: unknown): LookChoice | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const row = raw as Partial<LookChoice>
  const hex = /^[0-9a-f]{6}$/i
  if (typeof row.skin !== 'string' || !hex.test(row.skin)) return undefined
  if (typeof row.hair !== 'string' || !hex.test(row.hair)) return undefined
  const look: LookChoice = { skin: row.skin.toLowerCase(), hair: row.hair.toLowerCase() }
  if (row.body === 'm' || row.body === 'f') look.body = row.body
  if (validOutfit(row.outfit) && row.outfit > 0) look.outfit = row.outfit
  if (validArmor(row.armor)) look.armor = row.armor
  return look
}

/** Address -> packed look, published by the server for everyone it has seen. */
export type LooksPub = Record<string, PackedLook>

export function hexOfRgb(c: { r: number; g: number; b: number }): string {
  const ch = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v * 255)))
      .toString(16)
      .padStart(2, '0')
  return ch(c.r) + ch(c.g) + ch(c.b)
}

export function rgbOfHex(hex: string): { r: number; g: number; b: number } | undefined {
  if (!/^[0-9a-f]{6}$/i.test(hex)) return undefined
  return {
    r: parseInt(hex.slice(0, 2), 16) / 255,
    g: parseInt(hex.slice(2, 4), 16) / 255,
    b: parseInt(hex.slice(4, 6), 16) / 255
  }
}

/** Client -> server: the few feed-worthy moments only the client knows about. */
export type FeedMsg =
  | { type: 'pull'; defId: string }
  | { type: 'road'; n: number }
  | { type: 'warlord'; defId: string }
  | { type: 'level'; n: number }
  | { type: 'streak' }

/** Account levels worth announcing. */
export const FEED_LEVELS = [10, 20, 30, 40, 50]

/** Realms worth announcing an arrival in (cottages and inns are not). */
export const FEED_REALMS = ['village', 'wilds', 'deep', 'crow', 'fen', 'moorgate', 'rookhaven', 'crypt', 'well', 'hall']

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
  /** World boss spoils: the week's payout by rank (rank >= 1, maybe a card) or
   * the kill bonus when the realm felled a boss you had hit (rank 0, coins only). */
  | { type: 'boss'; rank: number; coins: number; dropDefId?: string; dropUid?: string }
  | { type: 'sent'; coins: number }
  | { type: 'blocked'; reason: 'daily' | 'gone' }

// --- World Boss -------------------------------------------------------------------
//
// One warlord the whole realm hits together. An attack is your party fighting
// it for BOSS_ATTACK_S seconds (simulated on the server, streamed to you); the
// damage you deal in that minute is the attempt's score, and only your best
// attempt stands on the round's board. The board and the boss live in a
// rolling three-day UTC window (BOSS_WINDOW_MS); when it turns, everyone who
// attacked is paid by rank. Fell the boss early and a stronger one rises at once.

/** How long one boss board stands before it pays out and resets. */
export const BOSS_WINDOW_MS = 3 * DAY_MS

/** Window id stamped on the stored boss state (its `week` field). */
export function bossWindowOf(now: number): number {
  return Math.floor(now / BOSS_WINDOW_MS)
}

export function bossEndsAt(window: number): number {
  return (window + 1) * BOSS_WINDOW_MS
}

export const BOSS_ATTACKS_PER_DAY = 3
export const BOSS_ATTACK_S = 60
/** Seconds between simulated actions (the rift steps at 1.6 too). */
export const BOSS_STEP_S = 1.6
export const BOSS_BASE_HP = 120_000
/** Each boss the realm fells this round is this much tougher than the last. */
export const BOSS_HP_GROWTH = 1.6
/** Coins to everyone who hit a boss when the realm fells it. */
export const BOSS_KILL_COINS = 120
/** Rows shown on the damage board. */
export const BOSS_TOP = 10

export function bossHpFor(tier: number): number {
  return Math.round(BOSS_BASE_HP * Math.pow(BOSS_HP_GROWTH, Math.max(0, tier - 1)))
}

/** The boss's blow. Tuned with tools/sim-boss.ts: a two-card day-one party
 * lasts ~40s against tier 1 and a first-week party the whole minute (~600
 * damage; a levelled party deals ~1700-2000, capped by the actions a minute
 * holds); later tiers bite harder so surviving the minute needs a real party.
 * With BOSS_BASE_HP, ~10 active players at 3 attacks a day fell tier 1 in
 * about five days; 20 do it in two and meet tier 2. */
export function bossAtk(tier: number): number {
  return 10 + 4 * Math.max(1, tier)
}

/** The week's payout by final rank. Everyone who attacked is paid; the top
 * is only slightly better - the boss is meant to be everyone's fight. */
export type BossReward = { coins: number; pack?: 'crown' | 'vow' | 'ember' }

export function bossRewardFor(rank: number): BossReward {
  if (rank === 1) return { coins: 600, pack: 'crown' }
  if (rank <= 3) return { coins: 450, pack: 'crown' }
  if (rank <= 10) return { coins: 320, pack: 'vow' }
  return { coins: 180, pack: 'ember' }
}

/** One wallet on the damage board: their best single attack this week. */
export type BossEntry = { address: string; name: string; level: number; best: number; attacks: number }

/** Where a present player stands: rank (0 = not yet attacked), best hit,
 * attacks left today. */
export type BossYou = { rank: number; best: number; left: number }

/** The lair as one synced JSON snapshot. */
export type BossPub = {
  week: number
  /** 1-based: how many bosses the realm has felled this week, plus one. */
  tier: number
  defId: string
  hp: number
  maxHp: number
  endsAt: number
  kills: number
  board: BossEntry[]
  you: Record<string, BossYou>
  /** Attacks in progress right now (the lair feels alive). */
  fighting: number
}

export function emptyBoss(now: number = Date.now()): BossPub {
  const week = bossWindowOf(now)
  return {
    week,
    tier: 1,
    defId: 'moor-ogre',
    hp: bossHpFor(1),
    maxHp: bossHpFor(1),
    endsAt: bossEndsAt(week),
    kills: 0,
    board: [],
    you: {},
    fighting: 0
  }
}

export type BossMsg = { type: 'attack' }

/** Server -> the attacker only: their private fight, step by step, then the verdict. */
export type BossUpdate =
  | { type: 'fight'; battle: BattleState; left: number; dealt: number }
  | { type: 'done'; dealt: number; best: number; rank: number; kill?: boolean; wiped?: boolean }
  | { type: 'blocked'; reason: 'none' | 'busy' | 'party' }
