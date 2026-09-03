import { InputAction, inputSystem } from '@dcl/sdk/ecs'
import { owMonsterOn, owRemoteMonsters, owRemotePlayers, sendOwMove, sendOwSlay } from '../mp/owClient'
import { playBump, playChest } from './audio'
import { startWildBattle } from './campaign'
import { resetMenu } from './menu'
import { clampCleared } from './progress'
import {
  GRID_H,
  GRID_W,
  OW_DX,
  OW_DY,
  OW_REALMS,
  OW_SPAWN_GX,
  OW_SPAWN_GY,
  OW_SUB,
  OwDir,
  OwExit,
  OwRealmId,
  OW_STEP_S,
  MAP_H,
  TILE,
  owChestAt,
  owExitAt,
  owLockAt,
  owNpcAt,
  owPortalAt,
  owSignAt,
  owSpawnByKey,
  owWalkable
} from './owdefs'
import { grantOwItem, hasOwFlag, hasOwItem, npcTalkId, owTalkActive, setOwFlag, startOwTalk } from './owTalk'
import { ROADS } from './quests'
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

export const ow = {
  gx: OW_SPAWN_GX * OW_SUB, // local subtile stood on (or stepped into)
  gy: OW_SPAWN_GY * OW_SUB,
  fx: OW_SPAWN_GX * OW_SUB, // subtile the current hop started from
  fy: OW_SPAWN_GY * OW_SUB,
  t: 1, // step progress 0..1; 1 = standing
  facing: 'down' as OwDir,
  stride: 0, // which foot leads this hop; flips every step
  walkTime: 0, // wall-bump timer only: > 0 animates walking in place
  turnT: 0 // remaining turn-in-place time; > 0 means turning, not walking
}

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
let wildReturn: { realm: OwRealmId; gx: number; gy: number; facing: OwDir; key: string } | undefined

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
function resetPuzzles() {
  blockPos = (OW_REALMS[realmId].blocks ?? []).map((block) => ({ gx: block.gx, gy: block.gy }))
}

function blockAt(gx: number, gy: number): { gx: number; gy: number } | undefined {
  return blockPos.find((block) => block.gx === gx && block.gy === gy)
}

function switchHeld(gx: number, gy: number): boolean {
  return !!blockAt(gx, gy)
}

function lockFlag(lock: { gx: number; gy: number }): string {
  return `ow-lock:${realmId}:${lock.gx},${lock.gy}`
}

function lockClosed(gx: number, gy: number): boolean {
  const lock = owLockAt(realmId, gx, gy)
  if (!lock) return false
  if (hasOwFlag(lockFlag(lock))) return false
  return !switchHeld(lock.needSwitch.gx, lock.needSwitch.gy)
}

function placePlayer(gx: number, gy: number, facing: OwDir) {
  const sx = toSub(gx)
  const sy = toSub(gy)
  ow.gx = sx
  ow.gy = sy
  ow.fx = sx
  ow.fy = sy
  ow.t = 1
  ow.facing = facing
  ow.stride = 0
  ow.walkTime = 0
  ow.turnT = 0
  talkedFrom = ''
  sendOwMove(realmId, gx, gy, facing)
}

export function enterOverworld() {
  realmId = 'village'
  padDir = ''
  fade.dir = 0
  fade.t = 0
  wildReturn = undefined
  resetPuzzles()
  placePlayer(OW_SPAWN_GX, OW_SPAWN_GY, 'down')
}

/** The village is the hub: boot, a lost fight, and the credits all wake the
 * player on the plaza. Home is the pause menu over it (nav.back on the map). */
