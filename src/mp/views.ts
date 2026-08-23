import { FestPub, RiftPub, emptyFest, emptyRift } from './protocol'

// Leaf module: client-side mirrors of server-owned multiplayer state.
// session.ts writes these; audio, nav, flipbook, and the UI read them.
// Keeping them here (not in session.ts) keeps the import graph acyclic.

export const riftView: { pub: RiftPub; revision: number } = { pub: emptyRift(), revision: -1 }

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
