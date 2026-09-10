import { SKILL_FX_SRC, tickCombatEarly, tickCombatLate } from './fx/combatFx'
import { tickChest } from './fx/chest'
import { tickReveal } from './fx/reveal'
import { tickAttack, tickIdle, tickPunch } from './fx/sheets'

export { campfireSheet, campfireUvs, chestWobble, loopSparksUvs, villagerSheet, villagerTalkUvs } from './fx/ambient'
export {
  dashState,
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
  facePoster,
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

/** What a fight draws that nothing else warms: the skill flipbooks. The
 * reveal, chest and ambient sheets bind on the screens that show them. (This
 * used to be every fx sheet: ~220 MB of 2048px textures bound on the hero
 * card, the report and the banner, which is what made pack openings lag.) */
export function allFxSrcs(): string[] {
  return Object.values(SKILL_FX_SRC)
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
