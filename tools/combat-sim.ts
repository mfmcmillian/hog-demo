/**
 * Combat simulation harness: drives the real game logic in src/game/combat.ts
 * to rank every recruitable unit and every skill.
 *
 * Run: npx -y tsx tools/combat-sim.ts
 *
 * Fairness notes:
 * - finalBattle is set true so foe-side bosses use their specials every turn,
 *   matching how player-owned units behave (otherwise the 'foe' side bosses
 *   sandbag two of every three actions).
 * - Every 1v1 pairing runs twice (each unit takes the 'you' slot once) since
 *   attack ties in turn order favor the 'you' side.
 */
import { stepBattle } from '../src/game/combat'
import { FAMILIARS, HEROES, NFT_HEROES, getDef, statsOf } from '../src/game/familiars'
import { BattleState, BattleUnit } from '../src/game/types'

const ALL_DEFS = [...HEROES, ...FAMILIARS, ...NFT_HEROES]
const ALL_IDS = ALL_DEFS.map((d) => d.id)
// Units with hardcoded specials in act(); their `skill` field is overridden.
const UNIQUE_IDS = new Set([
  'nova',
  'ashen-regent',
  'wasteland-monarch',
  'thorn-queen',
  'garr',
  'frost-monarch',
  'ether-assassin',
  'crimson-abbot'
])

let uidCounter = 0
function makeUnit(defId: string, side: 'you' | 'foe', stars: number, level: number): BattleUnit {
  const def = getDef(defId)
  const stats = statsOf({ uid: '', defId, stars, level, xp: 0 })
  return {
    uid: `u-${uidCounter++}`,
    defId,
    name: def.name,
    side,
    hp: stats.hp,
    maxHp: stats.hp,
    atk: stats.atk,
    skill: def.skill
  }
}

function fight(you: BattleUnit[], foe: BattleUnit[]): 'you' | 'foe' | 'draw' {
  const battle: BattleState = {
    you,
    foe,
    log: [],
    queue: [],
    turn: 0,
    actingUid: '',
    targetUid: '',
    hitUids: [],
    fxUids: [],
    damage: 0,
    coins: 0,
    kills: 0,
    xpEarned: 0,
    finalBattle: true
  }
  for (let step = 0; step < 2000; step++) {
    stepBattle(battle)
    if (battle.winner) return battle.winner
  }
  return 'draw'
}

function duel(aId: string, bId: string, stars: number, level: number): number {
  // Returns score for a: 1 win, 0.5 draw, 0 loss (a plays the 'you' slot).
  const winner = fight([makeUnit(aId, 'you', stars, level)], [makeUnit(bId, 'foe', stars, level)])
  return winner === 'you' ? 1 : winner === 'draw' ? 0.5 : 0
}

type Row = { id: string; name: string; rarity: string; skill: string; unique: boolean; score: number; games: number }

function roundRobin(stars: number, level: number): Row[] {
  const rows = new Map<string, Row>()
  for (const def of ALL_DEFS)
    rows.set(def.id, {
      id: def.id,
      name: def.name,
      rarity: def.rarity,
      skill: def.skill,
      unique: UNIQUE_IDS.has(def.id),
      score: 0,
      games: 0
    })
  for (const a of ALL_IDS)
    for (const b of ALL_IDS) {
      if (a === b) continue
      const s = duel(a, b, stars, level)
      const ra = rows.get(a)!
      const rb = rows.get(b)!
      ra.score += s
      ra.games += 1
      rb.score += 1 - s
      rb.games += 1
    }
  return [...rows.values()].sort((x, y) => y.score / y.games - x.score / x.games)
}

// Mulberry32 for reproducible team sampling.
function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function sampleTeam(rand: () => number): string[] {
  const pool = [...ALL_IDS]
  const team: string[] = []
  for (let i = 0; i < 4; i++) {
    const idx = Math.floor(rand() * pool.length)
    team.push(pool.splice(idx, 1)[0])
  }
  return team
}

