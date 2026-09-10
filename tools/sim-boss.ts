/**
 * World Boss tuning harness: runs the exact attack the server simulates
 * (src/server/boss.ts) - a party vs one warlord dressed with bossAtk(tier)
 * and a huge pool, stepped every BOSS_STEP_S for BOSS_ATTACK_S - for a few
 * representative parties, and prints the damage a minute deals and how long
 * the party lasts. Use it to keep bossAtk/BOSS_BASE_HP honest:
 *
 *   - a fresh party should last most of the minute at tier 1 (it is everyone's
 *     fight), a levelled one the whole minute;
 *   - a realm of ~20 people spending 3 attacks a day should fell tier 1 in a
 *     few days, so BOSS_BASE_HP sits near 20 * 3 * 3 * (mid-party dealt).
 *
 * Run: npx -y tsx tools/sim-boss.ts
 */
import { buildBattle, stepBattle } from '../src/game/combat'
import { BOSS_IDS, FAMILIARS, HEROES } from '../src/game/familiars'
import { OwnedFamiliar } from '../src/game/types'
import { BOSS_ATTACK_S, BOSS_BASE_HP, BOSS_HP_GROWTH, BOSS_STEP_S, bossAtk, bossHpFor } from '../src/mp/protocol'

let uid = 0
function owned(defId: string, stars: number, level: number): OwnedFamiliar {
  return { uid: `u${uid++}`, defId, stars, level, xp: 0 }
}

function byRarity(rarity: string): string[] {
  return FAMILIARS.filter((def) => def.rarity === rarity).map((def) => def.id)
}

/** The kind of party a player fields at a few points in their account. */
const PARTIES: { name: string; party: OwnedFamiliar[] }[] = [
  { name: 'day one (hero L1 + 1 common)', party: [owned(HEROES[0].id, 1, 1), owned(byRarity('common')[0], 1, 1)] },
  {
    name: 'first week (hero L5, 3 commons L3)',
    party: [owned(HEROES[0].id, 1, 5), ...byRarity('common').slice(0, 3).map((id) => owned(id, 1, 3))]
  },
  {
    name: 'mid (hero 2* L10, uncommon/rare L8)',
    party: [
      owned(HEROES[1 % HEROES.length].id, 2, 10),
      owned(byRarity('uncommon')[0], 2, 8),
      owned(byRarity('uncommon')[1] ?? byRarity('uncommon')[0], 1, 8),
      owned(byRarity('rare')[0], 1, 8)
    ]
  },
  {
    name: 'veteran (3* L20 epics/legendary)',
    party: [
      owned(HEROES[0].id, 3, 20),
      owned(byRarity('epic')[0], 3, 20),
      owned(byRarity('epic')[1] ?? byRarity('epic')[0], 2, 18),
      owned(byRarity('legendary')[0], 2, 18)
    ]
  }
]

function attack(party: OwnedFamiliar[], tier: number): { dealt: number; lasted: number; steps: number } {
  const bossId = BOSS_IDS[(tier - 1) % BOSS_IDS.length]
  const battle = buildBattle(party, [bossId])
  const boss = battle.foe[0]
  const pool = bossHpFor(tier)
  boss.hp = pool
  boss.maxHp = pool
  boss.atk = bossAtk(tier)
  let hp = pool
  let dealt = 0
  let t = 0
  let wait = 1.2 // the server's first step comes a beat after the attack lands
  let steps = 0
  while (t < BOSS_ATTACK_S) {
    t += wait
    if (t > BOSS_ATTACK_S) break
    boss.hp = hp
    const before = boss.hp
    stepBattle(battle)
    const dmg = Math.max(0, before - boss.hp)
    hp = Math.max(0, hp - dmg)
    boss.hp = hp
    dealt += dmg
    steps += 1
    wait = BOSS_STEP_S
    if (battle.winner === 'foe') return { dealt, lasted: t, steps }
  }
  return { dealt, lasted: BOSS_ATTACK_S, steps }
}

console.log(`attack = ${BOSS_ATTACK_S}s, step ${BOSS_STEP_S}s; pool tier 1 = ${BOSS_BASE_HP} (x${BOSS_HP_GROWTH}/tier)\n`)
for (let tier = 1; tier <= 4; tier++) {
  console.log(`tier ${tier}: ${BOSS_IDS[(tier - 1) % BOSS_IDS.length]}  atk ${bossAtk(tier)}  pool ${bossHpFor(tier)}`)
  for (const entry of PARTIES) {
    const result = attack(entry.party.map((card) => ({ ...card })), tier)
    const lasted = result.lasted >= BOSS_ATTACK_S ? 'the minute' : `${result.lasted.toFixed(0)}s (wiped)`
    console.log(`  ${entry.name.padEnd(40)} dealt ${String(result.dealt).padStart(5)}  lasted ${lasted}`)
  }
  // how many mid-party attacks the pool takes
  const mid = attack(PARTIES[2].party.map((card) => ({ ...card })), tier).dealt
  const attacks = Math.ceil(bossHpFor(tier) / Math.max(1, mid))
  console.log(`  -> ~${attacks} mid-party attacks to fell (${(attacks / (20 * 3)).toFixed(1)} days for 20 players x 3/day)\n`)
}
