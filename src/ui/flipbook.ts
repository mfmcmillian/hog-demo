import { playChest, playLevelUp, playReveal, playSkill } from '../game/audio'
import { getDef } from '../game/familiars'
import { game } from '../game/state'
import { BattleFx, Rarity, XpLine } from '../game/types'

// Heroes of Genesis sprite sheets. Animation only shifts UVs on the same
// bound texture, so there is no per-frame texture swap.
const SHEETS: Record<string, string> = {
  hallwarden: 'images/chars/hallwarden-sheet-f.png',
  'sigil-witch': 'images/chars/sigil-witch-sheet-f.png',
  crowmark: 'images/chars/crowmark-sheet-f.png',
  blaze: 'images/chars/blaze-sheet-f.png',
  rook: 'images/chars/rook-sheet-f.png',
  voss: 'images/chars/voss-sheet-f.png',
  kite: 'images/chars/kite-sheet-f.png',
  hexa: 'images/chars/hexa-sheet-f.png',
  siphon: 'images/chars/siphon-sheet-f.png',
  lyra: 'images/chars/lyra-sheet-f.png',
  pax: 'images/chars/pax-sheet-f.png',
  garr: 'images/chars/garr-sheet-f.png',
  nova: 'images/chars/nova-sheet-f.png',
  'ash-hound': 'images/chars/ash-hound-sheet-f.png',
  'cinder-wight': 'images/chars/cinder-wight-sheet-f.png',
  'lamp-imp': 'images/chars/lamp-imp-sheet-f.png',
  'moor-ogre': 'images/chars/moor-ogre-sheet-f.png',
  'moor-crow': 'images/chars/moor-crow-sheet-g.png',
  'grave-pike': 'images/chars/grave-pike-sheet-f.png',
  'rust-ballista': 'images/chars/rust-ballista-sheet-f.png',
  'thorn-queen': 'images/chars/thorn-queen-sheet-f.png',
  'veil-sister': 'images/chars/veil-sister-sheet-f.png',
  'blood-leech': 'images/chars/blood-leech-sheet-f.png',
  'dusk-oracle': 'images/chars/dusk-oracle-sheet-f.png',
  'crimson-abbot': 'images/chars/crimson-abbot-sheet-f.png',
  'oath-knight': 'images/chars/oath-knight-sheet-f.png',
  'night-covenant': 'images/chars/night-covenant-sheet-f.png',
  'pale-howl': 'images/chars/pale-howl-sheet-f.png',
  'ashen-regent': 'images/chars/ashen-regent-sheet-f.png',
  'frost-monarch': 'images/chars/frost-monarch-sheet-f.png',
  'ether-assassin': 'images/chars/ether-assassin-sheet-f.png',
  'wasteland-monarch': 'images/chars/wasteland-monarch-sheet-f.png'
}

const FULL16 = new Set([
  'blaze',
  'rook',
  'voss',
  'kite',
  'hexa',
  'siphon',
  'lyra',
  'pax',
  'garr',
  'nova',
  'ash-hound',
  'cinder-wight',
  'lamp-imp',
  'moor-ogre',
  'moor-crow',
  'grave-pike',
  'rust-ballista',
  'thorn-queen',
  'veil-sister',
  'blood-leech',
  'dusk-oracle',
  'crimson-abbot',
  'oath-knight',
  'night-covenant',
  'pale-howl',
  'ashen-regent',
  'hallwarden',
  'sigil-witch',
  'crowmark',
  'frost-monarch',
  'ether-assassin',
  'wasteland-monarch'
])

