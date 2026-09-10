import { FEED_LEVELS, type PlayerSave } from '../mp/protocol'
import { feedLevel } from '../mp/feedClient'
import { makeOwned } from './familiars'
import { PackId, PACKS, rollPack } from './packs'
import { game } from './store'
import type { OwnedFamiliar } from './types'

// Account level: one bar every activity in the game feeds. Hero cards keep
// their own levels and stars (types.OwnedFamiliar.level); this is the
// player's own meta-progression, shown on the home HUD and to other players.
//
// Curve: xpToNext(n) = 30 * n^1.2 rounded to 5 - level 2 costs 30, level 10
// costs ~420, the cap needs ~70k total. A casual day (a handful of floors,
// the dailies, a fuse or gift) is ~250 XP, so level 10 lands inside the
// first week and the cap is a long-haul goal.

export const LEVEL_CAP = 50

/** XP each activity pays (see grantAccountXp call sites). */
export const XP = {
  floor: 10,
  wild: 8,
  raid: 40,
  duel: 30,
  roadClear: 100,
  sideQuest: 80,
  dailyTask: 25,
  streak: 20,
  allDone: 50,
  newHero: 15,
  fuse: 30,
  gift: 10,
  trade: 25,
  boss: 35
}

/** Levels that hand out a free hero card on top of coins and the refill. */
export const PACK_LEVELS = [5, 10, 20, 30, 40, 50]

export function xpToNext(level: number): number {
  if (level >= LEVEL_CAP) return 0
  return Math.max(30, Math.round((30 * Math.pow(level, 1.2)) / 5) * 5)
}

/** Total XP at which `level` begins (level 1 = 0). */
export function levelStartXp(level: number): number {
  let total = 0
  for (let n = 1; n < level; n++) total += xpToNext(n)
  return total
}

export function levelForXp(xp: number): number {
  let level = 1
  let total = 0
  while (level < LEVEL_CAP) {
    const need = xpToNext(level)
    if (xp < total + need) break
    total += need
    level++
  }
  return level
}

/** Where the bar sits: `into` XP of the `need` for the next level (need 0 at cap). */
export function levelProgress(xp: number): { level: number; into: number; need: number } {
  const level = levelForXp(xp)
  return { level, into: xp - levelStartXp(level), need: xpToNext(level) }
}

/** Max energy at a level: 30 at level 1, one more every two levels (54 at cap). */
export function energyCapFor(level: number): number {
  return 30 + Math.floor((Math.max(1, Math.min(LEVEL_CAP, level)) - 1) / 2)
}

/** Coins paid for reaching `level`. */
export function levelCoins(level: number): number {
  return 25 * level
}

/**
 * Account XP for a save that predates the level system, so veterans do not
 * start at 1: what their roads, cards and stars would have paid.
 */
export function retroXp(save: Pick<PlayerSave, 'collection' | 'cleared' | 'finalWon'>): number {
  let xp = save.cleared * (XP.roadClear + 10 * XP.floor)
  for (const owned of save.collection as OwnedFamiliar[]) {
    xp += XP.newHero + (owned.stars - 1) * XP.fuse
  }
  if (save.finalWon) xp += 500
  return xp
}

export const XP_HARD_CAP = levelStartXp(LEVEL_CAP)

/** The milestone prize: a chest roll that keeps pace with the level - ember
 * early, vow from 10, crown from 30 - added straight to the collection. */
function grantMilestoneCard(level: number): OwnedFamiliar {
  const packId: PackId = level >= 30 ? 'crown' : level >= 10 ? 'vow' : 'ember'
  const pack = PACKS.find((p) => p.id === packId) ?? PACKS[0]
  const owned = makeOwned(rollPack(pack).id)
  game.collection.push(owned)
  if (game.freshUids.indexOf(owned.uid) < 0) game.freshUids.push(owned.uid)
  return owned
}

/** Current account level. */
export function accountLevel(): number {
  return levelForXp(game.axp)
}

/** Set XP silently (loading / merging a save): level and energy cap follow, no ceremony. */
export function setAccountXp(xp: number): void {
  game.axp = Math.max(0, Math.min(XP_HARD_CAP, Math.floor(xp)))
  game.energyMax = energyCapFor(accountLevel())
  if (game.energy > game.energyMax) game.energy = game.energyMax
}

/**
 * Earn XP. Crossing one or more levels pays coins for each, refills energy to
 * the (possibly higher) new cap, hands out a hero card at PACK_LEVELS, and
 * queues one ceremony (game.levelUp) that the home screen plays.
 */
export function grantAccountXp(amount: number): void {
  if (amount <= 0 || game.axp >= XP_HARD_CAP) return
  const before = accountLevel()
  game.axp = Math.min(XP_HARD_CAP, game.axp + Math.floor(amount))
  const after = accountLevel()
  if (after <= before) return
  let coins = 0
  let card: OwnedFamiliar | undefined
  for (let level = before + 1; level <= after; level++) {
    coins += levelCoins(level)
    if (PACK_LEVELS.indexOf(level) >= 0) card = grantMilestoneCard(level) ?? card
    if (FEED_LEVELS.indexOf(level) >= 0) feedLevel(level) // realm news
  }
  game.coins += coins
  game.energyMax = energyCapFor(after)
  game.energy = game.energyMax
  game.energyAt = 0
  const pending = game.levelUp
  // A second level-up before the first ceremony played folds into it.
  game.levelUp = {
    from: pending ? pending.from : before,
    level: after,
    coins: (pending ? pending.coins : 0) + coins,
    energyMax: game.energyMax,
    card: card ?? pending?.card
  }
}
