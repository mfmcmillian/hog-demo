import { InputAction, inputSystem } from '@dcl/sdk/ecs'
import { owMonsterOn, owRemoteMonsters, owRemotePlayers, sendOwMove, sendOwSlay } from '../mp/owClient'
import { bossSlain, bossSlainFlag, questRewarded } from './owQuests'
import { playBump, playChest } from './audio'
import { startWildBattle } from './campaign'
import { resetMenu } from './menu'
import {
  GRID_H,
  GRID_W,
  OW_DX,
  OW_DY,
  OW_REALMS,
  OW_SPAWN_GX,
  OW_SPAWN_GY,
  OW_SUB,
  OwDecor,
  OwDir,
  OwExit,
  OwLock,
  OwRealmId,
  OW_STEP_S,
  MAP_H,
  TILE,
  isOwBossKey,
  owBossKey,
  owChestAt,
  owExitAt,
  owLedgeDir,
  owLockAt,
  owDoorInto,
  owNpcAt,
  owNpcPresent,
  owSignAt,
  owSpawnByKey,
  owWalkable
} from './owdefs'
import { grantOwItem, hasOwFlag, hasOwItem, npcQuestPending, npcTalkId, owTalkActive, setOwFlag, startOwTalk } from './owTalk'
import { game } from './store'

// Pokemon-style overworld: 9x16 tile grids over pre-rotated backdrops
// (72 stage px per tile), shared across all players. Realm/collision data
// lives in owdefs.ts (also used by the authoritative server); this module is
// the LOCAL avatar: input, step lerp, realm swaps, and battle handoffs.
// Everyone else's avatars and the wilds monsters mirror in via mp/owClient.

export { GRID_H, GRID_W, MAP_H, MAP_W, OW_SUB, TILE } from './owdefs'
export type { OwDir } from './owdefs'

// Walk-sheet rows (images/chars/player-walk-a.png, cells pre-rotated like the
// rest of the art): row 0 faces down, 1 left, 2 right, 3 up.
const FACING_ROW: Record<OwDir, number> = { down: 0, left: 1, right: 2, up: 3 }

// Wall-bump cycle (walking in place, no hop to sync to): left, right.
// Actual steps take their frame from hop progress in owAvatarCell instead.
const WALK_SEQ = [1, 3]
const FRAME_S = OW_STEP_S / 2
const TURN_S = 0.1 // turn-in-place beat before a step in a new direction
const HOP_S = 0.46 // ledge hop: three subtiles in one arc
const HOP_PX = 26 // arc height in stage px (physically upward)
const DUST_S = 0.45 // landing puff

export const ow = {
  gx: OW_SPAWN_GX * OW_SUB, // local subtile stood on (or stepped into)
  gy: OW_SPAWN_GY * OW_SUB,
  fx: OW_SPAWN_GX * OW_SUB, // subtile the current hop started from
  fy: OW_SPAWN_GY * OW_SUB,
  t: 1, // step progress 0..1; 1 = standing
  facing: 'down' as OwDir,
  stride: 0, // which foot leads this hop; flips every step
  walkTime: 0, // wall-bump timer only: > 0 animates walking in place
  turnT: 0, // remaining turn-in-place time; > 0 means turning, not walking
  hop: false // the step in flight is a ledge hop (arc, slower, thud on landing)
}

/** Landing puff after a hop: subtile it happened on and seconds left. */
const dust = { gx: 0, gy: 0, t: 0 }

// Direction currently held on the on-screen d-pad (see OverworldHud). The
// tick also requires IA_POINTER to still be down, so a missed onMouseUp
// (finger slid off the pad) cannot leave the avatar walking forever.
let padDir: OwDir | '' = ''

let realmId: OwRealmId = 'village'
/** Live push-block positions for the current realm; reset on every enter. */
let blockPos: { gx: number; gy: number }[] = []
// One talk per walk-up: remember which NPC we already greeted from this
// tile so holding the pad into them does not reopen the dialog.
let talkedFrom = ''

// Realm-swap fade: dir 1 = fading to black (then swap), -1 = fading back in.
const FADE_S = 0.35
const fade = { dir: 0 as -1 | 0 | 1, t: 0, exit: undefined as OwExit | undefined }

