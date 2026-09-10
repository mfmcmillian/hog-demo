import { engine } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'
import { buildBattle, stepBattle } from '../game/combat'
import { DEBUG } from '../game/debug'
import { BOSS_IDS, grantXp, makeOwned, rollDef } from '../game/familiars'
import { OwnedFamiliar } from '../game/types'
import {
  ENERGY_MAX,
  GHOST_ALLY_COINS,
  GHOST_PREFIX,
  LOBBY_COUNTDOWN_S,
  RAID_SPOILS_PER_DAY,
  RIFT_ENERGY_COST,
  RIFT_FLOORS,
  RIFT_GHOST_FILL,
  RIFT_SEATS,
  RiftMsg,
  RiftPub,
  RiftReward,
  RiftSeat,
  emptyRift,
  giftDayOf,
  isGhostAddress
} from '../mp/protocol'
import { MpRiftState, RIFT_SYNC_ID, room } from '../mp/transport'
import { ServerCtx } from './ctx'
import { FeedApi } from './feed'
import { relayFzInvite } from './fz'
import { GhostsApi } from './ghosts'

export function setupRift(
  ctx: ServerCtx,
  deps: { festBump: (floors: number) => void; raidWon: (address: string) => void; feed: FeedApi; ghosts: GhostsApi }
): { rift: RiftPub; publishRift: () => void; riftReset: () => void } {
  // --- The Rift ---------------------------------------------------------------
  const riftEntity = engine.addEntity()
  let riftRevision = 0
  const rift: RiftPub = emptyRift()
  /** Carried hp between floors, by unit uid. */
  let riftHp = new Map<string, number>()
  let riftWait = 0
  /** Spoils-paying wins per wallet per UTC day (RAID_SPOILS_PER_DAY). Raids
   * are free, so this is what keeps them from being a card farm. Session
   * memory is enough: a restart at worst pays one extra day's spoils. */
  const spoilsToday = new Map<string, { day: number; n: number }>()

  function spoilsLeft(address: string): number {
    const day = giftDayOf(Date.now())
    const row = spoilsToday.get(address)
    return Math.max(0, RAID_SPOILS_PER_DAY - (row && row.day === day ? row.n : 0))
  }

  function spendSpoils(address: string): void {
    const day = giftDayOf(Date.now())
    const row = spoilsToday.get(address)
    spoilsToday.set(address, { day, n: (row && row.day === day ? row.n : 0) + 1 })
  }

  MpRiftState.create(riftEntity, { json: JSON.stringify(rift), revision: riftRevision })
  syncEntity(riftEntity, [MpRiftState.componentId], RIFT_SYNC_ID)

  function publishRift(): void {
    riftRevision += 1
    // Every seated human sees how many paying wins they have left today.
    for (const seat of rift.seats) if (!seat.ghost) seat.spoils = spoilsLeft(seat.address)
    const state = MpRiftState.getMutable(riftEntity)
    state.json = JSON.stringify(rift)
    state.revision = riftRevision
  }

  /** Seats short of RIFT_GHOST_FILL get ghost allies: absent players' first
   * party hero, fought by the server exactly like a seated one. */
  function seatGhosts(): void {
    const humans = rift.seats.filter((seat) => !seat.ghost)
    const need = RIFT_GHOST_FILL - rift.seats.length
    if (need <= 0) return
    const exclude = humans.map((seat) => seat.address)
    for (const ghost of deps.ghosts.pickRaiders(exclude, need)) {
      const hero = ghost.party?.[0]
      if (!hero) continue
      rift.seats.push({
        address: `${GHOST_PREFIX}${ghost.address.startsWith(GHOST_PREFIX) ? ghost.address.slice(GHOST_PREFIX.length) : ghost.address}`,
        name: ghost.name,
        uid: `${hero.uid}@ghost`,
        defId: hero.defId,
        stars: hero.stars,
        level: hero.level,
        ready: true,
        ghost: true
      })
    }
  }

  function riftReset(): void {
    rift.phase = 'lobby'
    rift.seats = []
    rift.floor = 1
    rift.battle = undefined
    rift.rewards = undefined
    rift.resetIn = undefined
    rift.startIn = undefined
    riftHp = new Map()
    publishRift()
  }

  /** Everyone seated is ready: the raid is go. */
  function allReady(): boolean {
    return rift.seats.length > 0 && rift.seats.every((entry) => entry.ready)
  }

  /** Re-evaluate the lobby countdown after any seat change: arm it when the
   * room just became all-ready, cancel it when someone stood up or unreadied. */
  function syncCountdown(): void {
    if (rift.phase !== 'lobby') return
    if (allReady()) {
      if (rift.startIn === undefined) {
        riftWait = LOBBY_COUNTDOWN_S
        rift.startIn = LOBBY_COUNTDOWN_S
      }
    } else {
      rift.startIn = undefined
    }
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
    const battle = buildBattle(
      seatParty(),
      riftFoes(rift.floor, rift.seats.length),
      undefined,
      riftScale(rift.floor, rift.seats.length)
    )
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
        if (RIFT_ENERGY_COST > 0) {
          save.energy = DEBUG.unlimitedEnergy ? ENERGY_MAX : Math.max(0, save.energy - RIFT_ENERGY_COST)
          ctx.persistSave(seat.address)
          ctx.pushSave(seat.address)
        }
        // Their party is now a ghost other raids can call on.
        deps.ghosts.snapRaider(seat.address, save)
      }
      seat.ready = false
    }
    // Short-handed: ghost allies take the empty seats.
    seatGhosts()
    rift.floor = 1
    rift.startIn = undefined
    riftHp = new Map()
    riftBeginFloor()
  }

  function riftFinish(won: boolean): void {
    rift.phase = won ? 'won' : 'lost'
    if (won) {
      const rewards: RiftReward[] = []
      const humans = rift.seats.filter((seat) => !seat.ghost)
      const withName = humans[0]?.name ?? 'a traveler'
      for (const seat of rift.seats) {
        if (seat.ghost) {
          // The owner is owed a cut, paid when they next arrive (or now, if here).
          deps.ghosts.owe(seat.address, GHOST_ALLY_COINS, withName)
          rewards.push({ address: seat.address, coins: GHOST_ALLY_COINS, xp: 0 })
          continue
        }
        deps.raidWon(seat.address) // a rung on the Hall of Heroes raids board
        const save = ctx.saves.get(seat.address)
        // Spoils pay RAID_SPOILS_PER_DAY times a day; after that XP and the board only.
        const paying = spoilsLeft(seat.address) > 0
        const reward: RiftReward = { address: seat.address, coins: paying ? 90 : 0, xp: 46 }
        if (paying && Math.random() < 0.7) {
          const drop = makeOwned(rollDef().id)
          reward.dropDefId = drop.defId
          reward.dropUid = drop.uid
          save?.collection.push(drop)
        }
        if (paying) spendSpoils(seat.address)
        if (save) {
          save.coins += reward.coins
          const owned = save.collection.find((entry) => entry.uid === seat.uid)
          if (owned) grantXp(owned, reward.xp)
          ctx.persistSave(seat.address)
          ctx.pushSave(seat.address)
        }
        rewards.push(reward)
        deps.feed.post('raid', seat.address, { n: rift.seats.length })
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
      if (rift.phase !== 'lobby') return
      if (isGhostAddress(sender)) return
      const mine = rift.seats.find((seat) => seat.address === sender)
      if (!mine && rift.seats.length >= RIFT_SEATS) return
      const save = ctx.saves.get(sender)
      const card = save?.collection.find((owned) => owned.uid === msg.heroUid)
      if (!save || !card) return
      if (mine) {
        // Already seated: swap the pick. Un-readies, so a running 3-2-1
        // (syncCountdown) can't start the raid on a hero nobody saw.
        mine.uid = card.uid
        mine.defId = card.defId
        mine.stars = card.stars
        mine.level = card.level
        mine.ready = false
        syncCountdown()
        publishRift()
        return
      }
      // Not enough energy: refuse the seat (clients also gate this).
      if (RIFT_ENERGY_COST > 0 && !DEBUG.unlimitedEnergy && save.energy < RIFT_ENERGY_COST) return
      const seat: RiftSeat = {
        address: sender,
        name: ctx.nameFor(sender),
        uid: card.uid,
        defId: card.defId,
        stars: card.stars,
        level: card.level,
        ready: false,
        spoils: spoilsLeft(sender)
      }
      rift.seats.push(seat)
      publishRift()
      return
    }
    if (msg.type === 'leave') {
      if (rift.phase !== 'lobby') return
      rift.seats = rift.seats.filter((seat) => seat.address !== sender)
      syncCountdown()
      publishRift()
      return
    }
    if (msg.type === 'ready') {
      if (rift.phase !== 'lobby') return
      const seat = rift.seats.find((entry) => entry.address === sender)
      if (!seat) return
      seat.ready = msg.ready === true
      // All ready arms the 3-2-1 (the ticker fires riftStart); unreadying cancels it.
      syncCountdown()
      publishRift()
      return
    }
    if (msg.type === 'invite') {
      relayFzInvite(ctx, sender, msg.to, 'raid')
    }
  })

  // --- Rift battle ticker -------------------------------------------------------
  engine.addSystem((dt) => {
    if (rift.phase === 'lobby') {
      if (rift.startIn === undefined) return
      // Presence may have pulled a seat out from under the countdown.
      if (!allReady()) {
        rift.startIn = undefined
        publishRift()
        return
      }
      riftWait -= dt
      if (riftWait <= 0) {
        riftStart()
        return
      }
      const secs = Math.ceil(riftWait)
      if (secs !== rift.startIn) {
        rift.startIn = secs
        publishRift()
      }
      return
    }
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