// 2048x2048 power-of-two sheet, 4x4 grid of 512px cells.
// Starter 8-cell layout (pre-collectible): 0 idle (original oath poster),
// 1 atk0, 2 tween, 3 atk1, 4 tween, 5 atk2, 6 tween, 7 atk3.
const COLS = 4
const ROWS = 4
const SWING = [1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2]
const STEP_TIME = [0.14, 0.08, 0.07, 0.06, 0.05, 0.05, 0.12, 0.07, 0.07, 0.08, 0.09, 0.11]
const IMPACT_STEP = 6 // full extension (cell 7)
const SWING16 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
const STEP_TIME16 = [
  0.07, 0.06, 0.06, 0.08,
  0.055, 0.055, 0.055, 0.055,
  0.12,
  0.06, 0.065, 0.07, 0.07, 0.075, 0.08, 0.09
]
const IMPACT16 = 8
const DRIVE16 = [
  0, -4, -8, -12,
  -8, 0, 12, 26,
  42,
  30, 20, 12, 8, 5, 2, 1, 0
]

// Continuous whole-poster motion, sampled per render tick (not per frame):
// px of "lunge" at the START of each step, linearly eased between steps.
// Negative = lean back, positive = drive forward. The eye tracks this
// smooth glide, so the discrete pose flips read as detail, not chop.
const DRIVE = [
  0, -8, -12, -10, 0, 16, 42,
  30, 16, 8, 4, 2, 0
]
const IDLE_CELL = 0

const PUNCH_DECAY = 5 // impact accent fades in ~0.2s
export const SKILL_FX_KINDS: BattleFx[] = ['strike', 'drain', 'rally', 'volley', 'bolt']
export const SKILL_FX_SRC: Record<BattleFx, string> = {
  bolt: 'images/fx/bolt-f.png',
  strike: 'images/fx/strike-g.png',
  drain: 'images/fx/drain-g.png',
  rally: 'images/fx/rally-g.png',
  volley: 'images/fx/volley-g.png'
}
const FX_FPS = 20
const FX_FRAMES = 16
const FX_LIFE = FX_FRAMES / FX_FPS

let playingId = ''
let step = 0
let frameWait = 0
let punch = 0
let idleTime = 0
let idleWeight = 1 // fades out during the attack so motions don't stack
let lastActing = ''
let hitUids: string[] = []
let hit = 0
let pendingHitUids: string[] = []
let pendingFx: BattleFx | '' = ''
let pendingFxUids: string[] = []
let foeLunge = 0
let fxKind: BattleFx | '' = ''
let fxUids: string[] = []
let fxAge = -1
let popSeq = 0
const POP_LIFE = 0.85
const pops: { id: number; uid: string; amount: number; age: number }[] = []
let reportAge = -1
let dropAge = -1
let revealAge = -1
let revealSkip = false
let levelBurst = 0
let overflowPopped = false

const REVEAL_RISE = 0.75
const REVEAL_FLIP = 0.45
const REVEAL_BURST = 0.7

function revealHold(rarity: Rarity) {
  if (rarity === 'mythic') return 2.2
  if (rarity === 'legendary') return 1.8
  if (rarity === 'epic') return 1.4
  if (rarity === 'rare') return 1.1
  return 0.85
}

function revealEnd(rarity: Rarity) {
  return REVEAL_RISE + revealHold(rarity) + REVEAL_FLIP + REVEAL_BURST
}

export function skipReveal() {
  revealSkip = true
}

export function revealReady() {
  if (!game.reveal || game.phase !== 'heroCard') return true
  if (revealSkip) return true
  return revealAge >= revealEnd(getDef(game.reveal.defId).rarity)
}

