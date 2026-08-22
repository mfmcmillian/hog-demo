import {
  AvatarModifierArea,
  AvatarModifierType,
  CameraModeArea,
  CameraType,
  Material,
  MeshRenderer,
  Transform,
  engine
} from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'

const ink = Color4.create(0.07, 0.045, 0.06, 1)

function wall(x: number, y: number, z: number, w: number, h: number, rotY = 0, rotX = 0) {
  const e = engine.addEntity()
  Transform.create(e, {
    position: Vector3.create(x, y, z),
    rotation: Quaternion.fromEulerDegrees(rotX, rotY, 0),
    scale: Vector3.create(w, h, 1)
  })
  MeshRenderer.setPlane(e)
  Material.setBasicMaterial(e, { diffuseColor: ink })
}

/** Hide avatars and wrap the spawn in a dark box so the 2D UI sits on a
 *  field without a tap-blocking full-screen overlay. */
export function createShell() {
  const hide = engine.addEntity()
  Transform.create(hide, { position: Vector3.create(16, 8, 16) })
  AvatarModifierArea.create(hide, {
    area: Vector3.create(80, 40, 80),
    modifiers: [
      AvatarModifierType.AMT_HIDE_AVATARS,
      AvatarModifierType.AMT_DISABLE_PASSPORTS,
      AvatarModifierType.AMT_HIDE_NAMETAGS
    ],
    excludeIds: []
  })

  const cam = engine.addEntity()
  Transform.create(cam, { position: Vector3.create(16, 8, 16) })
  CameraModeArea.create(cam, {
    area: Vector3.create(80, 40, 80),
    mode: CameraType.CT_FIRST_PERSON
  })

  engine.addSystem(() => {
    if (!Transform.has(engine.PlayerEntity)) return
    const pos = Transform.get(engine.PlayerEntity).position
    const hideT = Transform.getMutable(hide)
    hideT.position = Vector3.create(pos.x, pos.y + 1, pos.z)
    const camT = Transform.getMutable(cam)
    camT.position = Vector3.create(pos.x, pos.y + 1, pos.z)
  })

  wall(16, 8, 31.5, 32, 20, 0)
  wall(16, 8, 0.5, 32, 20, 180)
  wall(0.5, 8, 16, 32, 20, 90)
  wall(31.5, 8, 16, 32, 20, -90)
  wall(16, 0.05, 16, 32, 32, 0, -90)
  wall(16, 16, 16, 32, 32, 0, 90)
}
