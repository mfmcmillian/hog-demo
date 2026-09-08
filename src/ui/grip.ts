import { DEBUG } from '../game/debug'

// How the player holds the screen. Every composition is authored for the
// portrait grip: a 1600x720 landscape canvas whose art is pre-rotated 90 CCW,
// read with the phone turned upright (physical top = canvas left). On a
// desktop monitor nobody turns their head, so the same tree is re-expressed
// upright at draw time (see ui.tsx): the virtual canvas becomes 720x1600, the
// art's UVs are turned back, and every flex axis / edge is remapped. No
// screen code changes; the phone path is byte-identical.
export type Grip = 'portrait' | 'landscape'

/** Decided once at boot (detectGrip) before the UI renderer mounts. */
export const view = { grip: 'portrait' as Grip }

export function landscape(): boolean {
  return view.grip === 'landscape'
}

/** Desktop and web explorers get the upright layout; phones (and anything
 * we can't identify in time) keep the portrait grip. */
export async function detectGrip(): Promise<void> {
  if (DEBUG.forceGrip) {
    view.grip = DEBUG.forceGrip
    return
  }
  try {
    const { getExplorerInformation } = await import('~system/Runtime')
    const timeout = new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 1500))
    const info = await Promise.race([getExplorerInformation({}), timeout])
    const platform = info?.platform ?? ''
    if (platform === 'desktop' || platform === 'web') view.grip = 'landscape'
  } catch {
    // Older explorer without the API: stay portrait.
  }
}
