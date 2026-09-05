import { engine } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'
import { buildBattle, stepBattle } from '../game/combat'
import { DEBUG } from '../game/debug'
import { BOSS_IDS, grantXp, makeOwned, rollDef } from '../game/familiars'
import { OwnedFamiliar } from '../game/types'
import {
  ENERGY_MAX,
  RIFT_ENERGY_COST,
  RIFT_FLOORS,
  RIFT_SEATS,
  RiftMsg,
  RiftPub,
  RiftReward,
  RiftSeat,
  emptyRift
} from '../mp/protocol'
import { MpRiftState, RIFT_SYNC_ID, room } from '../mp/transport'
import { ServerCtx } from './ctx'

export function setupRift(
  ctx: ServerCtx,
  deps: { festBump: (floors: number) => void }
): { rift: RiftPub; publishRift: () => void; riftReset: () => void } {
  // --- The Rift ---------------------------------------------------------------
  const riftEntity = engine.addEntity()
  let riftRevision = 0
  const rift: RiftPub = emptyRift()
  /** Carried hp between floors, by unit uid. */
  let riftHp = new Map<string, number>()
  let riftWait = 0

  MpRiftState.create(riftEntity, { json: JSON.stringify(rift), revision: riftRevision })
  syncEntity(riftEntity, [MpRiftState.componentId], RIFT_SYNC_ID)

  function publishRift(): void {
    riftRevision += 1
    const state = MpRiftState.getMutable(riftEntity)
    state.json = JSON.stringify(rift)
    state.revision = riftRevision
  }

  function riftReset(): void {
    rift.phase = 'lobby'
    rift.seats = []
    rift.floor = 1
    rift.battle = undefined
    rift.rewards = undefined
    rift.resetIn = undefined
    riftHp = new Map()
    publishRift()
  }

  function riftFoePools(): string[][] {
    return [
      ['ash-hound', 'cinder-wight'],
      ['moor-crow', 'lamp-imp', 'grave-pike'],
      ['veil-sister', 'rust-ballista', 'blood-leech'],
      ['oath-knight', 'dusk-oracle'],
      // Elite guard, not bosses - the real boss waits on floor 6.
      ['oath-knight', 'blood-leech', 'rust-ballista']
    ]
  }

  function riftFoes(floor: number, seatCount: number): string[] {
    if (floor >= RIFT_FLOORS) return [BOSS_IDS[Math.floor(Math.random() * BOSS_IDS.length)]]
    const pool = riftFoePools()[floor - 1]
    const count = Math.max(1, Math.min(4, seatCount))
    const foes: string[] = []
    for (let i = 0; i < count; i++) foes.push(pool[(floor + i) % pool.length])
    return foes
  }

  function riftScale(floor: number, seatCount: number): number {
    // Sim-tuned (tools/sim-rift.ts): fresh L3 solo wins ~60%, groups clear.
    const base = 0.62 + (floor - 1) * 0.1 + seatCount * 0.03
    return floor >= RIFT_FLOORS ? base * 1.1 : base
  }

  function seatParty(): OwnedFamiliar[] {
    return rift.seats.map((seat) => ({ uid: seat.uid, defId: seat.defId, stars: seat.stars, level: seat.level, xp: 0 }))
  }

  function riftBeginFloor(): void {
    const battle = buildBattle(seatParty(), riftFoes(rift.floor, rift.seats.length), undefined, riftScale(rift.floor, rift.seats.length))
    // Gauntlet rule: hp carries between floors; the fallen stay fallen.
    // Survivors catch their breath: heal 30% of max between floors.
    for (const unit of battle.you) {
      const carried = riftHp.get(unit.uid)
      if (carried === undefined) continue
      const healed = carried > 0 ? carried + unit.maxHp * 0.3 : 0
      unit.hp = Math.max(0, Math.min(unit.maxHp, Math.round(healed)))
    }
    rift.battle = battle
    rift.phase = 'battle'
    riftWait = 2.4
    publishRift()
  }

  function riftStart(): void {
    for (const seat of rift.seats) {
      const save = ctx.saves.get(seat.address)
      if (save) {
        // Mirrors the client's spendEnergy: the playtest flag refills instead
        // of draining, so the server copy never silently starves out sits.
        save.energy = DEBUG.unlimitedEnergy ? ENERGY_MAX : Math.max(0, save.energy - RIFT_ENERGY_COST)
        ctx.persistSave(seat.address)
        ctx.pushSave(seat.address)
      }
      seat.ready = false
    }
    rift.floor = 1
    riftHp = new Map()
    riftBeginFloor()
  }

  function riftFinish(won: boolean): void {
    rift.phase = won ? 'won' : 'lost'
    if (won) {
      const rewards: RiftReward[] = []
      for (const seat of rift.seats) {
        const save = ctx.saves.get(seat.address)
        const reward: RiftReward = { address: seat.address, coins: 90, xp: 46 }
        if (Math.random() < 0.7) {
          const drop = makeOwned(rollDef().id)
          reward.dropDefId = drop.defId
          reward.dropUid = drop.uid
          save?.collection.push(drop)
        }
        if (save) {
          save.coins += reward.coins
          const owned = save.collection.find((entry) => entry.uid === seat.uid)
          if (owned) grantXp(owned, reward.xp)
          ctx.persistSave(seat.address)
          ctx.pushSave(seat.address)
        }
        rewards.push(reward)
      }
      rift.rewards = rewards
    }
    riftWait = won ? 12 : 9
    rift.resetIn = riftWait
    publishRift()
  }

  room.onMessage('riftMsg', (data, context) => {
    if (!context) return
    const sender = context.from.toLowerCase()
    if (!sender) return
    let msg: RiftMsg
    try {
      msg = JSON.parse(data.json) as RiftMsg
    } catch {
      return
    }
    if (msg.type === 'sit') {
      if (rift.phase !== 'lobby' || rift.seats.length >= RIFT_SEATS) return
      if (rift.seats.some((seat) => seat.address === sender)) return
      const save = ctx.saves.get(sender)
      const card = save?.collection.find((owned) => owned.uid === msg.heroUid)
      if (!save || !card) return
      // Not enough energy: refuse the seat (clients also gate this).
      if (!DEBUG.unlimitedEnergy && save.energy < RIFT_ENERGY_COST) return
      const seat: RiftSeat = {
        address: sender,
        name: ctx.nameFor(sender),
        uid: card.uid,
        defId: card.defId,
        stars: card.stars,
        level: card.level,
        ready: false
      }
      rift.seats.push(seat)
      publishRift()
      return
    }
    if (msg.type === 'leave') {
      if (rift.phase !== 'lobby') return
      rift.seats = rift.seats.filter((seat) => seat.address !== sender)
      publishRift()
      return
    }
    if (msg.type === 'ready') {
      if (rift.phase !== 'lobby') return
      const seat = rift.seats.find((entry) => entry.address === sender)
      if (!seat) return
      seat.ready = msg.ready === true
      if (rift.seats.length > 0 && rift.seats.every((entry) => entry.ready)) {
        riftStart()
        return
      }
      publishRift()
    }
  })

  // --- Rift battle ticker -------------------------------------------------------
  engine.addSystem((dt) => {
    if (rift.phase === 'won' || rift.phase === 'lost') {
      riftWait -= dt
      if (riftWait <= 0) {
        riftReset()
        return
      }
      // Tick the spectators' reopen countdown once per whole second.
      const secs = Math.ceil(riftWait)
      if (secs !== rift.resetIn) {
        rift.resetIn = secs
        publishRift()
      }
      return
    }
    if (rift.phase !== 'battle' || !rift.battle) return
    riftWait -= dt
    if (riftWait > 0) return

    const battle = rift.battle
    if (battle.winner) {
      for (const unit of battle.you) riftHp.set(unit.uid, unit.hp)
      if (battle.winner === 'foe') {
        riftFinish(false)
        return
      }
      deps.festBump(1) // every cleared rift floor feeds the realm goal
      if (rift.floor >= RIFT_FLOORS) {
        riftFinish(true)
        return
      }
      rift.floor += 1
      riftBeginFloor()
      return
    }
    stepBattle(battle)
    riftWait = 1.6
    publishRift()
  })

  return { rift, publishRift, riftReset }
}
