import { benchUnits, partyUnits } from './party'
import { game } from './store'
import { TipId } from './types'

/**
 * First-press tutorial tips. Each tip is a few pages of pre-rotated label
 * strips (see tools/gen-tut-labels.ps1) shown in the elder's quest dialog over
 * the freshly opened, dimmed screen. Tapping anywhere advances; the last tap
 * dismisses and marks the tip seen (persisted in the player save). A page may
 * also aim the animated pointer at a key element of the screen underneath —
 * positions are percentages of the screen area, safe because every screen is
 * pinned to the fixed 1600x720 Stage (see ui/screens.tsx), so the screen area
 * is deterministic on every device.
 */
export type TipPage = {
  /** Label keys, one per dialog line, phone top-to-bottom. */
  lines: string[]
  /** Pointer cluster position over the dimmed screen; omit for no pointer. */
  pointer?: { left: `${number}%`; top: `${number}%` }
}

export const TIPS: Record<TipId, TipPage[]> = {
  party: [
    // page 1: the bench (right half of the party hall)
    { lines: ['tut-party-1a', 'tut-party-1b', 'tut-party-1c'], pointer: { left: '72%', top: '35%' } },
    // page 2: the four seats (middle columns)
    { lines: ['tut-party-2a', 'tut-party-2b', 'tut-party-2c'], pointer: { left: '38%', top: '30%' } }
  ],
  map: [
    // page 1: the road rows
    { lines: ['tut-map-1a', 'tut-map-1b', 'tut-map-1c'], pointer: { left: '35%', top: '35%' } },
    { lines: ['tut-map-2a', 'tut-map-2b', 'tut-map-2c'] }
  ],
  settings: [
    // the sound/music rows sit left of center
    { lines: ['tut-settings-1a', 'tut-settings-1b', 'tut-settings-1c'], pointer: { left: '33%', top: '38%' } }
  ],
  events: [
    // page 1: the realm goal bar panel
    { lines: ['tut-events-1a', 'tut-events-1b', 'tut-events-1c'], pointer: { left: '38%', top: '38%' } },
    // page 2: the SEND button in the gift panel
    { lines: ['tut-events-2a', 'tut-events-2b', 'tut-events-2c'], pointer: { left: '58%', top: '42%' } }
  ],
  fuse: [
    // page 1: the hero-face bench
    { lines: ['tut-fuse-1a', 'tut-fuse-1b', 'tut-fuse-1c'], pointer: { left: '72%', top: '35%' } },
    // page 2: the accept/result seat
    { lines: ['tut-fuse-2a', 'tut-fuse-2b', 'tut-fuse-2c'], pointer: { left: '40%', top: '40%' } }
  ],
  shop: [
    // the pack cards fill the middle of the counter
    { lines: ['tut-shop-1a', 'tut-shop-1b', 'tut-shop-1c'], pointer: { left: '40%', top: '35%' } },
    { lines: ['tut-shop-2a', 'tut-shop-2b', 'tut-shop-2c'] }
  ],
  trade: [
    // page 1: the traveler plates
    { lines: ['tut-trade-1a', 'tut-trade-1b', 'tut-trade-1c'], pointer: { left: '40%', top: '35%' } },
    { lines: ['tut-trade-2a', 'tut-trade-2b', 'tut-trade-2c'] }
  ],
  friendzone: [
    // page 1: the hero pick strip
    { lines: ['tut-friendzone-1a', 'tut-friendzone-1b', 'tut-friendzone-1c'], pointer: { left: '45%', top: '55%' } },
    { lines: ['tut-friendzone-2a', 'tut-friendzone-2b', 'tut-friendzone-2c'] },
    // page 3: the raids/duels tabs
    { lines: ['tut-friendzone-3a', 'tut-friendzone-3b', 'tut-friendzone-3c'], pointer: { left: '14%', top: '30%' } }
  ],
  // No dialog: 'go' is only the pointer on the home GO button (goPointerShowing).
  go: []
}

export function tipShowing(): boolean {
  return game.tutTip !== ''
}

/** Fire the tip for a just-opened screen unless this account has seen it. */
export function maybeStartTip(tip: TipId): void {
  if (game.tutSeen[tip] || TIPS[tip].length === 0) return
  game.tutTip = tip
  game.tutPage = 0
}

/**
 * Animated pointer on the home GO button: shows once the party hall has been
 * visited (its tip dismissed) and stays until the player launches their first
 * road fight — launchRun marks 'go' seen, and the save persists it. Hidden
 * while any home dialog holds the screen.
 */
export function goPointerShowing(): boolean {
  if (game.phase !== 'home') return false
  if (!game.tutSeen.party || game.tutSeen.go) return false
  // Saves that predate the flag: anyone with road progress knows GO already.
  if (game.cleared > 0) return false
  // One pointer at a time: undiscovered cards send you to the hall first.
  if (game.freshUids.length > 0) return false
  return homeClear()
}

/**
 * Animated pointer on the home party button while cards sit undiscovered in
 * the hall (fresh drops, quest rewards). Replaces the old red count badge
 * with the same nudge the GO button uses; clears itself when the party
 * screen opens (open() empties freshUids).
 */
export function partyPointerShowing(): boolean {
  if (game.phase !== 'home' || game.freshUids.length === 0) return false
  return homeClear()
}

/** No home dialog or overlay holding the screen. */
function homeClear(): boolean {
  return !game.dropTalk && !game.fireTalk && !game.onlineOpen && !tipShowing()
}

/**
 * Pointer chain on the party hall during onboarding, picking up where the
 * party tip's dialog left off: first aim at the bench recruit, then (once
 * every owned hero is seated) at the back button so the player heads home,
 * where the GO pointer takes over. Self-correcting: unseating the recruit
 * brings the bench pointer right back.
 */
function partyPointerStage(): 'bench' | 'back' | '' {
  if (game.phase !== 'party') return ''
  // Only between the party tip and the first road fight, on fresh accounts.
  if (!game.tutSeen.party || game.tutSeen.go || game.cleared > 0) return ''
  if (tipShowing() || game.nftTalk !== '' || game.notice !== '') return ''
  if (benchUnits().length > 0) return 'bench'
  return partyUnits().length >= 2 ? 'back' : ''
}

/** Animated pointer on the first bench tile (the hound's dropped recruit). */
export function benchPointerShowing(): boolean {
  return partyPointerStage() === 'bench'
}

/** Animated pointer on the back button once the recruit is seated. */
export function backPointerShowing(): boolean {
  return partyPointerStage() === 'back'
}

/** Tap anywhere: next page, or dismiss from the last one. */
export function advanceTip(): void {
  if (!game.tutTip) return
  const pages = TIPS[game.tutTip]
  if (game.tutPage < pages.length - 1) {
    game.tutPage += 1
    return
  }
  dismissTip()
}

/** Close the tip and mark it seen; the debounced save push persists it. */
export function dismissTip(): void {
  if (!game.tutTip) return
  game.tutSeen[game.tutTip] = true
  game.tutTip = ''
  game.tutPage = 0
}
