import { engine, executeTask } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'
import { Storage } from '@dcl/sdk/server'
import { buildBattle, stepBattle } from '../game/combat'
import { BOSS_IDS, makeOwned, rollDef, statsOf } from '../game/familiars'
import { levelForXp } from '../game/level'
import { PACKS, rollPack } from '../game/packs'
import { BattleState, OwnedFamiliar } from '../game/types'
import {
  BOSS_ATTACKS_PER_DAY,
  BOSS_ATTACK_S,
  BOSS_KILL_COINS,
  BOSS_STEP_S,
  BOSS_TOP,
  BossEntry,
  BossMsg,
  BossPub,
  BossReward,
  BossUpdate,
  BossYou,
  GiftUpdate,
  bossAtk,
  bossHpFor,
  bossRewardFor,
  bossEndsAt,
  bossWindowOf,
  giftDayOf,
  isGhostAddress
} from '../mp/protocol'
import { BOSS_SYNC_ID, MpBossState, room } from '../mp/transport'
import { ServerCtx } from './ctx'
import { FeedApi } from './feed'

// --- The World Boss ---------------------------------------------------------------
//
// One warlord the whole realm hits together, simulated here. Every attack is
// a private BattleState (the attacker's party vs the boss) that this module
// steps for BOSS_ATTACK_S seconds and streams to that wallet alone over
// bossUpdate; the damage it deals comes off the one shared hp pool that the
// synced BossPub publishes to everyone. The pool, the week's damage board and
// the payouts owed to absent players persist in Storage.

/** Something a wallet is owed: the week's payout by rank, or a kill bonus (rank 0). */
type Owed = BossReward & { rank: number }

type BossStore = {
  week: number
  tier: number
  defId: string
  hp: number
  kills: number
  /** Best single attack per wallet this week. */
  best: Record<string, BossEntry>
  /** Attacks spent per wallet on their latest UTC day. */
  attacks: Record<string, { day: number; n: number }>
  /** Wallets that have hit the current boss (the kill bonus goes to them). */
  hitters: string[]
  /** Payouts waiting for wallets that were away when they were earned. */
  owed: Record<string, Owed[]>
}

type Fight = {
  battle: BattleState
  /** Seconds of the minute left. */
  left: number
  /** Seconds until the next simulated action. */
  wait: number
  dealt: number
}

const BOSS_KEY = 'hog-boss-v1'

function freshStore(now = Date.now()): BossStore {
  const week = bossWindowOf(now)
  return {
    week,
    tier: 1,
    defId: BOSS_IDS[0],
    hp: bossHpFor(1),
    kills: 0,
    best: {},
    attacks: {},
    hitters: [],
    owed: {}
  }
}

export type BossApi = { maybeGrantBoss: (address: string) => void }

