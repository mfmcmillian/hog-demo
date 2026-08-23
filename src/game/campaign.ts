import { coinBonus, familiarForKin, listOathkin } from './allies'
import { buildBattle, stepBattle } from './combat'
import { COLLECTIBLE_HEROES, DEBUG, OATH_DROP_ID } from './debug'
import { getDef, grantXp, makeOwned, pickWeighted, rarityWeight, rollDef, xpProgress } from './familiars'
import { goHome, resetMenu, revealAcquisition } from './menu'
import { partyUnits } from './party'
import { clearFloor, resetRunRewards, roadStarOf } from './progress'
import { FLOORS, ROADS, dropStarsFor, floorCoins, floorFoes, floorScale, starScale } from './quests'
import { findOwned, game } from './store'
import { MAX_STARS, XpLine } from './types'

const REPLAY_COIN_SCALE = 0.35

function spendEnergy(): boolean {
  if (DEBUG.unlimitedEnergy) {
    game.energy = game.energyMax
    return true
  }
  if (game.energy < 1) return false
  game.energy -= 1
  return true
}

function enterBattlePhase() {
  game.battleWait = 0.8
  game.phase = 'battle'
  resetMenu()
}

export function startOathClash() {
  const hero = findOwned(game.heroUid)
  if (!hero) {
    goHome()
    return
  }
  game.run = undefined
  game.fightingIndex = -1
  resetRunRewards()
  game.battle = buildBattle([hero], ['ash-hound'])
  game.battle.oathClash = true
  // Random hero card, never a copy of the starter they just picked.
  // Rarity-weighted like a pack roll: Nova stays a possible day-one
  // jackpot (~0.5%), not an 11% coin flip that skips the campaign.
  const pool = COLLECTIBLE_HEROES.filter((id) => id !== hero.defId)
  const randomDrop = pickWeighted(pool, (id) => rarityWeight(getDef(id).rarity)) ?? OATH_DROP_ID
  const dropId = DEBUG.forceDropId || randomDrop
  if (dropId) {
    const drop = makeOwned(dropId)
    game.pendingDrop = drop
    game.battle.dropId = drop.defId
  }
  enterBattlePhase()
}

function currentRoad() {
  if (!game.run) return undefined
  return ROADS.find((road) => road.id === game.run?.roadId) ?? ROADS[game.fightingIndex]
}

function grantBattleXp() {
  if (!game.battle) return
  const floor = game.run?.floor ?? 1
  const boss = !!game.run && floor >= FLOORS
  const base = 6 + game.battle.kills * 4 + (boss ? 20 : game.battle.oathClash ? 8 : 8)
  // 0.6 keeps replays worth running: at 0.35 the post-first-clear grind to
  // the next power step was ~30 scrap fights, which is where players quit.
  const full = game.run?.replay ? Math.max(2, Math.floor(base * 0.6)) : base
  const amount = game.battle.winner === 'you' ? full : Math.max(2, Math.floor(full * 0.5))
  const lines: XpLine[] = []
  for (const unit of game.battle.you) {
    if (unit.ally) continue
    const owned = findOwned(unit.uid)
    if (!owned) continue
    const before = xpProgress(owned)
    const line: XpLine = {
      uid: owned.uid,
      defId: owned.defId,
      xpBefore: before.xp,
      needBefore: before.need,
      levelBefore: owned.level,
      xpAfter: before.xp,
      needAfter: before.need,
      levelAfter: owned.level,
      levels: 0
    }
    line.levels = grantXp(owned, amount)
    const after = xpProgress(owned)
    line.xpAfter = after.xp
    line.levelAfter = owned.level
    line.needAfter = after.need
    lines.push(line)
  }
  lines.sort((a, b) => (a.uid === game.heroUid ? -1 : b.uid === game.heroUid ? 1 : 0))
  game.xpLines = lines
  game.lastXp = amount
  game.lastLevels = lines.reduce((sum, line) => sum + line.levels, 0)
  game.battle.xpEarned = amount
}

