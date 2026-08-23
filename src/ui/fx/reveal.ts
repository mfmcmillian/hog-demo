import { playLevelUp, playReveal } from '../../game/audio'
import { getDef } from '../../game/familiars'
import { game } from '../../game/store'
import { Rarity, XpLine } from '../../game/types'
import { cellUvs, ease, FX_FRAMES, RAY_FPS, SPARK_FPS } from './sheets'

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
    rarity === 'mythic' ? 580 : rarity === 'legendary' ? 520 : rarity === 'epic' ? 480 : rarity === 'rare' ? 440 : 400
  return {
    size,
    grow: Math.round((1 - slam) * -80 + pulse),
    flash: mythic && t < 0.35 ? 1 - t / 0.35 : legendary && t < 0.2 ? 0.55 * (1 - t / 0.2) : 0,
    rings: mythic ? 3 : legendary ? 2 : epic ? 1 : 0,
    ready: t > (mythic ? 0.7 : 0.35)
  }
}

export const RAY_SRC = 'images/fx/drop-rays-f.png'
export const BURST_SRC = 'images/fx/reveal-swirl-f.png'
export const SPARKS_SRC = 'images/fx/sparks-f.png'

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

export function tickReveal(dt: number) {
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
}
