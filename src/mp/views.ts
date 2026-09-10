import type { BattleState } from '../game/types'
import {
  Arena,
  BoardId,
  BoardsPub,
  BossPub,
  DuelMode,
  DuelPub,
  FestPub,
  RiftPub,
  emptyBoards,
  emptyBoss,
  emptyDuel,
  emptyFest,
  emptyRift
} from './protocol'

// Leaf module: client-side mirrors of server-owned multiplayer state.
// session.ts writes these; audio, nav, flipbook, and the UI read them.
// Keeping them here (not in session.ts) keeps the import graph acyclic.

export const riftView: { pub: RiftPub; revision: number } = { pub: emptyRift(), revision: -1 }

/** Account level of every present player (server-published), by lowercase address. */
export const levelsView: { levels: Record<string, number>; revision: number } = { levels: {}, revision: -1 }

/** Another player's account level as the server knows it; 0 = not known yet. */
export function levelOf(address: string): number {
  return levelsView.levels[address.toLowerCase()] ?? 0
}

export const duelViews: Record<DuelMode, { pub: DuelPub; revision: number }> = {
  '1v1': { pub: emptyDuel('1v1'), revision: -1 },
  '4v4': { pub: emptyDuel('4v4'), revision: -1 }
}

/** Where in the friendzone the local player is: the arena hub (landing), the
 * raid room, or a duel ring; plus the overlays and invite/requeue state. */
export const fz = {
  tab: 'hub' as 'hub' | 'raids' | 'duels',
  duelMode: '1v1' as DuelMode,
  /** Someone wants me in their room: drives the accept/decline toast. */
  invite: undefined as { from: string; name: string; arena: Arena } | undefined,
  /** Seconds the invite toast has been up (it expires on its own). */
  inviteAge: 0,
  /** The lobby's invite picker overlay is open. */
  inviting: false,
  /** Seconds left on the INVITE SENT flash after pinging someone. */
  sentFlash: 0,
  /** PLAY AGAIN: sit back down (same hero) the moment the room reopens. */
  requeue: undefined as { arena: Arena; heroUid?: string } | undefined
}

/** The room the player is looking at, as an invite target. */
export function currentArena(): Arena {
  return fz.tab === 'duels' ? fz.duelMode : 'raid'
}

/** The duel ring currently on screen. */
export function activeDuel(): DuelPub {
  return duelViews[fz.duelMode].pub
}

export const festView: { pub: FestPub; revision: number } = { pub: emptyFest(), revision: -1 }

/** The Hall of Heroes leaderboards (server-published). */
export const boardsView: { pub: BoardsPub; revision: number } = { pub: emptyBoards(), revision: -1 }

/** Which page the hall's wall is showing: a board, or the realm news feed. */
export type HallTab = BoardId | 'news'
export const hall = { tab: 'level' as HallTab }

/** The tailor's rack (ui/wardrobe.tsx): which page is open. */
export type WardrobeTab = 'colors' | 'clothes' | 'armor'
export const wardrobe = { tab: 'colors' as WardrobeTab, fromSettings: false }

/** My 1-based rank on `board` as the server last published it; 0 = unranked. */
export function myBoardRank(address: string, board: BoardId): number {
  return boardsView.pub.ranks[address.toLowerCase()]?.[board] ?? 0
}

/** The world boss lair (server-published), plus my private fight and its verdict. */
export const bossView: {
  pub: BossPub
  revision: number
  /** My attack in progress: the server's snapshot, refreshed every step. */
  fight?: { battle: BattleState; left: number; dealt: number; at: number }
  /** The verdict of my last attack, until the lair is left or the next attack starts. */
  result?: { dealt: number; best: number; rank: number; kill: boolean; wiped: boolean }
  /** The server said no; shown briefly on the lair. */
  blocked: '' | 'none' | 'busy' | 'party'
  blockedAge: number
  /** The lair's pages: the warlord and your attacks, or the week's damage board. */
  tab: 'lair' | 'board'
} = { pub: emptyBoss(), revision: -1, blocked: '', blockedAge: 0, tab: 'lair' }

export const gift = {
  /** Incoming gift: drives the full chest-opening ceremony overlay. `goal`:
   * the realm goal's crown chest rather than a traveler's daily gift; `boss`:
   * world boss spoils (the rank paid, 0 = a kill bonus). */
  received: undefined as { name: string; coins: number; dropDefId?: string; goal?: boolean; boss?: number } | undefined,
  /** Blessing coins granted for sending; >0 shows the sender toast. */
  blessing: 0,
  blessAge: 0,
  /** Recipient picker overlay open. */
  picking: false,
  /** Server refused the gift; shown briefly on the festival screen. */
  blocked: '' as '' | 'daily' | 'gone',
  blockedAge: 0
}
