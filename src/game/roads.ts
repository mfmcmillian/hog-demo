import { beginFloor } from './campaign'
import { DEBUG } from './debug'
import { prepareFuse } from './fuse'
import { goHome, openHeroCard, resetMenu } from './menu'
import { partyUnits, seatInParty } from './party'
import {
  clampCleared,
  clearFloor,
  frontierFloor,
  pickedStarOf,
  rememberFloor,
  resetRunRewards,
  resumeFloor,
  roadStarOf
} from './progress'
import { FLOORS, ROADS } from './quests'
import { findOwned, game } from './store'
import { maybeStartTip } from './tutorial'
import { MAX_STARS, Phase, RoadRun, SeenStoryId, STORY_IDS } from './types'

function partyReady(): boolean {
  if (partyUnits().length === 0) {
    game.notice = 'recruit-first'
    game.phase = 'party'
    game.freshUids = []
    maybeStartTip('party')
    return false
  }
  if (!DEBUG.unlimitedEnergy && game.energy < 1) {
    game.notice = 'no-coin'
    return false
  }
  return true
}

function launchRun(index: number, run: RoadRun) {
  // First road fight ever: the GO-button pointer has done its job.
  game.tutSeen.go = true
  // A road's story plays once before its first fight: stash the run, roll
  // the slideshow, and finishStory (intro.ts) relaunches via resumePendingRun.
  // Party/energy were already checked; nothing is spent until beginFloor.
  const storyId = (STORY_IDS as readonly string[]).indexOf(run.roadId) >= 0 ? (run.roadId as SeenStoryId) : undefined
  if (storyId && !game.storySeen[storyId]) {
    game.pendingRun = { index, run }
    game.storyId = storyId
    game.introPage = 0
    game.phase = 'intro'
    return
  }
  game.fightingIndex = index
  resetRunRewards()
  game.run = run
  beginFloor()
}

/** The road story just ended: launch the fight it interrupted. */
export function resumePendingRun(): void {
  const pending = game.pendingRun
  game.pendingRun = undefined
  if (!pending) {
    goHome()
    return
  }
  launchRun(pending.index, pending.run)
}

function startRoad(index: number) {
  clampCleared()
  if (index > game.cleared) {
    game.notice = 'clear-road'
    return
  }
  if (!partyReady()) return
  const road = ROADS[index]
  if (!road) {
    game.notice = 'road-failed'
    return
  }
  delete game.pickedStar[road.id] // GO always climbs the road's current tier
  launchRun(index, { roadId: road.id, floor: resumeFloor(road.id), via: 'go', star: roadStarOf(road.id) })
}

/** Road GO climbs next: first uncleared, else the lowest unmastered tier. -1 = all mastered. */
function goRoadIndex(): number {
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
    maybeStartTip('map')
    return
  }
  startRoad(index)
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
  if (!partyReady()) return
  const star = pickedStarOf(road.id)
  // Lower-tier farm runs pay full rewards at that tier; only re-fighting
  // beaten floors of the current climb counts as a scrap replay.
  const replay = star >= roadStarOf(road.id) && floor < frontier
  launchRun(index, { roadId: road.id, floor, replay, via: 'map', star })
}

/** Where the report returns to; survives the card-reveal detour (which
 * re-enters leaveResult after game.run was already cleared). */
let resultReturn: { roadIndex: number; bossWin: boolean } | undefined

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
  // Road fights return to where the next fight starts, never the village:
  // the road's floor grid, or the road map after a boss clear (that's where
  // the next road just unlocked).
  if (run && !oath) {
    resultReturn = {
      roadIndex: ROADS.findIndex((road) => road.id === run.roadId),
      bossWin: run.floor >= FLOORS && game.battle?.winner === 'you' && !run.replay
    }
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
  const dest = resultReturn
  resultReturn = undefined
  if (dest && dest.roadIndex >= 0) {
    if (dest.bossWin) {
      // Boss felled: show the road map with the freshly unlocked next road
      // (or the Gates of Antrom row once the last road falls).
      game.phase = 'quest'
      resetMenu()
      game.cursor = Math.min(game.cleared, ROADS.length)
      return
    }
    openLevels(dest.roadIndex)
    // openLevels refuses locked roads (possible after a mid-battle save
    // sync); don't strand the player on the report screen.
    if (game.phase !== 'levels') goHome()
    return
  }
  // First arrival at the village: tease the hound's card drop so the player
  // follows the badge to the party screen (where the card waits undiscovered).
  if (oath && game.battle?.winner === 'you' && game.freshUids.length > 0) {
    game.dropTalk = true
  }
  // Gates of Antrom is the campaign ending: the epilogue (then credits)
  // plays after every win. Card reveal detoured above.
  if (game.battle?.finalBattle && game.battle.winner === 'you') {
    game.storyId = 'epilogue'
    game.introPage = 0
    game.phase = 'intro'
    return
  }
  goHome()
}

function closeOverlay(then: Phase | 'leaveResult') {
  if (then === 'leaveResult') {
    leaveResult()
    return
  }
  game.phase = then
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
