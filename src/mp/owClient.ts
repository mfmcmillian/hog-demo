import { engine } from '@dcl/sdk/ecs'
import { OW_STEP_S, OW_SUB, OwDir, OwRealmId, owSpawnByKey } from '../game/owdefs'
import { game } from '../game/store'
import { getMyAddress } from './identity'
import { OwMsg, OwPub, emptyOw } from './protocol'
import { MpOwState, room } from './transport'

// Client side of the shared overworld. Sends my tile-committed steps as
// intents, mirrors the server's OwPub snapshot, and keeps per-remote lerp
// state so other avatars (and the wilds monsters) glide between tiles at
// walk cadence instead of teleporting.

const MONSTER_STEP_S = 0.6 // monsters amble; the server steps them ~1.1s apart

export const owView: { pub: OwPub; revision: number } = { pub: emptyOw(), revision: -1 }

/** A mirrored entity mid-lerp: (fx,fy) -> (gx,gy) at progress t. */
export type OwRemote = {
  name: string
  realm: OwRealmId
  gx: number
  gy: number
  fx: number
  fy: number
  t: number
  facing: OwDir
}

const remotePlayers = new Map<string, OwRemote>()
const remoteMonsters = new Map<string, OwRemote & { id: string }>()

/** True while the server thinks I'm standing on a map (a move was sent). */
let onMap = false

function sendOw(msg: OwMsg): void {
  room.send('owMsg', { json: JSON.stringify(msg) })
}

// Last move actually sent: local sub-tile steps land on the same coarse tile
// twice, and turns re-send unchanged tiles; the room only needs real changes.
let lastMoveSent = ''

export function sendOwMove(realm: OwRealmId, gx: number, gy: number, facing: OwDir): void {
  const sig = `${realm}:${gx},${gy},${facing}`
  if (onMap && sig === lastMoveSent) return
  lastMoveSent = sig
  onMap = true
  sendOw({ type: 'move', realm, gx, gy, facing })
}

export function sendOwLeave(): void {
  if (!onMap) return
  onMap = false
  lastMoveSent = ''
  sendOw({ type: 'leave' })
}

// Keys slain locally but not yet confirmed gone by a snapshot: hides them
// from contact checks so the beaten monster can't restart the fight during
// the round trip. Cleared once the server's publish drops (or respawns) them.
const slainPending = new Set<string>()

export function sendOwSlay(key: string): void {
  slainPending.add(key)
  remoteMonsters.delete(key)
  sendOw({ type: 'slay', key })
}

// Kill feed: someone else's slay hangs as a toast for a beat so players feel
// each other clearing the shared map ("Matt broke the gatekeeper — path's open").
const SLAY_TOAST_S = 4
const SLAY_FADE_S = 0.6
let slayFeed: { name: string; id: string; key: string; t: number } | undefined
let slaySeqSeen = -1

/** Someone else's fresh kill: their name, the monster, whether it was a
 * path-blocking guard, and the fade-out alpha. Undefined when quiet. */
export function owSlayToast(): { name: string; id: string; guard: boolean; alpha: number } | undefined {
  if (!slayFeed) return undefined
  return {
    name: slayFeed.name,
    id: slayFeed.id,
    guard: owSpawnByKey(slayFeed.key)?.guard === true,
    alpha: Math.min(1, slayFeed.t / SLAY_FADE_S)
  }
}

/** Remote avatars standing in (or walking through) the given realm. */
export function owRemotePlayers(realm: OwRealmId): OwRemote[] {
  const out: OwRemote[] = []
  for (const remote of remotePlayers.values()) if (remote.realm === realm) out.push(remote)
  return out
}

/** Live wilds monsters of the given realm, with their sync keys. */
export function owRemoteMonsters(realm: OwRealmId): (OwRemote & { id: string; key: string })[] {
  const out: (OwRemote & { id: string; key: string })[] = []
  for (const [key, remote] of remoteMonsters) if (remote.realm === realm) out.push({ key, ...remote })
  return out
}

/** The monster (if any) whose committed tile is (gx,gy) in the given realm. */
export function owMonsterOn(realm: OwRealmId, gx: number, gy: number): { key: string; id: string } | undefined {
  for (const [key, remote] of remoteMonsters) {
    if (remote.realm === realm && remote.gx === gx && remote.gy === gy) return { key, id: remote.id }
  }
  return undefined
}

