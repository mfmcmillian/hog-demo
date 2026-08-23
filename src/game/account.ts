import { startOathClash } from './campaign'
import { applyDebugGrants, grantTestRoster } from './debug'
import { HEROES, makeOwned } from './familiars'
import { game } from './store'

export function cycleHero(delta: number) {
  const len = HEROES.length
  game.heroIndex = (game.heroIndex + delta + len) % len
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