// Gen-3-style area-name toast: the realm's name strip hangs over the map for
// a beat after arriving somewhere named, then fades out.
const TOAST_S = 2.4
const TOAST_FADE_S = 0.6
let toastT = 0

// Where to drop the player after a wild battle won on the current realm.
let wildReturn: { realm: OwRealmId; gx: number; gy: number; facing: OwDir; key: string; id: string } | undefined

function coarse(n: number): number {
  return Math.floor(n / OW_SUB)
}

function toSub(n: number): number {
  return n * OW_SUB
}

function publishCoarse(gx: number, gy: number, facing: OwDir): void {
  sendOwMove(realmId, coarse(gx), coarse(gy), facing)
}

/** Set the local avatar down on a coarse tile (exits / spawn) and tell the room. */
/** Signs read this visit (`gx,gy`): a sign fires the first time you step on
 * it after entering a realm, then stays quiet, so a post on a lane you
 * walk both ways (the pier, a chapel run) doesn't stop you every pass.
 * Leaving and coming back re-arms it, like the stones. */
let signsRead = new Set<string>()

function resetPuzzles() {
  blockPos = (OW_REALMS[realmId].blocks ?? []).map((block) => ({ gx: block.gx, gy: block.gy }))
  signsRead = new Set()
}

function blockAt(gx: number, gy: number): { gx: number; gy: number } | undefined {
  return blockPos.find((block) => block.gx === gx && block.gy === gy)
}

function switchHeld(gx: number, gy: number): boolean {
  return !!blockAt(gx, gy)
}

function lockFlag(lock: { gx: number; gy: number }): string {
  // Hyphens only: the server's save filter drops flags with other punctuation.
  return `ow-lock-${realmId}-${lock.gx}-${lock.gy}`
}

/** Every plate this lock wants is holding a stone right now. */
function lockSatisfied(lock: OwLock): boolean {
  if (lock.needItem) return hasOwItem(lock.needItem)
  return (lock.needSwitch ?? []).every((plate) => switchHeld(plate.gx, plate.gy))
}

function lockClosed(gx: number, gy: number): boolean {
  const lock = owLockAt(realmId, gx, gy)
  if (!lock) return false
  if (hasOwFlag(lockFlag(lock))) return false
  return !lockSatisfied(lock)
}

function placePlayer(gx: number, gy: number, facing: OwDir) {
  const sx = toSub(gx)
  const sy = toSub(gy)
  ow.gx = sx
  ow.gy = sy
  ow.fx = sx
  ow.fy = sy
  ow.t = 1
  ow.hop = false
  ow.facing = facing
  ow.stride = 0
  ow.walkTime = 0
  ow.turnT = 0
  talkedFrom = ''
  sendOwMove(realmId, gx, gy, facing)
}

let visited = false

/** Fresh entry from the home village button: spawn on the plaza. */
export function enterOverworld() {
  realmId = 'village'
  padDir = ''
  fade.dir = 0
  fade.t = 0
  wildReturn = undefined
  visited = true
  toastT = TOAST_S // name the place you just walked into, same as a realm swap
  resetPuzzles()
  placePlayer(OW_SPAWN_GX, OW_SPAWN_GY, 'down')
  // First time on the map: the elder explains walking and the light, once.
  if (!hasOwFlag('guide-village')) {
    setOwFlag('guide-village')
    startOwTalk('guide-village')
  }
}

/** Been on the map this session (so the village button can resume in place). */
export function owVisited(): boolean {
  return visited
}

export function setPadDir(dir: OwDir | '') {
  padDir = dir
}

/** Pad direction the avatar is currently walking from, for lighting the pad. */
export function owPadDir(): OwDir | '' {
  return padDir
}

export function owRealmId(): OwRealmId {
  return realmId
}

/** Why this exit is shut, or '' if it is open. */
function gateReason(exit: OwExit): 'flag' | 'item' | '' {
  if (exit.needFlag && !hasOwFlag(exit.needFlag)) return 'flag'
  if (exit.needItem && !hasOwItem(exit.needItem)) return 'item'
  return ''
}

function postGateNotice(exit: OwExit) {
  const why = gateReason(exit)
  if (!why) return
  game.notice = why === 'item' && exit.needItem === 'reed-lamp' ? 'need-item' : 'sealed'
  playBump()
}

