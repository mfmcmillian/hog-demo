import { BOSS_IDS, getDef, statsOf } from './familiars'
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

function act(actor: BattleUnit, allies: BattleUnit[], enemies: BattleUnit[], relentless = false): ActResult {
  const empty: ActResult = { targetUid: '', hitUids: [], damage: 0 }
  if (actor.hp <= 0) return empty
  const foe = weakest(enemies)
  if (!foe) return empty

  // Player units use their skill every turn, but enemy bosses hold theirs
  // back: a plain blow on most actions, the special every third one. At the
  // Gates of Antrom (relentless) the warlords skip the plain blows and fire
  // their specials every single turn.
  actor.acts = (actor.acts ?? 0) + 1
  if (actor.side === 'foe' && BOSS_IDS.includes(actor.defId) && !relentless && actor.acts % 3 !== 0) {
    hit(foe, actor.atk)
    return {
      line: { text: `${actor.name} strikes ${foe.name}`, side: actor.side },
      targetUid: foe.uid,
      hitUids: [foe.uid],
      fx: 'strike',
      damage: actor.atk
    }
  }

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

  if (actor.defId === 'ashen-regent') {
    // End the Line: a 1.75x killing blow whose overkill spills into the
    // next-weakest foe, so finishing one enemy carves into the next.
    const dmg = Math.max(12, Math.floor(actor.atk * 1.75))
    const prior = foe.hp
    hit(foe, dmg)
    const spill = dmg - prior
    const next = spill > 0 ? weakest(enemies) : undefined
    if (next && spill > 0) hit(next, spill)
    return {
      line: { text: `${actor.name} ends a line through ${foe.name}`, side: actor.side },
      targetUid: foe.uid,
      hitUids: [foe.uid, ...(next ? [next.uid] : [])],
      fx: 'strike',
      damage: dmg
    }
  }

  if (actor.defId === 'wasteland-monarch') {
    // The Waste Claims All: drains the entire rank, hoards the life for
    // himself, and grows stronger for every foe claimed. Self-heal matches
    // drain's 0.35 ratio so the combatFx hp-hold stays accurate.
    const rank = living(enemies)
    const dmg = Math.max(10, Math.floor(actor.atk * 0.75))
    for (const enemy of rank) hit(enemy, dmg)
    actor.hp = Math.min(actor.maxHp, actor.hp + Math.floor(dmg * 0.35))
    actor.atk += Math.max(1, Math.floor(dmg * 0.1)) * rank.length
    return {
      line: { text: `${actor.name} claims the rank for the waste`, side: actor.side },
      targetUid: foe.uid,
      hitUids: rank.map((enemy) => enemy.uid),
      fx: 'drain',
      damage: dmg
    }
  }

  if (actor.defId === 'thorn-queen') {
    // Briar Rain: a full-strength volley on every foe with no crowd taper,
    // and the briars snag — each victim loses a little attack.
    const rank = living(enemies)
    const dmg = Math.max(6, Math.floor(actor.atk * 0.85))
    const snag = Math.max(1, Math.floor(dmg * 0.12))
    for (const enemy of rank) {
      hit(enemy, dmg)
      enemy.atk = Math.max(1, enemy.atk - snag)
    }
    return {
      line: { text: `${actor.name} buries the rank in briars`, side: actor.side },
      targetUid: foe.uid,
      hitUids: rank.map((enemy) => enemy.uid),
      fx: 'volley',
      damage: dmg
    }
  }

  if (actor.defId === 'garr') {
    // Titan's Feast: a crushing drain at 1.5x attack. Heal stays at drain's
    // 0.35 ratio so the hp-hold animation in combatFx stays accurate.
    const dmg = Math.max(10, Math.floor(actor.atk * 1.5))
    hit(foe, dmg)
    actor.hp = Math.min(actor.maxHp, actor.hp + Math.floor(dmg * 0.35))
    return {
      line: { text: `${actor.name} feeds the gate with ${foe.name}`, side: actor.side },
      targetUid: foe.uid,
      hitUids: [foe.uid],
      fx: 'drain',
      damage: dmg
    }
  }

  if (actor.defId === 'frost-monarch') {
    // Winter's March: rallies the whole oath harder than a normal rally and
    // chills every foe, sapping their attack.
    const oath = living(allies)
    const rank = living(enemies)
    const gain = Math.max(3, Math.floor(actor.atk * 0.25))
    for (const ally of oath) ally.atk += gain
    const chill = Math.max(1, Math.floor(actor.atk * 0.12))
    for (const enemy of rank) enemy.atk = Math.max(1, enemy.atk - chill)
    const dmg = Math.max(4, Math.floor(actor.atk * 0.5))
    hit(foe, dmg)
    return {
      line: { text: `${actor.name} marches winter through the rank`, side: actor.side },
      targetUid: foe.uid,
      hitUids: [foe.uid],
      fx: 'rally',
      fxUids: oath.map((ally) => ally.uid),
      damage: dmg
    }
  }

  if (actor.defId === 'ether-assassin') {
    // Ghost Cut: ignores the weakest-first rule and executes the deadliest
    // living enemy at 1.5x attack.
    const rank = living(enemies)
    const mark = [...rank].sort((a, b) => b.atk - a.atk)[0] ?? foe
    const dmg = Math.max(10, Math.floor(actor.atk * 1.5))
    hit(mark, dmg)
    return {
      line: { text: `${actor.name} cuts down ${mark.name} without echo`, side: actor.side },
      targetUid: mark.uid,
      hitUids: [mark.uid],
      fx: 'strike',
      damage: dmg
    }
  }

  if (actor.defId === 'crimson-abbot') {
    // Blood Rite: drains the whole enemy rank and feeds the stolen life to
    // every living ally. Heal matches drain's 0.35 ratio so the hp-hold
    // animation in combatFx stays accurate for the actor.
    const rank = living(enemies)
    const oath = living(allies)
    const dmg = Math.max(8, Math.floor(actor.atk * 0.7))
    for (const enemy of rank) hit(enemy, dmg)
    const mend = Math.floor(dmg * 0.35)
    for (const ally of oath) ally.hp = Math.min(ally.maxHp, ally.hp + mend)
    return {
      line: { text: `${actor.name} bleeds the rank to feed the oath`, side: actor.side },
      targetUid: foe.uid,
      hitUids: rank.map((enemy) => enemy.uid),
      fx: 'drain',
      fxUids: [...rank.map((enemy) => enemy.uid), ...oath.map((ally) => ally.uid)],
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
  const result = act(actor, allies, enemies, !!battle.finalBattle)
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