function teamSim(matches: number, stars: number, level: number, seed: number) {
  const rand = rng(seed)
  const perDef = new Map<string, { wins: number; games: number }>()
  const perSkill = new Map<string, { wins: number; games: number }>()
  for (const id of ALL_IDS) perDef.set(id, { wins: 0, games: 0 })
  const bump = (map: Map<string, { wins: number; games: number }>, key: string, win: number) => {
    const e = map.get(key) ?? { wins: 0, games: 0 }
    e.wins += win
    e.games += 1
    map.set(key, e)
  }
  for (let m = 0; m < matches; m++) {
    const teamA = sampleTeam(rand)
    const teamB = sampleTeam(rand)
    const winner = fight(
      teamA.map((id) => makeUnit(id, 'you', stars, level)),
      teamB.map((id) => makeUnit(id, 'foe', stars, level))
    )
    const scoreA = winner === 'you' ? 1 : winner === 'draw' ? 0.5 : 0
    for (const id of teamA) {
      bump(perDef, id, scoreA)
      bump(perSkill, UNIQUE_IDS.has(id) ? 'unique' : getDef(id).skill, scoreA)
    }
    for (const id of teamB) {
      bump(perDef, id, 1 - scoreA)
      bump(perSkill, UNIQUE_IDS.has(id) ? 'unique' : getDef(id).skill, 1 - scoreA)
    }
  }
  const defs = [...perDef.entries()]
    .map(([id, e]) => ({ id, name: getDef(id).name, rarity: getDef(id).rarity, skill: getDef(id).skill, unique: UNIQUE_IDS.has(id), winRate: e.wins / e.games, games: e.games }))
    .sort((a, b) => b.winRate - a.winRate)
  const skills = [...perSkill.entries()]
    .map(([skill, e]) => ({ skill, winRate: e.wins / e.games, games: e.games }))
    .sort((a, b) => b.winRate - a.winRate)
  return { defs, skills }
}

/**
 * Skill isolation: identical dummy statlines (hp 50 / atk 14), one per skill,
 * fighting 1v1 and 4-of-a-kind vs 4-of-a-kind, so stats can't confound.
 */
function skillMatrix() {
  const SKILLS = ['strike', 'drain', 'rally', 'volley'] as const
  const dummy = (skill: (typeof SKILLS)[number], side: 'you' | 'foe'): BattleUnit => ({
    uid: `d-${uidCounter++}`,
    defId: `dummy-${skill}`,
    name: `Dummy ${skill}`,
    side,
    hp: 50,
    maxHp: 50,
    atk: 14,
    skill
  })
  const solo: Record<string, Record<string, number>> = {}
  const squad: Record<string, Record<string, number>> = {}
  for (const a of SKILLS) {
    solo[a] = {}
    squad[a] = {}
    for (const b of SKILLS) {
      const w1 = fight([dummy(a, 'you')], [dummy(b, 'foe')])
      const w2 = fight([dummy(b, 'you')], [dummy(a, 'foe')])
      const s1 = w1 === 'you' ? 1 : w1 === 'draw' ? 0.5 : 0
      const s2 = w2 === 'you' ? 0 : w2 === 'draw' ? 0.5 : 1
      solo[a][b] = (s1 + s2) / 2
      const t1 = fight(Array.from({ length: 4 }, () => dummy(a, 'you')), Array.from({ length: 4 }, () => dummy(b, 'foe')))
      const t2 = fight(Array.from({ length: 4 }, () => dummy(b, 'you')), Array.from({ length: 4 }, () => dummy(a, 'foe')))
      const q1 = t1 === 'you' ? 1 : t1 === 'draw' ? 0.5 : 0
      const q2 = t2 === 'you' ? 0 : t2 === 'draw' ? 0.5 : 1
      squad[a][b] = (q1 + q2) / 2
    }
  }
  return { solo, squad }
}

const result = {
  duelBase: roundRobin(1, 1),
  duelMax: roundRobin(5, 30),
  teamBase: teamSim(8000, 1, 1, 1337),
  teamMax: teamSim(8000, 5, 30, 4242),
  skillMatrix: skillMatrix(),
  statlines: ALL_DEFS.map((d) => {
    const base = statsOf({ uid: '', defId: d.id, stars: 1, level: 1, xp: 0 })
    const max = statsOf({ uid: '', defId: d.id, stars: 5, level: 30, xp: 0 })
    return { id: d.id, name: d.name, rarity: d.rarity, skill: d.skill, unique: UNIQUE_IDS.has(d.id), base, max }
  })
}

console.log(JSON.stringify(result, null, 1))
