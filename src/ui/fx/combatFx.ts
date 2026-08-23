import { playSkill } from '../../game/audio'
import { game } from '../../game/store'
import { BattleFx } from '../../game/types'
import {
  cellUvs,
  FX_FRAMES,
  isPlaying,
  playAttack,
  PUNCH_DECAY,
  setAttackHooks,
  sheetSrcOf,
  stopAttack
} from './sheets'

export const SKILL_FX_KINDS: BattleFx[] = ['strike', 'drain', 'rally', 'volley', 'bolt']
export const SKILL_FX_SRC: Record<BattleFx, string> = {
  bolt: 'images/fx/bolt-f.png',
  strike: 'images/fx/strike-g.png',
  drain: 'images/fx/drain-g.png',
  rally: 'images/fx/rally-g.png',
  volley: 'images/fx/volley-g.png'
}
const FX_FPS = 20
const FX_LIFE = FX_FRAMES / FX_FPS

let lastActing = ''
let hitUids: string[] = []
let hit = 0
let pendingHitUids: string[] = []
let pendingFx: BattleFx | '' = ''
let pendingFxUids: string[] = []
let foeLunge = 0
let fxKind: BattleFx | '' = ''
let fxUids: string[] = []
let fxAge = -1
let popSeq = 0
const POP_LIFE = 0.85
const pops: { id: number; uid: string; amount: number; age: number }[] = []

// The sim applies damage the instant a turn resolves, but the swing takes a
// beat to reach its impact frame. These hold the PRE-hit hp per unit until
// the impact lands, so the bar drops together with the blow.
const hpHold = new Map<string, number>()

/** Arena-displayed hp for a unit: the real value, or the pre-hit hold mid-swing. */
export function shownHp(uid: string, actual: number): number {
  return hpHold.get(uid) ?? actual
}

function holdHp() {
  hpHold.clear()
  if (!game.battle) return
  const dmg = game.battle.damage
  if (dmg <= 0) return
  const everyone = [...game.battle.you, ...game.battle.foe]
  for (const uid of pendingHitUids) {
    const target = everyone.find((unit) => unit.uid === uid)
    if (target) hpHold.set(uid, Math.min(target.maxHp, target.hp + dmg))
  }
  // Drain also healed the actor up front; hold their bar at the pre-steal value.
  if (game.battle.fx === 'drain') {
    const actor = everyone.find((unit) => unit.uid === game.battle?.actingUid)
    if (actor) hpHold.set(actor.uid, Math.max(1, actor.hp - Math.floor(dmg * 0.35)))
  }
}

function spawnDmg(uid: string) {
  const amount = game.battle?.damage ?? 0
  if (!uid || amount <= 0) return
  popSeq += 1
  pops.push({ id: popSeq, uid, amount, age: 0 })
}

function strike(uids: string[]) {
  hpHold.clear()
  hitUids = uids.filter(Boolean)
  if (!hitUids.length) return
  hit = 1
  for (const uid of hitUids) spawnDmg(uid)
}

export function dmgPops(): { id: number; uid: string; amount: number; t: number }[] {
  return pops.map((pop) => ({
    id: pop.id,
    uid: pop.uid,
    amount: pop.amount,
    t: Math.min(1, pop.age / POP_LIFE)
  }))
}

// 0..1 hit recoil on a unit that just took damage.
export function unitHit(uid: string): number {
  return hitUids.includes(uid) ? hit : 0
}

export function unitSkillFx(uid: string): BattleFx | '' {
  if (fxAge < 0 || !fxKind || !fxUids.includes(uid)) return ''
  return fxKind
}

export function skillFxSheet(): string {
  return fxKind ? SKILL_FX_SRC[fxKind] : SKILL_FX_SRC.bolt
}

export function skillFxUvs(): number[] {
  const cell = Math.min(FX_FRAMES - 1, Math.floor(Math.max(0, fxAge) * FX_FPS))
  return cellUvs(cell)
}

// 0..1 lunge for a foe that has no attack sheet.
export function foeLungeAmt(): number {
  return foeLunge
}

function startSkillFx(kind: BattleFx | '', uids: string[]) {
  if (!kind || !uids.length) return
  fxKind = kind
  fxUids = uids
  fxAge = 0
}

setAttackHooks({
  onImpact() {
    if (pendingHitUids.length) {
      strike(pendingHitUids)
      pendingHitUids = []
    }
  },
  onStop() {
    if (pendingFx && pendingFxUids.length && fxAge < 0) startSkillFx(pendingFx, pendingFxUids)
    hpHold.clear()
    pendingFx = ''
    pendingFxUids = []
  }
})

export function tickCombatEarly(dt: number) {
  if (hit > 0) hit = Math.max(0, hit - dt * PUNCH_DECAY)
  if (foeLunge > 0) foeLunge = Math.max(0, foeLunge - dt * 3)
  if (fxAge >= 0) {
    fxAge += dt
    if (fxAge >= FX_LIFE) {
      fxAge = -1
      fxKind = ''
      fxUids = []
    }
  }
  for (let i = pops.length - 1; i >= 0; i--) {
    pops[i].age += dt
    if (pops[i].age >= POP_LIFE) pops.splice(i, 1)
  }
  if (game.phase !== 'battle' && pops.length) pops.length = 0
}

export function tickCombatLate() {
  if ((game.phase === 'battle' || game.phase === 'rift') && game.battle) {
    if (!game.battle.actingUid && isPlaying()) stopAttack()
    if (game.battle.actingUid && game.battle.actingUid !== lastActing) {
      lastActing = game.battle.actingUid
      const actor = [...game.battle.you, ...game.battle.foe].find((unit) => unit.uid === lastActing)
      const marked = game.battle.hitUids.length
        ? game.battle.hitUids
        : game.battle.targetUid
          ? [game.battle.targetUid]
          : []
      const flash = game.battle.fxUids.length ? game.battle.fxUids : marked
      if (actor && sheetSrcOf(actor.defId)) {
        playAttack(actor.defId)
        pendingHitUids = marked
        holdHp()
        pendingFx = game.battle.fx ?? ''
        pendingFxUids = flash
        startSkillFx(pendingFx, flash)
        playSkill(pendingFx)
      } else {
        if (actor?.side === 'foe') foeLunge = 1
        startSkillFx(game.battle.fx ?? '', flash)
        playSkill(game.battle.fx)
        strike(marked)
      }
    }
    if (!game.battle.actingUid) lastActing = ''
    return
  }

  lastActing = ''
  if (isPlaying()) stopAttack()
}