export function goVillage(): void {
  clampCleared()
  game.phase = 'overworld'
  game.menuBack = 'home'
  game.selectedSlot = -1
  resetMenu()
  enterOverworld()
  fade.dir = -1
  // Fresh account's first look at the plaza: the elder's welcome, once.
  if (game.cleared === 0 && !game.tutSeen.party && !hasOwFlag('guide-village')) {
    setOwFlag('guide-village')
    startOwTalk('guide-village')
  }
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
function gateReason(exit: OwExit): 'need' | 'item' | '' {
  if (exit.need && game.cleared < exit.need) return 'need'
  if (exit.needItem && !hasOwItem(exit.needItem)) return 'item'
  return ''
}

function postGateNotice(exit: OwExit) {
  const why = gateReason(exit)
  if (why === 'item') {
    game.notice = exit.needItem === 'reed-lamp' ? 'need-item' : 'sealed'
    playBump()
    return
  }
  // Only the *next* road gate talks. Post-game locks (need: 4 while you are
  // still on road 1) stay silent — that used to read as "kill the roamers."
  if (why === 'need' && exit.need === game.cleared + 1) {
    game.notice = 'clear-road'
    playBump()
  }
}

export function walkable(gx: number, gy: number): boolean {
  const maxX = GRID_W * OW_SUB
  const maxY = GRID_H * OW_SUB
  if (gx < 0 || gy < 0 || gx >= maxX || gy >= maxY) return false
  const cx = coarse(gx)
  const cy = coarse(gy)
  if (!owWalkable(realmId, cx, cy)) return false
  if (lockClosed(cx, cy)) return false
  if (blockAt(cx, cy)) return false
  const exit = owExitAt(realmId, cx, cy)
  if (exit && gateReason(exit)) return false
  return true
}

function canPlaceBlock(gx: number, gy: number): boolean {
  if (!owWalkable(realmId, gx, gy)) return false
  if (lockClosed(gx, gy)) return false
  if (blockAt(gx, gy)) return false
  if (owNpcAt(realmId, gx, gy) || owChestAt(realmId, gx, gy) || owSignAt(realmId, gx, gy)) return false
  if (owExitAt(realmId, gx, gy) || owPortalAt(realmId, gx, gy)) return false
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
    for (const lock of OW_REALMS[realmId].locks ?? []) {
      if (switchHeld(lock.needSwitch.gx, lock.needSwitch.gy)) setOwFlag(lockFlag(lock))
    }
    if (!wasHeld) playChest()
  }
  return true
}

/** Contact! The roamer brings its whole pack (spawn def) into the fight.
 * False when the fight can't start (no party) so walking stays possible. */
function triggerWildBattle(mon: { key: string; id: string }): boolean {
  const pack = owSpawnByKey(mon.key)?.pack ?? []
  if (!startWildBattle([mon.id, ...pack])) return false
  wildReturn = { realm: realmId, gx: coarse(ow.gx), gy: coarse(ow.gy), facing: ow.facing, key: mon.key }
  padDir = ''
  return true
}

/** Post-battle handoff from leaveResult: a won wild fight reports the slain
 * monster to the server and resumes the realm right where contact happened.
 * A loss falls through to the default blackout-home flow. */
