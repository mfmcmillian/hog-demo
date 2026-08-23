import { game } from './store'

/** Boot gate. UI preload writes this; game/nav only reads it. */
export const boot = {
  ready: false,
  filled: false,
  loaded: 0,
  total: 0,
  /** Set when the boot keyart/logo files have been fetched; gates the fade-in. */
  artAt: 0,
  /** 0..1 ramp over the minimum boot hold; caps the bar so it always sweeps. */
  gate: 0,
  /** True once the server answered whether this wallet has a save. Holding the
   * curtain until then stops returning players from glimpsing the oath screen. */
  saveKnown: false
}

export function isBootReady() {
  return boot.ready
}

export function isBootFilled() {
  return boot.filled
}

export function enterGame() {
  if (!boot.filled) return
  boot.ready = true
  // New accounts hear the story before the oath. Returning players are
  // already on 'home' by now (saveSync routes them before the curtain lifts).
  if (game.phase === 'start' && !game.introSeen) {
    game.introPage = 0
    game.phase = 'intro'
  }
}
