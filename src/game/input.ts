import { InputAction, PointerEventType, engine, inputSystem } from '@dcl/sdk/ecs'
import { back, padTappedRecently, primary, shiftMenu } from './nav'

export function tickInput() {
  if (!padTappedRecently()) {
    if (inputSystem.isTriggered(InputAction.IA_FORWARD, PointerEventType.PET_DOWN)) shiftMenu(-1)
    if (inputSystem.isTriggered(InputAction.IA_BACKWARD, PointerEventType.PET_DOWN)) shiftMenu(1)
    if (inputSystem.isTriggered(InputAction.IA_LEFT, PointerEventType.PET_DOWN)) shiftMenu(-1)
    if (inputSystem.isTriggered(InputAction.IA_RIGHT, PointerEventType.PET_DOWN)) shiftMenu(1)
  }
  if (inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN)) primary()
  if (inputSystem.isTriggered(InputAction.IA_SECONDARY, PointerEventType.PET_DOWN)) back()
}

export function startInput() {
  engine.addSystem(tickInput)
}
