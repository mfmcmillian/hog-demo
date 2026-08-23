import { openHeroCard } from '../game/menu'
import { game } from '../game/store'
import type { OwnedFamiliar } from '../game/types'
import { getMyAddress } from './identity'
import { TradeMsg, TradeTable, TradeUpdate } from './protocol'
import { room } from './transport'

export const trade = {
  /** Pending incoming invite. */
  invite: undefined as { from: string; name: string } | undefined,
  /** Outgoing invite we are waiting on. */
  sentTo: '',
  table: undefined as TradeTable | undefined,
  closed: '' as '' | 'declined' | 'cancelled' | 'left' | 'failed'
}

function sendTrade(msg: TradeMsg): void {
  room.send('tradeMsg', { json: JSON.stringify(msg) })
}

export function tradeInvite(to: string): void {
  trade.sentTo = to
  trade.closed = ''
  sendTrade({ type: 'invite', to })
}

export function tradeAccept(): void {
  if (!trade.invite) return
  sendTrade({ type: 'accept', from: trade.invite.from })
  trade.invite = undefined
}

export function tradeDecline(): void {
  if (!trade.invite) return
  sendTrade({ type: 'decline', from: trade.invite.from })
  trade.invite = undefined
}

export function tradeOffer(uid: string): void {
  sendTrade({ type: 'offer', uid })
}

export function tradeLock(locked: boolean): void {
  sendTrade({ type: 'lock', locked })
}

export function tradeCancel(): void {
  if (trade.table || trade.sentTo) sendTrade({ type: 'cancel' })
  trade.table = undefined
  trade.sentTo = ''
  trade.closed = ''
}

/** My side / their side of the live table, if any. */
export function tradeSides(): {
  mine?: OwnedFamiliar
  theirs?: OwnedFamiliar
  myLock: boolean
  theirLock: boolean
  themName: string
} {
  const table = trade.table
  if (!table) return { myLock: false, theirLock: false, themName: '' }
  const iAmA = table.a === getMyAddress()
  return {
    mine: iAmA ? table.offerA : table.offerB,
    theirs: iAmA ? table.offerB : table.offerA,
    myLock: iAmA ? table.lockA : table.lockB,
    theirLock: iAmA ? table.lockB : table.lockA,
    themName: iAmA ? table.nameB : table.nameA
  }
}

export function setupTradeClient(): void {
  room.onMessage('tradeUpdate', (data) => {
    if (!getMyAddress() || data.address.toLowerCase() !== getMyAddress()) return
    let update: TradeUpdate
    try {
      update = JSON.parse(data.json) as TradeUpdate
    } catch {
      return
    }
    if (update.type === 'invite') {
      trade.invite = { from: update.from, name: update.name }
      return
    }
    if (update.type === 'state') {
      trade.table = update.table
      trade.sentTo = ''
      trade.closed = ''
      // Pull both parties onto the table unless they are mid-fight.
      const p = game.phase
      if (p === 'home' || p === 'quest' || p === 'party' || p === 'fuse' || p === 'shop' || p === 'allies') {
        game.phase = 'trade'
      }
      return
    }
    if (update.type === 'done') {
      trade.table = undefined
      trade.sentTo = ''
      // saveLoaded landed just before this; the received card is in the collection.
      const received = game.collection.find((owned) => owned.uid === update.receivedUid)
      if (received) {
        game.reveal = received
        openHeroCard(received.uid, 'trade')
      }
      return
    }
    trade.table = undefined
    trade.sentTo = ''
    trade.closed = update.reason
  })
}
