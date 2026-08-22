import { AvatarBase, PlayerIdentityData, engine } from '@dcl/sdk/ecs'
import { getPlayer } from '@dcl/sdk/src/players'
import { FAMILIARS, makeOwned } from './familiars'
import { OwnedFamiliar } from './types'

export type Oathkin = {
  userId: string
  name: string
}

function hash(text: string): number {
  let value = 0
  for (let i = 0; i < text.length; i++) value = (value * 31 + text.charCodeAt(i)) >>> 0
  return value
}

export function listOathkin(): Oathkin[] {
  const me = (getPlayer()?.userId ?? '').toLowerCase()
  const people: Oathkin[] = []
  for (const [entity, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
    const userId = (identity.address ?? '').toLowerCase()
    if (!userId || userId === me) continue
    const name = AvatarBase.getOrNull(entity)?.name ?? 'Traveler'
    people.push({ userId, name })
  }
  return people
}

export function familiarForKin(userId: string): OwnedFamiliar {
  const pool = FAMILIARS.filter((def) => {
    if (def.lineage === 'ogre') return false
    return def.rarity === 'rare' || def.rarity === 'epic' || def.rarity === 'legendary' || def.rarity === 'mythic'
  })
  const def = pool[hash(userId) % pool.length]
  const stars = 1 + (hash(userId + 'star') % 3)
  return { ...makeOwned(def.id, stars, 4 + (hash(userId + 'lv') % 6)), uid: `ally-${userId}` }
}

export function coinBonus(kinCount: number): number {
  return 1 + kinCount * 0.3
}
