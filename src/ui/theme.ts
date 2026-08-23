import { Color4 } from '@dcl/sdk/math'
import { Rarity } from '../game/types'

export const ink = Color4.create(0.07, 0.045, 0.06, 1)
export const panelDim = Color4.create(0.13, 0.08, 0.1, 1)
export const navySoft = Color4.create(0.28, 0.08, 0.1, 1)
export const cream = Color4.create(0.95, 0.9, 0.84, 1)
export const muted = Color4.create(0.62, 0.53, 0.51, 1)
export const gold = Color4.create(0.82, 0.62, 0.28, 1)
export const danger = Color4.create(0.45, 0.1, 0.12, 1)
export const good = Color4.create(0.12, 0.28, 0.15, 1)

export function rarityBg(rarity: Rarity): Color4 {
  if (rarity === 'mythic') return Color4.create(0.42, 0.18, 0.08, 1)
  if (rarity === 'legendary') return Color4.create(0.36, 0.24, 0.08, 1)
  if (rarity === 'epic') return Color4.create(0.24, 0.1, 0.28, 1)
  if (rarity === 'rare') return Color4.create(0.1, 0.16, 0.3, 1)
  if (rarity === 'uncommon') return Color4.create(0.1, 0.24, 0.14, 1)
  return Color4.create(0.16, 0.14, 0.15, 1)
}

export const PASS: { pointerFilter: 'none' } = { pointerFilter: 'none' }
