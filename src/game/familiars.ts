import { FamiliarDef, MAX_LEVEL, OwnedFamiliar, Rarity } from './types'

export const HEROES: FamiliarDef[] = [
  { id: 'hallwarden', name: 'Hallwarden', lineage: 'hero', rarity: 'uncommon', role: 'melee', hp: 56, atk: 14, skill: 'strike', skillText: 'I hold the gate' },
  { id: 'sigil-witch', name: 'Sigil Witch', lineage: 'hero', rarity: 'uncommon', role: 'support', hp: 46, atk: 11, skill: 'rally', skillText: 'I bind the dark' },
  { id: 'crowmark', name: 'Crowmark', lineage: 'hero', rarity: 'uncommon', role: 'ranged', hp: 46, atk: 18, skill: 'volley', skillText: 'I never miss the heart' }
]

export const HERO_IDS = HEROES.map((hero) => hero.id)

export const FAMILIARS: FamiliarDef[] = [
  { id: 'ash-hound', name: 'Ash Hound', lineage: 'hound', rarity: 'common', role: 'melee', hp: 42, atk: 11, skill: 'strike', skillText: 'Bites the weakest foe' },
  { id: 'cinder-wight', name: 'Cinder Wight', lineage: 'wight', rarity: 'common', role: 'melee', hp: 38, atk: 12, skill: 'drain', skillText: 'Steals a little life' },
  { id: 'moor-crow', name: 'Moor Crow', lineage: 'crow', rarity: 'common', role: 'ranged', hp: 32, atk: 13, skill: 'volley', skillText: 'Pecks every foe' },
  { id: 'lamp-imp', name: 'Lamp Imp', lineage: 'imp', rarity: 'common', role: 'support', hp: 30, atk: 8, skill: 'rally', skillText: 'Raises allied attack' },
  { id: 'grave-pike', name: 'Grave Pike', lineage: 'pike', rarity: 'uncommon', role: 'melee', hp: 52, atk: 14, skill: 'strike', skillText: 'Spears the front line' },
  { id: 'veil-sister', name: 'Veil Sister', lineage: 'veil', rarity: 'uncommon', role: 'support', hp: 36, atk: 9, skill: 'rally', skillText: 'War chant for the oath' },
  { id: 'rust-ballista', name: 'Rust Ballista', lineage: 'ballista', rarity: 'uncommon', role: 'ranged', hp: 38, atk: 16, skill: 'volley', skillText: 'Bolts the whole rank' },
  { id: 'blood-leech', name: 'Blood Leech', lineage: 'leech', rarity: 'uncommon', role: 'melee', hp: 40, atk: 12, skill: 'drain', skillText: 'Feeds mid-clash' },
  { id: 'oath-knight', name: 'Oath Knight', lineage: 'knight', rarity: 'rare', role: 'melee', hp: 70, atk: 18, skill: 'strike', skillText: 'A pledged killing blow' },
  { id: 'dusk-oracle', name: 'Dusk Oracle', lineage: 'oracle', rarity: 'rare', role: 'support', hp: 44, atk: 11, skill: 'rally', skillText: 'The hall fights harder' },
  { id: 'thorn-queen', name: 'Thorn Queen', lineage: 'queen', rarity: 'legendary', role: 'ranged', hp: 56, atk: 24, skill: 'volley', skillText: 'A rain of briars' },
  { id: 'crimson-abbot', name: 'Crimson Abbot', lineage: 'abbot', rarity: 'legendary', role: 'support', hp: 60, atk: 14, skill: 'drain', skillText: 'Takes and gives in kind' },
  { id: 'ashen-regent', name: 'Ashen Regent', lineage: 'regent', rarity: 'mythic', role: 'melee', hp: 88, atk: 24, skill: 'strike', skillText: 'Ends a line' },
  { id: 'night-covenant', name: 'Night Covenant', lineage: 'covenant', rarity: 'epic', role: 'support', hp: 60, atk: 14, skill: 'rally', skillText: 'The oath becomes an army' },
  { id: 'pale-howl', name: 'Pale Howl', lineage: 'howl', rarity: 'epic', role: 'ranged', hp: 54, atk: 26, skill: 'volley', skillText: 'A scream across the field' },
  { id: 'moor-ogre', name: 'Moor Ogre', lineage: 'ogre', rarity: 'epic', role: 'melee', hp: 90, atk: 16, skill: 'strike', skillText: 'A gate that walks' },
  { id: 'blaze', name: 'Blaze, Torch Knight', lineage: 'torch', rarity: 'common', role: 'melee', hp: 48, atk: 12, skill: 'strike', skillText: 'I carry the hall light' },
  { id: 'rook', name: 'Rook, Crowshot', lineage: 'crowshot', rarity: 'common', role: 'ranged', hp: 34, atk: 14, skill: 'volley', skillText: 'A cheap flight of nails' },
  { id: 'voss', name: 'Voss, Iron Vow', lineage: 'vow', rarity: 'uncommon', role: 'melee', hp: 58, atk: 15, skill: 'strike', skillText: 'I swear the threshold' },
  { id: 'kite', name: 'Kite, Sky Lance', lineage: 'lance', rarity: 'uncommon', role: 'ranged', hp: 40, atk: 18, skill: 'volley', skillText: 'A black flight of spears' },
  { id: 'hexa', name: 'Hexa, Fire Witch', lineage: 'fire', rarity: 'rare', role: 'support', hp: 42, atk: 10, skill: 'rally', skillText: 'The coven answers' },
  { id: 'siphon', name: 'Siphon, Red Knight', lineage: 'red', rarity: 'rare', role: 'melee', hp: 44, atk: 13, skill: 'drain', skillText: 'I drink the fallen' },
  { id: 'lyra', name: 'Lyra, War Siren', lineage: 'siren', rarity: 'epic', role: 'support', hp: 52, atk: 13, skill: 'drain', skillText: 'The hymn takes and gives' },
  { id: 'pax', name: 'Pax, Oath Priest', lineage: 'priest', rarity: 'epic', role: 'support', hp: 56, atk: 14, skill: 'rally', skillText: 'The hall sings back' },
  { id: 'garr', name: 'Garr, Gold Titan', lineage: 'titan', rarity: 'legendary', role: 'melee', hp: 68, atk: 19, skill: 'drain', skillText: 'The gate feeds' },
  { id: 'nova', name: 'Nova, Light Saint', lineage: 'saint', rarity: 'mythic', role: 'support', hp: 76, atk: 38, skill: 'drain', skillText: 'Light splits the rank' }
]

