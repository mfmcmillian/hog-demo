import { AssetLoad, engine, executeTask } from '@dcl/sdk/ecs'
import { boot } from '../game/boot'
import { allFxSrcs, allSheetSrcs } from './flipbook'
import { allHallSrcs, cardBackArt } from './halls'
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
  'images/ads/koa-b.png',
  'images/ads/decentracraft-b.png',
  'sounds/fx/rift-c.mp3',
  cardBackArt().src
]

function uniqueSrcs(): string[] {
  const seen: Record<string, true> = {}
  const out: string[] = []
  for (const src of [
    ...Object.values(LABELS).map((info) => info.src),
    ...allHallSrcs(),
    ...allSheetSrcs(),
    ...allFxSrcs(),
    ...EXTRA
  ]) {
    if (!src || seen[src]) continue
    seen[src] = true
    out.push(src)
  }
  return out
}

export const PRELOAD_SRCS = uniqueSrcs()
boot.total = PRELOAD_SRCS.length

function markFilled() {
  if (boot.filled) return
  boot.loaded = boot.total
  boot.filled = true
}

export function startPreload() {
  const holder = engine.addEntity()
  AssetLoad.create(holder, { assets: PRELOAD_SRCS })

  executeTask(async () => {
    const first = BOOT_SRCS
    const rest = PRELOAD_SRCS.filter((src) => first.indexOf(src) === -1)
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
