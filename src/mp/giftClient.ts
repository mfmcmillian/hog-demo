import { isCeremonyBusy, openHeroCard } from '../game/menu'
import { findOwned, game } from '../game/store'
import { getMyAddress } from './identity'
import { GiftMsg, GiftUpdate, giftDayOf } from './protocol'
import { room } from './transport'
import { gift } from './views'

/** A card that came inside a gift chest, waiting for its reveal. */
let giftDropUid = ''

export function giftSend(to: string): void {
  gift.picking = false
  const msg: GiftMsg = { type: 'send', to }
  room.send('giftMsg', { json: JSON.stringify(msg) })
}

/** One gift per UTC day; giftDay mirrors the server through the save. */
export function canGiftToday(): boolean {
  return game.giftDay < giftDayOf(Date.now())
}

export function setupGiftClient(): void {
  room.onMessage('giftUpdate', (data) => {
    if (!getMyAddress() || data.address.toLowerCase() !== getMyAddress()) return
    let update: GiftUpdate
    try {
      update = JSON.parse(data.json) as GiftUpdate
    } catch {
      return
    }
    if (update.type === 'received') {
      gift.received = { name: update.name, coins: update.coins, dropDefId: update.dropDefId }
      if (update.dropUid) giftDropUid = update.dropUid
      // The gift chest ceremony auto-starts: tickFlipbook watches gift.received.
      return
    }
    if (update.type === 'sent') {
      gift.blessing = update.coins
      gift.blessAge = 0
      return
    }
    gift.blocked = update.reason
    gift.blockedAge = 0
  })
}

export function tickGiftTimers(dt: number): void {
  // Gift toast/notice timers.
  if (gift.blessing > 0) {
    gift.blessAge += dt
    if (gift.blessAge > 3.5) gift.blessing = 0
  }
  if (gift.blocked) {
    gift.blockedAge += dt
    if (gift.blockedAge > 2.5) gift.blocked = ''
  }
}

export function tickGiftDropReveal(): void {
  // Gift card reveal: after the chest ceremony is dismissed and the updated
  // save has landed, run the same hero-card reveal as pack drops. Waits out
  // any battle flow the gift may have interrupted.
  if (giftDropUid && !gift.received) {
    const owned = findOwned(giftDropUid)
    if (!isCeremonyBusy() && owned) {
      giftDropUid = ''
      game.reveal = owned
      openHeroCard(owned.uid, game.phase === 'festival' ? 'festival' : 'home')
    }
  }
}
