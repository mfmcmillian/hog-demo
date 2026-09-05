import { engine } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'
import { OW_DX, OW_DY, OW_REALMS, OwDir, OwRealmId, owExitAt, owWalkable } from '../game/owdefs'
import { OW_MONSTER_RESPAWN_S, OwMonsterPub, OwMsg, OwPlayerPub, OwPub, OwSlayPub } from '../mp/protocol'
import { MpOwState, OW_SYNC_ID, room } from '../mp/transport'
import { ServerCtx } from './ctx'

// The shared overworld: where every player stands (realm + tile) and where
// the wilds monsters roam. The server owns all of it - clients send tile
// intents ('owMsg') and mirror the published OwPub snapshot.

const WANDER_STEP_S = 1.1 // seconds between monster steps (client lerp matches)
const MONSTER_PUBLISH_S = 0.55 // batch wander updates
// Batch player tiles too: with several players walking, per-message publishes
// flooded the CRDT channel (each publish is the full snapshot JSON). Remotes
// lerp a full tile over ~0.5s, so 8Hz batching is invisible to them.
const PLAYER_PUBLISH_S = 0.12
const DIRS: OwDir[] = ['down', 'left', 'right', 'up']

type SrvMonster = OwMonsterPub & {
  spawnGx: number
  spawnGy: number
  /** Seconds until the next wander step (alive) or the respawn (slain). */
  wait: number
  alive: boolean
  guard: boolean
}

