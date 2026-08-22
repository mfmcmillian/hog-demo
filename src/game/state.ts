import { coinBonus, familiarForKin, listOathkin } from './allies'
import { buildBattle, stepBattle } from './combat'
import { HEROES, getDef, grantXp, makeOwned, nextUid, rarityWeight, rollDef, xpProgress } from './familiars'
import { PACKS, PackId, packAt, rollPack } from './packs'
import { FLOORS, ROADS, dropStarsFor, floorCoins, floorFoes, floorScale, starScale } from './quests'
import { BattleState, MAX_STARS, NoticeCode, OwnedFamiliar, PARTY_SIZE, Phase, RoadRun, XpLine } from './types'

/** Fallback oath-fight drop if the random pool is somehow empty. */
export const OATH_DROP_ID = 'blaze'

/** Local playtest only. Flip cheats off before a real deploy. */
export const DEBUG = {
  // Stays on until an energy regen system exists; without it a player at
  // zero energy would be stranded forever.
  unlimitedEnergy: true,
  grantAllHeroes: false,
  /** D-pad + ACTION/BACK + crown. Off while we try tap-only screens. */
  showPlayHud: false,
  /** Bottom-of-screen KoA / DecentraCraft ads. Off for shots, on for prod. */
  showAds: true,
  /** Playtest: oath fight drops this id instead of OATH_DROP_ID. */
  forceDropId: '',
  /** Playtest: never let gold fall below this. 0 disables. */
  minCoins: 0,
  /** Spare 1-star L1 copies of fuseTestId so fuse can be tried without farming. */
  grantFuseCopies: 0,
  fuseTestId: 'blaze',
  /** One-shot cleanup of the granted test pile (and anything fused from it). */
  purgeFuseCopies: false
}

/** Reapply cheat floors; runs at roster grant and after every save load. */
export function applyDebugGrants() {
  if (DEBUG.minCoins > game.coins) game.coins = DEBUG.minCoins
  const id = DEBUG.fuseTestId
  if (!game.heroUid || !id) return
  if (DEBUG.purgeFuseCopies) {
    // Sweep test copies: every unseated non-hero copy of the test id.
    game.collection = game.collection.filter(
      (owned) => owned.defId !== id || owned.isHero || game.party.indexOf(owned.uid) >= 0
    )
    return
  }
  if (DEBUG.grantFuseCopies <= 0) return
  let have = 0
  for (const owned of game.collection) {
    if (owned.defId === id && !owned.isHero && owned.stars === 1) have += 1
  }
  // One pile only. Refilling here would undo fuses every time the screen opens.
  if (have > 0) return
  for (let i = 0; i < DEBUG.grantFuseCopies; i++) {
    game.collection.push(makeOwned(id, 1, 1))
  }
}

const COLLECTIBLE_HEROES = [
  'blaze',
  'rook',
  'voss',
  'kite',
  'hexa',
  'siphon',
  'lyra',
  'pax',
  'garr',
  'nova'
]

export const game = {
  phase: 'start' as Phase,
  heroIndex: 0,
  heroUid: '',
  cursor: 0,
  menuShift: 0,
  coins: 40,
  energy: 12,
  energyMax: 30,
  collection: [] as OwnedFamiliar[],
  party: ['', '', '', ''] as string[],
  selectedSlot: -1,
  cleared: 0,
  selectedAlly: '' as string,
  fuseA: '' as string,
  fuseB: '' as string,
  fuseHelp: false,
  /** Hero face selected on the fuse tree. */
  fuseId: '',
  /** Ingredient star rank (1..4). Two of these become fuseRank + 1. */
  fuseRank: 1,
  notice: '' as NoticeCode,
  noticeArg: '' as string,
  /** Chest waiting on the shop's ACCEPT/DECLINE confirmation. */
  pendingPack: '' as PackId | '',
  battle: undefined as BattleState | undefined,
  battleWait: 0,
  fightingIndex: 0,
  pendingDrop: undefined as OwnedFamiliar | undefined,
  rewarded: false,
  run: undefined as RoadRun | undefined,
  floorAt: {} as Record<string, number>,
  /** Ascension tier per road (1..MAX_STARS). Missing = tier 1. */
  roadStar: {} as Record<string, number>,
  /** Tier being browsed/fought this session; missing = the road's current tier. */
  pickedStar: {} as Record<string, number>,
  /** Tier the just-won boss fight raised its road to; 0 = no ascension. */
  ascendedStar: 0,
  /** Starter star total granted by the fight just won; 0 = none. */
  oathStar: 0,
  /** Road index being browsed on the level-select screen. */
  roadPick: 0,
  lastXp: 0,
  lastLevels: 0,
  xpLines: [] as XpLine[],
  reveal: undefined as OwnedFamiliar | undefined,
  dropBack: 'home' as Phase,
  inspectUid: '',
  heroCardBack: 'home' as Phase,
  /** Settings toggles. `tickAudio` in audio.ts honors these every frame. */
  soundOn: true,
  musicOn: true,
  /** UTC day index of the last daily gift sent (0 = never). */
  giftDay: 0,
  /** Parent star count for the fuse flipbook; 0 = no burst. */
  starBurstFrom: 0,
  starBurstTo: 0
}

