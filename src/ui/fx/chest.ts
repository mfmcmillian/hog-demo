import { playChest } from '../../game/audio'
import { game } from '../../game/store'
import { gift } from '../../mp/views'
import { cellUvs, ease, RAY_FPS, SPARK_FPS } from './sheets'

// ---- shop chest ceremony ---------------------------------------------------
// SHAKE: the crate rattles harder and harder while a colored swirl glows up
// behind it. BURST: white flash, spark flipbook over the crate, light rays
// wheeling behind. Three sheets + procedural jitter, all on the same clock.
const CHEST_SHAKE = 0.8
const CHEST_BURST = 0.65 // 13 lid-opening frames at ~20fps
const CHEST_TAIL = 0.4 // hold the blazing open chest before the card reveal
let chestAge = -1

// Painted 4x4 lid-opening flipbooks, one per pack. Cells 0-2 are closed
// (used as the idle/rattle pose), 3-15 swing the lid open with light.
export const CHEST_OPEN_SRCS: Record<string, string> = {
  ember: 'images/fx/chest-open-ember-f.png',
  vow: 'images/fx/chest-open-vow-f.png',
  crown: 'images/fx/chest-open-crown-f.png',
  gift: 'images/fx/chest-open-gift-f.png'
}

export function chestOpenSheet(pack: string): string | undefined {
  return CHEST_OPEN_SRCS[pack]
}

export function chestOpenSrcs(): string[] {
  return Object.values(CHEST_OPEN_SRCS)
}

/** Started by tickFlipbook when game.chestOpening goes up (ACCEPT tapped). */
function startChestFx() {
  if (chestAge >= 0) return
  chestAge = 0
  playChest()
}

function chestClock(age: number, opts: { glowFloor: number; raysFloor: number; loopSparksWhenSettled: boolean }) {
  const active = age >= 0
  const t = Math.max(0, age)
  const shakeU = Math.min(1, t / CHEST_SHAKE)
  const inBurst = active && t >= CHEST_SHAKE
  const burstT = Math.max(0, t - CHEST_SHAKE)
  const burstU = Math.min(1, burstT / CHEST_BURST)
  const amp = active && !inBurst ? 1.5 + 9 * shakeU * shakeU : 0
  const settled = active && t >= CHEST_SHAKE + CHEST_BURST
  // closed frames 0-2 rattle during the shake; the lid opens across 3-15
  const chestCell = inBurst ? Math.min(15, 3 + Math.floor(burstT * 20)) : Math.floor(t * 8) % 3
  const sparksCell =
    opts.loopSparksWhenSettled && settled
      ? 12 + (Math.floor(burstT * 8) % 4)
      : Math.min(15, Math.floor(burstT * SPARK_FPS))
  return {
    active,
    settled,
    done: active && t >= CHEST_SHAKE + CHEST_BURST + CHEST_TAIL,
    jx: Math.round(Math.sin(t * 43) * amp),
    jy: Math.round(Math.cos(t * 61 + 1.7) * amp * 0.7),
    grow: inBurst ? Math.round(30 * (1 - ease(burstU))) : Math.round(8 * shakeU),
    glow: active ? (inBurst ? Math.max(opts.glowFloor, 1 - burstU) : ease(shakeU)) : 0,
    flash: inBurst && burstT < 0.14 ? 1 - burstT / 0.14 : 0,
    swirlUvs: cellUvs(Math.floor(t * 14) % 16),
    raysAlpha: inBurst ? Math.max(opts.raysFloor, 1 - ease(burstU)) : 0,
    raysUvs: cellUvs(Math.floor(burstT * RAY_FPS) % 16),
    sparks: inBurst,
    sparksUvs: cellUvs(sparksCell),
    chestUvs: cellUvs(chestCell)
  }
}

export function chestFx() {
  const clock = chestClock(chestAge, { glowFloor: 0, raysFloor: 0, loopSparksWhenSettled: false })
  return {
    active: clock.active,
    done: clock.done,
    jx: clock.jx,
    jy: clock.jy,
    grow: clock.grow,
    glow: clock.glow,
    flash: clock.flash,
    swirlUvs: clock.swirlUvs,
    raysAlpha: clock.raysAlpha,
    raysUvs: clock.raysUvs,
    sparks: clock.sparks,
    sparksUvs: clock.sparksUvs,
    chestUvs: clock.chestUvs
  }
}

// ---- gift ceremony -----------------------------------------------------------
// Same beat as the shop chest but self-clocked: it auto-plays when a gift
// arrives and then holds the blazing open chest until the player taps away.
let giftAge = -1
/** The gift object currently playing its ceremony, so a fresh gift restarts it. */
let lastGiftSeen: object | undefined

/** Started by tickFlipbook when a new gift.received lands. */
function startGiftFx() {
  giftAge = 0
  playChest()
}

export function stopGiftFx() {
  giftAge = -1
}

export function giftFx() {
  const clock = chestClock(giftAge, { glowFloor: 0.35, raysFloor: 0.3, loopSparksWhenSettled: true })
  return {
    active: clock.active,
    settled: clock.settled, // rewards fade in once the lid is fully open
    jx: clock.jx,
    jy: clock.jy,
    grow: clock.grow,
    glow: clock.glow,
    flash: clock.flash,
    swirlUvs: clock.swirlUvs,
    raysAlpha: clock.raysAlpha,
    raysUvs: clock.raysUvs,
    sparks: clock.sparks,
    sparksUvs: clock.sparksUvs,
    chestUvs: clock.chestUvs
  }
}

export function tickChest(dt: number) {
  // Chest ceremony runs only while the confirm dialog is up; a cancel or a
  // completed purchase (phase change) stops the clock. ACCEPT raises
  // game.chestOpening (from nav or the UI) and the clock starts here, so
  // game/ modules never import UI code.
  if (game.chestOpening && game.phase === 'shop' && game.pendingPack) startChestFx()
  if (chestAge >= 0) {
    if (game.phase !== 'shop' || !game.pendingPack) chestAge = -1
    else chestAge += dt
  }
  if (game.phase !== 'shop' || !game.pendingPack) game.chestOpening = false

  // A new incoming gift auto-plays its ceremony; the overlay stops the clock
  // on dismiss (stopGiftFx) when it clears gift.received.
  if (gift.received && gift.received !== lastGiftSeen) {
    lastGiftSeen = gift.received
    startGiftFx()
  }
  if (!gift.received) lastGiftSeen = undefined
  if (giftAge >= 0) giftAge += dt
}
