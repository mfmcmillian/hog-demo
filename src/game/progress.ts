import { FLOORS, ROADS } from './quests'
import { game } from './store'
import { MAX_STARS } from './types'

export function clampCleared() {
  if (game.cleared > ROADS.length) game.cleared = ROADS.length
}

function clampFloor(floor: number) {
  return Math.max(1, Math.min(FLOORS, Math.floor(floor) || 1))
}

/** Floor this road will open on. Stays put after a loss. */
export function resumeFloor(roadId: string) {
  return clampFloor(game.floorAt[roadId] ?? 1)
}

export function rememberFloor(roadId: string, floor: number) {
  game.floorAt[roadId] = clampFloor(floor)
}

export function clearFloor(roadId: string) {
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

/** Highest floor a road offers on the level map. 0 = the road is locked. */
export function frontierFloor(index: number): number {
  const road = ROADS[index]
  if (!road || index > game.cleared) return 0
  // Farming a lower tier: the whole road is open.
  if (pickedStarOf(road.id) < roadStarOf(road.id)) return FLOORS
  return resumeFloor(road.id)
}

export function resetRunRewards() {
  game.pendingDrop = undefined
  game.rewarded = false
  game.lastXp = 0
  game.lastLevels = 0
  game.xpLines = []
  game.ascendedStar = 0
  game.oathStar = 0
}
