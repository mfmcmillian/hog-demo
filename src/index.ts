import { isServer } from '@dcl/sdk/network'
// Synced components and room messages must register during initial module
// evaluation - the engine seals component definitions before main() runs.
// The transport module therefore loads statically on both server and client.
import './mp/transport'

export async function main() {
  if (isServer()) {
    // Headless authoritative server: owns saves, trades, and the Rift.
    // No rendering, UI or camera code loads here.
    const { startServer } = await import('./server/main')
    startServer()
    return
  }

  const { InputAction, InputModifier, TouchScreenControls, engine } = await import('@dcl/sdk/ecs')
  const { tickAudio } = await import('./game/audio')
  const { startInput } = await import('./game/input')
  const { tickBattle } = await import('./game/campaign')
  const { tickOverworld } = await import('./game/overworld')
  const { DEBUG } = await import('./game/debug')
  const { createShell } = await import('./scene/shell')
  const { tickFlipbook } = await import('./ui/flipbook')
  const { setupUi } = await import('./ui/screens')
  const { initMultiplayerSession } = await import('./mp/session')
  const { initNftHeroes } = await import('./game/nftHeroes')

  const CROWN = { tex: { $case: 'texture' as const, texture: { src: 'images/hud/crown.png' } } }

  function applyTouchHud() {
    const show = DEBUG.showPlayHud
    TouchScreenControls.createOrReplace(engine.RootEntity, {
      hideJoystick: true,
      hideCrosshair: true,
      touchInputs: [
        { inputAction: InputAction.IA_POINTER, hide: true },
        { inputAction: InputAction.IA_PRIMARY, hide: true },
        { inputAction: InputAction.IA_SECONDARY, hide: true },
        { inputAction: InputAction.IA_ACTION_3, hide: true },
        { inputAction: InputAction.IA_ACTION_4, hide: true },
        { inputAction: InputAction.IA_ACTION_5, hide: true },
        { inputAction: InputAction.IA_ACTION_6, hide: true },
        { inputAction: InputAction.IA_JUMP, hide: !show, icon: CROWN }
      ]
    })
  }

  createShell()
  setupUi()
  startInput()
  applyTouchHud()
  initMultiplayerSession()
  initNftHeroes()

  engine.addSystem((dt) => {
    tickBattle(dt)
    tickOverworld(dt)
    tickFlipbook(dt)
    tickAudio()
  })
  engine.addSystem(() => {
    InputModifier.createOrReplace(engine.PlayerEntity, {
      mode: InputModifier.Mode.Standard({
        disableWalk: true,
        disableRun: true,
        disableJog: true,
        disableJump: true,
        disableEmote: true
      })
    })
  })
}
