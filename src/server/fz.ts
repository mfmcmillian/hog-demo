import { Arena, FzUpdate } from '../mp/protocol'
import { room } from '../mp/transport'
import { ServerCtx } from './ctx'

// Friendzone invites: relay a seated player's "come raid / duel me" ping to
// one other traveler in the scene. Nothing to validate beyond presence - the
// invite is only a nudge; the target still sits down through the normal
// (gated) sit path.

/** Minimum gap between invites from one wallet, so a tap-happy player can't spam. */
const INVITE_GAP_MS = 1500
const lastInviteAt = new Map<string, number>()

export function relayFzInvite(ctx: ServerCtx, sender: string, to: string, arena: Arena): void {
  const target = (to || '').toLowerCase()
  if (!target || target === sender || !ctx.present.has(target) || !ctx.present.has(sender)) return
  const now = Date.now()
  if (now - (lastInviteAt.get(sender) ?? 0) < INVITE_GAP_MS) return
  lastInviteAt.set(sender, now)
  const update: FzUpdate = { type: 'invite', from: sender, name: ctx.nameFor(sender), arena }
  room.send('fzUpdate', { address: target, json: JSON.stringify(update) })
}
