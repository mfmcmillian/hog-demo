import { AvatarBase, PlayerIdentityData, engine, executeTask } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'
import { Storage } from '@dcl/sdk/server'
import { buildBattle, stepBattle } from '../game/combat'
import { BOSS_IDS, getDef, grantXp, isNftHero, makeOwned, nextUid, rollDef } from '../game/familiars'
import { PACKS, rollPack } from '../game/packs'
import { ROADS } from '../game/quests'
import { MAX_LEVEL, MAX_STARS, OwnedFamiliar, PARTY_SIZE } from '../game/types'
import {
  FEST_BLESS_COINS,
  FEST_GIFT_CARD_CHANCE,
  FEST_GIFT_COINS,
  FestPub,
  GiftMsg,
  GiftUpdate,
  MP_VERSION,
  PlayerSave,
  RIFT_ENERGY_COST,
  RIFT_FLOORS,
  RIFT_SEATS,
  RiftMsg,
  RiftPub,
  RiftReward,
  RiftSeat,
  TradeMsg,
  TradeTable,
  TradeUpdate,
  emptyFest,
  emptyRift,
  emptySave,
  giftDayOf
} from '../mp/protocol'
import { FEST_SYNC_ID, MpFestState, MpRiftState, RIFT_SYNC_ID, room } from '../mp/transport'

// Heroes of Genesis authoritative server. Owns per-wallet saves (collection,
// party, coins, progress), hero-card trade sessions, and the co-op Rift room.
// Battles in the Rift are simulated HERE and broadcast as snapshots, so no
// client can forge results.

const SAVE_KEY = 'hog-save-v1'
const ENERGY_MAX = 30

const present = new Set<string>()
const displayNames = new Map<string, string>()

function shortAddress(address: string): string {
  return address.length > 10 ? `${address.slice(0, 6)}..${address.slice(-4)}` : address
}

function nameFor(address: string): string {
  return displayNames.get(address) || shortAddress(address)
}

// --- Save sanitizing -------------------------------------------------------------

function knownDef(defId: unknown): boolean {
  if (typeof defId !== 'string' || !defId) return false
  try {
    getDef(defId)
    return true
  } catch {
    return false
  }
}

function sanitizeOwned(raw: unknown): OwnedFamiliar | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const row = raw as Partial<OwnedFamiliar>
  if (!knownDef(row.defId) || typeof row.uid !== 'string' || !row.uid) return undefined
  return {
    uid: row.uid.slice(0, 40),
    defId: row.defId as string,
    stars: Math.max(1, Math.min(MAX_STARS, Math.floor(Number(row.stars) || 1))),
    level: Math.max(1, Math.min(MAX_LEVEL, Math.floor(Number(row.level) || 1))),
    xp: Math.max(0, Math.min(999999, Math.floor(Number(row.xp) || 0))),
    ...(row.isHero === true ? { isHero: true } : {})
  }
}

function sanitizeSave(raw: unknown): PlayerSave {
  const save = emptySave()
  if (!raw || typeof raw !== 'object') return save
  const row = raw as Partial<PlayerSave>
  const seen = new Set<string>()
  for (const item of Array.isArray(row.collection) ? row.collection.slice(0, 300) : []) {
    const owned = sanitizeOwned(item)
    if (!owned || seen.has(owned.uid)) continue
    seen.add(owned.uid)
    save.collection.push(owned)
  }
  const uids = new Set(save.collection.map((owned) => owned.uid))
  save.heroUid = typeof row.heroUid === 'string' && uids.has(row.heroUid) ? row.heroUid : ''
  for (let i = 0; i < PARTY_SIZE; i++) {
    const uid = Array.isArray(row.party) ? row.party[i] : ''
    save.party[i] = typeof uid === 'string' && uids.has(uid) && save.party.indexOf(uid) < 0 ? uid : ''
  }
  save.coins = Math.max(0, Math.min(9999999, Math.floor(Number(row.coins) || 0)))
  save.energy = Math.max(0, Math.min(ENERGY_MAX, Math.floor(Number(row.energy) || 0)))
  save.cleared = Math.max(0, Math.min(ROADS.length, Math.floor(Number(row.cleared) || 0)))
  if (row.floorAt && typeof row.floorAt === 'object') {
    for (const road of ROADS) {
      const floor = (row.floorAt as Record<string, unknown>)[road.id]
      if (typeof floor === 'number' && floor > 1) save.floorAt[road.id] = Math.min(10, Math.floor(floor))
    }
  }
  if (row.roadStar && typeof row.roadStar === 'object') {
    for (const road of ROADS) {
      const star = (row.roadStar as Record<string, unknown>)[road.id]
      if (typeof star === 'number' && star > 1) save.roadStar![road.id] = Math.min(MAX_STARS, Math.floor(star))
    }
  }
  save.soundOn = row.soundOn !== false
  save.musicOn = row.musicOn !== false
  save.giftDay = Math.max(0, Math.floor(Number(row.giftDay) || 0))
  return save
}

