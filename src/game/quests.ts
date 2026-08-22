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

export function floorFoeCount(floor: number, star = 1): number {
  if (floor >= FLOORS) return 1
  if (floor <= 3) return 2
  if (floor <= 7) return 3
  // The fourth body on the deep floors is an ascension threat, not a base one.
  return star >= 3 ? 4 : 3
}

/** Boss backup at higher tiers: alone at T1, +1 add at T2-3, +2 at T4-5. */
export function bossAdds(star: number): number {
  if (star >= 4) return 2
  if (star >= 2) return 1
  return 0
}

export function floorFoes(road: Road, floor: number, star = 1): string[] {
  if (floor >= FLOORS) {
    const foes = [road.boss]
    for (let i = 0; i < bossAdds(star); i++) {
      foes.push(road.pool[i % road.pool.length])
    }
    return foes
  }
  const count = floorFoeCount(floor, star)
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
 * Sim-tuned alongside squad sizes (sim-ascend-sweep): extra bodies
 * (floorFoeCount, bossAdds) now carry part of the tier difficulty, so the
 * stat curve is gentler than the old +50%/star. +30% is the steepest curve
 * the mastery ceiling roster clears on every road; +35% walls Oath Hall T5.
 * Tier 5 = 2.2x stats on top of a 4-foe rank and a boss with two adds.
 */
export function starScale(star: number): number {
  const s = Math.max(1, Math.min(MAX_STARS, Math.floor(star) || 1))
  return 1 + (s - 1) * 0.3
}

/** Card quality the boss drops at a tier: 1-2 pay 1-star, 3-4 pay 2-star, 5 pays 3-star. */
export function dropStarsFor(star: number): number {
  if (star >= MAX_STARS) return 3
  if (star >= 3) return 2
  return 1
}