export function returnFromWildBattle(): boolean {
  const stash = wildReturn
  wildReturn = undefined
  if (!stash) return false
  if (game.battle?.winner !== 'you') return false
  sendOwSlay(stash.key)
  realmId = stash.realm
  placePlayer(stash.gx, stash.gy, stash.facing)
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
    if (!tryPush(dir) || !walkable(nx, ny)) {
      const exit = owExitAt(realmId, coarse(nx), coarse(ny))
      if (exit) postGateNotice(exit)
      return false
    }
  }
  ow.fx = ow.gx
  ow.fy = ow.gy
  ow.gx = nx
  ow.gy = ny
  ow.t = 0
  ow.stride = ow.stride === 0 ? 1 : 0
  ow.walkTime = 0
  talkedFrom = ''
  // Walking away dismisses a floating notice (locked gate, recruit-first).
  game.notice = ''
  publishCoarse(nx, ny, dir)
  return true
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
  if (ow.t < 1) {
    ow.t = Math.min(1, ow.t + dt / OW_STEP_S)
    if (ow.t < 1) return
    ow.fx = ow.gx
    ow.fy = ow.gy
    // Step just landed: an open exit fades. Shut gates are unwalkable, so
    // their notices fire on the bump in tryStep instead.
    const exit = owExitAt(realmId, coarse(ow.gx), coarse(ow.gy))
    if (exit && !gateReason(exit)) {
      fade.dir = 1
      fade.t = 0
      fade.exit = exit
      return
    }
    // Warlord landmark door: standing at the gate opens its floor-select.
    const gate = OW_REALMS[realmId].roadGate
    if (gate && coarse(ow.gx) === gate.gx && coarse(ow.gy) === gate.gy) {
      openRoadGate(gate.road)
      return
    }
    // Menu portal (the rift at the stone circle): open the screen in place.
    const portal = owPortalAt(realmId, coarse(ow.gx), coarse(ow.gy))
    if (portal && openFromMap) {
      padDir = ''
      openFromMap(portal.opens)
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
  const mon = owMonsterOn(realmId, coarse(ow.gx), coarse(ow.gy))
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

function tryChest(): boolean {
  const chest = owChestAt(realmId, coarse(ow.gx), coarse(ow.gy))
  if (!chest || hasOwFlag(chest.id)) return false
  setOwFlag(chest.id)
  if (chest.loot.coins) game.coins += chest.loot.coins
  if (chest.loot.item) grantOwItem(chest.loot.item)
  playChest()
  const talk = chest.loot.item === 'reed-lamp' ? 'chest-lamp' : chest.loot.item ? 'chest-key' : 'chest-coins'
  startOwTalk(talk)
  padDir = ''
  return true
}

function trySign(): boolean {
  const sign = owSignAt(realmId, coarse(ow.gx), coarse(ow.gy))
  if (sign && startOwTalk(sign.talk)) {
    padDir = ''
    return true
  }
  return false
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
  const npc = owNpcAt(realmId, ahead.gx, ahead.gy)
  if (!npc) return false
  const key = `${realmId}:${coarse(ow.gx)},${coarse(ow.gy)}:${npc.id}`
  if (talkedFrom === key) return false
  if (!startOwTalk(npcTalkId(npc.talk))) return false
  talkedFrom = key
  padDir = ''
  return true
}

// nav.ts registers its open-from-map routine here (importing nav directly
// would be a cycle). It marks the back path so leaving the screen resumes
// the map instead of going home.
let openFromMap: ((phase: string) => void) | undefined
export function setOwOpener(fn: (phase: string) => void): void {
  openFromMap = fn
}

/** Landmark door reached on foot: open that road's floor-select in place.
 * Mirrors roads.openLevels (kept local to avoid an import cycle) but marks
 * the back path so leaving the screen steps back outside the gate. */
function openRoadGate(road: number): void {
  if (road > game.cleared || !ROADS[road]) {
    game.notice = 'clear-road'
    playBump()
    return
  }
  game.roadPick = road
  game.levelsBack = 'overworld'
  game.phase = 'levels'
  padDir = ''
  resetMenu()
}

/** Back out of a landmark's floor-select: wake on the door tile facing away
 * from the gate, under a fade-in, without resetting position to spawn. */
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

/** Area-name toast on realm entry: label key + fade-out alpha, or nothing. */
export function owToast(): { key: string; alpha: number } | undefined {
  if (toastT <= 0) return undefined
  const key = OW_REALMS[realmId].nameKey
  if (!key) return undefined
  return { key, alpha: Math.min(1, toastT / TOAST_FADE_S) }
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

export function owNpcRects(size: number): { id: string; sheet: string; left: number; top: number }[] {
  return (OW_REALMS[realmId].npcs ?? []).map((npc) => ({
    id: npc.id,
    sheet: npc.sheet,
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
        (lock) => lock.needSwitch.gx === plate.gx && lock.needSwitch.gy === plate.gy && hasOwFlag(lockFlag(lock))
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

function hintTile(): { gx: number; gy: number } | undefined {
  if (realmId === 'village') {
    // Fresh account: the inn first (its bench is the party tutorial), then the roads.
    if (!game.tutSeen.party) return OW_REALMS.village.exits.find((exit) => exit.to === 'hall-inn')
    if (game.cleared >= 1) return { gx: 0, gy: 9 }
    return { gx: 4, gy: 14 }
  }
  // Onboarding inside the inn: the square before the innkeeper, then (party
  // seated) the door back out.
  if (realmId === 'hall-inn' && game.cleared === 0) {
    return game.tutSeen.party ? OW_REALMS[realmId].exits[0] : { gx: 4, gy: 6 }
  }
  if (realmId === 'wilds') {
    if (!hasOwItem('reed-lamp')) return { gx: 5, gy: 2 }
    return { gx: 4, gy: 1 }
  }
  if (realmId === 'fen') return { gx: 3, gy: 1 }
  if (realmId === 'crypt') {
    const lock = OW_REALMS.crypt.locks?.[0]
    if (lock && lockClosed(lock.gx, lock.gy)) return lock.needSwitch
    if (!hasOwItem('gate-sigil')) return { gx: 2, gy: 3 }
    return { gx: 4, gy: 1 }
  }
  if (realmId === 'moorgate') return { gx: 4, gy: 3 }
  if (realmId === 'crow') return { gx: 4, gy: 1 }
  return undefined
}

/** Avatar quad in stage px, relative to the map's top-left corner. */
export function owAvatarRect(size: number): { left: number; top: number } {
  const px = ow.fx + (ow.gx - ow.fx) * ow.t
  const py = ow.fy + (ow.gy - ow.fy) * ow.t
  return tileRect(px, py, size, TILE / OW_SUB)
}

/** The shared wilds monsters of the current realm, placed for the UI.
 * `sizeOf` lets rarer roamers draw larger without changing the tile grid. */
export function owMonsterRects(
  sizeOf: (id: string) => number
): { id: string; left: number; top: number; size: number }[] {
  return owRemoteMonsters(realmId).map((mon) => {
    const size = sizeOf(mon.id)
    const px = mon.fx + (mon.gx - mon.fx) * mon.t
    const py = mon.fy + (mon.gy - mon.fy) * mon.t
    return { id: mon.id, size, ...tileRect(px, py, size) }
  })
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