export function walkable(gx: number, gy: number): boolean {
  const maxX = GRID_W * OW_SUB
  const maxY = GRID_H * OW_SUB
  if (gx < 0 || gy < 0 || gx >= maxX || gy >= maxY) return false
  const cx = coarse(gx)
  const cy = coarse(gy)
  if (!owWalkable(realmId, cx, cy, hasOwFlag)) return false
  if (lockClosed(cx, cy)) return false
  if (blockAt(cx, cy)) return false
  const exit = owExitAt(realmId, cx, cy)
  if (exit && gateReason(exit)) return false
  return true
}

function canPlaceBlock(gx: number, gy: number): boolean {
  if (!owWalkable(realmId, gx, gy, hasOwFlag)) return false
  if (lockClosed(gx, gy)) return false
  if (blockAt(gx, gy)) return false
  if (owChestAt(realmId, gx, gy) || owSignAt(realmId, gx, gy)) return false
  if (owExitAt(realmId, gx, gy)) return false
  return true
}

/** Bump a stone one coarse tile. True if it moved (the vacated tile is free). */
function tryPush(dir: OwDir): boolean {
  const ax = coarse(ow.gx) + OW_DX[dir]
  const ay = coarse(ow.gy) + OW_DY[dir]
  const block = blockAt(ax, ay)
  if (!block) return false
  const nx = ax + OW_DX[dir]
  const ny = ay + OW_DY[dir]
  if (!canPlaceBlock(nx, ny)) return false
  const wasHeld = (OW_REALMS[realmId].switches ?? []).some((plate) => switchHeld(plate.gx, plate.gy))
  block.gx = nx
  block.gy = ny
  const nowHeld = (OW_REALMS[realmId].switches ?? []).some((plate) => switchHeld(plate.gx, plate.gy))
  if (nowHeld) {
    // A lock whose plates are all held stays open for good (save flag).
    for (const lock of OW_REALMS[realmId].locks ?? []) {
      if (lock.needSwitch && lockSatisfied(lock)) setOwFlag(lockFlag(lock))
    }
    if (!wasHeld) playChest()
  }
  return true
}

/** This realm's warlords you have not felled yet (personal, from the def). */
function localBosses(): { key: string; id: string; gx: number; gy: number }[] {
  const out: { key: string; id: string; gx: number; gy: number }[] = []
  for (const spawn of OW_REALMS[realmId].monsters) {
    if (spawn.boss && !bossSlain(spawn.id)) out.push({ key: owBossKey(realmId, spawn.id), id: spawn.id, gx: spawn.gx, gy: spawn.gy })
  }
  return out
}

/** Whatever stands on a coarse tile: a shared roamer or your own warlord. */
function monsterOn(gx: number, gy: number): { key: string; id: string } | undefined {
  return owMonsterOn(realmId, gx, gy) ?? localBosses().find((boss) => boss.gx === gx && boss.gy === gy)
}

/** Contact! The roamer brings its whole pack (spawn def) into the fight.
 * False when the fight can't start (no party) so walking stays possible. */
function triggerWildBattle(mon: { key: string; id: string }): boolean {
  const spawn = owSpawnByKey(mon.key)
  const pack = spawn?.pack ?? []
  const kind = spawn?.boss ? 'boss' : spawn?.guard ? 'guard' : 'roam'
  if (!startWildBattle([mon.id, ...pack], kind)) return false
  wildReturn = { realm: realmId, gx: coarse(ow.gx), gy: coarse(ow.gy), facing: ow.facing, key: mon.key, id: mon.id }
  padDir = ''
  return true
}

/** Post-battle handoff from leaveResult: a won wild fight reports the slain
 * roamer to the server (or remembers the felled warlord in the save) and
 * resumes the realm right where contact happened. A loss wakes you on the
 * Antrom plaza — the questing area never drops you back to home. */
export function returnFromWildBattle(): boolean {
  const stash = wildReturn
  wildReturn = undefined
  if (!stash) return false
  if (game.battle?.winner === 'you') {
    if (isOwBossKey(stash.key)) setOwFlag(bossSlainFlag(stash.id))
    else sendOwSlay(stash.key)
    realmId = stash.realm
    placePlayer(stash.gx, stash.gy, stash.facing)
  } else {
    realmId = 'village'
    resetPuzzles()
    placePlayer(OW_SPAWN_GX, OW_SPAWN_GY, 'down')
  }
  padDir = ''
  // Wake under a fade-in so the cut back from the report reads as a scene.
  fade.dir = -1
  fade.t = 0
  fade.exit = undefined
  game.phase = 'overworld'
  resetMenu()
  return true
}

