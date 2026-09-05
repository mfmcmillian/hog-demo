import { engine } from '@dcl/sdk/ecs'
import { isNftHero, nextUid } from '../game/familiars'
import { OwnedFamiliar } from '../game/types'
import { TradeMsg, TradeTable, TradeUpdate } from '../mp/protocol'
import { room } from '../mp/transport'
import { ServerCtx } from './ctx'

/** Unanswered invites die so the sender is not left on "waiting" forever. */
const INVITE_TTL_S = 45

export type TradeSession = { a: string; b: string; offerA?: OwnedFamiliar; offerB?: OwnedFamiliar; lockA: boolean; lockB: boolean }

export function setupTrades(ctx: ServerCtx): {
  sessions: Map<string, TradeSession>
  invites: Map<string, { from: string; at: number }>
  closeTrade: (session: TradeSession, reason: 'declined' | 'cancelled' | 'left' | 'failed') => void
  dropInvites: (address: string) => void
} {
  // --- Trading ---------------------------------------------------------------
  const sessions = new Map<string, TradeSession>() // both addresses -> same object
  const invites = new Map<string, { from: string; at: number }>() // invitee -> inviter

  function sendTrade(address: string, update: TradeUpdate): void {
    room.send('tradeUpdate', { address, json: JSON.stringify(update) })
  }

  /** Pull back every invite this player has out; the invitees' toasts close. */
  function withdrawInvites(from: string): void {
    for (const [target, invite] of [...invites]) {
      if (invite.from !== from) continue
      invites.delete(target)
      sendTrade(target, { type: 'closed', reason: 'cancelled' })
    }
  }

  /** Someone left the scene: drop their outgoing toast and tell whoever invited them. */
  function dropInvites(address: string): void {
    withdrawInvites(address)
    const incoming = invites.get(address)
    if (!incoming) return
    invites.delete(address)
    sendTrade(incoming.from, { type: 'closed', reason: 'left' })
  }

  function tableOf(session: TradeSession): TradeTable {
    return {
      a: session.a,
      b: session.b,
      nameA: ctx.nameFor(session.a),
      nameB: ctx.nameFor(session.b),
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
    const saveA = ctx.saves.get(session.a)
    const saveB = ctx.saves.get(session.b)
    const offerA = session.offerA
    const offerB = session.offerB
    if (!saveA || !saveB || !offerA || !offerB || !ctx.isSaveReady(session.a) || !ctx.isSaveReady(session.b)) {
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
    ctx.persistSave(session.a)
    ctx.persistSave(session.b)
    sessions.delete(session.a)
    sessions.delete(session.b)
    ctx.pushSave(session.a)
    ctx.pushSave(session.b)
    sendTrade(session.a, { type: 'done', receivedUid: toA.uid })
    sendTrade(session.b, { type: 'done', receivedUid: toB.uid })
    console.log(`[Server] trade: ${ctx.nameFor(session.a)} ${cardA.defId} <-> ${ctx.nameFor(session.b)} ${cardB.defId}`)
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
      // Tell the sender why it did not land — silent drop left them waiting.
      if (
        !target ||
        target === sender ||
        !ctx.present.has(target) ||
        sessions.has(sender) ||
        sessions.has(target) ||
        !ctx.isSaveReady(sender) ||
        !ctx.isSaveReady(target)
      ) {
        sendTrade(sender, { type: 'closed', reason: 'failed' })
        return
      }
      // One invite out at a time; a newer invite to a busy target bumps the
      // older inviter (they hear 'declined' instead of waiting forever).
      withdrawInvites(sender)
      const standing = invites.get(target)
      if (standing && standing.from !== sender) sendTrade(standing.from, { type: 'closed', reason: 'declined' })
      invites.set(target, { from: sender, at: Date.now() })
      sendTrade(target, { type: 'invite', from: sender, name: ctx.nameFor(sender) })
      return
    }
    if (msg.type === 'accept') {
      const invite = invites.get(sender)
      if (!invite || invite.from !== (msg.from ?? '').toLowerCase()) return
      invites.delete(sender)
      if (sessions.has(sender) || sessions.has(invite.from) || !ctx.present.has(invite.from)) {
        sendTrade(sender, { type: 'closed', reason: 'failed' })
        sendTrade(invite.from, { type: 'closed', reason: 'failed' })
        return
      }
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
    if (!session) {
      // Backing out while the invite is still unanswered pulls it back.
      if (msg.type === 'cancel') withdrawInvites(sender)
      return
    }
    const mine = session.a === sender ? 'A' : 'B'

    if (msg.type === 'offer') {
      const save = ctx.saves.get(sender)
      // Same rule as executeTrade, applied up front so a bad offer is refused
      // instead of failing the whole trade at the lock.
      const card = msg.uid
        ? save?.collection.find((owned) => owned.uid === msg.uid && !owned.isHero && !isNftHero(owned.defId))
        : undefined
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

  engine.addSystem(() => {
    const cutoff = Date.now() - INVITE_TTL_S * 1000
    for (const [target, invite] of [...invites]) {
      if (invite.at > cutoff) continue
      invites.delete(target)
      sendTrade(target, { type: 'closed', reason: 'cancelled' })
      sendTrade(invite.from, { type: 'closed', reason: 'declined' })
    }
  })

  return { sessions, invites, closeTrade, dropInvites }
}
