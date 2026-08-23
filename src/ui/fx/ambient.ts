import { cellUvs, getIdleTime } from './sheets'

/** Looping ember sparks for ambient celebration (realm goal complete). */
export function loopSparksUvs(): number[] {
  return cellUvs(Math.floor(getIdleTime() * 14) % 16)
}

export const CAMPFIRE_SRC = 'images/fx/campfire-f.png'

export function campfireSheet(): string {
  return CAMPFIRE_SRC
}

/** Endless village campfire loop for the home field. */
export function campfireUvs(): number[] {
  return cellUvs(Math.floor(getIdleTime() * 12) % 16)
}

// Village elder quest dialog: standard 2048 sheet, 4x4 of 512. The 16 cells
// are one continuous talking cycle authored to flow back into cell 0.
export const VILLAGER_SRC = 'images/chars/villager-sheet-b.png'
const VILLAGER_FPS = 8

export function villagerSheet(): string {
  return VILLAGER_SRC
}

/** Seamless talking loop for the campfire elder. */
export function villagerTalkUvs(): number[] {
  return cellUvs(Math.floor(getIdleTime() * VILLAGER_FPS) % 16)
}

/** Brief "something is alive in there" rattle on the focused shop card. */
export function chestWobble(): { jx: number; jy: number } {
  const idleTime = getIdleTime()
  const cyc = idleTime % 2.8
  const amp = cyc < 0.42 ? (1 - cyc / 0.42) * 3.2 : 0
  return {
    jx: Math.round(Math.sin(idleTime * 46) * amp),
    jy: Math.round(Math.cos(idleTime * 57) * amp * 0.6)
  }
}
