import { Color4 } from '@dcl/sdk/math'

// Tactile button feedback: a tap pushes the visual fully in on the same
// frame, holds a beat, then springs back out. Driven off Date.now() like
// PhaseFade — the UI re-renders every frame, so no tick hookup is needed.
// Only one button can be depressed at a time (taps are serial anyway).
const PRESS_MS = 150
const HOLD = 0.4
const SHRINK = 0.08
const DIM = 0.3

let pressedId = ''
let pressedAt = 0

/** Wrap a tap handler so the owning widget renders itself pushed in. */
export function press(id: string, handler?: () => void): (() => void) | undefined {
  if (!handler) return undefined
  return () => {
    pressedId = id
    pressedAt = Date.now()
    handler()
  }
}

/** 0..1 push-in amount for a button id (1 = fully pressed). */
export function pressAmt(id: string): number {
  if (id !== pressedId) return 0
  const t = (Date.now() - pressedAt) / PRESS_MS
  if (t >= 1) return 0
  return t < HOLD ? 1 : 1 - (t - HOLD) / (1 - HOLD)
}

/** Pixels to shave off a `size`-wide visual while pressed. */
export function pressShrink(id: string, size: number): number {
  return Math.round(size * SHRINK * pressAmt(id))
}

/** `base` (default white) darkened by the press; alpha untouched. */
export function pressTint(id: string, base?: Color4): Color4 {
  const b = base ?? Color4.White()
  const amt = pressAmt(id)
  if (amt <= 0) return b
  const d = 1 - DIM * amt
  return Color4.create(b.r * d, b.g * d, b.b * d, b.a)
}
