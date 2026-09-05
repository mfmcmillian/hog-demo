import { engine, executeTask } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'
import { Storage } from '@dcl/sdk/server'
import { buildDuelBattle, stepBattle } from '../game/combat'
import { DEBUG } from '../game/debug'
import { grantXp } from '../game/familiars'
import { OwnedFamiliar } from '../game/types'
import {
  DUEL_ENERGY_COST,
  DUEL_LADDER_TOP,
  DUEL_LOSS_XP,
  DUEL_MODES,
  DUEL_SEATS,
  DUEL_WIN_COINS,
  DUEL_WIN_XP,
  DuelFighter,
  DuelMode,
  DuelMsg,
  DuelPub,
  DuelRank,
  DuelSeat,
  ENERGY_MAX,
  PlayerSave,
  RiftReward,
  emptyDuel
} from '../mp/protocol'
import { DUEL_SYNC_IDS, MpDuelState, room } from '../mp/transport'
import { ServerCtx } from './ctx'

// The friendzone duel rings: two players face off, 1v1 (champion vs champion)
// or 4v4 (full party vs full party) - same trust model as the rift, no shared
// spoils. The victor takes the purse and a rung on the mode's win ladder,
// which persists in world storage across server restarts.

export type DuelRoom = { duel: DuelPub; publishDuel: () => void; duelReset: () => void }

type Ring = DuelRoom & { onMsg: (sender: string, msg: DuelMsg) => void }

