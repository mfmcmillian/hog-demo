import { engine } from '@dcl/sdk/ecs'
import { getPlayer } from '@dcl/sdk/src/players'
import { isHydrated } from '../mp/session'
import { NFT_HEROES, isNftHero, makeOwned } from './familiars'
import { game, openHeroCard } from './state'

// Wearable-gated heroes. Own the FULL wearable set (every URN below, from
// the Antrom3 collections) and the hero card joins your collection; sell or
// lose a piece and the card leaves again. These never appear in packs,
// drops, or trades - the wearables are the only door in.

export type NftPiece = { urn: string; icon: string }

/** Full set per hero: normalized 6-segment lowercase URNs, plus the LABELS
 *  key of each piece's marketplace thumbnail (images/wear/). */
const NFT_SETS: Record<string, NftPiece[]> = {
  'frost-monarch': [
    { urn: 'urn:decentraland:matic:collections-v2:0x0e9663c4b53ed79b343739b5bafab89666ee8ba3:0', icon: 'wear-frost-head' },
    { urn: 'urn:decentraland:matic:collections-v2:0x0e9663c4b53ed79b343739b5bafab89666ee8ba3:1', icon: 'wear-frost-body' },
    { urn: 'urn:decentraland:matic:collections-v2:0x0897430acd7bfc81bdcf51e815db8f0f53c94878:0', icon: 'wear-frost-shield' }
  ],
  'ether-assassin': [
    { urn: 'urn:decentraland:matic:collections-v2:0x0bf152a83a6fc55066c2b664b164ca2916ad38f5:0', icon: 'wear-ether-boots' },
    { urn: 'urn:decentraland:matic:collections-v2:0x0bf152a83a6fc55066c2b664b164ca2916ad38f5:1', icon: 'wear-ether-gloves' },
    { urn: 'urn:decentraland:matic:collections-v2:0x0bf152a83a6fc55066c2b664b164ca2916ad38f5:2', icon: 'wear-ether-armor' },
    { urn: 'urn:decentraland:matic:collections-v2:0x0bf152a83a6fc55066c2b664b164ca2916ad38f5:3', icon: 'wear-ether-pants' }
  ],
  'wasteland-monarch': [
    { urn: 'urn:decentraland:matic:collections-v2:0xf8a87150ca602dbeb2e748ad7c9c790d55d10528:0', icon: 'wear-waste-helm' },
    { urn: 'urn:decentraland:matic:collections-v2:0xf8a87150ca602dbeb2e748ad7c9c790d55d10528:2', icon: 'wear-waste-armor' },
    { urn: 'urn:decentraland:matic:collections-v2:0xf8a87150ca602dbeb2e748ad7c9c790d55d10528:1', icon: 'wear-waste-pants' }
  ]
}

/** The pieces behind one hero, for the locked-card dialog. */
export function nftPieces(defId: string): NftPiece[] {
  return NFT_SETS[defId] ?? []
}

// Foundation catalysts, tried in order - individual peers go down sometimes.
const CATALYSTS = [
  'https://peer.decentraland.org',
  'https://peer-ec2.decentraland.org',
  'https://peer-eu1.decentraland.org',
  'https://peer-ap1.decentraland.org'
]

const REFETCH_SECS = 300 // ownership can change mid-session (marketplace)
const RETRY_SECS = 20
const RECONCILE_SECS = 2

/** defIds whose full wearable set the wallet owns. Valid once `checked`. */
const entitled = new Set<string>()
/** Every gate-relevant URN the wallet owns; drives the dialog's piece ticks. */
const ownedUrns = new Set<string>()

/** True if the wallet owns this exact wearable (last successful check). */
export function ownsUrn(urn: string): boolean {
  return ownedUrns.has(urn)
}
/** True after the first successful ownership answer (guests count). */
let checked = false
let fetching = false
let nextFetchIn = 0
let reconcileIn = 0
/** Freshly granted cards waiting for their hero-card reveal. */
const revealQueue: string[] = []

export function nftChecked(): boolean {
  return checked
}

/** Wearable-gated heroes the player has NOT unlocked - the teaser tiles. */
export function lockedNftHeroes(): string[] {
  return NFT_HEROES.filter((def) => !game.collection.some((owned) => owned.defId === def.id)).map((def) => def.id)
}

function normalizeUrn(raw: string): string {
  const parts = raw.toLowerCase().split(':')
  return parts.length > 6 ? parts.slice(0, 6).join(':') : parts.join(':')
}