export function beginFloor() {
  const road = currentRoad()
  if (!road || !game.run) {
    goHome()
    return
  }
  if (!spendEnergy()) {
    game.notice = 'no-coin'
    goHome()
    return
  }
  try {
    const floor = game.run.floor
    const star = game.run.star ?? roadStarOf(road.id)
    const scale = floorScale(floor) * starScale(star)
    const foes = floorFoes(road, floor, star)
    const kin = listOathkin()
    const ally = game.selectedAlly ? familiarForKin(game.selectedAlly) : undefined
    const replay = !!game.run.replay
    game.pendingDrop = undefined
    game.rewarded = false
    game.battle = buildBattle(partyUnits(), foes, ally, scale)
    const coinBase = floorCoins(road, floor) * starScale(star)
    const baseCoins = Math.floor(coinBase * (replay ? REPLAY_COIN_SCALE : 1))
    game.battle.coins = Math.floor(coinBase * coinBonus(kin.length) * (replay ? REPLAY_COIN_SCALE : 1))
    game.battle.kin = kin.length
    game.battle.kinCoins = Math.max(0, game.battle.coins - baseCoins)
    const bossFloor = floor >= FLOORS
    // The first road always gifts a recruit after the solo floors: F4+ is
    // tuned for a party of three, and a fresh account only has two cards
    // (starter + oath drop). Granted on winning F3, seated for F4.
    const firstRoadGift = road.id === ROADS[0].id && floor === 3 && game.cleared === 0
    if (!replay && ((bossFloor && Math.random() < road.dropChance + kin.length * 0.05) || firstRoadGift)) {
      // The gift is curated, not rolled: a sustain/strike common the player
      // doesn't own yet, so an all-glass oath draw still gets a body that
      // can stand in front of the ogre. Sim-tuned (drain first).
      const giftPool = ['cinder-wight', 'blaze', 'ash-hound']
      const giftId = firstRoadGift
        ? giftPool.find((id) => !game.collection.some((owned) => owned.defId === id)) ?? rollDef().id
        : rollDef().id
      // Boss drops climb in quality with the tier being fought.
      const drop = makeOwned(giftId, bossFloor ? dropStarsFor(star) : 1)
      game.battle.dropId = drop.defId
      game.pendingDrop = drop
    }
    enterBattlePhase()
  } catch (err) {
    game.notice = 'road-failed'
    console.error(err)
  }
}

/** Mastering roads is the starter's ascension: +1 star per road at max tier. */
function grantStarterStars() {
  const hero = findOwned(game.heroUid)
  if (!hero) return
  const mastered = ROADS.filter((road) => roadStarOf(road.id) >= MAX_STARS).length
  const target = Math.min(MAX_STARS, 1 + mastered)
  if (hero.stars >= target) return
  const from = hero.stars
  hero.stars = target
  game.oathStar = target
  // The boss drop owns the hero-card ceremony if one also paid out;
  // the report still calls the starter star out either way.
  if (!game.pendingDrop) {
    game.starBurstFrom = from
    game.starBurstTo = target
    game.reveal = hero
    game.dropBack = 'home'
  }
}

function settleBattle() {
  if (!game.battle || game.rewarded) return
  game.rewarded = true
  grantBattleXp()
  if (game.battle.winner !== 'you') return
  game.coins += game.battle.coins
  const run = game.run
  const bossClear = !!run && run.floor >= FLOORS && !run.replay
  if (bossClear && run) {
    if (game.fightingIndex === game.cleared && game.cleared < ROADS.length) {
      game.cleared += 1
    }
    // Ascension: felling the boss at the road's current tier raises the
    // tier and resets the climb. Lower-tier farm runs never move it.
    const star = run.star ?? roadStarOf(run.roadId)
    if (star >= roadStarOf(run.roadId) && star < MAX_STARS) {
      game.roadStar[run.roadId] = star + 1
      delete game.pickedStar[run.roadId]
      clearFloor(run.roadId)
      game.ascendedStar = star + 1
      grantStarterStars()
    }
  }
  // pendingDrop is only ever set for fights that may drop (boss floors,
  // the oath clash, the first-road gift), so any win with one pays out.
  if (game.pendingDrop) {
    const drop = game.pendingDrop
    game.pendingDrop = undefined
    revealAcquisition(drop, 'home', { seat: true, show: false })
  }
}

export function tickBattle(dt: number) {
  if (game.phase !== 'battle' || !game.battle) return
  game.battleWait -= dt
  if (game.battleWait > 0) return
  if (game.battle.winner) {
    settleBattle()
    game.phase = 'banner'
    return
  }
  stepBattle(game.battle)
  game.battleWait = 1.8
}

export function skipBattle() {
  if (!game.battle) return
  while (!game.battle.winner) stepBattle(game.battle)
  settleBattle()
  game.phase = 'banner'
}

/** Win/lose banner always opens the rewards report. */
export function advanceBanner() {
  if (game.phase !== 'banner' || !game.battle?.winner) return
  game.phase = 'report'
}
