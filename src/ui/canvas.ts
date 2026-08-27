import { engine, UiCanvasInformation } from '@dcl/sdk/ecs'
import { STAGE_H, STAGE_W } from './theme'

// Live canvas metrics in virtual (stage) units, refreshed every frame from
// UiCanvasInformation. The SDK contain-fits the 1600x720 virtual screen, so
// the canvas is at least stage-sized and the stage sits centered with
// `gutterX`/`gutterY` of slack on each side. Hardware insets (notch, home
// indicator, rounded corners) arrive in canvas px and are converted here so
// stage-relative UI can dodge them.
export const canvasV = {
  /** Canvas size in virtual units (>= stage size on both axes). */
  w: STAGE_W,
  h: STAGE_H,
  /** Stage origin offset from the canvas edges (one of these is usually 0). */
  gutterX: 0,
  gutterY: 0,
  /** Device hardware insets in virtual units; all zero on desktop. */
  inset: { top: 0, left: 0, right: 0, bottom: 0 },
  /** Explorer HUD (chat, profile, ...) insets in virtual units. */
  hud: { top: 0, left: 0, right: 0, bottom: 0 },
  /** Raw canvas px and density, for the debug readout. */
  pxW: 0,
  pxH: 0,
  dpr: 1
}

export function startCanvasWatch() {
  engine.addSystem(() => {
    const info = UiCanvasInformation.getOrNull(engine.RootEntity)
    if (!info || info.width <= 0 || info.height <= 0) return
    const scale = Math.min(info.width / STAGE_W, info.height / STAGE_H)
    if (!Number.isFinite(scale) || scale <= 0) return
    canvasV.w = info.width / scale
    canvasV.h = info.height / scale
    canvasV.gutterX = (canvasV.w - STAGE_W) / 2
    canvasV.gutterY = (canvasV.h - STAGE_H) / 2
    const inset = info.screenInsetArea
    canvasV.inset.top = (inset?.top ?? 0) / scale
    canvasV.inset.left = (inset?.left ?? 0) / scale
    canvasV.inset.right = (inset?.right ?? 0) / scale
    canvasV.inset.bottom = (inset?.bottom ?? 0) / scale
    const hud = info.interactableArea
    canvasV.hud.top = (hud?.top ?? 0) / scale
    canvasV.hud.left = (hud?.left ?? 0) / scale
    canvasV.hud.right = (hud?.right ?? 0) / scale
    canvasV.hud.bottom = (hud?.bottom ?? 0) / scale
    canvasV.pxW = info.width
    canvasV.pxH = info.height
    canvasV.dpr = info.devicePixelRatio
  })
}