export function setupBoss(ctx: ServerCtx, deps: { feed: FeedApi }): BossApi {
  const entity = engine.addEntity()
  let revision = 0
  let store: BossStore = freshStore()
  /** Storage round-trip confirmed; until then the lair is session-only. */
  let ready = false
  const fights = new Map<string, Fight>()
  let dirty = false
  let publishWait = 0
  let persistWait = 0
  let persistDirty = false
  /** Who the `you` block was last built for, so presence changes republish. */
  let lastPresentKey = ''
  let lastDay = giftDayOf(Date.now())

  function addressish(name: string): boolean {
    return !name || /^0x[0-9a-f]{4}/i.test(name)
  }

  /** The avatar's real name whenever the server knows it; never a downgrade. */
  function bestName(address: string, current: string): string {
    const known = ctx.displayNames.get(address)
    if (known && !addressish(known)) return known
    return current || ctx.nameFor(address)
  }

  function attacksLeft(address: string): number {
    const day = giftDayOf(Date.now())
    const row = store.attacks[address]
    return Math.max(0, BOSS_ATTACKS_PER_DAY - (row && row.day === day ? row.n : 0))
  }

  function spendAttack(address: string): void {
    const day = giftDayOf(Date.now())
    const row = store.attacks[address]
    store.attacks[address] = { day, n: (row && row.day === day ? row.n : 0) + 1 }
  }

  /** The board, best hit first; ties go to whoever got there first (stable). */
  function ranked(): BossEntry[] {
    return Object.values(store.best)
      .filter((entry) => entry.best > 0)
      .sort((a, b) => b.best - a.best)
  }

  function rankOf(address: string, order = ranked()): number {
    const at = order.findIndex((entry) => entry.address === address)
    return at < 0 ? 0 : at + 1
  }

  function pubOf(): BossPub {
    const order = ranked()
    for (const entry of order) entry.name = bestName(entry.address, entry.name)
    const you: Record<string, BossYou> = {}
    for (const address of ctx.present) {
      const mine = store.best[address]
      you[address] = { rank: mine ? rankOf(address, order) : 0, best: mine?.best ?? 0, left: attacksLeft(address) }
    }
    return {
      week: store.week,
      tier: store.tier,
      defId: store.defId,
      hp: store.hp,
      maxHp: bossHpFor(store.tier),
      endsAt: bossEndsAt(store.week),
      kills: store.kills,
      board: order.slice(0, BOSS_TOP),
      you,
      fighting: fights.size
    }
  }

  MpBossState.create(entity, { json: JSON.stringify(pubOf()), revision })
  syncEntity(entity, [MpBossState.componentId], BOSS_SYNC_ID)

  function publish(): void {
    revision += 1
    const state = MpBossState.getMutable(entity)
    state.json = JSON.stringify(pubOf())
    state.revision = revision
    dirty = false
    publishWait = 0.5
    lastPresentKey = [...ctx.present].sort().join(',')
  }

  function persist(): void {
    persistDirty = false
    if (!ready) return
    try {
      // Storage.set resolves false on a failed PUT (it does not reject).
      Storage.set(BOSS_KEY, JSON.stringify(store))
        .then((ok) => {
          if (!ok) console.log('[Server] boss persist failed: storage set returned false')
        })
        .catch((error: unknown) => {
          console.log(`[Server] boss persist failed: ${error}`)
        })
    } catch (error) {
      console.log(`[Server] boss persist failed: ${error}`)
    }
  }

  const sendUpdate = (address: string, update: BossUpdate) =>
    room.send('bossUpdate', { address, json: JSON.stringify(update) })
  const sendGift = (address: string, update: GiftUpdate) =>
    room.send('giftUpdate', { address, json: JSON.stringify(update) })

  /** Bank something for a wallet: paid now if they are here, else when they arrive. */
  function owe(address: string, owed: Owed): void {
    const list = store.owed[address] ?? []
    list.push(owed)
    store.owed[address] = list
    maybeGrantBoss(address)
  }

  /** Pay everything a present wallet is owed as one chest: all the coins, a
   * card per pack owed (the first one shown), the best rank on the plaque. */
  function maybeGrantBoss(address: string): void {
    const list = store.owed[address]
    if (!list || list.length === 0) return
    const save = ctx.saves.get(address)
    if (!save || !ctx.isSaveReady(address)) return // away: paid on arrival
    let coins = 0
    let rank = 0
    let dropDefId: string | undefined
    let dropUid: string | undefined
    for (const owed of list) {
      coins += owed.coins
      if (owed.rank > 0 && (rank === 0 || owed.rank < rank)) rank = owed.rank
      if (owed.pack) {
        const pack = PACKS.find((entry) => entry.id === owed.pack)
        const drop = makeOwned((pack ? rollPack(pack) : rollDef()).id)
        save.collection.push(drop)
        if (!dropDefId) {
          dropDefId = drop.defId
          dropUid = drop.uid
        }
      }
    }
    save.coins += coins
    delete store.owed[address]
    ctx.persistSave(address)
    persist()
    ctx.pushSave(address)
    sendGift(address, { type: 'boss', rank, coins, dropDefId, dropUid })
  }

  /** The week is over: rank the board, bank every payout, and open a fresh
   * lair. Also runs at boot when the stored week is an old one, so a server
   * that slept through the turn still pays out. */
  function closeWeek(): void {
    const order = ranked()
    order.forEach((entry, i) => {
      const reward = bossRewardFor(i + 1)
      const list = store.owed[entry.address] ?? []
      list.push({ ...reward, rank: i + 1 })
      store.owed[entry.address] = list
    })
    console.log(`[Server] world boss week ${store.week} closed: ${order.length} attacker(s) paid`)
    const owed = store.owed
    store = freshStore()
    store.owed = owed
    for (const address of ctx.present) maybeGrantBoss(address)
    persist()
    publish()
  }

  executeTask(async () => {
    try {
      const raw = await Storage.get<string>(BOSS_KEY)
      if (raw) {
        const stored = JSON.parse(raw) as Partial<BossStore>
        store = {
          ...freshStore(),
          ...stored,
          best: stored.best ?? {},
          attacks: stored.attacks ?? {},
          hitters: stored.hitters ?? [],
          owed: stored.owed ?? {}
        }
        // Make sure a stored boss id still exists in the roster.
        if (BOSS_IDS.indexOf(store.defId) < 0) store.defId = BOSS_IDS[(store.tier - 1) % BOSS_IDS.length]
      }
      ready = true
      if (store.week !== bossWindowOf(Date.now())) closeWeek()
      else persist() // prove the write path at boot
    } catch (error) {
      console.log(`[Server] boss load failed: ${error}`)
    }
    publish()
  })

  /** The attacker's party as the server holds it; the strongest card alone
   * when the party slots are empty (a brand-new account). */
  function partyOf(address: string): OwnedFamiliar[] {
    const save = ctx.saves.get(address)
    if (!save) return []
    const party: OwnedFamiliar[] = []
    for (const uid of save.party) {
      const card = save.collection.find((owned) => owned.uid === uid)
      if (card) party.push(card)
    }
    if (party.length > 0) return party
    let best: OwnedFamiliar | undefined
    let bestPower = -1
    for (const card of save.collection) {
      const stats = statsOf(card)
      const power = stats.hp + stats.atk * 3
      if (power > bestPower) {
        bestPower = power
        best = card
      }
    }
    return best ? [best] : []
  }

  /** The boss as one foe unit whose hp IS the realm's pool. */
  function dressBoss(battle: BattleState): void {
    const boss = battle.foe[0]
    if (!boss) return
    boss.hp = store.hp
    boss.maxHp = bossHpFor(store.tier)
    boss.atk = bossAtk(store.tier)
  }

  function startFight(address: string): void {
    const party = partyOf(address)
    if (party.length === 0) {
      sendUpdate(address, { type: 'blocked', reason: 'party' })
      return
    }
    const battle = buildBattle(party, [store.defId])
    dressBoss(battle)
    battle.log = [{ text: 'The world boss turns to face you.' }]
    spendAttack(address) // counted up front: walking away does not refund it
    if (store.hitters.indexOf(address) < 0) store.hitters.push(address)
    const fight: Fight = { battle, left: BOSS_ATTACK_S, wait: 1.2, dealt: 0 }
    fights.set(address, fight)
    sendUpdate(address, { type: 'fight', battle, left: BOSS_ATTACK_S, dealt: 0 })
    persistDirty = true
    publish()
  }

  function endFight(address: string, fight: Fight, kill: boolean, wiped: boolean): void {
    fights.delete(address)
    const save = ctx.saves.get(address)
    const previous = store.best[address]
    const realmBest = ranked()[0]?.best ?? 0
    const entry: BossEntry = {
      address,
      name: bestName(address, previous?.name ?? ''),
      level: save ? levelForXp(save.axp ?? 0) : (previous?.level ?? 1),
      best: Math.max(previous?.best ?? 0, fight.dealt),
      attacks: (previous?.attacks ?? 0) + 1
    }
    store.best[address] = entry
    // A new realm-best hit is news (not the very first hit of the week: that
    // beats nothing).
    if (realmBest > 0 && fight.dealt > realmBest) deps.feed.post('boss', address, { arg: store.defId, n: fight.dealt })
    sendUpdate(address, {
      type: 'done',
      dealt: fight.dealt,
      best: entry.best,
      rank: rankOf(address),
      kill: kill || undefined,
      wiped: wiped || undefined
    })
    persist()
    publish()
  }

  /** The pool ran dry: bonus for everyone who hit it, then a tougher warlord
   * rises at once. Fights still running carry on against the new boss (their
   * foe unit re-syncs to the new pool on its next step). */
  function fell(killer: string): void {
    const felled = store.defId
    store.kills += 1
    store.tier += 1
    store.defId = BOSS_IDS[(store.tier - 1) % BOSS_IDS.length]
    store.hp = bossHpFor(store.tier)
    const hitters = store.hitters
    store.hitters = []
    console.log(`[Server] world boss ${felled} felled by ${killer}; tier ${store.tier} (${store.defId}) rises`)
    deps.feed.post('bossfell', killer, { arg: felled, n: store.tier - 1 })
    for (const address of hitters) owe(address, { rank: 0, coins: BOSS_KILL_COINS })
    for (const fight of fights.values()) {
      const boss = fight.battle.foe[0]
      if (!boss) continue
      boss.defId = store.defId
      boss.uid = `foe-${store.defId}-0`
      boss.acts = 0
      dressBoss(fight.battle)
    }
    persistDirty = true
  }

  room.onMessage('bossMsg', (data, context) => {
    if (!context) return
    const sender = context.from.toLowerCase()
    if (!sender || isGhostAddress(sender)) return
    let msg: BossMsg
    try {
      msg = JSON.parse(data.json) as BossMsg
    } catch {
      return
    }
    if (msg.type !== 'attack') return
    if (!ready) return
    if (!ctx.saves.get(sender) || !ctx.isSaveReady(sender)) return
    if (fights.has(sender)) {
      sendUpdate(sender, { type: 'blocked', reason: 'busy' })
      return
    }
    if (attacksLeft(sender) <= 0) {
      sendUpdate(sender, { type: 'blocked', reason: 'none' })
      return
    }
    if (Date.now() >= bossEndsAt(store.week)) return // rolling over this frame
    startFight(sender)
  })

  engine.addSystem((dt) => {
    if (!ready) return
    // The round turned: pay out and open the next lair.
    if (Date.now() >= bossEndsAt(store.week)) {
      for (const [address, fight] of [...fights]) endFight(address, fight, false, false)
      closeWeek()
      return
    }

    for (const [address, fight] of [...fights]) {
      fight.left -= dt
      fight.wait -= dt
      if (fight.wait > 0 && fight.left > 0) continue
      const battle = fight.battle
      const boss = battle.foe[0]
      if (!boss) {
        endFight(address, fight, false, false)
        continue
      }
      if (fight.left > 0) {
        // Others may have hit the pool since this fight's last step.
        boss.hp = store.hp
        const before = boss.hp
        stepBattle(battle)
        const dmg = Math.max(0, before - boss.hp)
        store.hp = Math.max(0, store.hp - dmg)
        boss.hp = store.hp // the boss's own heals never touch the pool
        fight.dealt += dmg
        fight.wait = BOSS_STEP_S
        // The pool is the pool: the private battle is over only when the
        // whole realm has drained it.
        if (store.hp <= 0) {
          battle.winner = 'you'
          sendUpdate(address, { type: 'fight', battle, left: Math.ceil(fight.left), dealt: fight.dealt })
          fell(address)
          endFight(address, fight, true, false)
          continue
        }
        if (battle.winner === 'you') battle.winner = undefined
        sendUpdate(address, { type: 'fight', battle, left: Math.ceil(fight.left), dealt: fight.dealt })
        if (dmg > 0) dirty = true
        if (battle.winner === 'foe') {
          endFight(address, fight, false, true)
          continue
        }
        continue
      }
      endFight(address, fight, false, false)
    }

    // Publishing: at most twice a second while fights drain the pool, and
    // whenever the room's roster (the `you` block) changes.
    publishWait -= dt
    if (publishWait <= 0) {
      const presentKey = [...ctx.present].sort().join(',')
      // A new UTC day hands everyone their attacks back: say so.
      const day = giftDayOf(Date.now())
      if (day !== lastDay) {
        lastDay = day
        dirty = true
      }
      if (dirty || presentKey !== lastPresentKey) publish()
      else publishWait = 0.5
    }
    // Persist the pool every so often while it is being hit; fight ends and
    // payouts write straight away.
    persistWait -= dt
    if (persistWait <= 0) {
      persistWait = 20
      if (persistDirty || fights.size > 0) persist()
    }
  })

  return { maybeGrantBoss }
}
