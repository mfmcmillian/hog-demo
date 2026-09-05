import type { BattleState, OwnedFamiliar, TipId } from '../game/types'

// Typed payloads carried as JSON strings inside the transport messages, so the
// registered schemas stay tiny and stable (same pattern as DecentraCraft).

export const MP_VERSION = 1

export const ENERGY_MAX = 30

/** Everything a wallet owns; the server persists this per player. */
export type PlayerSave = {
  v: number
  collection: OwnedFamiliar[]
  party: string[]
  heroUid: string
  coins: number
  energy: number
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
}

export function emptySave(): PlayerSave {
  return { v: MP_VERSION, collection: [], party: ['', '', '', ''], heroUid: '', coins: 0, energy: 0, cleared: 0, floorAt: {}, roadStar: {}, soundOn: true, musicOn: true, giftDay: 0, tutSeen: {}, fresh: [], intro: false, stories: [], finalWon: false, owFlags: [], owItems: [] }
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

export type RiftMsg =
  | { type: 'sit'; heroUid: string }
  | { type: 'leave' }
  | { type: 'ready'; ready: boolean }

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
}

export function emptyDuel(mode: DuelMode): DuelPub {
  return { mode, phase: 'lobby', seats: [], ladder: [] }
}

// --- Festival ------------------------------------------------------------------

export const FEST_TARGET = 200 // rift floors the realm must clear this window
export const FEST_GIFT_COINS = 120
export const FEST_BLESS_COINS = 40
/** Some days the gift chest also holds a hero card (ember-tier roll). */
export const FEST_GIFT_CARD_CHANCE = 0.2
export const DAY_MS = 24 * 60 * 60 * 1000

/** The festival ends Sep 3, 2026 at midnight Eastern (end of day; EDT = UTC-4). */
export const FEST_END_MS = Date.UTC(2026, 8, 4, 4, 0, 0)
/** Window id stamped on the stored state and reward claims. */
export const FEST_WINDOW_ID = 20260903

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

export function emptyFest(): FestPub {
  return { week: FEST_WINDOW_ID, count: 0, target: FEST_TARGET, endsAt: FEST_END_MS, done: false }
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
  | { type: 'sent'; coins: number }
  | { type: 'blocked'; reason: 'daily' | 'gone' }