export function cycleHero(delta: number) {
  const len = HEROES.length
  game.heroIndex = (game.heroIndex + delta + len) % len
}

function grantTestRoster() {
  if (!DEBUG.grantAllHeroes) return
  for (const id of COLLECTIBLE_HEROES) {
    if (game.collection.some((owned) => owned.defId === id)) continue
    game.collection.push(makeOwned(id))
  }
  game.energy = game.energyMax
  applyDebugGrants()
}

function spendEnergy(): boolean {
  if (DEBUG.unlimitedEnergy) {
    game.energy = game.energyMax
    return true
  }
  if (game.energy < 1) return false
  game.energy -= 1
  return true
}

export function pickHero(defId?: string) {
  const hero = HEROES.find((entry) => entry.id === defId) ?? HEROES[game.heroIndex]
  const owned = makeOwned(hero.id)
  owned.isHero = true
  game.heroUid = owned.uid
  game.collection = [owned]
  game.party = ['', '', '', '']
  game.party[0] = owned.uid
  game.selectedSlot = -1
  grantTestRoster()
  startOathClash()
}

export function findOwned(uid: string) {
  if (!uid) return undefined
  return game.collection.find((owned) => owned.uid === uid)
}

export function partyIndexOf(uid: string) {
  return game.party.indexOf(uid)
}

export function firstEmptyPartySlot() {
  return game.party.indexOf('')
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
  const totalWeight = pool.reduce((sum, id) => sum + rarityWeight(getDef(id).rarity), 0)
  let roll = Math.random() * totalWeight
  let randomDrop = pool[0] ?? OATH_DROP_ID
  for (const id of pool) {
    roll -= rarityWeight(getDef(id).rarity)
    if (roll <= 0) {
      randomDrop = id
      break
    }
  }
  const dropId = DEBUG.forceDropId || randomDrop
  if (dropId) {
    const drop = makeOwned(dropId)
    game.pendingDrop = drop
    game.battle.dropId = drop.defId
  }
  enterBattlePhase()
}

function clampCleared() {
  if (game.cleared > ROADS.length) game.cleared = ROADS.length
}

function clampFloor(floor: number) {
  return Math.max(1, Math.min(FLOORS, Math.floor(floor) || 1))
}

/** Floor this road will open on. Stays put after a loss. */
export function resumeFloor(roadId: string) {
  return clampFloor(game.floorAt[roadId] ?? 1)
}

function rememberFloor(roadId: string, floor: number) {
  game.floorAt[roadId] = clampFloor(floor)
}

function clearFloor(roadId: string) {
  delete game.floorAt[roadId]
}

/** A road's current ascension tier (1..MAX_STARS). */
export function roadStarOf(roadId: string): number {
  const star = Math.floor(game.roadStar[roadId] ?? 1) || 1
  return Math.max(1, Math.min(MAX_STARS, star))
}

/** The tier being browsed/fought on a road; never above its current tier. */
export function pickedStarOf(roadId: string): number {
  const current = roadStarOf(roadId)
  const star = Math.floor(game.pickedStar[roadId] ?? current) || current
  return Math.max(1, Math.min(current, star))
}

