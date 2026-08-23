import { engine } from '@dcl/sdk/ecs'
import { getPlayer, onEnterScene, onLeaveScene } from '@dcl/sdk/src/players'
import { boot } from '../game/boot'
import { applyDebugGrants, findOwned, game, goHome, openHeroCard } from '../game/state'
import { startGiftFx } from '../ui/flipbook'
import type { OwnedFamiliar } from '../game/types'
import {
  FestPub,
  GiftMsg,
  GiftUpdate,
  PlayerSave,
  MP_VERSION,
  RiftMsg,
  RiftPub,
  TradeMsg,
  TradeTable,
  TradeUpdate,
  emptyFest,
  emptyRift,
  giftDayOf
} from './protocol'
import { MpFestState, MpRiftState, room } from './transport'

// Client side of multiplayer. The server owns saves, trade tables, and the
// rift room; this module hydrates the local `game` from the server, pushes
// debounced save updates, and mirrors trade/rift state for the UI.

let myAddress = ''
let myName = ''
/** Other players currently in the scene: address -> display name. */
export const presentPlayers = new Map<string, string>()

/** True once the server confirmed a storage-backed save round-trip. */
let hydrated = false
let lastPushedJson = ''
let pushWait = 0

export const trade = {
  /** Pending incoming invite. */
  invite: undefined as { from: string; name: string } | undefined,
  /** Outgoing invite we are waiting on. */
  sentTo: '',
  table: undefined as TradeTable | undefined,
  closed: '' as '' | 'declined' | 'cancelled' | 'left' | 'failed'
}

export const riftView: { pub: RiftPub; revision: number } = { pub: emptyRift(), revision: -1 }

/** Watchers leave the end plaque on their own clock, not the room's 12s hold. */
const SPECTATOR_HOME_SECS = 2.8
let spectatorHomeIn = SPECTATOR_HOME_SECS

/** My rift drop, waiting for its hero-card reveal after the spoils screen. */
let riftDropUid = ''
/** A card that came inside a gift chest, waiting for its reveal. */
let giftDropUid = ''

// --- Festival --------------------------------------------------------------------

export const festView: { pub: FestPub; revision: number } = { pub: emptyFest(), revision: -1 }

export const gift = {
  /** Incoming gift: drives the full chest-opening ceremony overlay. */
  received: undefined as { name: string; coins: number; dropDefId?: string } | undefined,
  /** Blessing coins granted for sending; >0 shows the sender toast. */
  blessing: 0,
  blessAge: 0,
  /** Recipient picker overlay open. */
  picking: false,
  /** Server refused the gift; shown briefly on the festival screen. */
  blocked: '' as '' | 'daily' | 'gone',
  blockedAge: 0
}

export function giftSend(to: string): void {
  gift.picking = false
  const msg: GiftMsg = { type: 'send', to }
  room.send('giftMsg', { json: JSON.stringify(msg) })
}

/** One gift per UTC day; giftDay mirrors the server through the save. */
export function canGiftToday(): boolean {
  return game.giftDay < giftDayOf(Date.now())
}

export function getMyAddress(): string {
  return myAddress
}

export function isHydrated(): boolean {
  return hydrated
}

/**
 * Tell the server to wipe this wallet's stored save (settings > restart).
 * Uses a dedicated message because saveRequest deliberately refuses to
 * replace a real save with an empty one. The local wipe (resetAccount) puts
 * the game back on the start screen; the next debounced push after the new
 * oath stores the fresh account.
 */
export function pushAccountReset(): void {
  lastPushedJson = JSON.stringify(mySave())
  room.send('resetRequest', { confirm: true })
}

function mySave(): PlayerSave {
  return {
    v: MP_VERSION,
    collection: game.collection,
    party: game.party,
    heroUid: game.heroUid,
    coins: game.coins,
    energy: game.energy,
    cleared: game.cleared,
    floorAt: game.floorAt,
    roadStar: game.roadStar,
    soundOn: game.soundOn,
    musicOn: game.musicOn,
    giftDay: game.giftDay
  }
}

function applySave(save: PlayerSave): void {
  game.collection = save.collection
  game.party = [save.party[0] ?? '', save.party[1] ?? '', save.party[2] ?? '', save.party[3] ?? '']
  game.heroUid = save.heroUid
  game.coins = save.coins
  game.energy = save.energy
  game.cleared = save.cleared
  game.floorAt = save.floorAt
  // Older saves predate ascension; every road starts back at tier 1.
  game.roadStar = save.roadStar ?? {}
  // Older saves predate the toggles; missing means on.
  game.soundOn = save.soundOn !== false
  game.musicOn = save.musicOn !== false
  game.giftDay = Math.max(0, Math.floor(Number(save.giftDay) || 0))
  applyDebugGrants()
}

