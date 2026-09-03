import { makeOwned } from './familiars'
import { game } from './store'

/** Fallback oath-fight drop if the random pool is somehow empty. */
export const OATH_DROP_ID = 'blaze'

/** Local playtest only. Flip cheats off before a real deploy. */
export const DEBUG = {
  // Stays on until an energy regen system exists; without it a player at
  // zero energy would be stranded forever.
  unlimitedEnergy: true,
  grantAllHeroes: false,
  /** D-pad + ACTION/BACK + crown. Off while we try tap-only screens. */
  showPlayHud: false,
  /** Bottom-of-screen KoA / DecentraCraft ads. Off for shots, on for prod. */
  showAds: true,
  /** Live canvas / stage / safe-area readout for responsive-layout testing. */
  showCanvasInfo: false,
  /** Overworld 9x16 tile outlines so we can judge TILE size. */
  showOwGrid: false,
  /** Playtest: oath fight drops this id instead of OATH_DROP_ID. */
  forceDropId: '',
  /** Playtest: never let gold fall below this. 0 disables. */
  minCoins: 0,
  /** Spare 1-star L1 copies of fuseTestId so fuse can be tried without farming. */
  grantFuseCopies: 0,
  fuseTestId: 'blaze',
  /** One-shot cleanup of the granted test pile (and anything fused from it). */
  purgeFuseCopies: false
}

/** Reapply cheat floors; runs at roster grant and after every save load. */
export function applyDebugGrants() {
  if (DEBUG.minCoins > game.coins) game.coins = DEBUG.minCoins
  const id = DEBUG.fuseTestId
  if (!game.heroUid || !id) return
  if (DEBUG.purgeFuseCopies) {
    // Sweep test copies: every unseated non-hero copy of the test id.
    game.collection = game.collection.filter(
      (owned) => owned.defId !== id || owned.isHero || game.party.indexOf(owned.uid) >= 0
    )
    return
  }
  if (DEBUG.grantFuseCopies <= 0) return
  let have = 0
  for (const owned of game.collection) {
    if (owned.defId === id && !owned.isHero && owned.stars === 1) have += 1
  }
  // One pile only. Refilling here would undo fuses every time the screen opens.
  if (have > 0) return
  for (let i = 0; i < DEBUG.grantFuseCopies; i++) {
    game.collection.push(makeOwned(id, 1, 1))
  }
}

export const COLLECTIBLE_HEROES = [
  'blaze',
  'rook',
  'voss',
  'kite',
  'hexa',
  'siphon',
  'lyra',
  'pax',
  'garr',
  'nova'
]

export function grantTestRoster() {
  if (!DEBUG.grantAllHeroes) return
  for (const id of COLLECTIBLE_HEROES) {
    if (game.collection.some((owned) => owned.defId === id)) continue
    game.collection.push(makeOwned(id))
  }
  game.energy = game.energyMax
  applyDebugGrants()
}