/**
 * Pokemon step rules: a new direction first turns in place (no movement),
 * then held input walks. Returns true only when a step actually starts;
 * false means turning or blocked (caller distinguishes via ow.turnT).
 */
function tryStep(dir: OwDir): boolean {
  if (dir !== ow.facing) {
    ow.facing = dir
    ow.turnT = TURN_S
    // Broadcast the turn so remote mirrors of me face the right way.
    publishCoarse(ow.gx, ow.gy, dir)
    return false
  }
  const nx = ow.gx + OW_DX[dir]
  const ny = ow.gy + OW_DY[dir]
  if (!walkable(nx, ny)) {
    if (tryHop(dir, nx, ny)) return true
    if (!tryPush(dir) || !walkable(nx, ny)) {
      // The rest of a cottage front counts as its door: fade in from here.
      const door = owDoorInto(realmId, coarse(nx), coarse(ny))
      if (door && !gateReason(door)) {
        fade.dir = 1
        fade.t = 0
        fade.exit = door
        return true
      }
      const exit = owExitAt(realmId, coarse(nx), coarse(ny))
      if (exit) postGateNotice(exit)
      else if (lockClosed(coarse(nx), coarse(ny)) && !game.notice) {
        // A shut door answers like a sealed exit: the sign nearby says why.
        game.notice = 'sealed'
        playBump()
      }
      return false
    }
  }
  beginStep(nx, ny, dir, false)
  return true
}

/** Pokemon ledge: walking into a cliff lip from its open side jumps the
 * whole ledge tile and lands on the tile beyond. Any other approach, or a
 * blocked landing, is a plain bump. */
function tryHop(dir: OwDir, nx: number, ny: number): boolean {
  if (owLedgeDir(realmId, coarse(nx), coarse(ny)) !== dir) return false
  // nx,ny is the ledge's near subtile; the far tile's near subtile is two on.
  const lx = nx + OW_DX[dir] * OW_SUB
  const ly = ny + OW_DY[dir] * OW_SUB
  if (!walkable(lx, ly) || owLedgeDir(realmId, coarse(lx), coarse(ly))) return false
  beginStep(lx, ly, dir, true)
  return true
}

function beginStep(nx: number, ny: number, dir: OwDir, hop: boolean): void {
  ow.fx = ow.gx
  ow.fy = ow.gy
  ow.gx = nx
  ow.gy = ny
  ow.t = 0
  ow.hop = hop
  ow.stride = ow.stride === 0 ? 1 : 0
  ow.walkTime = 0
  talkedFrom = ''
  // Walking away dismisses a floating notice (locked gate, recruit-first).
  game.notice = ''
  publishCoarse(nx, ny, dir)
}

function heldKeyDir(): OwDir | '' {
  if (inputSystem.isPressed(InputAction.IA_FORWARD)) return 'up'
  if (inputSystem.isPressed(InputAction.IA_BACKWARD)) return 'down'
  if (inputSystem.isPressed(InputAction.IA_LEFT)) return 'left'
  if (inputSystem.isPressed(InputAction.IA_RIGHT)) return 'right'
  return ''
}

function heldPadDir(): OwDir | '' {
  if (!padDir) return ''
  if (!inputSystem.isPressed(InputAction.IA_POINTER)) {
    padDir = ''
    return ''
  }
  return padDir
}