/** Levels-screen tier picker: cycle through 1..current tier. */
export function cycleTier(roadId: string, delta: number) {
  const max = roadStarOf(roadId)
  if (max <= 1) return
  const next = ((pickedStarOf(roadId) - 1 + delta + max * 4) % max) + 1
  game.pickedStar[roadId] = next
}

export function roadMastered(roadId: string): boolean {
  return roadStarOf(roadId) >= MAX_STARS
}

export function resetMenu() {
  game.cursor = 0
  game.menuShift = 0
  game.notice = ''
  game.noticeArg = ''
  game.fuseHelp = false
}

function closeOverlay(then: Phase | 'leaveResult') {
  if (then === 'leaveResult') {
    leaveResult()
    return
  }
  game.phase = then
  resetMenu()
}

function resetRunRewards() {
  game.pendingDrop = undefined
  game.rewarded = false
  game.lastXp = 0
  game.lastLevels = 0
  game.xpLines = []
  game.ascendedStar = 0
  game.oathStar = 0
}

function enterBattlePhase() {
  game.battleWait = 0.8
  game.phase = 'battle'
  resetMenu()
}

function revealAcquisition(owned: OwnedFamiliar, back: Phase, opts?: { seat?: boolean; show?: boolean }) {
  if (!findOwned(owned.uid)) game.collection.push(owned)
  if (opts?.seat) seatInParty(owned.uid)
  game.reveal = owned
  game.dropBack = back
  if (opts?.show === false) return
  openHeroCard(owned.uid, back)
}

export function startRoad(index: number) {
  clampCleared()
  if (index > game.cleared) {
    game.notice = 'clear-road'
    return
  }
  if (partyUnits().length === 0) {
    game.notice = 'recruit-first'
    game.phase = 'party'
    return
  }
  if (!DEBUG.unlimitedEnergy && game.energy < 1) {
    game.notice = 'no-coin'
    return
  }
  const road = ROADS[index]
  if (!road) {
    game.notice = 'road-failed'
    return
  }
  game.fightingIndex = index
  resetRunRewards()
  delete game.pickedStar[road.id] // GO always climbs the road's current tier
  game.run = { roadId: road.id, floor: resumeFloor(road.id), via: 'go', star: roadStarOf(road.id) }
  beginFloor()
}

/** Road GO climbs next: first uncleared, else the lowest unmastered tier. -1 = all mastered. */
export function goRoadIndex(): number {
  clampCleared()
  if (game.cleared < ROADS.length) return game.cleared
  let best = -1
  let bestStar = MAX_STARS
  ROADS.forEach((road, index) => {
    const star = roadStarOf(road.id)
    if (star < bestStar) {
      bestStar = star
      best = index
    }
  })
  return best
}

/** The home GO button: keep climbing, or browse the roads once all are mastered. */
export function goRoad() {
  const index = goRoadIndex()
  if (index < 0) {
    game.phase = 'quest'
    resetMenu()
    return
  }
  startRoad(index)
}

/** Highest floor a road offers on the level map. 0 = the road is locked. */
export function frontierFloor(index: number): number {
  const road = ROADS[index]
  if (!road || index > game.cleared) return 0
  // Farming a lower tier: the whole road is open.
  if (pickedStarOf(road.id) < roadStarOf(road.id)) return FLOORS
  return resumeFloor(road.id)
}

/** Open the floor grid for one road. */
export function openLevels(index: number) {
  clampCleared()
  if (index > game.cleared || !ROADS[index]) {
    game.notice = 'clear-road'
    return
  }
  game.roadPick = index
  game.phase = 'levels'
  resetMenu()
}