export function startServer(): void {
  console.log('[Server] Heroes of Genesis authoritative server starting')

  // --- Saves -----------------------------------------------------------------
  const saves = new Map<string, PlayerSave>()
  /** Addresses whose storage load succeeded; only those may persist. */
  const saveReady = new Set<string>()
  const saveChain = new Map<string, Promise<void>>()

  function enqueue(address: string, work: () => Promise<void>): void {
    const previous = saveChain.get(address) ?? Promise.resolve()
    const next = previous.then(work, work)
    saveChain.set(
      address,
      next.catch((error: unknown) => console.log(`[Server] save task failed for ${address}: ${error}`))
    )
  }

  /**
   * 'load' = echoing held/stored state (arrivals, hello requests) - the client
   * may be ahead of it and should merge. 'update' = the server itself changed
   * the save (trade, rift, gift) - the client should mirror it.
   */
  function pushSave(address: string, reason: 'load' | 'update' = 'update'): void {
    const save = saves.get(address)
    room.send('saveLoaded', {
      address,
      json: JSON.stringify({ save: save ?? null, ready: saveReady.has(address), reason })
    })
  }

  function persistSave(address: string): void {
    if (!saveReady.has(address)) return
    const save = saves.get(address)
    if (!save) return
    try {
      Storage.player.set(address, SAVE_KEY, save).catch((error: unknown) => {
        console.log(`[Server] save persist failed for ${address}: ${error}`)
      })
    } catch (error) {
      console.log(`[Server] save persist failed for ${address}: ${error}`)
    }
  }

  function loadOnArrive(address: string): void {
    enqueue(address, async () => {
      try {
        const stored = await Storage.player.get<PlayerSave>(address, SAVE_KEY)
        if (!saves.has(address) || (stored && stored.collection?.length)) {
          saves.set(address, sanitizeSave(stored ?? undefined))
        }
        saveReady.add(address)
        maybeGrantFest(address) // contributor arriving after the goal completed
      } catch (error) {
        console.log(`[Server] save load failed for ${address}: ${error}`)
        saveReady.delete(address)
      }
      pushSave(address, 'load')
    })
  }

  room.onMessage('saveRequest', (data, context) => {
    if (!context) return
    const sender = context.from.toLowerCase()
    if (!sender) return
    if (!data.json) {
      pushSave(sender, 'load')
      return
    }
    let incoming: PlayerSave
    try {
      incoming = sanitizeSave(JSON.parse(data.json))
    } catch {
      return
    }
    const stored = saves.get(sender)
    // Never let an unhydrated client wipe a real save with an empty one.
    // Deliberate wipes go through resetRequest instead.
    if (stored && stored.collection.length > 0 && incoming.collection.length === 0) return
    saves.set(sender, incoming)
    persistSave(sender)
  })

  room.onMessage('resetRequest', (data, context) => {
    if (!context || !data.confirm) return
    const sender = context.from.toLowerCase()
    if (!sender) return
    saves.set(sender, emptySave())
    persistSave(sender)
  })

  // --- Trading ---------------------------------------------------------------
  type TradeSession = { a: string; b: string; offerA?: OwnedFamiliar; offerB?: OwnedFamiliar; lockA: boolean; lockB: boolean }
  const sessions = new Map<string, TradeSession>() // both addresses -> same object
  const invites = new Map<string, { from: string; at: number }>() // invitee -> inviter

  function sendTrade(address: string, update: TradeUpdate): void {
    room.send('tradeUpdate', { address, json: JSON.stringify(update) })
  }

  function tableOf(session: TradeSession): TradeTable {
    return {
      a: session.a,
      b: session.b,
      nameA: nameFor(session.a),
      nameB: nameFor(session.b),
      offerA: session.offerA,
      offerB: session.offerB,
      lockA: session.lockA,
      lockB: session.lockB
    }
  }

  function publishTrade(session: TradeSession): void {
    sendTrade(session.a, { type: 'state', table: tableOf(session) })
    sendTrade(session.b, { type: 'state', table: tableOf(session) })
  }

  function closeTrade(session: TradeSession, reason: 'declined' | 'cancelled' | 'left' | 'failed'): void {
    sessions.delete(session.a)
    sessions.delete(session.b)
    sendTrade(session.a, { type: 'closed', reason })
    sendTrade(session.b, { type: 'closed', reason })
  }

  function executeTrade(session: TradeSession): void {
    const saveA = saves.get(session.a)
    const saveB = saves.get(session.b)
    const offerA = session.offerA
    const offerB = session.offerB
    if (!saveA || !saveB || !offerA || !offerB || !saveReady.has(session.a) || !saveReady.has(session.b)) {
      closeTrade(session, 'failed')
      return
    }
    // NFT wearable-gated heroes are untradable: ownership follows the
    // wearables, and a traded copy would just be revoked on the buyer's client.
    const cardA = saveA.collection.find((owned) => owned.uid === offerA.uid && !owned.isHero && !isNftHero(owned.defId))
    const cardB = saveB.collection.find((owned) => owned.uid === offerB.uid && !owned.isHero && !isNftHero(owned.defId))
    if (!cardA || !cardB) {
      closeTrade(session, 'failed')
      return
    }
    // Atomic swap; transferred cards get fresh uids so uid schemes never collide.
    saveA.collection = saveA.collection.filter((owned) => owned.uid !== cardA.uid)
    saveB.collection = saveB.collection.filter((owned) => owned.uid !== cardB.uid)
    saveA.party = saveA.party.map((uid) => (uid === cardA.uid ? '' : uid))
    saveB.party = saveB.party.map((uid) => (uid === cardB.uid ? '' : uid))
    const toA: OwnedFamiliar = { ...cardB, uid: nextUid(), isHero: undefined }
    const toB: OwnedFamiliar = { ...cardA, uid: nextUid(), isHero: undefined }
    delete toA.isHero
    delete toB.isHero
    saveA.collection.push(toA)
    saveB.collection.push(toB)
    persistSave(session.a)
    persistSave(session.b)
    sessions.delete(session.a)
    sessions.delete(session.b)
    pushSave(session.a)
    pushSave(session.b)
    sendTrade(session.a, { type: 'done', receivedUid: toA.uid })
    sendTrade(session.b, { type: 'done', receivedUid: toB.uid })
    console.log(`[Server] trade: ${nameFor(session.a)} ${cardA.defId} <-> ${nameFor(session.b)} ${cardB.defId}`)
  }

  room.onMessage('tradeMsg', (data, context) => {
    if (!context) return
    const sender = context.from.toLowerCase()
    if (!sender) return
    let msg: TradeMsg
    try {
      msg = JSON.parse(data.json) as TradeMsg
    } catch {
      return
    }
    const session = sessions.get(sender)

    if (msg.type === 'invite') {
      const target = typeof msg.to === 'string' ? msg.to.toLowerCase() : ''
      if (!target || target === sender) return
      if (!present.has(target) || sessions.has(sender) || sessions.has(target)) return
      if (!saveReady.has(sender) || !saveReady.has(target)) return
      invites.set(target, { from: sender, at: Date.now() })
      sendTrade(target, { type: 'invite', from: sender, name: nameFor(sender) })
      return
    }
    if (msg.type === 'accept') {
      const invite = invites.get(sender)
      if (!invite || invite.from !== (msg.from ?? '').toLowerCase()) return
      invites.delete(sender)
      if (sessions.has(sender) || sessions.has(invite.from) || !present.has(invite.from)) return
      const fresh: TradeSession = { a: invite.from, b: sender, lockA: false, lockB: false }
      sessions.set(fresh.a, fresh)
      sessions.set(fresh.b, fresh)
      publishTrade(fresh)
      return
    }
    if (msg.type === 'decline') {
      const invite = invites.get(sender)
      if (!invite) return
      invites.delete(sender)
      sendTrade(invite.from, { type: 'closed', reason: 'declined' })
      return
    }
    if (!session) return
    const mine = session.a === sender ? 'A' : 'B'

    if (msg.type === 'offer') {
      const save = saves.get(sender)
      const card = msg.uid ? save?.collection.find((owned) => owned.uid === msg.uid && !owned.isHero) : undefined
      if (msg.uid && !card) return
      if (mine === 'A') session.offerA = card
      else session.offerB = card
      session.lockA = false
      session.lockB = false
      publishTrade(session)
      return
    }
    if (msg.type === 'lock') {
      if (mine === 'A') session.lockA = msg.locked === true && !!session.offerA
      else session.lockB = msg.locked === true && !!session.offerB
      if (session.lockA && session.lockB) {
        executeTrade(session)
        return
      }
      publishTrade(session)
      return
    }
    if (msg.type === 'cancel') closeTrade(session, 'cancelled')
  })

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
      const save = saves.get(seat.address)
      if (save) {
        save.energy = Math.max(0, save.energy - RIFT_ENERGY_COST)
        persistSave(seat.address)
        pushSave(seat.address)
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
        const save = saves.get(seat.address)
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
          persistSave(seat.address)
          pushSave(seat.address)
        }
        rewards.push(reward)
      }
      rift.rewards = rewards
    }
    riftWait = won ? 12 : 9
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
      const save = saves.get(sender)
      const card = save?.collection.find((owned) => owned.uid === msg.heroUid)
      if (!save || !card) return
      // Not enough energy: refuse the seat (clients also gate this).
      if (save.energy < RIFT_ENERGY_COST) return
      const seat: RiftSeat = {
        address: sender,
        name: nameFor(sender),
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
      if (riftWait <= 0) riftReset()
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
      festBump(1) // every cleared rift floor feeds the realm goal
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

  // --- Festival: realm goal + daily gifts -----------------------------------------
  const FEST_KEY = 'hog-fest-v1'
  type FestStore = FestPub & { contributors: Record<string, number>; claimed: Record<string, boolean> }
  const festEntity = engine.addEntity()
  let festRevision = 0
  let fest: FestStore = { ...emptyFest(), contributors: {}, claimed: {} }
  /** Storage round-trip confirmed; until then the counter is session-only. */
  let festReady = false

  function festPub(): FestPub {
    return { week: fest.week, count: fest.count, target: fest.target, endsAt: fest.endsAt, done: fest.done }
  }

  MpFestState.create(festEntity, { json: JSON.stringify(festPub()), revision: festRevision })
  syncEntity(festEntity, [MpFestState.componentId], FEST_SYNC_ID)

  function publishFest(): void {
    festRevision += 1
    const state = MpFestState.getMutable(festEntity)
    state.json = JSON.stringify(festPub())
    state.revision = festRevision
  }

  function persistFest(): void {
    if (!festReady) return
    try {
      Storage.set(FEST_KEY, JSON.stringify(fest)).catch((error: unknown) => {
        console.log(`[Server] fest persist failed: ${error}`)
      })
    } catch (error) {
      console.log(`[Server] fest persist failed: ${error}`)
    }
  }

  executeTask(async () => {
    try {
      const raw = await Storage.get<string>(FEST_KEY)
      if (raw) {
        const stored = JSON.parse(raw) as FestStore
        if (stored && stored.week === fest.week) {
          fest = { ...fest, ...stored, contributors: stored.contributors ?? {}, claimed: stored.claimed ?? {} }
        }
      }
      festReady = true
    } catch (error) {
      console.log(`[Server] fest load failed: ${error}`)
    }
    publishFest()
  })

  /** Grant the goal reward (a crown-tier card) once per contributor per window. */
  function maybeGrantFest(address: string): void {
    if (!fest.done || fest.claimed[address] || !(fest.contributors[address] > 0)) return
    const save = saves.get(address)
    if (!save || !saveReady.has(address)) return // offline: granted on next arrival
    const crown = PACKS.find((pack) => pack.id === 'crown')
    const drop = makeOwned((crown ? rollPack(crown) : rollDef()).id)
    save.collection.push(drop)
    fest.claimed[address] = true
    persistSave(address)
    persistFest()
    pushSave(address)
  }

  function festBump(floors: number): void {
    if (Date.now() > fest.endsAt) return // the festival is over; the tally freezes
    fest.count += floors
    for (const seat of rift.seats) {
      fest.contributors[seat.address] = (fest.contributors[seat.address] ?? 0) + floors
    }
    if (!fest.done && fest.count >= fest.target) {
      fest.done = true
      console.log('[Server] realm goal complete')
      for (const address of Object.keys(fest.contributors)) maybeGrantFest(address)
    }
    persistFest()
    publishFest()
  }

  room.onMessage('giftMsg', (data, context) => {
    if (!context) return
    const sender = context.from.toLowerCase()
    if (!sender) return
    let msg: GiftMsg
    try {
      msg = JSON.parse(data.json) as GiftMsg
    } catch {
      return
    }
    if (msg.type !== 'send') return
    const sendGift = (address: string, update: GiftUpdate) => room.send('giftUpdate', { address, json: JSON.stringify(update) })
    const to = (msg.to || '').toLowerCase()
    const giver = saves.get(sender)
    const taker = saves.get(to)
    if (!giver || !taker || !to || to === sender || !present.has(to)) {
      sendGift(sender, { type: 'blocked', reason: 'gone' })
      return
    }
    const today = giftDayOf(Date.now())
    if (giver.giftDay >= today) {
      sendGift(sender, { type: 'blocked', reason: 'daily' })
      return
    }
    giver.giftDay = today
    giver.coins += FEST_BLESS_COINS
    taker.coins += FEST_GIFT_COINS
    // Lucky days: the chest also holds an ember-tier hero card.
    let dropDefId: string | undefined
    let dropUid: string | undefined
    if (Math.random() < FEST_GIFT_CARD_CHANCE) {
      const ember = PACKS.find((pack) => pack.id === 'ember')
      const drop = makeOwned((ember ? rollPack(ember) : rollDef()).id)
      taker.collection.push(drop)
      dropDefId = drop.defId
      dropUid = drop.uid
    }
    persistSave(sender)
    persistSave(to)
    pushSave(sender)
    pushSave(to)
    sendGift(to, { type: 'received', name: nameFor(sender), coins: FEST_GIFT_COINS, dropDefId, dropUid })
    sendGift(sender, { type: 'sent', coins: FEST_BLESS_COINS })
  })

  // --- Presence -----------------------------------------------------------------
  engine.addSystem(() => {
    const inScene = new Set<string>()
    for (const [entity, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
      const address = identity.address.toLowerCase()
      inScene.add(address)
      if (AvatarBase.has(entity)) {
        const name = (AvatarBase.get(entity).name ?? '').trim().slice(0, 16)
        if (name && !/^0x[0-9a-f]/i.test(name)) displayNames.set(address, name)
      }
    }

    for (const address of present) {
      if (inScene.has(address)) continue
      // Departures: void their trade, free their lobby seat.
      const session = sessions.get(address)
      if (session) closeTrade(session, 'left')
      invites.delete(address)
      if (rift.phase === 'lobby' && rift.seats.some((seat) => seat.address === address)) {
        rift.seats = rift.seats.filter((seat) => seat.address !== address)
        publishRift()
      }
    }

    // Mid-run wipeout of humans: nobody left to watch, reopen the room.
    if (rift.phase !== 'lobby' && rift.seats.length > 0 && !rift.seats.some((seat) => inScene.has(seat.address))) {
      console.log('[Server] rift: all participants left; resetting')
      riftReset()
    }

    for (const address of inScene) {
      if (!present.has(address)) loadOnArrive(address)
    }
    present.clear()
    for (const address of inScene) present.add(address)
  })

  console.log(`[Server] ready (protocol v${MP_VERSION})`)
}