export function tickOverworld(dt: number) {
  if (game.phase !== 'overworld') return
  if (toastT > 0) toastT -= dt
  // Realm swap: black out, teleport at full black, fade back in. No input.
  // Runs ahead of the talk hold so a landing greeting fades the map in
  // behind its dialog instead of speaking over black.
  if (fade.dir !== 0) {
    fade.t += dt / FADE_S
    ow.walkTime = 0
    if (fade.t >= 1) {
      if (fade.dir === 1 && fade.exit) {
        const exit = fade.exit
        realmId = exit.to
        resetPuzzles()
        // Drop a held pad direction so the old heading can't bump the
        // player around before they re-orient on the new map.
        padDir = ''
        placePlayer(exit.sx, exit.sy, exit.facing)
        if (OW_REALMS[realmId].nameKey) toastT = TOAST_S
        fade.exit = undefined
        fade.dir = -1
        fade.t = 0
      } else {
        fade.dir = 0
        fade.t = 0
      }
    }
    return
  }
  if (owTalkActive()) {
    ow.walkTime = 0
    return
  }
  // Pokemon rule: a started step always finishes — no stopping or turning
  // between subtiles. Input is sampled only when grid-aligned, so releases
  // and direction changes take effect on landing (at most OW_STEP_S away).
  if (dust.t > 0) dust.t -= dt
  if (ow.t < 1) {
    ow.t = Math.min(1, ow.t + dt / (ow.hop ? HOP_S : OW_STEP_S))
    if (ow.t < 1) return
    ow.fx = ow.gx
    ow.fy = ow.gy
    if (ow.hop) {
      // Touch down: thud and a puff of dust under the feet.
      ow.hop = false
      playBump()
      dust.gx = ow.gx
      dust.gy = ow.gy
      dust.t = DUST_S
    }
    // Step just landed: an open exit fades. Shut gates are unwalkable, so
    // their notices fire on the bump in tryStep instead.
    const exit = owExitAt(realmId, coarse(ow.gx), coarse(ow.gy))
    if (exit && !gateReason(exit)) {
      fade.dir = 1
      fade.t = 0
      fade.exit = exit
      return
    }
    // Chests and signs fire on the landing tile. NPCs are blocked tiles:
    // landing on the square in front of one (facing them) starts talk.
    if (tryChest()) return
    if (trySign()) return
    if (tryNpcTalk()) return
  }
  // Grid-aligned: contact with a monster on this tile starts the fight
  // (covers both stepping onto one and one wandering onto us).
  const mon = monsterOn(coarse(ow.gx), coarse(ow.gy))
  if (mon && triggerWildBattle(mon)) return
  // Turning in place: hold the new facing's standing frame for a beat.
  if (ow.turnT > 0) {
    ow.turnT -= dt
    ow.walkTime = 0
    return
  }
  // Pick the next step. Hardware keys win over the pad.
  const dir = heldKeyDir() || heldPadDir()
  if (dir) {
    if (tryStep(dir)) return
    if (ow.turnT > 0) {
      ow.walkTime = 0 // just turned: stand for the turn beat
      return
    }
    // Walked into an NPC: stay on this tile and talk (Zelda bump).
    if (tryNpcTalk()) return
    // Blocked: walk in place against the wall with a soft thud.
    ow.walkTime += dt
    playBump()
    return
  }
  ow.walkTime = 0
}

/** Which talk a key item's chest opens with (owTalk.ts). */
const CHEST_TALK: Record<string, string> = {
  'reed-lamp': 'chest-lamp',
  'gate-sigil': 'chest-key',
  'bone-key': 'chest-bone',
  'oath-key': 'chest-oath'
}

function tryChest(): boolean {
  const chest = owChestAt(realmId, coarse(ow.gx), coarse(ow.gy))
  if (!chest || hasOwFlag(chest.id)) return false
  setOwFlag(chest.id)
  if (chest.loot.coins) game.coins += chest.loot.coins
  if (chest.loot.item) grantOwItem(chest.loot.item)
  playChest()
  startOwTalk((chest.loot.item && CHEST_TALK[chest.loot.item]) || 'chest-coins')
  padDir = ''
  return true
}

function trySign(): boolean {
  const sign = owSignAt(realmId, coarse(ow.gx), coarse(ow.gy))
  if (!sign) return false
  const at = `${sign.gx},${sign.gy}`
  if (signsRead.has(at)) return false
  if (!startOwTalk(sign.talk)) return false
  signsRead.add(at)
  padDir = ''
  return true
}

/** The coarse tile the avatar is facing — the square "in front". */
function tileAhead(): { gx: number; gy: number } {
  return {
    gx: coarse(ow.gx) + (ow.facing === 'left' ? -1 : ow.facing === 'right' ? 1 : 0),
    gy: coarse(ow.gy) + (ow.facing === 'up' ? -1 : ow.facing === 'down' ? 1 : 0)
  }
}

