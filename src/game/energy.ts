import { ENERGY_REGEN_MS } from '../mp/protocol'
import { game } from './store'

// Clock-driven energy refill. `game.energyAt` anchors the counter: every full
// ENERGY_REGEN_MS since then pays one energy, and the anchor slides forward
// by exactly what was paid so partial progress is never lost. At the cap the
// anchor is cleared (0) - it only changes when something is paid, so the
// save JSON stays stable between refills and the debounced push stays quiet.
// The moment energy is spent the anchor restarts from "now", so the first
// refill takes a full interval. Both fields ride in the save, so a player
// who logs off empty comes back to a refilled bar - the everyday reason to
// open the game again.

export function tickEnergyRegen(): void {
  const now = Date.now()
  if (game.energy >= game.energyMax) {
    if (game.energyAt !== 0) game.energyAt = 0
    return
  }
  if (!game.energyAt || game.energyAt > now) {
    game.energyAt = now
    return
  }
  const paid = Math.floor((now - game.energyAt) / ENERGY_REGEN_MS)
  if (paid <= 0) return
  game.energy = Math.min(game.energyMax, game.energy + paid)
  game.energyAt = game.energy >= game.energyMax ? 0 : game.energyAt + paid * ENERGY_REGEN_MS
}

/** Milliseconds until the next energy lands; 0 when the bar is full. */
export function msToNextEnergy(): number {
  if (game.energy >= game.energyMax) return 0
  return Math.max(0, game.energyAt + ENERGY_REGEN_MS - Date.now())
}