export function revealFx(rarity: Rarity) {
  const t = revealSkip ? revealEnd(rarity) : Math.max(0, revealAge)
  const hold = revealHold(rarity)
  const riseEnd = REVEAL_RISE
  const holdEnd = riseEnd + hold
  const flipEnd = holdEnd + REVEAL_FLIP
  const burstEnd = flipEnd + REVEAL_BURST
  const ready = t >= burstEnd
  const restLeft = 28
  const restTop = 30
  const restW = 44
  const restH = 40
  let left = restLeft
  let top = restTop
  let w = restW
  let h = restH
  let showFace = false
  let glow = 0
  let flash = 0

  if (t < riseEnd) {
    const u = ease(t / riseEnd)
    const over = u * u * (1.08 - 0.08 * u)
    left = 96 + (restLeft - 4 - 96) * over
    if (u > 0.85) left = restLeft - 4 + 4 * ease((u - 0.85) / 0.15)
    const scale = 0.7 + 0.35 * u
    w = restW * scale
    h = restH * scale
    left += (restW - w) / 2
    top += (restH - h) / 2
  } else if (t < holdEnd) {
    const u = (t - riseEnd) / hold
    glow = ease(u)
    top = restTop + Math.sin(t * 3.1) * 1.4
    w = restW
    h = restH
    left = restLeft
  } else if (t < flipEnd) {
    const u = (t - holdEnd) / REVEAL_FLIP
    showFace = u >= 0.5
    const squash = u < 0.5 ? 1 - ease(u / 0.5) : ease((u - 0.5) / 0.5)
    h = Math.max(1.2, restH * squash)
    w = restW
    left = restLeft
    top = restTop + (restH - h) / 2
    glow = 1
    flash = 1 - Math.abs(u - 0.5) * 2
  } else if (t < burstEnd) {
    const u = ease((t - flipEnd) / REVEAL_BURST)
    showFace = true
    left = restLeft * (1 - u)
    top = restTop * (1 - u)
    w = restW + (100 - restW) * u
    h = restH + (100 - restH) * u
    flash = rarity === 'mythic' ? 0.55 * (1 - u) : rarity === 'legendary' ? 0.35 * (1 - u) : 0.2 * (1 - u)
    glow = 1 - u
  } else {
    showFace = true
    left = 0
    top = 0
    w = 100
    h = 100
  }

  const legend = rarity === 'legendary' || rarity === 'mythic'
  const showBurst = legend && t >= holdEnd
  const rayScale = rarity === 'mythic' ? 3 : rarity === 'legendary' ? 2.2 : 1.4

  return { t, ready, showFace, showBurst, rayScale, flash, glow, left, top, w, h }
}

function ease(t: number) {
  const u = Math.min(1, Math.max(0, t))
  return u * u * (3 - 2 * u)
}

// ---- shop chest ceremony ---------------------------------------------------
// SHAKE: the crate rattles harder and harder while a colored swirl glows up
// behind it. BURST: white flash, spark flipbook over the crate, light rays
// wheeling behind. Three sheets + procedural jitter, all on the same clock.
const CHEST_SHAKE = 0.8
const CHEST_BURST = 0.65 // 13 lid-opening frames at ~20fps
const CHEST_TAIL = 0.4 // hold the blazing open chest before the card reveal
const SPARK_FPS = 26
let chestAge = -1