function tryNpcTalk(): boolean {
  const ahead = tileAhead()
  const npc = owNpcAt(realmId, ahead.gx, ahead.gy, hasOwFlag)
  if (!npc) return false
  const key = `${realmId}:${coarse(ow.gx)},${coarse(ow.gy)}:${npc.id}`
  if (talkedFrom === key) return false
  if (!startOwTalk(npcTalkId(npc.talk))) return false
  talkedFrom = key
  padDir = ''
  return true
}

/** Back onto the map from a screen: wake where you stood, facing down,
 * under a fade-in, without resetting position to spawn. */
export function resumeOverworld(): void {
  game.phase = 'overworld'
  padDir = ''
  ow.facing = 'down'
  talkedFrom = '' // back from a screen: walking into the host again re-opens it
  resetMenu()
  publishCoarse(ow.gx, ow.gy, ow.facing)
  fade.dir = -1
  fade.t = 0
  fade.exit = undefined
}

/** labels.gen key of the current realm's backdrop. */
export function owMapKey(): string {
  return OW_REALMS[realmId].map
}

/** Optional backdrop tint for reused maps (dusk woods, etc). */
export function owMapTint(): { r: number; g: number; b: number } | undefined {
  return OW_REALMS[realmId].tint
}

/** labels.gen key of the overhead cut drawn above everything, if any. */
export function owOverKey(): string | undefined {
  return OW_REALMS[realmId].over
}

/** Ambient flipbook decor for the realm, in tile space. */
export function owDecorRects(size: number): { fx: OwDecor['fx']; left: number; top: number }[] {
  return (OW_REALMS[realmId].decor ?? []).map((decor) => ({ fx: decor.fx, ...tileRect(decor.gx, decor.gy, size) }))
}

/** Fog alpha for the realm (0 = none). */
export function owFog(): number {
  return OW_REALMS[realmId].fog ?? 0
}

/** Area name for the badge by the map's physical top: bright for a beat on
 * arrival (the Gen-3 toast), then it stays dim so you always know where you
 * are. Interiors have no name, so the badge hides in a hut. */
export function owToast(): { key: string; alpha: number } | undefined {
  const key = OW_REALMS[realmId].nameKey
  if (!key) return undefined
  return { key, alpha: Math.max(0.42, Math.min(1, toastT / TOAST_FADE_S)) }
}

/** 0..1 black overlay strength for the realm-swap fade. */
export function owFadeAlpha(): number {
  if (fade.dir === 1) return Math.min(1, fade.t)
  if (fade.dir === -1) return Math.max(0, 1 - fade.t)
  return 0
}

/** Sprite quad in stage px. `cell` is the grid step (TILE for remotes/monsters,
 * TILE/OW_SUB for the local finer walk). */
function tileRect(px: number, py: number, size: number, cell = TILE): { left: number; top: number } {
  const cellsW = MAP_H / cell
  const stageX = py * cell + cell / 2
  const stageY = (cellsW - 1 - px) * cell + cell / 2
  // Nudge physically upward (stage -x) so the feet sit on the tile.
  return { left: stageX - size / 2 - 10, top: stageY - size / 2 }
}

/** `quest`: draw the '!' marker — this NPC has story business with you. */
export function owNpcRects(size: number): { id: string; sheet: string; quest: boolean; left: number; top: number }[] {
  return (OW_REALMS[realmId].npcs ?? [])
    .filter((npc) => owNpcPresent(npc, hasOwFlag))
    .map((npc) => ({
      id: npc.id,
      sheet: npc.sheet,
      quest: npcQuestPending(npc.talk),
      ...tileRect(npc.gx, npc.gy, size)
    }))
}

export function owChestRects(size: number): { id: string; open: boolean; left: number; top: number }[] {
  return (OW_REALMS[realmId].chests ?? []).map((chest) => ({
    id: chest.id,
    open: hasOwFlag(chest.id),
    ...tileRect(chest.gx, chest.gy, size)
  }))
}

export function owSignRects(size: number): { left: number; top: number }[] {
  return (OW_REALMS[realmId].signs ?? []).map((sign) => tileRect(sign.gx, sign.gy, size))
}

export function owBlockRects(size: number): { left: number; top: number }[] {
  return blockPos.map((block) => tileRect(block.gx, block.gy, size))
}