export function setupDuels(ctx: ServerCtx): { rooms: DuelRoom[] } {
  // --- The win ladders (persisted) -------------------------------------------------
  const LADDER_KEY = 'hog-duel-ladder-v1'
  type LadderStore = Record<DuelMode, Record<string, { name: string; wins: number }>>
  let ladder: LadderStore = { '1v1': {}, '4v4': {} }
  /** Storage round-trip confirmed; until then wins are session-only. */
  let ladderReady = false

  function topLadder(mode: DuelMode): DuelRank[] {
    return Object.values(ladder[mode])
      .sort((a, b) => b.wins - a.wins)
      .slice(0, DUEL_LADDER_TOP)
      .map((entry) => ({ name: entry.name, wins: entry.wins }))
  }

  function persistLadder(): void {
    if (!ladderReady) return
    try {
      // Storage.set resolves false on a failed PUT (it does not reject).
      Storage.set(LADDER_KEY, JSON.stringify(ladder))
        .then((ok) => {
          if (!ok) console.log('[Server] duel ladder persist failed: storage set returned false')
        })
        .catch((error: unknown) => {
          console.log(`[Server] duel ladder persist failed: ${error}`)
        })
    } catch (error) {
      console.log(`[Server] duel ladder persist failed: ${error}`)
    }
  }

  function bumpLadder(mode: DuelMode, address: string, name: string): void {
    const entry = ladder[mode][address] ?? { name, wins: 0 }
    entry.wins += 1
    entry.name = name // keep the freshest display name
    ladder[mode][address] = entry
    persistLadder()
  }

  // --- The rings (one per mode) -----------------------------------------------------
  const rooms: Ring[] = DUEL_MODES.map((mode) => makeRing(mode))

  executeTask(async () => {
    try {
      const raw = await Storage.get<string>(LADDER_KEY)
      if (raw) {
        const stored = JSON.parse(raw) as Partial<LadderStore>
        ladder = { '1v1': stored['1v1'] ?? {}, '4v4': stored['4v4'] ?? {} }
      }
      ladderReady = true
      // A missing key resolves null (no throw). Seed it now so the write
      // path is proven at boot instead of first tested when a win is on
      // the line - and so restarts stop re-reading an absent key.
      if (!raw) persistLadder()
    } catch (error) {
      console.log(`[Server] duel ladder load failed: ${error}`)
    }
    for (const ring of rooms) {
      ring.duel.ladder = topLadder(ring.duel.mode)
      ring.publishDuel()
    }
  })

  function makeRing(mode: DuelMode): Ring {
    const duelEntity = engine.addEntity()
    let duelRevision = 0
    const duel: DuelPub = emptyDuel(mode)
    let duelWait = 0

    MpDuelState.create(duelEntity, { json: JSON.stringify(duel), revision: duelRevision })
    syncEntity(duelEntity, [MpDuelState.componentId], DUEL_SYNC_IDS[mode])

    /** What everyone sees. Picks stay sealed while the ring is in the lobby -
     * the rosters are the surprise when the fight starts - so the broadcast
     * snapshot carries empty hands until then. The server keeps the real ones. */
    function pubView(): DuelPub {
      if (duel.phase !== 'lobby') return duel
      return { ...duel, seats: duel.seats.map((seat) => ({ ...seat, heroes: [] })) }
    }

    function publishDuel(): void {
      duelRevision += 1
      const state = MpDuelState.getMutable(duelEntity)
      state.json = JSON.stringify(pubView())
      state.revision = duelRevision
    }

    function duelReset(): void {
      duel.phase = 'lobby'
      duel.seats = []
      duel.battle = undefined
      duel.winner = undefined
      duel.rewards = undefined
      duel.resetIn = undefined
      publishDuel()
    }

    /** The fighters a sitter brings: their champion in 1v1, their party in 4v4. */
    function fighters(save: PlayerSave, heroUid?: string): DuelFighter[] {
      if (mode === '1v1') {
        const card = save.collection.find((owned) => owned.uid === heroUid)
        return card ? [{ uid: card.uid, defId: card.defId, stars: card.stars, level: card.level }] : []
      }
      const party: DuelFighter[] = []
      for (const uid of save.party) {
        const card = save.collection.find((owned) => owned.uid === uid)
        if (card) party.push({ uid: card.uid, defId: card.defId, stars: card.stars, level: card.level })
      }
      return party
    }

    function toOwned(fighter: DuelFighter): OwnedFamiliar {
      return { uid: fighter.uid, defId: fighter.defId, stars: fighter.stars, level: fighter.level, xp: 0 }
    }

    function duelStart(): void {
      for (const seat of duel.seats) {
        const save = ctx.saves.get(seat.address)
        if (save) {
          // Mirrors the client's spendEnergy: the playtest flag refills instead
          // of draining, so the server copy never silently starves out sits.
          save.energy = DEBUG.unlimitedEnergy ? ENERGY_MAX : Math.max(0, save.energy - DUEL_ENERGY_COST[mode])
          ctx.persistSave(seat.address)
          ctx.pushSave(seat.address)
        }
        seat.ready = false
      }
      // Seat order is battle order: seats[0] fights on 'you', seats[1] on 'foe'.
      const [a, b] = duel.seats
      duel.battle = buildDuelBattle(a.heroes.map(toOwned), b.heroes.map(toOwned))
      duel.phase = 'battle'
      duelWait = 2.4
      publishDuel()
    }

    function duelFinish(winnerSide: 'you' | 'foe'): void {
      const winnerSeat = winnerSide === 'you' ? duel.seats[0] : duel.seats[1]
      const rewards: RiftReward[] = []
      for (const seat of duel.seats) {
        const won = seat === winnerSeat
        const reward: RiftReward = {
          address: seat.address,
          coins: won ? DUEL_WIN_COINS[mode] : 0,
          xp: won ? DUEL_WIN_XP[mode] : DUEL_LOSS_XP[mode]
        }
        const save = ctx.saves.get(seat.address)
        if (save) {
          save.coins += reward.coins
          // Every fighter earns; in 1v1 that is just the champion.
          for (const fighter of seat.heroes) {
            const owned = save.collection.find((entry) => entry.uid === fighter.uid)
            if (owned) grantXp(owned, reward.xp)
          }
          ctx.persistSave(seat.address)
          ctx.pushSave(seat.address)
        }
        rewards.push(reward)
      }
      if (winnerSeat) bumpLadder(mode, winnerSeat.address, winnerSeat.name)
      duel.phase = 'done'
      duel.winner = winnerSeat?.address ?? ''
      duel.rewards = rewards
      duel.ladder = topLadder(mode)
      duelWait = 10
      duel.resetIn = duelWait
      publishDuel()
    }

    function onMsg(sender: string, msg: DuelMsg): void {
      if (msg.type === 'sit') {
        if (duel.phase !== 'lobby' || duel.seats.length >= DUEL_SEATS) return
        if (duel.seats.some((seat) => seat.address === sender)) return
        const save = ctx.saves.get(sender)
        if (!save) return
        const heroes = fighters(save, msg.heroUid)
        // 1v1 needs a valid champion; 4v4 needs the full party (clients also gate).
        if (mode === '1v1' ? heroes.length !== 1 : heroes.length < 4) return
        // Not enough energy: refuse the seat (clients also gate this).
        if (!DEBUG.unlimitedEnergy && save.energy < DUEL_ENERGY_COST[mode]) return
        const seat: DuelSeat = { address: sender, name: ctx.nameFor(sender), ready: false, heroes }
        duel.seats.push(seat)
        publishDuel()
        return
      }
      if (msg.type === 'leave') {
        if (duel.phase !== 'lobby') return
        duel.seats = duel.seats.filter((seat) => seat.address !== sender)
        publishDuel()
        return
      }
      if (msg.type === 'ready') {
        if (duel.phase !== 'lobby') return
        const seat = duel.seats.find((entry) => entry.address === sender)
        if (!seat) return
        seat.ready = msg.ready === true
        // A duel needs a full ring: both seats taken, both ready.
        if (duel.seats.length === DUEL_SEATS && duel.seats.every((entry) => entry.ready)) {
          duelStart()
          return
        }
        publishDuel()
      }
    }

    // --- Duel ticker ----------------------------------------------------------------
    engine.addSystem((dt) => {
      if (duel.phase === 'done') {
        duelWait -= dt
        if (duelWait <= 0) {
          duelReset()
          return
        }
        // Tick the spectators' reopen countdown once per whole second.
        const secs = Math.ceil(duelWait)
        if (secs !== duel.resetIn) {
          duel.resetIn = secs
          publishDuel()
        }
        return
      }
      if (duel.phase !== 'battle' || !duel.battle) return
      duelWait -= dt
      if (duelWait > 0) return

      const battle = duel.battle
      if (battle.winner) {
        duelFinish(battle.winner)
        return
      }
      stepBattle(battle)
      duelWait = 1.6
      publishDuel()
    })

    return { duel, publishDuel, duelReset, onMsg }
  }

  room.onMessage('duelMsg', (data, context) => {
    if (!context) return
    const sender = context.from.toLowerCase()
    if (!sender) return
    let msg: DuelMsg
    try {
      msg = JSON.parse(data.json) as DuelMsg
    } catch {
      return
    }
    rooms.find((entry) => entry.duel.mode === msg.mode)?.onMsg(sender, msg)
  })

  return { rooms }
}