/** Fold a fresh snapshot position into a lerp state: a one-tile change walks,
 * anything bigger (realm swap, respawn, missed updates) snaps. */
function foldRemote(remote: OwRemote, realm: OwRealmId, gx: number, gy: number, facing: OwDir): void {
  const oneStep = remote.realm === realm && Math.abs(gx - remote.gx) + Math.abs(gy - remote.gy) === 1
  if (oneStep) {
    remote.fx = remote.gx
    remote.fy = remote.gy
    remote.t = 0
  } else if (remote.realm !== realm || gx !== remote.gx || gy !== remote.gy) {
    remote.fx = gx
    remote.fy = gy
    remote.t = 1
  }
  remote.realm = realm
  remote.gx = gx
  remote.gy = gy
  remote.facing = facing
}

// Phases the shared map keeps showing me standing there: walking around, or
// off in a wild battle (fight + verdict banner + spoils report).
const OW_FLOW = new Set<typeof game.phase>(['overworld', 'battle', 'banner', 'report'])

export function tickOwMirror(dt: number): void {
  // Wandered off to the rest of the game (home, shops...): clear my tile.
  if (onMap && !OW_FLOW.has(game.phase)) sendOwLeave()

  // Mirror the synced overworld snapshot on revision change.
  for (const [, state] of engine.getEntitiesWith(MpOwState)) {
    if (state.revision === owView.revision) break
    owView.revision = state.revision
    try {
      owView.pub = JSON.parse(state.json) as OwPub
    } catch {
      break
    }
    const me = getMyAddress()
    const seenPlayers = new Set<string>()
    for (const player of owView.pub.players) {
      if (player.address === me) continue
      seenPlayers.add(player.address)
      const remote = remotePlayers.get(player.address)
      const realm = player.realm as OwRealmId
      const facing = player.facing as OwDir
      if (!remote) {
        remotePlayers.set(player.address, {
          name: player.name,
          realm,
          gx: player.gx,
          gy: player.gy,
          fx: player.gx,
          fy: player.gy,
          t: 1,
          facing
        })
      } else {
        remote.name = player.name
        foldRemote(remote, realm, player.gx, player.gy, facing)
      }
    }
    for (const address of remotePlayers.keys()) if (!seenPlayers.has(address)) remotePlayers.delete(address)

    const seenMonsters = new Set<string>()
    for (const monster of owView.pub.monsters) {
      seenMonsters.add(monster.key)
      if (slainPending.has(monster.key)) continue
      const remote = remoteMonsters.get(monster.key)
      const realm = monster.realm as OwRealmId
      if (!remote) {
        remoteMonsters.set(monster.key, {
          id: monster.id,
          name: '',
          realm,
          gx: monster.gx,
          gy: monster.gy,
          fx: monster.gx,
          fy: monster.gy,
          t: 1,
          facing: 'down'
        })
      } else {
        foldRemote(remote, realm, monster.gx, monster.gy, 'down')
      }
    }
    for (const key of remoteMonsters.keys()) if (!seenMonsters.has(key)) remoteMonsters.delete(key)
    for (const key of slainPending) if (!seenMonsters.has(key)) slainPending.delete(key)

    // Kill feed: toast slays that happen while we're here, not history from
    // before we connected (first snapshot only sets the baseline) or our own.
    const slay = owView.pub.slay
    if (slay) {
      if (slaySeqSeen === -1) slaySeqSeen = slay.seq
      else if (slay.seq !== slaySeqSeen) {
        slaySeqSeen = slay.seq
        if (slay.address !== me) slayFeed = { name: slay.name, id: slay.id, key: slay.key, t: SLAY_TOAST_S }
      }
    }
    break
  }

  // Advance the glide lerps.
  for (const remote of remotePlayers.values()) if (remote.t < 1) remote.t = Math.min(1, remote.t + dt / (OW_STEP_S * OW_SUB))
  for (const remote of remoteMonsters.values()) if (remote.t < 1) remote.t = Math.min(1, remote.t + dt / MONSTER_STEP_S)

  if (slayFeed) {
    slayFeed.t -= dt
    if (slayFeed.t <= 0) slayFeed = undefined
  }
}
