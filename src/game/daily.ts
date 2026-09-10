import {
  DAILY_STREAK_LEN,
  DAILY_TASK_SLOTS,
  DAY_MS,
  DailyState,
  emptyDaily,
  giftDayOf
} from '../mp/protocol'
import { feedStreak } from '../mp/feedClient'
import { makeOwned } from './familiars'
import { grantAccountXp, XP } from './level'
import { revealAcquisition } from './menu'
import { PACKS, PackId, rollPack } from './packs'
import { game } from './store'

// The events page's daily hooks: a 7-day login streak and a 3-slot task board
// that rerolls every UTC day. Both live in the save (game.daily) and are
// client-driven like road progress, so the merge rules in saveSync only ever
// move them forward. Rewards are paid on explicit CLAIM taps on the events
// page (not silently), which is what brings players back to the hall.

// --- Login streak ------------------------------------------------------------------

export type DailyReward = {
  coins: number
  /** A hero card rolled from this pack, revealed like a shop drop. */
  pack?: PackId
  /** Tops energy back up to the cap. */
  refill?: boolean
}

/** Day 1..7 of the streak. Every third-ish day is a card so the track reads
 * as building toward something; day 7 is the vow-tier prize, then it loops. */
export const STREAK_REWARDS: DailyReward[] = [
  { coins: 60 },
  { coins: 80 },
  { coins: 40, pack: 'ember' },
  { coins: 100 },
  { coins: 60, refill: true },
  { coins: 140 },
  { coins: 100, pack: 'vow' }
]

/** Finishing all three tasks pays this on top. */
export const DAILY_BONUS: DailyReward = { coins: 120, refill: true }

export function today(): number {
  return giftDayOf(Date.now())
}

/** Milliseconds until the next UTC day rolls the board and unlocks the login claim. */
export function msToNextDay(): number {
  return Math.max(0, (today() + 1) * DAY_MS - Date.now())
}

/** The live daily block, with a stale task board rerolled for today first. */
export function daily(): DailyState {
  if (!game.daily) game.daily = emptyDaily()
  const d = game.daily
  const t = today()
  if (d.taskDay !== t) {
    d.taskDay = t
    d.taskN = new Array<number>(DAILY_TASK_SLOTS).fill(0)
    d.taskPaid = new Array<boolean>(DAILY_TASK_SLOTS).fill(false)
    d.bonusPaid = false
  }
  return d
}

/** Claimed yesterday or today: the chain is unbroken. */
export function streakAlive(): boolean {
  const d = daily()
  return d.claimDay > 0 && d.claimDay >= today() - 1
}

/** A claim is waiting (one per UTC day). */
export function canClaimLogin(): boolean {
  return daily().claimDay < today()
}

/** Which streak day today's claim pays: continues the chain, loops after 7,
 * or restarts at 1 when a day was skipped. */
export function nextStreakDay(): number {
  const d = daily()
  if (!streakAlive()) return 1
  return (d.streak % DAILY_STREAK_LEN) + 1
}

/** How many slots on the 7-day track draw as earned right now. A full cycle
 * that is about to loop shows empty so the next claim visibly starts over. */
export function earnedStreak(): number {
  const d = daily()
  if (!streakAlive()) return 0
  if (canClaimLogin() && d.streak >= DAILY_STREAK_LEN) return 0
  return d.streak
}

/** The streak was alive but a day got skipped: say so once on the panel. */
export function streakBroken(): boolean {
  const d = daily()
  return d.streak > 0 && d.claimDay > 0 && !streakAlive()
}

function grant(reward: DailyReward): void {
  game.coins += reward.coins
  if (reward.refill) game.energy = Math.max(game.energy, game.energyMax)
  if (reward.pack) {
    const pack = PACKS.find((entry) => entry.id === reward.pack)
    if (pack) revealAcquisition(makeOwned(rollPack(pack).id), 'festival')
  }
}

export function claimLogin(): void {
  if (!canClaimLogin()) return
  const d = daily()
  const day = nextStreakDay()
  d.streak = day
  d.claimDay = today()
  grant(STREAK_REWARDS[day - 1])
  grantAccountXp(XP.streak)
  if (day === DAILY_STREAK_LEN) feedStreak() // a full week: realm news
}

// --- Task board ----------------------------------------------------------------------