// Painted 4x4 lid-opening flipbooks, one per pack. Cells 0-2 are closed
// (used as the idle/rattle pose), 3-15 swing the lid open with light.
const CHEST_OPEN_SRCS: Record<string, string> = {
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

export function sheetSrcOf(id: string): string | undefined {
  return SHEETS[id]
}

export function startChestFx() {
  if (chestAge >= 0) return
  chestAge = 0
  playChest()
}

export function chestFxActive(): boolean {
  return chestAge >= 0
}

export function chestFx() {
  const active = chestAge >= 0
  const t = Math.max(0, chestAge)
  const shakeU = Math.min(1, t / CHEST_SHAKE)
  const inBurst = active && t >= CHEST_SHAKE
  const burstT = Math.max(0, t - CHEST_SHAKE)
  const burstU = Math.min(1, burstT / CHEST_BURST)
  const amp = active && !inBurst ? 1.5 + 9 * shakeU * shakeU : 0
  // closed frames 0-2 rattle during the shake; the lid opens across 3-15
  const chestCell = inBurst ? Math.min(15, 3 + Math.floor(burstT * 20)) : Math.floor(t * 8) % 3
  return {
    active,
    done: active && t >= CHEST_SHAKE + CHEST_BURST + CHEST_TAIL,
    jx: Math.round(Math.sin(t * 43) * amp),
    jy: Math.round(Math.cos(t * 61 + 1.7) * amp * 0.7),
    grow: inBurst ? Math.round(30 * (1 - ease(burstU))) : Math.round(8 * shakeU),
    glow: active ? (inBurst ? 1 - burstU : ease(shakeU)) : 0,
    flash: inBurst && burstT < 0.14 ? 1 - burstT / 0.14 : 0,
    swirlUvs: cellUvs(Math.floor(t * 14) % 16),
    raysAlpha: inBurst ? 1 - ease(burstU) : 0,
    raysUvs: cellUvs(Math.floor(burstT * RAY_FPS) % 16),
    sparks: inBurst,
    sparksUvs: cellUvs(Math.min(15, Math.floor(burstT * SPARK_FPS))),
    chestUvs: cellUvs(chestCell)
  }
}

// ---- gift ceremony -----------------------------------------------------------
// Same beat as the shop chest but self-clocked: it auto-plays when a gift
// arrives and then holds the blazing open chest until the player taps away.
let giftAge = -1

export function startGiftFx() {
  giftAge = 0
  playChest()
}

export function stopGiftFx() {
  giftAge = -1
}

export function giftFx() {
  const active = giftAge >= 0
  const t = Math.max(0, giftAge)
  const shakeU = Math.min(1, t / CHEST_SHAKE)
  const inBurst = active && t >= CHEST_SHAKE
  const burstT = Math.max(0, t - CHEST_SHAKE)
  const burstU = Math.min(1, burstT / CHEST_BURST)
  const amp = active && !inBurst ? 1.5 + 9 * shakeU * shakeU : 0
  const settled = active && t >= CHEST_SHAKE + CHEST_BURST
  const chestCell = inBurst ? Math.min(15, 3 + Math.floor(burstT * 20)) : Math.floor(t * 8) % 3
  return {
    active,
    settled, // rewards fade in once the lid is fully open
    jx: Math.round(Math.sin(t * 43) * amp),
    jy: Math.round(Math.cos(t * 61 + 1.7) * amp * 0.7),
    grow: inBurst ? Math.round(30 * (1 - ease(burstU))) : Math.round(8 * shakeU),
    glow: active ? (inBurst ? Math.max(0.35, 1 - burstU) : ease(shakeU)) : 0,
    flash: inBurst && burstT < 0.14 ? 1 - burstT / 0.14 : 0,
    swirlUvs: cellUvs(Math.floor(t * 14) % 16),
    raysAlpha: inBurst ? Math.max(0.3, 1 - ease(burstU)) : 0,
    raysUvs: cellUvs(Math.floor(burstT * RAY_FPS) % 16),
    sparks: inBurst,
    sparksUvs: cellUvs(settled ? 12 + (Math.floor(burstT * 8) % 4) : Math.min(15, Math.floor(burstT * SPARK_FPS))),
    chestUvs: cellUvs(chestCell)
  }
}

/** Looping ember sparks for ambient celebration (realm goal complete). */
export function loopSparksUvs(): number[] {
  return cellUvs(Math.floor(idleTime * 14) % 16)
}

const CAMPFIRE_SRC = 'images/fx/campfire-f.png'

export function campfireSheet(): string {
  return CAMPFIRE_SRC
}

/** Endless village campfire loop for the home field. */
export function campfireUvs(): number[] {
  return cellUvs(Math.floor(idleTime * 12) % 16)
}

// Village elder quest dialog: standard 2048 sheet, 4x4 of 512. The 16 cells
// are one continuous talking cycle authored to flow back into cell 0.
const VILLAGER_SRC = 'images/chars/villager-sheet-b.png'
const VILLAGER_FPS = 8

export function villagerSheet(): string {
  return VILLAGER_SRC
}

/** Seamless talking loop for the campfire elder. */
export function villagerTalkUvs(): number[] {
  return cellUvs(Math.floor(idleTime * VILLAGER_FPS) % 16)
}

/** Brief "something is alive in there" rattle on the focused shop card. */
export function chestWobble(): { jx: number; jy: number } {
  const cyc = idleTime % 2.8
  const amp = cyc < 0.42 ? (1 - cyc / 0.42) * 3.2 : 0
  return {
    jx: Math.round(Math.sin(idleTime * 46) * amp),
    jy: Math.round(Math.cos(idleTime * 57) * amp * 0.6)
  }
}

const BAR_IN = 0.7
const BAR_REST = 0.5

export function reportFx(line: XpLine): {
  bar: number
  xp: number
  level: number
  burst: number
  ranked: boolean
  showSeal: boolean
  showStats: boolean
} {
  const ranked = line.levels > 0
  const age = Math.max(0, reportAge)
  const start = line.needBefore > 0 ? line.xpBefore / line.needBefore : 0
  const end = line.needAfter > 0 ? line.xpAfter / line.needAfter : 0
  const xp = Math.round(game.lastXp * ease(age / 0.4))
  if (!ranked) {
    return {
      bar: start + (end - start) * ease(age / BAR_IN),
      xp,
      level: line.levelAfter,
      burst: 0,
      ranked: false,
      showSeal: false,
      showStats: false
    }
  }
  if (age < BAR_IN) {
    return {
      bar: start + (1 - start) * ease(age / BAR_IN),
      xp,
      level: line.levelBefore,
      burst: 0,
      ranked: true,
      showSeal: false,
      showStats: false
    }
  }
  return {
    bar: end * ease((age - BAR_IN) / BAR_REST),
    xp: game.lastXp,
    level: line.levelAfter,
    burst: levelBurst,
    ranked: true,
    showSeal: true,
    showStats: true
  }
}

export function dropFx(rarity: Rarity): {
  size: number
  grow: number
  flash: number
  rings: number
  ready: boolean
} {
  const t = Math.max(0, dropAge)
  const slam = ease(Math.min(1, t / 0.28))
  const mythic = rarity === 'mythic'
  const legendary = rarity === 'legendary'
  const epic = rarity === 'epic'
  const pulse = mythic || legendary ? 8 + 10 * Math.sin(t * 6) : epic ? 4 + 5 * Math.sin(t * 4) : 0
  const size =
    rarity === 'mythic' ? 580 :
    rarity === 'legendary' ? 520 :
    rarity === 'epic' ? 480 :
    rarity === 'rare' ? 440 :
    400
  return {
    size,
    grow: Math.round((1 - slam) * -80 + pulse),
    flash: mythic && t < 0.35 ? 1 - t / 0.35 : legendary && t < 0.2 ? 0.55 * (1 - t / 0.2) : 0,
    rings: mythic ? 3 : legendary ? 2 : epic ? 1 : 0,
    ready: t > (mythic ? 0.7 : 0.35)
  }
}

const RAY_SRC = 'images/fx/drop-rays-f.png'
const BURST_SRC = 'images/fx/reveal-swirl-f.png'
const SPARKS_SRC = 'images/fx/sparks-f.png'
const RAY_FPS = 16

export function allSheetSrcs(): string[] {
  return Object.values(SHEETS)
}

export function allFxSrcs(): string[] {
  return [...Object.values(SKILL_FX_SRC), RAY_SRC, BURST_SRC, SPARKS_SRC, CAMPFIRE_SRC, VILLAGER_SRC, ...Object.values(CHEST_OPEN_SRCS)]
}

export function sparksSheet(): string {
  return SPARKS_SRC
}

export function dropRaySheet(): string {
  return RAY_SRC
}

export function revealBurstSheet(): string {
  return BURST_SRC
}

export function revealBurstUvs(rarity: Rarity): number[] | undefined {
  if (rarity !== 'legendary' && rarity !== 'mythic') return undefined
  const fps = rarity === 'mythic' ? 16 : 12
  return cellUvs(Math.floor(Math.max(0, revealAge) * fps) % 16)
}

export function dropRayUvs(rarity: Rarity): number[] | undefined {
  if (rarity !== 'epic') return undefined
  const t = Math.max(0, revealAge)
  const cell = Math.floor(t * RAY_FPS * 0.4) % 16
  return cellUvs(cell)
}

// Fuse: hold the old star count, then play sparks-f as the new pip lands.
const STAR_HOLD = 0.28
const STAR_POP = 0.22
let starBurstAge = -1

export function starBurstFx(): {
  active: boolean
  shown: number
  popping: boolean
  pop: number
  sparks: boolean
  sparksUvs: number[]
  flash: number
} {
  const from = game.starBurstFrom
  const to = game.starBurstTo
  const armed = to > from && from > 0
  if (!armed) {
    return { active: false, shown: to, popping: false, pop: 0, sparks: false, sparksUvs: cellUvs(0), flash: 0 }
  }
  if (starBurstAge < 0) {
    return { active: true, shown: from, popping: false, pop: 0, sparks: false, sparksUvs: cellUvs(0), flash: 0 }
  }
  const t = starBurstAge
  const popping = t >= STAR_HOLD
  const burstT = Math.max(0, t - STAR_HOLD)
  const popU = popping ? Math.min(1, burstT / STAR_POP) : 0
  return {
    active: true,
    shown: popping ? to : from,
    popping,
    pop: popping ? 1 - ease(popU) : 0,
    sparks: popping && burstT < FX_FRAMES / SPARK_FPS,
    sparksUvs: cellUvs(Math.min(15, Math.floor(burstT * SPARK_FPS))),
    flash: popping && burstT < 0.12 ? 1 - burstT / 0.12 : 0
  }
}

// The sim applies damage the instant a turn resolves, but the swing takes a
// beat to reach its impact frame. These hold the PRE-hit hp per unit until
// the impact lands, so the bar drops together with the blow.
const hpHold = new Map<string, number>()

/** Arena-displayed hp for a unit: the real value, or the pre-hit hold mid-swing. */
export function shownHp(uid: string, actual: number): number {
  return hpHold.get(uid) ?? actual
}

function holdHp() {
  hpHold.clear()
  if (!game.battle) return
  const dmg = game.battle.damage
  if (dmg <= 0) return
  const everyone = [...game.battle.you, ...game.battle.foe]
  for (const uid of pendingHitUids) {
    const target = everyone.find((unit) => unit.uid === uid)
    if (target) hpHold.set(uid, Math.min(target.maxHp, target.hp + dmg))
  }
  // Drain also healed the actor up front; hold their bar at the pre-steal value.
  if (game.battle.fx === 'drain') {
    const actor = everyone.find((unit) => unit.uid === game.battle?.actingUid)
    if (actor) hpHold.set(actor.uid, Math.max(1, actor.hp - Math.floor(dmg * 0.35)))
  }
}

function spawnDmg(uid: string) {
  const amount = game.battle?.damage ?? 0
  if (!uid || amount <= 0) return
  popSeq += 1
  pops.push({ id: popSeq, uid, amount, age: 0 })
}

function strike(uids: string[]) {
  hpHold.clear()
  hitUids = uids.filter(Boolean)
  if (!hitUids.length) return
  hit = 1
  for (const uid of hitUids) spawnDmg(uid)
}

export function dmgPops(): { id: number; uid: string; amount: number; t: number }[] {
  return pops.map((pop) => ({
    id: pop.id,
    uid: pop.uid,
    amount: pop.amount,
    t: Math.min(1, pop.age / POP_LIFE)
  }))
}

function cellUvs(cell: number): number[] {
  const col = cell % COLS
  const row = Math.floor(cell / COLS)
  const u0 = col / COLS
  const u1 = (col + 1) / COLS
  const vTop = 1 - row / ROWS
  const vBottom = 1 - (row + 1) / ROWS
  // A(bottom-left) B(top-left) C(top-right) D(bottom-right)
  return [u0, vBottom, u0, vTop, u1, vTop, u1, vBottom]
}

// Cross-fading frames was tried here and looked like twitching: the poses
// differ too much, so the ghost double-exposure pulsed once per step.
// Clean single-frame stepping reads better for these dramatic swings.
function isFull16(id: string) {
  return FULL16.has(id)
}

function swingOf(id: string) {
  return isFull16(id) ? SWING16 : SWING
}

function stepTimeOf(id: string) {
  return isFull16(id) ? STEP_TIME16 : STEP_TIME
}

function impactOf(id: string) {
  return isFull16(id) ? IMPACT16 : IMPACT_STEP
}

function driveOf(id: string) {
  return isFull16(id) ? DRIVE16 : DRIVE
}

export function idlePoster(id: string): { src: string; uvs: number[] } | null {
  const src = SHEETS[id]
  if (!src) return null
  return { src, uvs: cellUvs(IDLE_CELL) }
}

/**
 * Sheet + frame for one drawn unit. `attacking` must be false for units that
 * merely share the actor's sheet (owning a foe's card and fighting that foe),
 * otherwise both copies play the swing in lockstep.
 */
export function heroPoster(id: string, attacking = true): { src: string; uvs: number[] } | null {
  const src = SHEETS[id]
  if (!src) return null
  const swing = swingOf(id)
  const cell = attacking && playingId === id ? (swing[step] ?? IDLE_CELL) : IDLE_CELL
  return { src, uvs: cellUvs(cell) }
}

// 0..1 strength of the impact accent, for scale/offset effects in the UI.
export function posterPunch(): number {
  return punch
}

// Smoothly interpolated lunge offset (px) for the current instant of the
// attack. Changes every render tick, unlike the stepped frames.
export function posterDrive(): number {
  if (!playingId) return 0
  const drive = driveOf(playingId)
  const times = stepTimeOf(playingId)
  const from = drive[step] ?? 0
  const to = drive[step + 1] ?? 0
  const dur = times[step] ?? 0.08
  let t = 1 - frameWait / dur
  t = Math.min(1, Math.max(0, t))
  t = t * t * (3 - 2 * t) // smoothstep: no velocity spikes at step edges
  return from + (to - from) * t
}

// Breathing idle: lift = physical up/down bob, sway = slow sideways drift,
// grow = px of scale pulse. All ease to zero while the attack plays.
// 0..1 hit recoil on a unit that just took damage.
export function unitHit(uid: string): number {
  return hitUids.includes(uid) ? hit : 0
}

export function unitSkillFx(uid: string): BattleFx | '' {
  if (fxAge < 0 || !fxKind || !fxUids.includes(uid)) return ''
  return fxKind
}

export function skillFxSheet(): string {
  return fxKind ? SKILL_FX_SRC[fxKind] : SKILL_FX_SRC.bolt
}

export function skillFxUvs(): number[] {
  const cell = Math.min(FX_FRAMES - 1, Math.floor(Math.max(0, fxAge) * FX_FPS))
  return cellUvs(cell)
}

// 0..1 lunge for a foe that has no attack sheet.
export function foeLungeAmt(): number {
  return foeLunge
}

export function idleMotion(): { lift: number; sway: number; grow: number } {
  const breath = Math.sin(idleTime * 1.7)
  return {
    lift: breath * 5 * idleWeight,
    sway: Math.sin(idleTime * 0.7 + 1.3) * 4 * idleWeight,
    grow: (breath * 0.5 + 0.5) * 7 * idleWeight
  }
}

export function playAttack(id: string) {
  if (!SHEETS[id]) return
  playingId = id
  step = 0
  frameWait = stepTimeOf(id)[0]
}

function startSkillFx(kind: BattleFx | '', uids: string[]) {
  if (!kind || !uids.length) return
  fxKind = kind
  fxUids = uids
  fxAge = 0
}

export function stopAttack() {
  if (pendingFx && pendingFxUids.length && fxAge < 0) startSkillFx(pendingFx, pendingFxUids)
  hpHold.clear()
  playingId = ''
  step = 0
  frameWait = 0
  pendingFx = ''
  pendingFxUids = []
}

export function isPlaying(id?: string): boolean {
  if (!playingId) return false
  return id ? playingId === id : true
}

export function tickFlipbook(dt: number) {
  if (punch > 0) punch = Math.max(0, punch - dt * PUNCH_DECAY)
  if (hit > 0) hit = Math.max(0, hit - dt * PUNCH_DECAY)
  if (foeLunge > 0) foeLunge = Math.max(0, foeLunge - dt * 3)
  if (fxAge >= 0) {
    fxAge += dt
    if (fxAge >= FX_LIFE) {
      fxAge = -1
      fxKind = ''
      fxUids = []
    }
  }
  for (let i = pops.length - 1; i >= 0; i--) {
    pops[i].age += dt
    if (pops[i].age >= POP_LIFE) pops.splice(i, 1)
  }
  if (game.phase !== 'battle' && pops.length) pops.length = 0
  if (levelBurst > 0) levelBurst = Math.max(0, levelBurst - dt * 1.8)
  if (game.phase === 'report') {
    if (reportAge < 0) reportAge = 0
    else reportAge += dt
    if (game.lastLevels > 0 && reportAge >= BAR_IN && !overflowPopped) {
      overflowPopped = true
      levelBurst = 1
      playLevelUp()
    }
  } else {
    reportAge = -1
    overflowPopped = false
    levelBurst = 0
  }
  if (game.phase === 'heroCard' && game.reveal) {
    if (revealAge < 0) {
      revealAge = 0
      revealSkip = false
      starBurstAge = -1
      playReveal(getDef(game.reveal.defId).rarity)
    } else revealAge += dt
    if (game.starBurstTo > game.starBurstFrom && revealReady()) {
      if (starBurstAge < 0) starBurstAge = 0
      else starBurstAge += dt
    }
  } else {
    revealAge = -1
    revealSkip = false
    starBurstAge = -1
  }
  dropAge = -1

  // Chest ceremony runs only while the confirm dialog is up; a cancel or a
  // completed purchase (phase change) stops the clock.
  if (chestAge >= 0) {
    if (game.phase !== 'shop' || !game.pendingPack) chestAge = -1
    else chestAge += dt
  }

  // The gift ceremony clock just runs; the overlay stops it on dismiss.
  if (giftAge >= 0) giftAge += dt

  idleTime += dt
  const idleTarget = playingId ? 0 : 1
  if (idleWeight !== idleTarget) {
    const dir = idleTarget > idleWeight ? 1 : -1
    idleWeight = Math.min(1, Math.max(0, idleWeight + dir * dt * 4))
  }

  if (playingId) {
    const swing = swingOf(playingId)
    const times = stepTimeOf(playingId)
    frameWait -= dt
    if (frameWait <= 0) {
      step += 1
      if (step >= swing.length) {
        stopAttack()
      } else {
        if (step === impactOf(playingId)) {
          punch = 1
          if (pendingHitUids.length) {
            strike(pendingHitUids)
            pendingHitUids = []
          }
        }
        frameWait = times[step] ?? 0.08
      }
    }
  }

  if ((game.phase === 'battle' || game.phase === 'rift') && game.battle) {
    if (!game.battle.actingUid && playingId) stopAttack()
    if (game.battle.actingUid && game.battle.actingUid !== lastActing) {
      lastActing = game.battle.actingUid
      const actor = [...game.battle.you, ...game.battle.foe].find((unit) => unit.uid === lastActing)
      const marked = game.battle.hitUids.length ? game.battle.hitUids : game.battle.targetUid ? [game.battle.targetUid] : []
      const flash = game.battle.fxUids.length ? game.battle.fxUids : marked
      if (actor && SHEETS[actor.defId]) {
        playAttack(actor.defId)
        pendingHitUids = marked
        holdHp()
        pendingFx = game.battle.fx ?? ''
        pendingFxUids = flash
        startSkillFx(pendingFx, flash)
        playSkill(pendingFx)
      } else {
        if (actor?.side === 'foe') foeLunge = 1
        startSkillFx(game.battle.fx ?? '', flash)
        playSkill(game.battle.fx)
        strike(marked)
      }
    }
    if (!game.battle.actingUid) lastActing = ''
    return
  }

  lastActing = ''
  if (playingId) stopAttack()
}
