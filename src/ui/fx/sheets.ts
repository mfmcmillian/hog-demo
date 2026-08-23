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
  0.07, 0.06, 0.06, 0.08, 0.055, 0.055, 0.055, 0.055, 0.12, 0.06, 0.065, 0.07, 0.07, 0.075, 0.08, 0.09
]
const IMPACT16 = 8
const DRIVE16 = [0, -4, -8, -12, -8, 0, 12, 26, 42, 30, 20, 12, 8, 5, 2, 1, 0]

// Continuous whole-poster motion, sampled per render tick (not per frame):
// px of "lunge" at the START of each step, linearly eased between steps.
// Negative = lean back, positive = drive forward. The eye tracks this
// smooth glide, so the discrete pose flips read as detail, not chop.
const DRIVE = [0, -8, -12, -10, 0, 16, 42, 30, 16, 8, 4, 2, 0]
const IDLE_CELL = 0

export const PUNCH_DECAY = 5 // impact accent fades in ~0.2s
export const FX_FRAMES = 16
export const SPARK_FPS = 26
export const RAY_FPS = 16

let playingId = ''
let step = 0
let frameWait = 0
let punch = 0
let idleTime = 0
let idleWeight = 1 // fades out during the attack so motions don't stack

export function ease(t: number) {
  const u = Math.min(1, Math.max(0, t))
  return u * u * (3 - 2 * u)
}

export function cellUvs(cell: number): number[] {
  const col = cell % COLS
  const row = Math.floor(cell / COLS)
  const u0 = col / COLS
  const u1 = (col + 1) / COLS
  const vTop = 1 - row / ROWS
  const vBottom = 1 - (row + 1) / ROWS
  // A(bottom-left) B(top-left) C(top-right) D(bottom-right)
  return [u0, vBottom, u0, vTop, u1, vTop, u1, vBottom]
}

export function sheetSrcOf(id: string): string | undefined {
  return SHEETS[id]
}

export function allSheetSrcs(): string[] {
  return Object.values(SHEETS)
}

export function getIdleTime() {
  return idleTime
}

// combatFx registers these so the impact frame and swing-end stay in sheets
// while strike() / pending skill FX stay in combatFx. Same tick, same order.
type AttackHooks = {
  onImpact: () => void
  onStop: () => void
}

let attackHooks: AttackHooks | undefined

export function setAttackHooks(hooks: AttackHooks) {
  attackHooks = hooks
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

export function stopAttack() {
  attackHooks?.onStop()
  playingId = ''
  step = 0
  frameWait = 0
}

export function isPlaying(id?: string): boolean {
  if (!playingId) return false
  return id ? playingId === id : true
}

export function tickPunch(dt: number) {
  if (punch > 0) punch = Math.max(0, punch - dt * PUNCH_DECAY)
}

export function tickIdle(dt: number) {
  idleTime += dt
  const idleTarget = playingId ? 0 : 1
  if (idleWeight !== idleTarget) {
    const dir = idleTarget > idleWeight ? 1 : -1
    idleWeight = Math.min(1, Math.max(0, idleWeight + dir * dt * 4))
  }
}

export function tickAttack(dt: number) {
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
          attackHooks?.onImpact()
        }
        frameWait = times[step] ?? 0.08
      }
    }
  }
}
