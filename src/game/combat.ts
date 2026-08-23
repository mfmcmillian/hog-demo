import { getDef, statsOf } from './familiars'
import { BattleFx, BattleState, BattleUnit, LogLine, OwnedFamiliar } from './types'

function living(units: BattleUnit[]) {
  return units.filter((unit) => unit.hp > 0)
}

function weakest(units: BattleUnit[]) {
  const alive = living(units)
  return alive.sort((a, b) => a.hp - b.hp)[0]
}

function toUnit(owned: OwnedFamiliar, side: 'you' | 'foe', ally = false): BattleUnit {
  const def = getDef(owned.defId)
  const stats = statsOf(owned)
  return {
    uid: owned.uid,
    defId: owned.defId,
    name: ally ? `${def.name} (oath)` : def.name,
    side,
    hp: stats.hp,
    maxHp: stats.hp,
    atk: stats.atk,
    skill: def.skill,
    ally,
    level: owned.level
  }
}

function toFoe(defId: string, index: number, scale = 1): BattleUnit {
  const def = getDef(defId)
  const hp = Math.max(1, Math.floor(def.hp * scale))
  const atk = Math.max(1, Math.floor(def.atk * scale))
  return {
    uid: `foe-${defId}-${index}`,
    defId,
    name: def.name,
    side: 'foe',
    hp,
    maxHp: hp,
    atk,
    skill: def.skill
  }
}

function hit(target: BattleUnit, amount: number) {
  target.hp = Math.max(0, target.hp - amount)
}

type ActResult = {
  line?: LogLine
  targetUid: string
  hitUids: string[]
  fx?: BattleFx
  fxUids?: string[]
  damage: number
}

function act(actor: BattleUnit, allies: BattleUnit[], enemies: BattleUnit[]): ActResult {
  const empty: ActResult = { targetUid: '', hitUids: [], damage: 0 }
  if (actor.hp <= 0) return empty
  const foe = weakest(enemies)
  if (!foe) return empty

  if (actor.defId === 'nova') {
    const rank = living(enemies)
    const dmg = Math.max(12, Math.floor(actor.atk * 1.25))
    const hitUids = rank.map((enemy) => enemy.uid)
    for (const enemy of rank) hit(enemy, dmg)
    actor.hp = Math.min(actor.maxHp, actor.hp + Math.floor(dmg * 0.2 * rank.length))
    return {
      line: { text: `${actor.name} splits the rank with light`, side: actor.side },
      targetUid: foe.uid,
      hitUids,
      fx: 'bolt',
      damage: dmg
    }
  }

  if (actor.skill === 'volley') {
    const rank = living(enemies)
    // Taper: full spread on a crowd, a focused shot on a lone target, so
    // volley units aren't dead weight on boss floors and duels.
    const mult = rank.length === 1 ? 0.9 : rank.length === 2 ? 0.65 : 0.55
    const dmg = Math.max(4, Math.floor(actor.atk * mult))
    for (const enemy of rank) hit(enemy, dmg)
    return {
      line: { text: `${actor.name} volleys the rank`, side: actor.side },
      targetUid: foe.uid,
      hitUids: rank.map((enemy) => enemy.uid),
      fx: 'volley',
      damage: dmg
    }
  }
  if (actor.skill === 'rally') {
    const oath = living(allies)
    // The war chant grows with the singer: rare rally units buff harder
    // than common ones instead of everyone granting the same flat +2.
    const gain = Math.max(2, Math.floor(actor.atk * 0.15))
    for (const ally of oath) ally.atk += gain
    const dmg = Math.max(3, Math.floor(actor.atk * 0.4))
    hit(foe, dmg)
    return {
      line: { text: `${actor.name} rallies the oath`, side: actor.side },
      targetUid: foe.uid,
      hitUids: [foe.uid],
      fx: 'rally',
      fxUids: oath.map((ally) => ally.uid),
      damage: dmg
    }
  }
  if (actor.skill === 'drain') {
    const dmg = actor.atk
    hit(foe, dmg)
    actor.hp = Math.min(actor.maxHp, actor.hp + Math.floor(dmg * 0.35))
    return {
      line: { text: `${actor.name} drains ${foe.name}`, side: actor.side },
      targetUid: foe.uid,
      hitUids: [foe.uid],
      fx: 'drain',
      damage: dmg
    }
  }
  hit(foe, actor.atk)
  return {
    line: { text: `${actor.name} strikes ${foe.name}`, side: actor.side },
    targetUid: foe.uid,
    hitUids: [foe.uid],
    fx: 'strike',
    damage: actor.atk
  }
}

function decideWinner(battle: BattleState) {
  if (living(battle.you).length === 0) {
    battle.winner = 'foe'
    battle.log.push({ text: 'The hall falls silent.' })
    return true
  }
  if (living(battle.foe).length === 0) {
    battle.winner = 'you'
    battle.log.push({ text: 'The oath holds.' })
    return true
  }
  return false
}

export function buildBattle(
  player: OwnedFamiliar[],
  foes: string[],
  ally?: OwnedFamiliar,
  scale = 1
): BattleState {
  const you = player.map((owned) => toUnit(owned, 'you'))
  return {
    you: [...you, ...(ally ? [toUnit(ally, 'you', true)] : [])],
    foe: foes.map((id, index) => toFoe(id, index, scale)),
    log: [{ text: ally ? 'An oath-kin joins the clash.' : 'The clash begins.' }],
    queue: [],
    turn: 0,
    actingUid: '',
    targetUid: '',
    hitUids: [],
    fxUids: [],
    damage: 0,
    coins: 0,
    kills: 0,
    xpEarned: 0
  }
}

export function stepBattle(battle: BattleState): BattleState {
  if (battle.winner) return battle

  battle.actingUid = ''
  battle.targetUid = ''
  battle.hitUids = []
  battle.fx = undefined
  battle.fxUids = []
  battle.damage = 0

  if (decideWinner(battle)) return battle

  const order = [...living(battle.you), ...living(battle.foe)].sort((a, b) => b.atk - a.atk)
  const actor = order[battle.turn % order.length]
  battle.turn += 1
  if (!actor) return battle

  const allies = actor.side === 'you' ? battle.you : battle.foe
  const enemies = actor.side === 'you' ? battle.foe : battle.you
  const livingBefore = living(enemies).length
  const result = act(actor, allies, enemies)
  if (actor.side === 'you') {
    battle.kills += Math.max(0, livingBefore - living(enemies).length)
  }

  battle.actingUid = actor.uid
  battle.targetUid = result.targetUid
  battle.hitUids = result.hitUids
  battle.fx = result.fx
  battle.fxUids = result.fxUids ?? result.hitUids
  battle.damage = result.damage
  if (result.line) {
    battle.log.push(result.line)
    if (battle.log.length > 8) battle.log.shift()
  }

  decideWinner(battle)
  return battle
}