export function owSwitchRects(size: number): { pressed: boolean; left: number; top: number }[] {
  return (OW_REALMS[realmId].switches ?? []).map((plate) => ({
    pressed:
      switchHeld(plate.gx, plate.gy) ||
      (OW_REALMS[realmId].locks ?? []).some(
        (lock) => hasOwFlag(lockFlag(lock)) && (lock.needSwitch ?? []).some((need) => need.gx === plate.gx && need.gy === plate.gy)
      ),
    ...tileRect(plate.gx, plate.gy, size)
  }))
}

export function owLockRects(size: number): { open: boolean; left: number; top: number }[] {
  return (OW_REALMS[realmId].locks ?? []).map((lock) => ({
    open: !lockClosed(lock.gx, lock.gy),
    ...tileRect(lock.gx, lock.gy, size)
  }))
}

/** Next-step lantern: one tile per realm so the forest has a light to walk to. */
export function owHintRect(size: number): { left: number; top: number } | undefined {
  const tile = hintTile()
  if (!tile) return undefined
  return tileRect(tile.gx, tile.gy, size)
}

/** Follows the questline (owQuests): Act 1 south to the Moor Gate and back
 * to the elder; Act 2 west up Crow Road to Rookhaven and north to the queen;
 * Act 3 down Rookhaven's west road to the well; Act 4 back south through
 * the Moor Gate's door. Each act ends at its giver. */
function hintTile(): { gx: number; gy: number } | undefined {
  if (realmId === 'village') {
    if (!hasOwFlag('elder-met')) return { gx: 4, gy: 3 } // first: the elder, who says where to go
    if (questRewarded('hall')) return undefined
    if (bossSlain('ashen-regent')) return { gx: 4, gy: 2 } // the elder pays
    if (questRewarded('well')) return { gx: 4, gy: 14 } // south again, to the door
    if (questRewarded('gate')) return { gx: 0, gy: 9 }
    if (bossSlain('moor-ogre')) return { gx: 4, gy: 2 } // the elder pays
    return { gx: 4, gy: 14 }
  }
  // The south chain (wilds -> fen -> crypt -> Moor Gate) is walked north for
  // the ogre (Act 1) and for the hall door (Act 4); any other time you are
  // down here the story is behind you, so every realm points back home.
  const southBound = !bossSlain('moor-ogre') || (questRewarded('well') && !bossSlain('ashen-regent'))
  if (realmId === 'wilds') {
    if (!southBound) return { gx: 8, gy: 13 } // home
    if (!hasOwItem('reed-lamp')) return { gx: 5, gy: 2 }
    return { gx: 4, gy: 1 }
  }
  if (realmId === 'fen') return southBound ? { gx: 3, gy: 1 } : { gx: 4, gy: 15 }
  if (realmId === 'crypt') {
    if (!southBound) return { gx: 4, gy: 15 } // back down to the fen
    return dungeonHint() ?? (hasOwItem('gate-sigil') ? { gx: 4, gy: 1 } : { gx: 2, gy: 3 })
  }
  if (realmId === 'moorgate') {
    if (!bossSlain('moor-ogre')) return { gx: 4, gy: 7 }
    if (questRewarded('well') && !bossSlain('ashen-regent')) return { gx: 4, gy: 3 } // the door
    return { gx: 4, gy: 15 }
  }
  // Crow Road: up to Rookhaven for Acts 2-3, back to the village after the Well.
  if (realmId === 'crow') return questRewarded('well') ? { gx: 8, gy: 14 } : { gx: 4, gy: 1 }
  if (realmId === 'rookhaven') {
    if (questRewarded('well')) return { gx: 4, gy: 14 } // home to the elder
    if (bossSlain('crimson-abbot')) return { gx: 6, gy: 8 } // the seer's door
    if (questRewarded('widow')) return { gx: 0, gy: 9 }
    if (bossSlain('thorn-queen')) return { gx: 2, gy: 4 } // the widow's door
    return { gx: 4, gy: 1 }
  }
  if (realmId === 'deep') return dungeonHint() ?? (bossSlain('thorn-queen') ? { gx: 0, gy: 14 } : { gx: 4, gy: 2 })
  if (realmId === 'well') return dungeonHint() ?? (bossSlain('crimson-abbot') ? { gx: 4, gy: 15 } : { gx: 4, gy: 1 })
  if (realmId === 'hall') return dungeonHint() ?? (bossSlain('ashen-regent') ? { gx: 4, gy: 15 } : { gx: 4, gy: 1 })
  return undefined
}

