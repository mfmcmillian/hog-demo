import { DuelMode, DuelPub, FestPub, RiftPub, emptyDuel, emptyFest, emptyRift } from './protocol'

// Leaf module: client-side mirrors of server-owned multiplayer state.
// session.ts writes these; audio, nav, flipbook, and the UI read them.
// Keeping them here (not in session.ts) keeps the import graph acyclic.

export const riftView: { pub: RiftPub; revision: number } = { pub: emptyRift(), revision: -1 }

export const duelViews: Record<DuelMode, { pub: DuelPub; revision: number }> = {
  '1v1': { pub: emptyDuel('1v1'), revision: -1 },
  '4v4': { pub: emptyDuel('4v4'), revision: -1 }
}

/** Which half of the friendzone the local player is looking at, which ring,
 * and whether the full-screen win-ladder board is open over the duel lobby. */
export const fz = { tab: 'raids' as 'raids' | 'duels', duelMode: '1v1' as DuelMode, board: false }

/** The duel ring currently on screen. */
export function activeDuel(): DuelPub {
  return duelViews[fz.duelMode].pub
}

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