/** Fight one chosen floor from the level map. Beaten floors replay for scraps. */
export function startFloor(index: number, floor: number) {
  clampCleared()
  const road = ROADS[index]
  const frontier = frontierFloor(index)
  if (!road || floor < 1 || floor > frontier) {
    game.notice = 'clear-road'
    return
  }
  if (partyUnits().length === 0) {
    game.notice = 'recruit-first'
    game.phase = 'party'
    return
  }
  if (!DEBUG.unlimitedEnergy && game.energy < 1) {
    game.notice = 'no-coin'
    return
  }
  game.fightingIndex = index
  resetRunRewards()
  const star = pickedStarOf(road.id)
  // Lower-tier farm runs pay full rewards at that tier; only re-fighting
  // beaten floors of the current climb counts as a scrap replay.
  const replay = star >= roadStarOf(road.id) && floor < frontier
  game.run = { roadId: road.id, floor, replay, via: 'map', star }
  beginFloor()
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

function beginFloor() {
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
    const foes = floorFoes(road, floor)
    const kin = listOathkin()
    const ally = game.selectedAlly ? familiarForKin(game.selectedAlly) : undefined
    const replay = !!game.run.replay
    game.pendingDrop = undefined
    game.rewarded = false
    game.battle = buildBattle(partyUnits(), foes, ally, scale)
    const coinBase = floorCoins(road, floor) * starScale(star)
    const baseCoins = Math.floor(coinBase * (replay ? 0.35 : 1))
    game.battle.coins = Math.floor(coinBase * coinBonus(kin.length) * (replay ? 0.35 : 1))
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

export function leaveResult() {
  // Settle progression up front so a card-reveal detour can't skip it.
  // Replays never move the checkpoint (losing a replay must not roll it back).
  const run = game.run
  const oath = !!game.battle?.oathClash
  // Lower-tier farm runs never move the climb; a tier-up in settleBattle
  // already reset it (roadStar moved past run.star, so `climbing` is false).
  const climbing = !!run && (run.star ?? 1) >= roadStarOf(run.roadId)
  if (run && game.battle && !oath && !run.replay && climbing) {
    if (game.battle.winner !== 'you') rememberFloor(run.roadId, run.floor)
    else if (run.floor < FLOORS) rememberFloor(run.roadId, run.floor + 1)
    else if ((run.star ?? 1) >= MAX_STARS) rememberFloor(run.roadId, FLOORS) // mastered: boss stays open
    else clearFloor(run.roadId)
  }
  game.run = undefined
  if (game.reveal && !findOwned(game.reveal.uid)) {
    // The revealed card vanished from the collection (e.g. a save sync
    // landed mid-battle). Drop the ceremony rather than dead-ending the tap.
    game.reveal = undefined
  }
  if (game.reveal) {
    openHeroCard(game.reveal.uid, game.dropBack)
    return
  }
  if (run?.via === 'map' && !oath) {
    const index = ROADS.findIndex((road) => road.id === run.roadId)
    if (index >= 0) {
      openLevels(index)
      return
    }
  }
  goHome()
}

export function goHome() {
  clampCleared()
  game.phase = 'home'
  game.selectedSlot = -1
  resetMenu()
}

/** Wipe the account back to a brand-new player and return to the oath. */
export function resetAccount() {
  game.collection = []
  game.party = ['', '', '', '']
  game.heroUid = ''
  game.heroIndex = 0
  game.coins = 40
  game.energy = 12
  game.cleared = 0
  game.floorAt = {}
  game.roadStar = {}
  game.pickedStar = {}
  game.ascendedStar = 0
  game.oathStar = 0
  game.roadPick = 0
  game.soundOn = true
  game.musicOn = true
  game.giftDay = 0
  game.run = undefined
  game.battle = undefined
  game.pendingPack = ''
  game.pendingDrop = undefined
  game.reveal = undefined
  game.inspectUid = ''
  game.notice = ''
  game.noticeArg = ''
  game.fuseA = ''
  game.fuseB = ''
  game.fuseId = ''
  game.fuseRank = 1
  game.starBurstFrom = 0
  game.starBurstTo = 0
  game.selectedAlly = ''
  game.selectedSlot = -1
  game.rewarded = false
  game.lastXp = 0
  game.lastLevels = 0
  game.xpLines = []
  game.cursor = 0
  game.menuShift = 0
  game.phase = 'start'
  applyDebugGrants()
}

export function partyUnits(): OwnedFamiliar[] {
  const units: OwnedFamiliar[] = []
  for (const uid of game.party) {
    const owned = findOwned(uid)
    if (owned) units.push(owned)
  }
  return units
}

export function seatedCount(): number {
  let n = 0
  for (const uid of game.party) if (uid) n += 1
  return n
}

function seatedDefIds(): Set<string> {
  const ids = new Set<string>()
  for (const uid of game.party) {
    const owned = findOwned(uid)
    if (owned) ids.add(owned.defId)
  }
  return ids
}

export function benchUnits(): OwnedFamiliar[] {
  const taken = seatedDefIds()
  // Best copy per face (stars, then level), matching the rift picker, so
  // the bench never offers a spare 1★ while a fused copy sits unseated.
  const best = new Map<string, OwnedFamiliar>()
  for (const owned of game.collection) {
    if (partyIndexOf(owned.uid) >= 0) continue
    if (taken.has(owned.defId)) continue
    const kept = best.get(owned.defId)
    if (!kept || owned.stars > kept.stars || (owned.stars === kept.stars && owned.level > kept.level)) {
      best.set(owned.defId, owned)
    }
  }
  return [...best.values()]
}

export function seatInParty(uid: string) {
  if (!uid || partyIndexOf(uid) >= 0) return
  const owned = findOwned(uid)
  if (!owned || seatedDefIds().has(owned.defId)) return
  const hole = firstEmptyPartySlot()
  if (hole < 0) return
  game.party[hole] = uid
}

export function toggleParty(uid: string) {
  if (uid === game.heroUid) return
  const index = partyIndexOf(uid)
  if (index >= 0) {
    game.party[index] = ''
    return
  }
  seatInParty(uid)
}

export function tapPartySlot(slot: number) {
  if (slot < 0 || slot >= PARTY_SIZE) return
  if (game.selectedSlot === slot) {
    if (game.party[slot] && game.party[slot] !== game.heroUid) game.party[slot] = ''
    game.selectedSlot = -1
    return
  }
  if (game.selectedSlot >= 0) {
    const a = game.selectedSlot
    const hold = game.party[a]
    game.party[a] = game.party[slot]
    game.party[slot] = hold
    game.selectedSlot = -1
    return
  }
  game.selectedSlot = slot
}

export function tapBenchHero(uid: string) {
  if (!uid) return
  const owned = findOwned(uid)
  if (!owned || seatedDefIds().has(owned.defId)) return
  if (game.selectedSlot < 0) {
    seatInParty(uid)
    return
  }
  const slot = game.selectedSlot
  if (game.party[slot] === game.heroUid) {
    game.selectedSlot = -1
    return
  }
  if (partyIndexOf(uid) >= 0) return
  game.party[slot] = uid
  game.selectedSlot = -1
}

export function clearPartySlot(slot: number) {
  if (slot < 0 || slot >= PARTY_SIZE) return
  if (!game.party[slot] || game.party[slot] === game.heroUid) return
  game.party[slot] = ''
  if (game.selectedSlot === slot) game.selectedSlot = -1
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
  const actor = [...game.battle.you, ...game.battle.foe].find((unit) => unit.uid === game.battle?.actingUid)
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

export function buyPack(id?: string) {
  const pack = PACKS.find((entry) => entry.id === id) ?? packAt(game.cursor)
  if (game.coins < pack.cost) {
    game.notice = 'no-coin'
    return
  }
  game.coins -= pack.cost
  revealAcquisition(makeOwned(rollPack(pack).id), 'shop')
}

/** Tapping a chest asks first; ACCEPT actually opens it. */
export function requestPack(id: PackId) {
  if (game.coins < PACKS.find((entry) => entry.id === id)!.cost) {
    game.notice = 'no-coin'
    return
  }
  game.pendingPack = id
}

export function confirmPack() {
  const id = game.pendingPack
  game.pendingPack = ''
  if (id) buyPack(id)
}

export function cancelPack() {
  game.pendingPack = ''
}

export function openHeroCard(uid: string, back: Phase = 'home') {
  if (!findOwned(uid)) return
  game.inspectUid = uid
  game.heroCardBack = back
  game.phase = 'heroCard'
  resetMenu()
}

export function leaveHeroCard() {
  const back = game.heroCardBack
  const acquired = game.reveal
  game.inspectUid = ''
  game.heroCardBack = 'home'
  game.starBurstFrom = 0
  game.starBurstTo = 0
  if (acquired) {
    if (back === 'home') seatInParty(acquired.uid)
    game.reveal = undefined
    game.dropBack = 'home'
    closeOverlay(back === 'home' ? 'leaveResult' : back)
    if (back === 'fuse') prepareFuse()
    return
  }
  closeOverlay(back)
  if (back === 'fuse') prepareFuse()
}

export function fuseUnits(): OwnedFamiliar[] {
  const out = game.collection.filter((owned) => !owned.isHero)
  out.sort((a, b) => {
    if (a.defId !== b.defId) return a.defId < b.defId ? -1 : 1
    if (a.stars !== b.stars) return a.stars - b.stars
    return b.level - a.level
  })
  return out
}

export function fuseFaces(): OwnedFamiliar[] {
  const best = new Map<string, OwnedFamiliar>()
  for (const owned of fuseUnits()) {
    const kept = best.get(owned.defId)
    if (!kept || owned.stars > kept.stars || (owned.stars === kept.stars && owned.level > kept.level)) {
      best.set(owned.defId, owned)
    }
  }
  return [...best.values()]
}

export function fuseAtRank(defId: string, stars: number): OwnedFamiliar[] {
  if (!defId) return []
  return fuseUnits().filter((owned) => owned.defId === defId && owned.stars === stars)
}

export function fuseCount(defId: string, stars: number): number {
  return fuseAtRank(defId, stars).length
}

function nextFuseRank(defId: string): number {
  for (let stars = 1; stars < MAX_STARS; stars++) {
    if (fuseCount(defId, stars) >= 2) return stars
  }
  return 1
}

function autoFillFuse() {
  const pool = fuseAtRank(game.fuseId, game.fuseRank)
  game.fuseA = pool[0]?.uid ?? ''
  game.fuseB = pool[1]?.uid ?? ''
}

export function prepareFuse() {
  const faces = fuseFaces()
  if (!game.fuseId || !faces.some((owned) => owned.defId === game.fuseId)) {
    game.fuseId = faces[0]?.defId ?? ''
  }
  game.fuseRank = nextFuseRank(game.fuseId)
  autoFillFuse()
}

export function pickFuseHero(defId: string) {
  if (!defId) return
  game.fuseId = defId
  game.fuseA = ''
  game.fuseB = ''
  game.fuseRank = nextFuseRank(defId)
  autoFillFuse()
}

export function pickFuseRank(stars: number) {
  if (stars < 1 || stars >= MAX_STARS) return
  game.fuseRank = stars
  game.fuseA = ''
  game.fuseB = ''
  autoFillFuse()
}

export function canFuse(a?: OwnedFamiliar, b?: OwnedFamiliar) {
  if (!a || !b || a.uid === b.uid) return false
  if (a.isHero || b.isHero) return false
  return a.defId === b.defId && a.stars === b.stars && a.stars < MAX_STARS
}

export function fuse() {
  const a = findOwned(game.fuseA)
  const b = findOwned(game.fuseB)
  if (!canFuse(a, b) || !a || !b) {
    game.notice = 'fuse-rule'
    return
  }
  const keep = a.level > b.level ? a : b.level > a.level ? b : a.xp >= b.xp ? a : b
  const fromStars = a.stars
  const child = makeOwned(a.defId, a.stars + 1, keep.level)
  child.uid = nextUid()
  child.xp = keep.xp
  game.collection = game.collection.filter((owned) => owned.uid !== a.uid && owned.uid !== b.uid)
  game.collection.push(child)
  for (let i = 0; i < PARTY_SIZE; i++) {
    if (game.party[i] === a.uid || game.party[i] === b.uid) game.party[i] = ''
  }
  seatInParty(child.uid)
  game.fuseA = ''
  game.fuseB = ''
  game.notice = 'fused'
  game.noticeArg = child.defId
  game.starBurstFrom = fromStars
  game.starBurstTo = child.stars
  revealAcquisition(child, 'fuse')
}

export function pickFuse(uid: string) {
  if (game.fuseA === uid) {
    game.fuseA = ''
    return
  }
  if (game.fuseB === uid) {
    game.fuseB = ''
    return
  }
  const owned = findOwned(uid)
  if (!owned || owned.isHero || owned.stars >= MAX_STARS) {
    game.notice = 'fuse-rule'
    return
  }
  if (game.fuseA) {
    const a = findOwned(game.fuseA)
    if (a && (a.defId !== owned.defId || a.stars !== owned.stars)) {
      game.notice = 'fuse-rule'
      return
    }
    game.fuseB = uid
    return
  }
  game.fuseA = uid
}
