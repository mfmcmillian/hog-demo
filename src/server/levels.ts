import { engine } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'
import { levelForXp } from '../game/level'
import { LEVELS_SYNC_ID, MpLevelsState } from '../mp/transport'
import { ServerCtx } from './ctx'

/**
 * Publishes every present player's account level (derived from the save the
 * server holds) on one synced entity, so clients can badge other players in
 * lobbies, trades and the gift list. Re-checked every couple of seconds and
 * only rewritten when something changed.
 */
export function setupLevels(ctx: ServerCtx): void {
  const entity = engine.addEntity()
  let revision = 0
  let lastJson = '{}'
  MpLevelsState.create(entity, { json: lastJson, revision })
  syncEntity(entity, [MpLevelsState.componentId], LEVELS_SYNC_ID)

  let wait = 0
  engine.addSystem((dt) => {
    wait += dt
    if (wait < 2) return
    wait = 0
    const levels: Record<string, number> = {}
    for (const address of ctx.present) {
      const save = ctx.saves.get(address)
      if (save) levels[address] = levelForXp(save.axp ?? 0)
    }
    const json = JSON.stringify(levels)
    if (json === lastJson) return
    lastJson = json
    revision += 1
    const state = MpLevelsState.getMutable(entity)
    state.json = json
    state.revision = revision
  })
}
