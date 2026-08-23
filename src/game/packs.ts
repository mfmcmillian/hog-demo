import { FAMILIARS, HERO_IDS, pickWeighted, rarityWeight } from './familiars'
import { FamiliarDef, Rarity } from './types'

export type PackId = 'ember' | 'vow' | 'crown'

export type PackDef = {
  id: PackId
  cost: number
  min: Rarity
  label: string
  art: string
  weights?: Partial<Record<Rarity, number>>
}

export const PACKS: PackDef[] = [
  { id: 'ember', cost: 80, min: 'common', label: 'ember', art: 'crate-ember' },
  {
    id: 'vow',
    cost: 240,
    min: 'uncommon',
    label: 'pack-vow',
    art: 'crate-vow',
    weights: { uncommon: 42, rare: 36, epic: 16, legendary: 5, mythic: 1 }
  },
  {
    id: 'crown',
    cost: 720,
    min: 'rare',
    label: 'crown',
    art: 'crate-crown',
    weights: { rare: 48, epic: 32, legendary: 15, mythic: 5 }
  }
]

const RANK: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic']

export function packAt(index: number) {
  return PACKS[index] ?? PACKS[0]
}

export function rollPack(pack: PackDef): FamiliarDef {
  const floor = RANK.indexOf(pack.min)
  const pool = FAMILIARS.filter((def) => {
    if (HERO_IDS.indexOf(def.id) >= 0) return false
    return RANK.indexOf(def.rarity) >= floor
  })
  const weightOf = (rarity: Rarity) => pack.weights?.[rarity] ?? rarityWeight(rarity)
  return pickWeighted(pool, (def) => weightOf(def.rarity))
}
