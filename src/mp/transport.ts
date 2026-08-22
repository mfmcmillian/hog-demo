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

/** Sync id for the festival entity (realm goal + window clock). */
export const FEST_SYNC_ID = 6002

export const MpFestState = engine.defineComponent('hog-mp-fest-state', {
  json: Schemas.String,
  revision: Schemas.Int
})

MpFestState.validateBeforeChange((value) => value.senderAddress === AUTH_SERVER_PEER_ID)

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
  // Client -> server: one GiftMsg (daily gift to another player).
  giftMsg: Schemas.Map({ json: Schemas.String }),
  // Server -> clients: a GiftUpdate addressed to one wallet.
  giftUpdate: Schemas.Map({ address: Schemas.String, json: Schemas.String })
}

export const room = registerMessages(MpMessages)