/**
 * A server-side change (trade, rift reward, gift) landed. The server holds
 * the truth for cards and coins, but road progression is client-driven and
 * strictly forward-moving: a push racing a just-won floor must not relock it.
 */
function applyServerUpdate(save: PlayerSave): void {
  const cleared = Math.max(game.cleared, save.cleared)
  const floorAt: Record<string, number> = { ...save.floorAt }
  for (const road of Object.keys(game.floorAt)) {
    floorAt[road] = Math.max(floorAt[road] ?? 1, game.floorAt[road])
  }
  const roadStar: Record<string, number> = { ...(save.roadStar ?? {}) }
  for (const road of Object.keys(game.roadStar)) {
    roadStar[road] = Math.max(roadStar[road] ?? 1, game.roadStar[road])
  }
  applySave(save)
  game.cleared = cleared
  game.floorAt = floorAt
  game.roadStar = roadStar
}

/**
 * The stored save arrived after the player already started playing (raced
 * past the start screen). Never clobber the live session - fold the stored
 * cards and progress in on top of it.
 */
function mergeSave(save: PlayerSave): void {
  const have = new Set(game.collection.map((owned) => owned.uid))
  for (const owned of save.collection) {
    if (!have.has(owned.uid)) game.collection.push(owned)
  }
  game.coins = Math.max(game.coins, save.coins)
  game.energy = Math.max(game.energy, save.energy)
  game.cleared = Math.max(game.cleared, save.cleared)
  for (const road of Object.keys(save.floorAt)) {
    game.floorAt[road] = Math.max(game.floorAt[road] ?? 1, save.floorAt[road])
  }
  for (const road of Object.keys(save.roadStar ?? {})) {
    game.roadStar[road] = Math.max(game.roadStar[road] ?? 1, save.roadStar![road])
  }
  applyDebugGrants()
}

// --- Trade API -------------------------------------------------------------------

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
export function tradeSides(): { mine?: OwnedFamiliar; theirs?: OwnedFamiliar; myLock: boolean; theirLock: boolean; themName: string } {
  const table = trade.table
  if (!table) return { myLock: false, theirLock: false, themName: '' }
  const iAmA = table.a === myAddress
  return {
    mine: iAmA ? table.offerA : table.offerB,
    theirs: iAmA ? table.offerB : table.offerA,
    myLock: iAmA ? table.lockA : table.lockB,
    theirLock: iAmA ? table.lockB : table.lockA,
    themName: iAmA ? table.nameB : table.nameA
  }
}

// --- Rift API --------------------------------------------------------------------

function sendRift(msg: RiftMsg): void {
  room.send('riftMsg', { json: JSON.stringify(msg) })
}

export function riftSit(heroUid: string): void {
  sendRift({ type: 'sit', heroUid })
}

export function riftLeave(): void {
  sendRift({ type: 'leave' })
}

export function riftReady(ready: boolean): void {
  sendRift({ type: 'ready', ready })
}

export function mySeat() {
  return riftView.pub.seats.find((seat) => seat.address === myAddress)
}

// --- Wiring ----------------------------------------------------------------------

let started = false