/** The next unsolved step of the realm's puzzles, in lock order: the first
 * empty plate of a shut plate-lock, or the chest holding a shut door's key.
 * Undefined once every lock is open (the caller then points at the boss). */
function dungeonHint(): { gx: number; gy: number } | undefined {
  const realm = OW_REALMS[realmId]
  for (const lock of realm.locks ?? []) {
    if (!lockClosed(lock.gx, lock.gy)) continue
    if (lock.needItem) {
      const chest = realm.chests?.find((c) => c.loot.item === lock.needItem)
      if (chest && !hasOwFlag(chest.id)) return chest
      return lock
    }
    return lock.needSwitch?.find((plate) => !switchHeld(plate.gx, plate.gy)) ?? lock
  }
  return undefined
}

/** Avatar quad in stage px, relative to the map's top-left corner. A hop
 * in flight lifts the quad along a sine arc (physically upward = stage -x). */
export function owAvatarRect(size: number): { left: number; top: number } {
  const px = ow.fx + (ow.gx - ow.fx) * ow.t
  const py = ow.fy + (ow.gy - ow.fy) * ow.t
  const rect = tileRect(px, py, size, TILE / OW_SUB)
  if (ow.hop && ow.t < 1) rect.left -= Math.sin(ow.t * Math.PI) * HOP_PX
  return rect
}

/** Landing puff: quad + fade alpha while it lasts, else undefined. */
export function owDustRect(size: number): { left: number; top: number; alpha: number } | undefined {
  if (dust.t <= 0) return undefined
  return { ...tileRect(dust.gx, dust.gy, size, TILE / OW_SUB), alpha: Math.min(1, dust.t / (DUST_S * 0.6)) }
}

/** The monsters of the current realm, placed for the UI: shared roamers
 * plus your own unfelled warlords. `sizeOf` lets rarer roamers draw larger
 * without changing the tile grid. */
export function owMonsterRects(
  sizeOf: (id: string) => number
): { id: string; left: number; top: number; size: number }[] {
  const out = owRemoteMonsters(realmId).map((mon) => {
    const size = sizeOf(mon.id)
    const px = mon.fx + (mon.gx - mon.fx) * mon.t
    const py = mon.fy + (mon.gy - mon.fy) * mon.t
    return { id: mon.id, size, ...tileRect(px, py, size) }
  })
  for (const boss of localBosses()) {
    const size = sizeOf(boss.id)
    out.push({ id: boss.id, size, ...tileRect(boss.gx, boss.gy, size) })
  }
  return out
}

/** Everyone else standing in this realm: placed quads + walk-sheet cells +
 * display names, for the UI. Mid-lerp remotes get a simple two-frame walk. */
export function owRemoteRects(size: number): { name: string; left: number; top: number; cell: number }[] {
  return owRemotePlayers(realmId).map((remote) => {
    const px = remote.fx + (remote.gx - remote.fx) * remote.t
    const py = remote.fy + (remote.gy - remote.fy) * remote.t
    // Stateless stride: which foot leads alternates with the tile parity.
    const col = remote.t < 1 ? ((remote.gx + remote.gy) % 2 === 0 ? 1 : 3) : 0
    return { name: remote.name, cell: FACING_ROW[remote.facing] * 4 + col, ...tileRect(px, py, size) }
  })
}

/** Walk-sheet cell for the current pose: row = facing, col = walk frame.
 * Stepping animates off hop progress — foot forward through the first half,
 * standing into the landing — so a foot plants exactly when the tile does
 * and stopping always ends on the standing frame. Lead foot alternates per
 * step (ow.stride). walkTime > 0 is only wall-bumping: walk in place. */
export function owAvatarCell(): number {
  let col = 0
  if (ow.t < 1) {
    col = ow.t < 0.5 ? (ow.stride === 0 ? 1 : 3) : 0
  } else if (ow.walkTime > 0) {
    col = WALK_SEQ[Math.floor(ow.walkTime / FRAME_S) % WALK_SEQ.length]
  }
  return FACING_ROW[ow.facing] * 4 + col
}
