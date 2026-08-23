import { CAMPFIRE_SRC, VILLAGER_SRC } from './fx/ambient'
import { SKILL_FX_SRC, tickCombatEarly, tickCombatLate } from './fx/combatFx'
import { CHEST_OPEN_SRCS, tickChest } from './fx/chest'
import { BURST_SRC, RAY_SRC, SPARKS_SRC, tickReveal } from './fx/reveal'
import { tickAttack, tickIdle, tickPunch } from './fx/sheets'

export { campfireSheet, campfireUvs, chestWobble, loopSparksUvs, villagerSheet, villagerTalkUvs } from './fx/ambient'
export {
  dmgPops,
  foeLungeAmt,
  shownHp,
  skillFxSheet,
  skillFxUvs,
  SKILL_FX_KINDS,
  SKILL_FX_SRC,
  unitHit,
  unitSkillFx
} from './fx/combatFx'
export { chestFx, chestOpenSheet, chestOpenSrcs, giftFx, stopGiftFx } from './fx/chest'
export {
  dropFx,
  dropRaySheet,
  dropRayUvs,
  reportFx,
  revealBurstSheet,
  revealBurstUvs,
  revealFx,
  revealReady,
  skipReveal,
  sparksSheet,
  starBurstFx
} from './fx/reveal'
export {
  allSheetSrcs,
  heroPoster,
  idleMotion,
  idlePoster,
  isPlaying,
  playAttack,
  posterDrive,
  posterPunch,
  sheetSrcOf,
  stopAttack
} from './fx/sheets'

export function allFxSrcs(): string[] {
  return [
    ...Object.values(SKILL_FX_SRC),
    RAY_SRC,
    BURST_SRC,
    SPARKS_SRC,
    CAMPFIRE_SRC,
    VILLAGER_SRC,
    ...Object.values(CHEST_OPEN_SRCS)
  ]
}

export function tickFlipbook(dt: number) {
  tickPunch(dt)
  tickCombatEarly(dt)
  tickReveal(dt)
  tickChest(dt)
  tickIdle(dt)
  tickAttack(dt)
  tickCombatLate()
}
