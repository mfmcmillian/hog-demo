import { Schemas, engine } from '@dcl/sdk/ecs'
import { registerMessages } from '@dcl/sdk/network'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'

// Shared transport - imported by BOTH the authoritative server and clients
// during initial module evaluation, so schemas and component ids match on
// every peer before main() runs.

/** Sync id for the rift room entity the server publishes. */
export const RIFT_SYNC_ID = 6001

/**
 * The whole rift room (lobby seats or the live battle snapshot) as one JSON
 * payload. Written only by the authoritative server; clients just parse it.
 * Living in a synced component means late joiners see the room instantly.
 */
export const MpRiftState = engine.defineComponent('hog-mp-rift-state', {
  json: Schemas.String,
  revision: Schemas.Int
})

MpRiftState.validateBeforeChange((value) => value.senderAddress === AUTH_SERVER_PEER_ID)

/** Sync ids for the duel ring entities the server publishes (one per mode). */
export const DUEL_SYNC_IDS = { '1v1': 6003, '4v4': 6004 } as const

/** A duel ring (lobby seats or the live fight snapshot), same pattern as the
 * rift. One component type on two entities - clients route by the mode field
 * inside the JSON. */
export const MpDuelState = engine.defineComponent('hog-mp-duel-state', {
  json: Schemas.String,
  revision: Schemas.Int
})

MpDuelState.validateBeforeChange((value) => value.senderAddress === AUTH_SERVER_PEER_ID)

/** Sync id for the festival entity (realm goal + window clock). */
export const FEST_SYNC_ID = 6002

export const MpFestState = engine.defineComponent('hog-mp-fest-state', {
  json: Schemas.String,
  revision: Schemas.Int
})

MpFestState.validateBeforeChange((value) => value.senderAddress === AUTH_SERVER_PEER_ID)

/** Sync id for the shared overworld entity (player tiles + wilds monsters). */
export const OW_SYNC_ID = 6005

export const MpOwState = engine.defineComponent('hog-mp-ow-state', {
  json: Schemas.String,
  revision: Schemas.Int
})

MpOwState.validateBeforeChange((value) => value.senderAddress === AUTH_SERVER_PEER_ID)

/** Sync id for the roster entity: every present player's account level. */
export const LEVELS_SYNC_ID = 6006

/** `json` is a Record<address, level> for players in the scene, so lobbies,
 * the trade table and the gift list can show who they are dealing with. */
export const MpLevelsState = engine.defineComponent('hog-mp-levels-state', {
  json: Schemas.String,
  revision: Schemas.Int
})

MpLevelsState.validateBeforeChange((value) => value.senderAddress === AUTH_SERVER_PEER_ID)

/** Sync id for the Hall of Heroes entity: the leaderboards. */
export const BOARDS_SYNC_ID = 6007

/** `json` is a BoardsPub: the top rows of each board plus every present
 * player's rank on each, rebuilt by the server when a row changes. */
export const MpBoardsState = engine.defineComponent('hog-mp-boards-state', {
  json: Schemas.String,
  revision: Schemas.Int
})

MpBoardsState.validateBeforeChange((value) => value.senderAddress === AUTH_SERVER_PEER_ID)

/** Sync id for the realm feed entity: the last FEED_MAX public events. */
export const FEED_SYNC_ID = 6008

/** `json` is a FeedPub ring buffer, persisted, so someone arriving in an empty
 * World still sees the last few hours of other people's play. */
export const MpFeedState = engine.defineComponent('hog-mp-feed-state', {
  json: Schemas.String,
  revision: Schemas.Int
})

MpFeedState.validateBeforeChange((value) => value.senderAddress === AUTH_SERVER_PEER_ID)

/** Sync id for the looks entity: how absent players' walkers should be drawn. */
export const LOOKS_SYNC_ID = 6009

/** `json` is a LooksPub: address -> packed avatar look (body, skin, hair) for
 * the last LOOKS_MAX wallets the server saw, so hall rows and feed lines for
 * people who have left still show their colors rather than the default villager. */
export const MpLooksState = engine.defineComponent('hog-mp-looks-state', {
  json: Schemas.String,
  revision: Schemas.Int
})

MpLooksState.validateBeforeChange((value) => value.senderAddress === AUTH_SERVER_PEER_ID)

/** Sync id for the world boss lair: the shared boss, its hp, the damage board. */
export const BOSS_SYNC_ID = 6010

/** `json` is a BossPub. Private fights are NOT in here - each attacker gets
 * theirs over bossUpdate - only what the whole realm shares. */
export const MpBossState = engine.defineComponent('hog-mp-boss-state', {
  json: Schemas.String,
  revision: Schemas.Int
})

MpBossState.validateBeforeChange((value) => value.senderAddress === AUTH_SERVER_PEER_ID)

export const MpMessages = {
  // Client -> server: push my PlayerSave JSON ('' asks for a load only).
  saveRequest: Schemas.Map({ json: Schemas.String }),
  // Client -> server: deliberately wipe my save (settings > restart account).
  // Separate from saveRequest so the empty-save safety guard stays intact.
  resetRequest: Schemas.Map({ confirm: Schemas.Boolean }),
  // Server -> clients: that wallet's PlayerSave. Clients ignore other addresses.
  saveLoaded: Schemas.Map({ address: Schemas.String, json: Schemas.String }),
  // Client -> server: one TradeMsg (sender comes from the transport).
  tradeMsg: Schemas.Map({ json: Schemas.String }),
  // Server -> clients: a TradeUpdate addressed to one wallet.
  tradeUpdate: Schemas.Map({ address: Schemas.String, json: Schemas.String }),
  // Client -> server: one RiftMsg.
  riftMsg: Schemas.Map({ json: Schemas.String }),
  // Client -> server: one DuelMsg.
  duelMsg: Schemas.Map({ json: Schemas.String }),
  // Client -> server: one GiftMsg (daily gift to another player).
  giftMsg: Schemas.Map({ json: Schemas.String }),
  // Server -> clients: a GiftUpdate addressed to one wallet.
  giftUpdate: Schemas.Map({ address: Schemas.String, json: Schemas.String }),
  // Client -> server: one OwMsg (overworld move / leave / monster slay).
  owMsg: Schemas.Map({ json: Schemas.String }),
  // Server -> clients: an FzUpdate (raid/duel invite) addressed to one wallet.
  fzUpdate: Schemas.Map({ address: Schemas.String, json: Schemas.String }),
  // Client -> server: one FeedMsg (a feed-worthy moment only the client saw).
  feedMsg: Schemas.Map({ json: Schemas.String }),
  // Server -> clients: a personal FeedEvent addressed to one wallet.
  feedUpdate: Schemas.Map({ address: Schemas.String, json: Schemas.String }),
  // Client -> server: one BossMsg (attack the world boss).
  bossMsg: Schemas.Map({ json: Schemas.String }),
  // Server -> clients: a BossUpdate (your private fight / verdict) addressed to one wallet.
  bossUpdate: Schemas.Map({ address: Schemas.String, json: Schemas.String })
}

export const room = registerMessages(MpMessages)
