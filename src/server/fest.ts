import { engine, executeTask } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'
import { Storage } from '@dcl/sdk/server'
import { makeOwned, rollDef } from '../game/familiars'
import { PACKS, rollPack } from '../game/packs'
import {
  FEST_BLESS_COINS,
  FEST_GIFT_CARD_CHANCE,
  FEST_GIFT_COINS,
  FestPub,
  GiftMsg,
  GiftUpdate,
  RiftSeat,
  emptyFest,
  giftDayOf
} from '../mp/protocol'
import { FEST_SYNC_ID, MpFestState, room } from '../mp/transport'
import { ServerCtx } from './ctx'

export function setupFest(
  ctx: ServerCtx,
  deps: { getRiftSeats: () => RiftSeat[] }
): { maybeGrantFest: (address: string) => void; festBump: (floors: number) => void } {
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
    const save = ctx.saves.get(address)
    if (!save || !ctx.isSaveReady(address)) return // offline: granted on next arrival
    const crown = PACKS.find((pack) => pack.id === 'crown')
    const drop = makeOwned((crown ? rollPack(crown) : rollDef()).id)
    save.collection.push(drop)
    fest.claimed[address] = true
    ctx.persistSave(address)
    persistFest()
    ctx.pushSave(address)
  }

  function festBump(floors: number): void {
    if (Date.now() > fest.endsAt) return // the festival is over; the tally freezes
    fest.count += floors
    for (const seat of deps.getRiftSeats()) {
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
    const giver = ctx.saves.get(sender)
    const taker = ctx.saves.get(to)
    if (!giver || !taker || !to || to === sender || !ctx.present.has(to)) {
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
    ctx.persistSave(sender)
    ctx.persistSave(to)
    ctx.pushSave(sender)
    ctx.pushSave(to)
    sendGift(to, { type: 'received', name: ctx.nameFor(sender), coins: FEST_GIFT_COINS, dropDefId, dropUid })
    sendGift(sender, { type: 'sent', coins: FEST_BLESS_COINS })
  })

  return { maybeGrantFest, festBump }
}