export function initMultiplayerSession(): void {
  if (started) return
  started = true

  onEnterScene((player) => {
    if (!player.userId) return
    const address = player.userId.toLowerCase()
    const me = (getPlayer()?.userId ?? '').toLowerCase()
    if (address === me) return
    presentPlayers.set(address, (player.name ?? '').trim() || address.slice(0, 8))
  })

  onLeaveScene((userId) => {
    presentPlayers.delete(userId.toLowerCase())
  })

  room.onMessage('saveLoaded', (data) => {
    if (!myAddress || data.address.toLowerCase() !== myAddress) return
    // Any answer (save, empty, or storage-down) releases the boot curtain.
    boot.saveKnown = true
    let parsed: { save?: PlayerSave | null; ready?: boolean; reason?: string }
    try {
      parsed = JSON.parse(data.json) as { save?: PlayerSave | null; ready?: boolean; reason?: string }
    } catch {
      return
    }
    if (parsed.ready === false) return // storage down: play session-only, never push
    const save = parsed.save
    // After a merge the local session may be AHEAD of the server; leaving
    // lastPushedJson stale lets the next debounce tick push the merged state.
    let merged = false
    if (save && save.collection.length > 0) {
      if (hydrated) {
        if (parsed.reason === 'load') {
          // Storage echo (e.g. the presence tracker blinked and re-loaded
          // us): the live session is newer, fold the echo in, never regress.
          mergeSave(save)
          merged = true
        } else {
          // A real server-side change (trade / rift reward / gift): mirror
          // it, but never let it roll road progression backwards.
          applyServerUpdate(save)
        }
      } else if (game.phase === 'start') {
        applySave(save)
        // Returning player: skip the oath ceremony, go straight to the hall.
        if (save.heroUid) goHome()
      } else {
        // Save arrived after the player already started playing; folding it
        // in keeps live cards (like a mid-battle drop) alive.
        mergeSave(save)
        merged = true
      }
    }
    if (!merged) lastPushedJson = JSON.stringify(mySave())
    hydrated = true
  })

  room.onMessage('tradeUpdate', (data) => {
    if (!myAddress || data.address.toLowerCase() !== myAddress) return
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

  room.onMessage('giftUpdate', (data) => {
    if (!myAddress || data.address.toLowerCase() !== myAddress) return
    let update: GiftUpdate
    try {
      update = JSON.parse(data.json) as GiftUpdate
    } catch {
      return
    }
    if (update.type === 'received') {
      gift.received = { name: update.name, coins: update.coins, dropDefId: update.dropDefId }
      if (update.dropUid) giftDropUid = update.dropUid
      startGiftFx() // ribbon chest ceremony; coins arrive via the save push
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

  engine.addSystem((dt) => {
    if (!myAddress) {
      const player = getPlayer()
      if (player?.userId) {
        // Guests play too - their address is just ephemeral, so the save
        // they build up only lives for the session.
        myAddress = player.userId.toLowerCase()
        myName = (player.name ?? '').trim() || myAddress.slice(0, 8)
        room.send('saveRequest', { json: '' }) // hello: ask for my save
      }
      return
    }

    // Mirror the synced rift room.
    for (const [, state] of engine.getEntitiesWith(MpRiftState)) {
      if (state.revision === riftView.revision) break
      riftView.revision = state.revision
      try {
        riftView.pub = JSON.parse(state.json) as RiftPub
      } catch {
        break
      }
      // Spectate: the server-simulated battle feeds the regular battle UI/FX.
      if (game.phase === 'rift' && riftView.pub.battle) game.battle = riftView.pub.battle
      if (riftView.pub.phase === 'won') {
        const mine = riftView.pub.rewards?.find((reward) => reward.address === myAddress)
        if (mine?.dropUid) riftDropUid = mine.dropUid
      }
      break
    }

    // Watchers are not on the spoils clock. A short recap, then home —
    // they should not sit on YOU WIN until the raiders tap through.
    if (game.phase === 'rift' && !mySeat() && (riftView.pub.phase === 'won' || riftView.pub.phase === 'lost')) {
      spectatorHomeIn -= dt
      if (spectatorHomeIn <= 0) {
        spectatorHomeIn = SPECTATOR_HOME_SECS
        goHome()
      }
    } else {
      spectatorHomeIn = SPECTATOR_HOME_SECS
    }

    // Mirror the synced festival state (realm goal + window clock).
    for (const [, state] of engine.getEntitiesWith(MpFestState)) {
      if (state.revision === festView.revision) break
      festView.revision = state.revision
      try {
        festView.pub = JSON.parse(state.json) as FestPub
      } catch {
        // keep the last good snapshot
      }
      break
    }

    // Gift toast/notice timers.
    if (gift.blessing > 0) {
      gift.blessAge += dt
      if (gift.blessAge > 3.5) gift.blessing = 0
    }
    if (gift.blocked) {
      gift.blockedAge += dt
      if (gift.blockedAge > 2.5) gift.blocked = ''
    }

    // Gift card reveal: after the chest ceremony is dismissed and the updated
    // save has landed, run the same hero-card reveal as pack drops. Waits out
    // any battle flow the gift may have interrupted.
    if (giftDropUid && !gift.received) {
      const busy =
        game.phase === 'battle' || game.phase === 'banner' || game.phase === 'report' || game.phase === 'heroCard' || game.phase === 'start'
      const owned = findOwned(giftDropUid)
      if (!busy && owned) {
        giftDropUid = ''
        game.reveal = owned
        openHeroCard(owned.uid, game.phase === 'festival' ? 'festival' : 'home')
      }
    }

    // Rift drop ceremony: once the spoils screen ends (room reset) or the
    // player walks off, open the hero card - same reveal as pack drops.
    if (riftDropUid && game.phase !== 'battle' && game.phase !== 'heroCard') {
      const doneWatching = riftView.pub.phase === 'lobby' || game.phase !== 'rift'
      const owned = findOwned(riftDropUid) // waits for the updated save to land
      if (doneWatching && owned) {
        riftDropUid = ''
        game.reveal = owned
        openHeroCard(owned.uid, game.phase === 'rift' ? 'rift' : 'home')
      }
    }

    // Debounced save push, only after a confirmed hydration round-trip.
    if (!hydrated) return
    pushWait -= dt
    if (pushWait > 0) return
    pushWait = 1.5
    if (game.phase === 'start') return // nothing worth saving before the oath
    const json = JSON.stringify(mySave())
    if (json === lastPushedJson) return
    lastPushedJson = json
    room.send('saveRequest', { json })
  })
}

export function getMyName(): string {
  return myName
}