/**
 * Sticky fallback: start with whichever catalyst answered last time, so a
 * dead primary only costs its timeout once per session, not on every fetch.
 */
let preferredCatalyst = 0

async function fetchOwnedUrns(userId: string): Promise<Set<string> | null> {
  let data: unknown = null
  for (let i = 0; i < CATALYSTS.length; i++) {
    const at = (preferredCatalyst + i) % CATALYSTS.length
    const domain = CATALYSTS[at]
    // Owned (not just equipped) wearables live in Lambdas v2 under /users.
    const url = `${domain}/lambdas/users/${userId}/wearables?pageSize=1000`
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`status ${response.status}`)
      data = await response.json()
      preferredCatalyst = at
      break
    } catch (error) {
      console.log(`[NFT] wearables fetch failed on ${domain}: ${error}`)
    }
  }
  if (data === null) return null
  const items = Array.isArray(data) ? data : Array.isArray((data as { elements?: unknown[] })?.elements) ? (data as { elements: unknown[] }).elements : []
  const urns = new Set<string>()
  for (const item of items) {
    const raw = (item as { urn?: string; id?: string })?.urn ?? (item as { id?: string })?.id
    if (typeof raw === 'string' && raw.length > 0) urns.add(normalizeUrn(raw))
  }
  return urns
}

async function refreshEntitlements(): Promise<void> {
  if (fetching) return
  const player = getPlayer()
  if (!player?.userId) return
  fetching = true
  try {
    if (player.isGuest) {
      // No wallet, no wearables - but the answer is final for this session.
      entitled.clear()
      ownedUrns.clear()
      checked = true
      return
    }
    const owned = await fetchOwnedUrns(player.userId)
    if (owned === null) {
      // Every catalyst failed: keep the last known answer, retry soon.
      nextFetchIn = RETRY_SECS
      return
    }
    entitled.clear()
    ownedUrns.clear()
    for (const defId of Object.keys(NFT_SETS)) {
      const pieces = NFT_SETS[defId]
      for (const piece of pieces) {
        if (owned.has(piece.urn)) ownedUrns.add(piece.urn)
      }
      if (pieces.every((piece) => owned.has(piece.urn))) entitled.add(defId)
    }
    checked = true
    nextFetchIn = REFETCH_SECS
    console.log(`[NFT] unlocked heroes: ${entitled.size ? [...entitled].join(', ') : 'none'}`)
  } finally {
    fetching = false
  }
}

/**
 * Make the collection agree with the wallet. Runs repeatedly (server pushes
 * can replace the whole collection, e.g. after a trade or rift reward), so
 * a clobbered grant heals on the next pass and the debounced save push
 * persists it.
 */
function reconcile(): void {
  for (const defId of Object.keys(NFT_SETS)) {
    const owned = game.collection.filter((entry) => entry.defId === defId)
    if (entitled.has(defId)) {
      if (owned.length > 0) continue
      const card = makeOwned(defId)
      game.collection.push(card)
      revealQueue.push(card.uid)
      continue
    }
    if (owned.length === 0) continue
    // The set broke up (piece sold/transferred): the hero leaves with it.
    const uids = owned.map((entry) => entry.uid)
    game.collection = game.collection.filter((entry) => uids.indexOf(entry.uid) < 0)
    game.party = game.party.map((uid) => (uids.indexOf(uid) >= 0 ? '' : uid))
  }
}

function tryReveal(): void {
  if (!revealQueue.length) return
  const busy =
    game.phase === 'battle' || game.phase === 'banner' || game.phase === 'report' || game.phase === 'heroCard' || game.phase === 'start'
  if (busy) return
  const uid = revealQueue[0]
  const owned = game.collection.find((entry) => entry.uid === uid)
  if (!owned) {
    revealQueue.shift()
    return
  }
  revealQueue.shift()
  game.reveal = owned
  openHeroCard(owned.uid, game.phase)
}

let started = false

export function initNftHeroes(): void {
  if (started) return
  started = true
  engine.addSystem((dt) => {
    nextFetchIn -= dt
    if (nextFetchIn <= 0 && !fetching) {
      nextFetchIn = RETRY_SECS
      void refreshEntitlements()
    }
    // Grant/revoke only against a server-confirmed save, or the push after
    // hydration could overwrite a real collection with a thin session one.
    if (!checked || !isHydrated()) return
    reconcileIn -= dt
    if (reconcileIn <= 0) {
      reconcileIn = RECONCILE_SECS
      reconcile()
    }
    tryReveal()
  })
}
