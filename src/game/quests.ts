import { MAX_STARS } from './types'

export type Road = {
  id: string
  name: string
  pool: string[]
  boss: string
  coins: number
  dropChance: number
}

export const FLOORS = 10

export const ROADS: Road[] = [
  { id: 'q1', name: 'The Moor Gate', pool: ['ash-hound', 'cinder-wight', 'lamp-imp'], boss: 'moor-ogre', coins: 28, dropChance: 0.8 },
  { id: 'q3', name: 'Crow Road', pool: ['moor-crow', 'grave-pike', 'rust-ballista'], boss: 'thorn-queen', coins: 44, dropChance: 0.7 },
  { id: 'q4', name: 'The Veiled Well', pool: ['veil-sister', 'blood-leech', 'dusk-oracle'], boss: 'crimson-abbot', coins: 52, dropChance: 0.75 },
  { id: 'q6', name: 'The Oath Hall', pool: ['oath-knight', 'night-covenant', 'pale-howl'], boss: 'ashen-regent', coins: 90, dropChance: 0.9 }
]

export function floorScale(floor: number): number {
  const n = Math.max(1, Math.min(FLOORS, floor))
  const base = 1 + (n - 1) * 0.12
  // Sim-tuned: 1.35 made the Q1 ogre a 252hp/44atk wall that demanded a
  // L9 trio while first-clear XP only paid L5. 1.12 keeps the boss a beat
  // above floor 9 without turning road one into the hardest fight shipped.
  return n === FLOORS ? base * 1.12 : base
}

export function floorFoeCount(floor: number): number {
  if (floor >= FLOORS) return 1
  if (floor <= 3) return 1
  if (floor <= 7) return 2
  return 3
}

export function floorFoes(road: Road, floor: number): string[] {
  if (floor >= FLOORS) return [road.boss]
  const count = floorFoeCount(floor)
  const foes: string[] = []
  for (let i = 0; i < count; i++) {
    foes.push(road.pool[(floor + i - 1) % road.pool.length])
  }
  return foes
}

export function floorCoins(road: Road, floor: number): number {
  if (floor >= FLOORS) return road.coins
  return Math.max(4, Math.floor(road.coins * (0.12 + floor * 0.03)))
}

/**
 * Ascension: foe power AND coin multiplier for a road's star tier.
 * Sim-tuned (sim-ascend-sweep): +50%/star is the steepest curve a maxed
 * roster (5-star L30 starter + fused mythics) can clear on every road;
 * at +55% the Crow Road tier 5 becomes unwinnable for ANY roster, and
 * the originally planned +75% walls out even the first road. Tier 5 = 3x.
 */
export function starScale(star: number): number {
  const s = Math.max(1, Math.min(MAX_STARS, Math.floor(star) || 1))
  return 1 + (s - 1) * 0.5
}

/** Card quality the boss drops at a tier: 1-2 pay 1-star, 3-4 pay 2-star, 5 pays 3-star. */
export function dropStarsFor(star: number): number {
  if (star >= MAX_STARS) return 3
  if (star >= 3) return 2
  return 1
}
