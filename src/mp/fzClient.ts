import { playRift } from '../game/audio'
import { duelInvite } from './duelClient'
import { getMyAddress } from './identity'
import { FzUpdate } from './protocol'
import { riftInvite } from './riftClient'
import { room } from './transport'
import { currentArena, fz } from './views'

// Friendzone invites: a seated player pings another present traveler from
// the lobby's invite picker; the server relays it as an FzUpdate and the
// target gets an accept/decline toast wherever they are (see FzInviteToast).

/** How long an unanswered invite toast hangs before it clears itself. */
const INVITE_TTL_S = 30
const SENT_FLASH_S = 2.5

export function setupFzClient(): void {
  room.onMessage('fzUpdate', (data) => {
    if (!getMyAddress() || data.address.toLowerCase() !== getMyAddress()) return
    let update: FzUpdate
    try {
      update = JSON.parse(data.json) as FzUpdate
    } catch {
      return
    }
    if (update.type === 'invite') {
      fz.invite = { from: update.from, name: update.name, arena: update.arena }
      fz.inviteAge = 0
      playRift() // the portal sting: someone wants you in their room
    }
  })
}

/** 1..0 share of the invite's life left, for the toast's draining bar. */
export function fzInviteLeft(): number {
  if (!fz.invite) return 0
  return Math.max(0, 1 - fz.inviteAge / INVITE_TTL_S)
}

/** Ping `to` about the room I'm looking at. */
export function fzInvite(to: string): void {
  const arena = currentArena()
  if (arena === 'raid') riftInvite(to)
  else duelInvite(arena, to)
  fz.inviting = false
  fz.sentFlash = SENT_FLASH_S
}

export function fzDecline(): void {
  fz.invite = undefined
}

export function tickFzTimers(dt: number): void {
  if (fz.invite) {
    fz.inviteAge += dt
    if (fz.inviteAge > INVITE_TTL_S) fz.invite = undefined
  }
  if (fz.sentFlash > 0) fz.sentFlash = Math.max(0, fz.sentFlash - dt)
}
