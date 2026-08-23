import { AssetLoad, engine, executeTask } from '@dcl/sdk/ecs'
import { boot } from '../game/boot'
import { HERO_IDS } from '../game/familiars'
import { allFxSrcs, allSheetSrcs, campfireSheet, sheetSrcOf } from './flipbook'
import { allHallSrcs, cardBackArt, hallSrc } from './halls'
import { LABELS } from './labels.gen'

const BOOT_SRCS = [
  'images/boot/keyart-a.png',
  'images/boot/logo-a.png',
  'images/boot/start-a.png',
  'images/boot/bar-frame-a.png',
  'images/boot/bar-fill-a.png',
  'images/boot/bar-head-a.png',
  'images/boot/spin-ring-a.png'
]

const EXTRA = [
  ...BOOT_SRCS,
  'images/maps/home-b.png',
  'images/maps/shop-b.png',
  'images/packs/ember-a.png',
  'images/packs/vow-a.png',
  'images/packs/crown-a.png',
  'images/hud/crown.png',
  'images/ads/koa-c.png',
  'images/ads/decentracraft-c.png',
  'sounds/fx/rift-c.mp3',
  cardBackArt().src
]

function uniq(srcs: string[]): string[] {
  const seen: Record<string, true> = {}
  const out: string[] = []
  for (const src of srcs) {
    if (!src || seen[src]) continue
    seen[src] = true
    out.push(src)
  }
  return out
}

// The boot gate waits for these only: boot art, every label/portrait the
// start + home screens draw, the three starter sheets and halls, and the
// campfire (visible the moment a returning player lands on home). Skill,
// reveal, and villager FX warm in the deferred pass right after the gate -
// the earliest any of them can appear is the oath clash, a few taps in.
// LABELS already covers the inspect and party halls.
export const CRITICAL_SRCS = uniq([
  ...BOOT_SRCS,
  ...Object.values(LABELS).map((info) => info.src),
  ...HERO_IDS.map((id) => sheetSrcOf(id) ?? ''),
  ...HERO_IDS.map((id) => hallSrc(id)),
  campfireSheet(),
  ...EXTRA
])

// Full set: collectible sheets, the rest of the halls, and the chest-open
// flipbooks warm in the background after the gate opens.
export const PRELOAD_SRCS = uniq([...CRITICAL_SRCS, ...allHallSrcs(), ...allSheetSrcs(), ...allFxSrcs()])

const DEFERRED_SRCS = PRELOAD_SRCS.filter((src) => CRITICAL_SRCS.indexOf(src) < 0)

boot.total = CRITICAL_SRCS.length

function markFilled() {
  if (boot.filled) return
  boot.loaded = boot.total
  boot.filled = true
}

export function startPreload() {
  const holder = engine.addEntity()
  AssetLoad.create(holder, { assets: CRITICAL_SRCS })

  executeTask(async () => {
    const first = BOOT_SRCS
    const rest = CRITICAL_SRCS.filter((src) => first.indexOf(src) === -1)
    const queue = [...first, ...rest]
    const chunk = 12
    let bootDone = 0
    for (let i = 0; i < queue.length; i += chunk) {
      const slice = queue.slice(i, i + chunk)
      await Promise.all(
        slice.map(async (src) => {
          try {
            await fetch(src)
          } catch {
            // Preview still binds the file from the hidden UI tiles.
          }
          if (!boot.ready) boot.loaded += 1
          if (BOOT_SRCS.indexOf(src) >= 0) {
            bootDone += 1
            if (bootDone >= BOOT_SRCS.length && !boot.artAt) boot.artAt = Date.now()
          }
        })
      )
    }
    if (!boot.artAt) boot.artAt = Date.now()

    // Critical art has landed; warm combat sheets, halls, and chest FX in
    // the background. Nothing gates on these.
    const lateHolder = engine.addEntity()
    AssetLoad.create(lateHolder, { assets: DEFERRED_SRCS })
    for (let i = 0; i < DEFERRED_SRCS.length; i += chunk) {
      await Promise.all(
        DEFERRED_SRCS.slice(i, i + chunk).map(async (src) => {
          try {
            await fetch(src)
          } catch {
            // Same as above: the hidden tiles still bind it eventually.
          }
        })
      )
    }
  })

  let waited = 0
  engine.addSystem((dt) => {
    if (boot.ready) return
    waited += dt
    boot.gate = Math.min(1, waited / 2.2)
    // Wait for the save answer too (8s cap) so a returning player never
    // taps through to the oath screen a beat before their save lands.
    const saveSettled = boot.saveKnown || waited >= 8
    if (boot.loaded >= boot.total && waited >= 2.2 && saveSettled) markFilled()
    else if (waited >= 22) markFilled()
  })
}