export type DailyTaskId = 'floors' | 'wild' | 'pack' | 'fuse' | 'raid' | 'duel' | 'gift' | 'trade'

export type DailyTaskDef = { id: DailyTaskId; target: number; coins: number }

export const DAILY_TASKS: Record<DailyTaskId, DailyTaskDef> = {
  floors: { id: 'floors', target: 3, coins: 60 },
  wild: { id: 'wild', target: 2, coins: 60 },
  pack: { id: 'pack', target: 1, coins: 50 },
  fuse: { id: 'fuse', target: 1, coins: 70 },
  raid: { id: 'raid', target: 1, coins: 90 },
  duel: { id: 'duel', target: 1, coins: 70 },
  gift: { id: 'gift', target: 1, coins: 50 },
  trade: { id: 'trade', target: 1, coins: 70 }
}

/** Slot 0 is always something you can do alone, slot 2 always needs another
 * traveler (the board nudges people into the friendzone), slot 1 is anything. */
const SOLO: DailyTaskId[] = ['floors', 'wild', 'pack', 'fuse']
const SOCIAL: DailyTaskId[] = ['raid', 'duel', 'gift', 'trade']
const ALL: DailyTaskId[] = [...SOLO, ...SOCIAL]

/** Small deterministic hash so every client rolls the same board for a day. */
function hash(day: number, salt: number): number {
  let x = (day * 2654435761 + salt * 40503) >>> 0
  x ^= x >>> 15
  x = (x * 2246822519) >>> 0
  x ^= x >>> 13
  return x >>> 0
}

export function rollDailyTasks(day: number): DailyTaskId[] {
  const first = SOLO[hash(day, 1) % SOLO.length]
  const last = SOCIAL[hash(day, 3) % SOCIAL.length]
  const rest = ALL.filter((id) => id !== first && id !== last)
  const middle = rest[hash(day, 2) % rest.length]
  return [first, middle, last]
}

export function todaysTasks(): DailyTaskDef[] {
  return rollDailyTasks(today()).map((id) => DAILY_TASKS[id])
}

/** Progress hook: call when the player does one of the tracked things. Only
 * counts toward a slot on today's board; anything else is a no-op. */
export function dailyBump(id: DailyTaskId, n = 1): void {
  // Every tracked deed also feeds the account level (a pack pays via the
  // card it reveals, see menu.revealAcquisition).
  if (id !== 'pack') grantAccountXp(ACTIVITY_XP[id] * n)
  const d = daily()
  const slot = rollDailyTasks(d.taskDay).indexOf(id)
  if (slot < 0) return
  d.taskN[slot] = Math.min(DAILY_TASKS[id].target, (d.taskN[slot] ?? 0) + n)
}

const ACTIVITY_XP: Record<DailyTaskId, number> = {
  floors: XP.floor,
  wild: XP.wild,
  pack: 0,
  fuse: XP.fuse,
  raid: XP.raid,
  duel: XP.duel,
  gift: XP.gift,
  trade: XP.trade
}

export function taskProgress(slot: number): number {
  return daily().taskN[slot] ?? 0
}

export function taskDone(slot: number): boolean {
  const def = todaysTasks()[slot]
  return !!def && taskProgress(slot) >= def.target
}

export function taskPaid(slot: number): boolean {
  return daily().taskPaid[slot] === true
}

export function canClaimTask(slot: number): boolean {
  return taskDone(slot) && !taskPaid(slot)
}

export function claimTask(slot: number): void {
  if (!canClaimTask(slot)) return
  const def = todaysTasks()[slot]
  daily().taskPaid[slot] = true
  game.coins += def.coins
  grantAccountXp(XP.dailyTask)
}

export function canClaimBonus(): boolean {
  const d = daily()
  return !d.bonusPaid && d.taskPaid.every((paid) => paid === true)
}

export function claimBonus(): void {
  if (!canClaimBonus()) return
  daily().bonusPaid = true
  grant(DAILY_BONUS)
  grantAccountXp(XP.allDone)
}

/** Anything on the events page waiting to be collected (home badge). */
export function dailyClaimable(): boolean {
  if (canClaimLogin() || canClaimBonus()) return true
  for (let i = 0; i < DAILY_TASK_SLOTS; i++) if (canClaimTask(i)) return true
  return false
}