export function setupOverworld(ctx: ServerCtx): { dropOwPlayer: (address: string) => void } {
  const entity = engine.addEntity()
  let revision = 0
  let dirty = false
  let playerDirty = false
  let monsterDirty = false
  let monsterPublishWait = 0
  let playerPublishWait = 0

  const players = new Map<string, OwPlayerPub>()
  let lastSlay: OwSlayPub | undefined
  const monsters: SrvMonster[] = []
  for (const realm of Object.keys(OW_REALMS) as OwRealmId[]) {
    for (const spawn of OW_REALMS[realm].monsters) {
      if (spawn.boss) continue // warlords are personal: each client draws its own
      monsters.push({
        key: `${realm}:${spawn.gx},${spawn.gy}`,
        id: spawn.id,
        realm,
        gx: spawn.gx,
        gy: spawn.gy,
        spawnGx: spawn.gx,
        spawnGy: spawn.gy,
        wait: Math.random() * WANDER_STEP_S,
        alive: true,
        guard: spawn.guard === true
      })
    }
  }

  function snapshot(): OwPub {
    return {
      players: [...players.values()],
      monsters: monsters.filter((monster) => monster.alive).map(({ key, id, realm, gx, gy }) => ({ key, id, realm, gx, gy })),
      slay: lastSlay
    }
  }

  MpOwState.create(entity, { json: JSON.stringify(snapshot()), revision })
  syncEntity(entity, [MpOwState.componentId], OW_SYNC_ID)

  let lastLoggedPlayers = -1

  function publish(): void {
    revision += 1
    const state = MpOwState.getMutable(entity)
    state.json = JSON.stringify(snapshot())
    state.revision = revision
    dirty = false
    playerDirty = false
    monsterDirty = false
    monsterPublishWait = MONSTER_PUBLISH_S
    playerPublishWait = PLAYER_PUBLISH_S
    if (players.size !== lastLoggedPlayers) {
      lastLoggedPlayers = players.size
      console.log(`[Server] ow: publishing ${players.size} player(s), rev ${revision}`)
    }
  }

  function dropOwPlayer(address: string): void {
    if (players.delete(address)) {
      playerDirty = true
      dirty = true
    }
  }

  room.onMessage('owMsg', (data, context) => {
    if (!context) return
    const sender = context.from.toLowerCase()
    if (!sender) return
    let msg: OwMsg
    try {
      msg = JSON.parse(data.json) as OwMsg
    } catch {
      return
    }
    if (msg.type === 'move') {
      const realm = msg.realm as OwRealmId
      if (!OW_REALMS[realm]) return
      if (!owWalkable(realm, msg.gx, msg.gy)) return
      const facing: OwDir = DIRS.includes(msg.facing as OwDir) ? (msg.facing as OwDir) : 'down'
      // No-op moves (same tile + facing) neither dirty the state nor publish.
      const prev = players.get(sender)
      if (prev && prev.realm === realm && prev.gx === msg.gx && prev.gy === msg.gy && prev.facing === facing) return
      players.set(sender, { address: sender, name: ctx.nameFor(sender), realm, gx: msg.gx, gy: msg.gy, facing })
      // Batched by the system (PLAYER_PUBLISH_S), not published per message.
      playerDirty = true
      dirty = true
      return
    }
    if (msg.type === 'leave') {
      dropOwPlayer(sender)
      if (dirty) publish()
      return
    }
    if (msg.type === 'slay') {
      const monster = monsters.find((entry) => entry.key === msg.key)
      // Two players can engage the same monster; the first slay wins.
      if (!monster || !monster.alive) return
      monster.alive = false
      monster.wait = OW_MONSTER_RESPAWN_S
      lastSlay = { seq: (lastSlay?.seq ?? 0) + 1, address: sender, name: ctx.nameFor(sender), id: monster.id, key: monster.key }
      monsterDirty = true
      dirty = true
      publish()
    }
  })

  // --- Monster wander + respawn ---------------------------------------------------
  engine.addSystem((dt) => {
    // Only realms with someone standing in them wander: empty maps would
    // otherwise dirty the snapshot forever for updates nobody can see.
    const activeRealms = new Set<string>()
    for (const player of players.values()) activeRealms.add(player.realm)
    for (const monster of monsters) {
      monster.wait -= dt
      if (monster.wait > 0) continue
      if (!monster.alive) {
        // Respawn back at the spawn tile, fresh for the next traveler.
        monster.alive = true
        monster.gx = monster.spawnGx
        monster.gy = monster.spawnGy
        monster.wait = WANDER_STEP_S
        monsterDirty = true
        dirty = true
        continue
      }
      monster.wait = WANDER_STEP_S * (0.8 + Math.random() * 0.7)
      if (monster.guard) continue // guards hold their tile: no way around
      if (!activeRealms.has(monster.realm)) continue // nobody watching: stand still
      if (Math.random() < 0.35) continue // pause a beat, like grass rustling
      const dir = DIRS[Math.floor(Math.random() * DIRS.length)]
      const nx = monster.gx + OW_DX[dir]
      const ny = monster.gy + OW_DY[dir]
      const realm = monster.realm as OwRealmId
      // Stay on walkable ground, off exit tiles and warlord posts, and
      // don't stack monsters.
      if (!owWalkable(realm, nx, ny) || owExitAt(realm, nx, ny)) continue
      if (OW_REALMS[realm].monsters.some((spawn) => spawn.boss && spawn.gx === nx && spawn.gy === ny)) continue
      if (OW_REALMS[realm].chests?.some((chest) => chest.gx === nx && chest.gy === ny)) continue
      if (OW_REALMS[realm].npcs?.some((npc) => npc.gx === nx && npc.gy === ny)) continue
      if (monsters.some((other) => other !== monster && other.alive && other.realm === monster.realm && other.gx === nx && other.gy === ny)) continue
      monster.gx = nx
      monster.gy = ny
      monsterDirty = true
      dirty = true
    }
    // Publish cadence: player motion batches at PLAYER_PUBLISH_S (walking is
    // the hot path), monster-only motion at the slower MONSTER_PUBLISH_S, and
    // an empty world publishes nothing at all.
    playerPublishWait -= dt
    monsterPublishWait -= dt
    if (players.size === 0) return
    if (playerDirty && playerPublishWait <= 0) {
      publish()
      return
    }
    if (dirty && monsterDirty && monsterPublishWait <= 0) publish()
  })

  return { dropOwPlayer }
}