export const BOSS_IDS = ['moor-ogre', 'thorn-queen', 'crimson-abbot', 'ashen-regent']

/**
 * Wearable-gated heroes. Deliberately NOT in FAMILIARS so every drop pool
 * (rollDef, rollPack, familiarForKin) excludes them: the only way in is
 * owning the full NFT wearable set (see nftHeroes.ts).
 */
export const NFT_HEROES: FamiliarDef[] = [
  { id: 'frost-monarch', name: 'Frost Monarch', lineage: 'winter', rarity: 'legendary', role: 'support', hp: 62, atk: 15, skill: 'rally', skillText: 'Winter marches with you' },
  { id: 'ether-assassin', name: 'Ether Assassin', lineage: 'ether', rarity: 'legendary', role: 'melee', hp: 64, atk: 22, skill: 'strike', skillText: 'One cut, no echo' },
  { id: 'wasteland-monarch', name: 'Wasteland Monarch', lineage: 'waste', rarity: 'mythic', role: 'support', hp: 84, atk: 30, skill: 'drain', skillText: 'The waste claims all' }
]

const NFT_HERO_IDS = NFT_HEROES.map((def) => def.id)

export function isNftHero(defId: string): boolean {
  return NFT_HERO_IDS.indexOf(defId) >= 0
}

const MAP = new Map([...FAMILIARS, ...HEROES, ...NFT_HEROES].map((def) => [def.id, def]))

export function getDef(id: string): FamiliarDef {
  const def = MAP.get(id)
  if (!def) throw new Error(`Unknown familiar ${id}`)
  return def
}

export function rarityWeight(rarity: Rarity): number {
  if (rarity === 'common') return 56
  if (rarity === 'uncommon') return 28
  if (rarity === 'rare') return 13
  if (rarity === 'epic') return 3
  if (rarity === 'legendary') return 2
  return 1
}

/** Every card a player can own: the three starters, the whole drop pool,
 * and the wearable-gated NFT heroes. Bosses count too - they drop from
 * packs and rifts at high rarity. */
export function collectionSize(): number {
  return HEROES.length + FAMILIARS.filter((def) => HERO_IDS.indexOf(def.id) < 0).length + NFT_HEROES.length
}

/** One Math.random() per call. Empty `items` still rolls, then returns undefined. */
export function pickWeighted<T>(items: T[], weightOf: (item: T) => number): T {
  const total = items.reduce((sum, item) => sum + weightOf(item), 0)
  let roll = Math.random() * total
  for (const item of items) {
    roll -= weightOf(item)
    if (roll <= 0) return item
  }
  return items[0]
}

export function rollDef(): FamiliarDef {
  const pool = FAMILIARS.filter((def) => HERO_IDS.indexOf(def.id) < 0)
  return pickWeighted(pool, (def) => rarityWeight(def.rarity))
}

export function statsOf(owned: OwnedFamiliar) {
  const def = getDef(owned.defId)
  return {
    hp: def.hp + owned.stars * 14 + owned.level * 3,
    atk: def.atk + owned.stars * 4 + Math.floor(owned.level * 1.2)
  }
}

export function nextUid(): string {
  return `f-${Date.now().toString(36)}-${Math.floor(Math.random() * 9999)}`
}

export function makeOwned(defId: string, stars = 1, level = 1): OwnedFamiliar {
  return { uid: nextUid(), defId, stars, level, xp: 0 }
}

function xpToNext(level: number): number {
  return 16 + level * 10
}

export function xpProgress(owned: OwnedFamiliar) {
  const need = xpToNext(owned.level)
  return { xp: owned.xp, need, frac: need > 0 ? owned.xp / need : 0 }
}

/** Apply XP and spend it on levels. Returns how many levels were gained. */
export function grantXp(owned: OwnedFamiliar, amount: number): number {
  if (owned.level >= MAX_LEVEL || amount <= 0) return 0
  owned.xp += amount
  let gained = 0
  while (owned.level < MAX_LEVEL) {
    const need = xpToNext(owned.level)
    if (owned.xp < need) break
    owned.xp -= need
    owned.level += 1
    gained += 1
  }
  return gained
}
