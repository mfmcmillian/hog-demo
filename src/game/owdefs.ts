// Shared overworld definitions: pure data + helpers, imported by BOTH the
// client (game/overworld.ts) and the authoritative server (server/overworld.ts).
// Nothing here may import client-only modules (audio, UI, campaign...).
//
// All grid coordinates are PHYSICAL (portrait grip): gx 0..8 runs
// left->right across the phone, gy 0..15 runs top->bottom. The stage is the
// rotated landscape canvas (see ui/screens.tsx), so the UI converts tiles to
// stage px with: stageX = gy * TILE, stageY = (GRID_W - 1 - gx) * TILE.

export const GRID_W = 9
export const GRID_H = 16
export const TILE = 72
export const MAP_W = GRID_H * TILE // stage x extent (physical height): 1152
export const MAP_H = GRID_W * TILE // stage y extent (physical width): 648
/** Local walk subdivision. 2 = half-tiles (18x32). Collision/exits/monsters stay 9x16. */
export const OW_SUB = 2
/** Seconds per local walk hop. Half-tiles at ~0.26s ≈ Pokemon's 16px step time. */
export const OW_STEP_S = 0.26

export type OwDir = 'down' | 'left' | 'right' | 'up'
export type OwRealmId =
  | 'village'
  | 'wilds'
  | 'deep'
  | 'crow'
  | 'fen'
  | 'moorgate'
  | 'hut-weaver'
  | 'hut-hunter'
  | 'hut-merchant'
  | 'hut-mother'
  | 'hall-inn'
  | 'rookhaven'
  | 'rook-widow'
  | 'rook-warden'
  | 'rook-merchant'
  | 'rook-seer'
  | 'rook-inn'
  | 'crypt'
  | 'well'
  | 'hall'

export const OW_DX: Record<OwDir, number> = { down: 0, left: -1, right: 1, up: 0 }
export const OW_DY: Record<OwDir, number> = { down: 1, left: 0, right: 0, up: -1 }

// Stepping onto (gx,gy) fades the screen and drops the player at (sx,sy)
// in the target realm, keeping their facing so a held direction carries on.
// Locked exits are unwalkable and show a notice on the bump (see tryStep).
export type OwExit = {
  gx: number
  gy: number
  to: OwRealmId
  sx: number
  sy: number
  facing: OwDir
  /** Story gate: this owFlag must be set (quest-complete flags, never
   * slain flags, so nothing re-locks when the warlords return). */
  needFlag?: string
  /** Zelda gate: must own this key item (see game.owItems). */
  needItem?: string
  /** Wide door: walking into any of these blocked tiles (a cottage's whole
   * front) enters as if you had stepped onto the exit tile itself. */
  also?: { gx: number; gy: number }[]
}
/** `sheet` = labels.gen key of the 4x4 walk sheet drawn on the map (cell 0)
 * and used as the talk portrait. `talk` = OW_TALKS id ('elder' picks by state). */
export type OwNpc = {
  gx: number
  gy: number
  id: string
  talk: string
  sheet: string
  /** Story placement: only here while this owFlag is set / until it is set
   * (the lost boy stands on the green, then by his mother's hearth). */
  needFlag?: string
  hideFlag?: string
}

/** Is this NPC standing here for a player whose story flags `has` reads?
 * Without a reader (the server has no per-player story) a conditional NPC
 * counts as absent, so its tile stays walkable for everyone: the client is
 * the one that blocks it while the NPC is drawn. */
export function owNpcPresent(npc: OwNpc, has?: (flag: string) => boolean): boolean {
  if (!npc.needFlag && !npc.hideFlag) return true
  if (!has) return false
  if (npc.needFlag && !has(npc.needFlag)) return false
  if (npc.hideFlag && has(npc.hideFlag)) return false
  return true
}
export type OwSign = { gx: number; gy: number; talk: string }
export type OwChest = { gx: number; gy: number; id: string; loot: { coins?: number; item?: string } }
/** Pushable stone. Resets on re-enter; a switch under it opens locks. */
export type OwBlock = { gx: number; gy: number }
/** Floor plate. Open while any block sits on it. */
export type OwSwitch = { gx: number; gy: number }
/** Sealed tile. Opens (and stays open, via an owFlag) once every plate in
 * `needSwitch` holds a block at the same time, or, for a keyed door, once
 * `needItem` is owned. */
export type OwLock = { gx: number; gy: number; needSwitch?: { gx: number; gy: number }[]; needItem?: string }
// `guard` = trainer-block pattern: never wanders, so on a single-file trail
// the only way past is through the fight (respawns like any roamer).
// `pack` = MMBN-style group encounter: these foes join the fight alongside
// the map sprite (the leader). Only the leader roams; the pack is implied.
// `boss` = quest warlord: personal, not shared. The server never spawns it;
// each client draws it from this def until its own slain flag is set (see
// owQuests.ts). Bosses stand still like guards.
export type OwMonsterSpawn = { id: string; gx: number; gy: number; guard?: boolean; boss?: boolean; pack?: string[] }

/** Ledge tiles (Pokemon one-way): the char is the only direction you may
 * cross it, and crossing is a hop that lands on the tile beyond. Solid to
 * everything else (roamers, stones, the other three directions). */
const LEDGE_DIR: Record<string, OwDir> = { v: 'down', '^': 'up', '<': 'left', '>': 'right' }

export type OwRealm = {
  map: string // labels.gen key for the pre-rotated backdrop
  /** Row = gy, column = gx. Legend `# . v ^ < > o`: '#' wall, '.' floor,
   * 'v' '^' '<' '>' ledge hop-through in that direction (see LEDGE_DIR).
   * 'o' never appears here: it is the overhead mask handed to
   * `tools/process-ow-map.ps1 -over` that cuts `<name>-over.png` (the
   * `over` layer below) out of the painting. Workflow, one realm at a time:
   * author rows -> `tools/render-ow-layout.ps1` diagram -> paint from it ->
   * `process-ow-map.ps1` -> check `assets/<name>-map-grid.png` -> wire. */
  rows: string[]
  exits: OwExit[]
  monsters: OwMonsterSpawn[]
  /** Optional map tint so a reused backdrop still reads as a new place. */
  tint?: { r: number; g: number; b: number }
  /** labels.gen key of the area-name strip; shown as a toast on entry. */
  nameKey?: string
  /** labels.gen key of the overhead cut (arches, canopy, bridges): the
   * painting's own pixels drawn above every sprite so you walk under them. */
  over?: string
  /** Ambient flipbooks on tiles, drawn between the backdrop and the sprites. */
  decor?: OwDecor[]
  /** Drifting fog alpha (0 = none), drawn above the sprites, under `over`. */
  fog?: number
  npcs?: OwNpc[]
  signs?: OwSign[]
  chests?: OwChest[]
  blocks?: OwBlock[]
  switches?: OwSwitch[]
  locks?: OwLock[]
}

/** `fx`: brazier = campfire loop, wisp = ember sparks, shaft = light rays. */
export type OwDecor = { gx: number; gy: number; fx: 'brazier' | 'wisp' | 'shaft' }

export const OW_SPAWN_GX = 4
export const OW_SPAWN_GY = 8 // village plaza center

// Cottage interiors (Zelda house pattern): one painted room reused by every
// village door, told apart by tint and by who lives there. Rows authored
// against assets/hut-map-grid.png: floor is cols 2-6 rows 5-11 (the bed
// takes col 2 on rows 5-6), the doorway (4,12) walks back out to the village.
const HUT_ROWS = [
  '#########', // 0  void
  '#########', // 1
  '#########', // 2  back wall
  '#########', // 3  bed / hearth / shelves
  '#########', // 4
  '###....##', // 5  hearth glow (host stands at 4,5)
  '###....##', // 6  bed foot
  '##.....##', // 7  rug
  '##.....##', // 8
  '##.....##', // 9  stool
  '##.....##', // 10
  '##.....##', // 11 spawn (4,11) facing up
  '####.####', // 12 doorway -> village
  '#########', // 13 doormat
  '#########', // 14
  '#########' // 15
]
const HUT_HOST = { gx: 4, gy: 5 }
const HUT_SPAWN = { sx: 4, sy: 11, facing: 'up' as OwDir }

function hut(
  town: OwRealmId,
  door: { gx: number; gy: number },
  npc: Omit<OwNpc, 'gx' | 'gy'>,
  more: Pick<OwRealm, 'tint' | 'chests' | 'npcs'> = {}
): OwRealm {
  const { npcs = [], ...rest } = more
  return {
    map: 'map-hut',
    rows: HUT_ROWS,
    exits: [{ gx: 4, gy: 12, to: town, sx: door.gx, sy: door.gy + 1, facing: 'down' }],
    monsters: [],
    npcs: [{ ...HUT_HOST, ...npc }, ...npcs],
    ...rest
  }
}

// Town door tiles: the walkable square at the foot of each cottage lot.
// Stepping onto it fades into that home; leaving drops you on the lane below.
// Each lot is two tiles wide, so the other front tile (`also`) enters too:
// walking into the house anywhere along its front is going in, not a bump.
// Both towns share the village painting, so the lots line up.
const DOOR_TL = { gx: 2, gy: 4, also: [{ gx: 1, gy: 4 }] }
const DOOR_TR = { gx: 6, gy: 4, also: [{ gx: 7, gy: 4 }] }
const DOOR_ML = { gx: 2, gy: 8, also: [{ gx: 1, gy: 8 }] }
const DOOR_MR = { gx: 6, gy: 8, also: [{ gx: 7, gy: 8 }] }
const DOOR_BL = { gx: 2, gy: 12, also: [{ gx: 1, gy: 12 }] }

// Village painting collision, shared by every town on that art: cottage
// lots, pines, and the pond are '#'; lanes, lawns, and the five doors '.'.
const TOWN_ROWS = [
  '#########', // 0  border pines
  '###...###', // 1  stone circle
  '##.....##', // 2  circle lawn (elder at 4,2)
  '###...###', // 3  top houses only (1-2 and 6-7)
  '##.....##', // 4  top house doors (2,4) and (6,4)
  '#.......#', // 5  cobble in front of the top houses
  '#.......#', // 6  crossroad
  '###...###', // 7  mid houses only
  '##.....##', // 8  mid house doors (2,8) and (6,8); spawn 4,8
  '........#', // 9  west road + cobble in front of mid houses
  '#.......#', // 10 south green (boy at 2,10)
  '###...###', // 11 bottom-left house (1-2); lake 6-8
  '##....###', // 12 inn door (2,12); chest 5,12
  '#......##', // 13 bottom lane (sign 3,13); pier 6,13; fisher in his boat 7,13
  '####.####', // 14 spine off the map
  '#########' // 15
]

// Collision rows hand-authored from the 9x16 grid overlays.
export const OW_REALMS: Record<OwRealmId, OwRealm> = {
  village: {
    map: 'map-overworld',
    nameKey: 'ow-antrom',
    rows: TOWN_ROWS,
    // Where the art's roads visibly leave the map: the spine's south end
    // fades to the wilds (Act 1), the west road's edge gap to Crow Road
    // (Act 2, opens once the elder has paid for the Moor Ogre). Five cottage
    // doors fade inside.
    exits: [
      { gx: 4, gy: 14, to: 'wilds', sx: 7, sy: 13, facing: 'left' },
      { gx: 0, gy: 9, to: 'crow', sx: 7, sy: 14, facing: 'left', needFlag: 'gate-reward' },
      { ...DOOR_TL, to: 'hut-weaver', ...HUT_SPAWN },
      { ...DOOR_TR, to: 'hut-hunter', ...HUT_SPAWN },
      { ...DOOR_ML, to: 'hut-merchant', ...HUT_SPAWN },
      { ...DOOR_MR, to: 'hut-mother', ...HUT_SPAWN },
      { ...DOOR_BL, to: 'hall-inn', ...HUT_SPAWN }
    ],
    monsters: [],
    npcs: [
      { gx: 4, gy: 2, id: 'elder', talk: 'elder', sheet: 'elder-walk' },
      { gx: 7, gy: 13, id: 'fisher', talk: 'fisher', sheet: 'fisher-walk' },
      // Lost until his mother has thanked you; then he is home (hut-mother).
      { gx: 2, gy: 10, id: 'boy', talk: 'boy', sheet: 'child-walk', hideFlag: 'boy-reward' }
    ],
    // Beside the spine's mouth, not on the pier lane (every trip to the
    // fisher crossed it).
    signs: [{ gx: 3, gy: 13, talk: 'sign-wilds' }],
    chests: [{ gx: 5, gy: 12, id: 'chest-village-lake', loot: { coins: 20 } }]
  },
  // Village homes: quest rooms (a host with a hint, sometimes a chest or a
  // side quest). Menus live on the home screen, not behind these doors.
  'hut-weaver': hut('village', DOOR_TL, { id: 'weaver', talk: 'weaver', sheet: 'woman-walk' }),
  'hut-hunter': hut(
    'village',
    DOOR_TR,
    { id: 'hunter', talk: 'hunter', sheet: 'man-walk' },
    { tint: { r: 0.82, g: 0.92, b: 0.86 } }
  ),
  'hut-merchant': hut(
    'village',
    DOOR_ML,
    { id: 'merchant', talk: 'merchant', sheet: 'man-walk' },
    { tint: { r: 1, g: 0.9, b: 0.78 }, chests: [{ gx: 6, gy: 11, id: 'chest-hut-cook', loot: { coins: 20 } }] }
  ),
  'hut-mother': hut(
    'village',
    DOOR_MR,
    { id: 'mother', talk: 'mother', sheet: 'woman-walk' },
    {
      tint: { r: 0.88, g: 0.86, b: 1 },
      // The rescued boy, by the bed foot once the side quest has paid out.
      npcs: [{ gx: 2, gy: 7, id: 'boy-home', talk: 'boy-home', sheet: 'child-walk', needFlag: 'boy-reward' }]
    }
  ),
  'hall-inn': hut(
    'village',
    DOOR_BL,
    { id: 'innkeeper', talk: 'inn', sheet: 'man-walk' },
    { tint: { r: 1, g: 0.84, b: 0.7 }, chests: [{ gx: 2, gy: 11, id: 'chest-hall-inn', loot: { coins: 20 } }] }
  ),
  // Act 2 town — Rookhaven, north of Crow Road's rookery clearing. Same
  // village painting under a cold moon; its own merchant and inn, and hosts
  // who talk about the Crow Lord instead of the fen.
  rookhaven: {
    map: 'map-rookhaven', // the village lots under snow, so TOWN_ROWS still fit
    nameKey: 'ow-rookhaven',
    fog: 0.2,
    decor: [
      { gx: 2, gy: 1, fx: 'brazier' },
      { gx: 6, gy: 1, fx: 'brazier' }
    ],
    rows: TOWN_ROWS,
    // South spine back down Crow Road; the stone circle's north tile climbs
    // into the Deep Woods, the Thorn Queen's court (Act 2 finale); the west
    // road's edge gap descends to the Veiled Well (Act 3) once the widow
    // has paid for the queen.
    exits: [
      { gx: 4, gy: 14, to: 'crow', sx: 4, sy: 2, facing: 'down' },
      { gx: 4, gy: 1, to: 'deep', sx: 1, sy: 14, facing: 'up' },
      { gx: 0, gy: 9, to: 'well', sx: 4, sy: 14, facing: 'up', needFlag: 'widow-reward' },
      { ...DOOR_TL, to: 'rook-widow', ...HUT_SPAWN },
      { ...DOOR_TR, to: 'rook-warden', ...HUT_SPAWN },
      { ...DOOR_ML, to: 'rook-merchant', ...HUT_SPAWN },
      { ...DOOR_MR, to: 'rook-seer', ...HUT_SPAWN },
      { ...DOOR_BL, to: 'rook-inn', ...HUT_SPAWN }
    ],
    monsters: [],
    npcs: [
      { gx: 7, gy: 13, id: 'rook-fisher', talk: 'rook-fisher', sheet: 'fisher-walk' },
      { gx: 2, gy: 10, id: 'rook-boy', talk: 'rook-boy', sheet: 'child-walk' }
    ],
    chests: [{ gx: 5, gy: 12, id: 'chest-rook-lake', loot: { coins: 20 } }]
  },
  'rook-widow': hut(
    'rookhaven',
    DOOR_TL,
    { id: 'widow', talk: 'rook-widow', sheet: 'woman-walk' },
    { tint: { r: 0.8, g: 0.84, b: 1 } }
  ),
  'rook-warden': hut(
    'rookhaven',
    DOOR_TR,
    { id: 'warden', talk: 'rook-warden', sheet: 'man-walk' },
    { tint: { r: 0.82, g: 0.92, b: 0.86 } }
  ),
  'rook-merchant': hut(
    'rookhaven',
    DOOR_ML,
    { id: 'rook-merchant', talk: 'rook-merchant', sheet: 'man-walk' },
    { tint: { r: 1, g: 0.9, b: 0.78 } }
  ),
  'rook-seer': hut(
    'rookhaven',
    DOOR_MR,
    { id: 'seer', talk: 'rook-seer', sheet: 'woman-walk' },
    { tint: { r: 0.74, g: 0.7, b: 1 } }
  ),
  'rook-inn': hut(
    'rookhaven',
    DOOR_BL,
    { id: 'rook-innkeeper', talk: 'rook-inn', sheet: 'man-walk' },
    { tint: { r: 1, g: 0.84, b: 0.7 }, chests: [{ gx: 2, gy: 11, id: 'chest-rook-inn', loot: { coins: 20 } }] }
  ),
  wilds: {
    map: 'map-wilds',
    nameKey: 'ow-wilds',
    rows: [
      '#########', // 0  border pines
      '##.....##', // 1  bone glade: open 5x3 room, north tile is the deep
      '##.....##', // 2
      '##.....##', // 3
      '##.###.##', // 4  twin trails down from the glade
      '##.###.##', // 5
      '##.###.##', // 6
      '##.###.##', // 7
      '##.....##', // 8  middle crossroad
      '##.###.##', // 9
      '##.###.##', // 10
      '##.###.##', // 11
      '##.###.##', // 12
      '##.......', // 13 bottom lane back out to the village (east edge)
      '#########', // 14
      '#########' // 15
    ],
    // East end of the bottom lane returns to the village. The glade's north
    // lip is the Act 1 trail (fen, needs the reed lamp).
    exits: [
      { gx: 8, gy: 13, to: 'village', sx: 4, sy: 13, facing: 'up' },
      { gx: 4, gy: 1, to: 'fen', sx: 4, sy: 14, facing: 'up', needItem: 'reed-lamp' }
    ],
    // Commons by the village lane, uncommons on the trails, a rare in the
    // glade. R1 eases into packs: singles near the village, pairs deeper in.
    monsters: [
      { id: 'ash-hound', gx: 4, gy: 2, pack: ['ash-hound'] }, // hounds hunt in pairs
      { id: 'cinder-wight', gx: 2, gy: 2 }, // common — west glade
      { id: 'lamp-imp', gx: 6, gy: 6, pack: ['moor-crow'] }, // imp with a crow overhead
      { id: 'moor-crow', gx: 2, gy: 10 }, // common — west trail
      { id: 'grave-pike', gx: 2, gy: 5 }, // uncommon — west trail
      { id: 'rust-ballista', gx: 6, gy: 11, pack: ['lamp-imp'] }, // crewed engine
      { id: 'veil-sister', gx: 4, gy: 8 }, // uncommon — crossroad
      { id: 'blood-leech', gx: 6, gy: 3 }, // uncommon — east glade lip
      { id: 'dusk-oracle', gx: 3, gy: 3 } // rare — deep in the glade
    ],
    // Bone-glade chests sit off the roamer tiles so a fight and a find
    // cannot land on the same step.
    chests: [
      { gx: 2, gy: 3, id: 'chest-wilds-coins', loot: { coins: 20 } },
      { gx: 5, gy: 2, id: 'chest-wilds-lamp', loot: { item: 'reed-lamp' } }
    ]
  },
  // Deep Woods (Act 2 finale): same trail art, cooler tint, rarer roamers.
  // Climbed from Rookhaven's stone circle. The Thorn Queen keeps court in
  // the inner glade; her card is the widow's thanks (owQuests 'widow').
  deep: {
    map: 'map-deep',
    over: 'map-deep-over', // oak canopy over the two side trail mouths: -over row 7 'ooo###ooo', -floor 4,8
    nameKey: 'ow-deep',
    // Act 2 puzzle: two stones, two marks, a double lock. Rock B (3,11)
    // slides east onto the first mark. Rock A (4,10) sits in the crossroad:
    // pushing it north (the obvious move) strands it in the gate approach;
    // it has to be pushed *down* onto the second mark, which means climbing
    // the west trail, crossing the upper hub and coming back down the
    // center. The east trail and the east stair are one-way ledges, so the
    // loop only runs clockwise. Leaving the woods resets the stones.
    // Rows authored against assets/deep-map-grid.png.
    fog: 0.3,
    rows: [
      '#########', // 0  border thorns
      '###...###', // 1  queen's glade (thorn ring)
      '###...###', // 2  queen at 4,2
      '###...###', // 3  glade foot
      '####.####', // 4  double lock: marks (4,11) and (5,11)
      '####.####', // 5  gate approach — a stone pushed here is lost
      '#.......#', // 6  upper hub
      '#.##.##.#', // 7  west trail (climbs) / center (the stone road) / east trail; canopy over 1,7 and 7,7
      '#.##.##.#', // 8
      '#.##.##v#', // 9  east ledge: hop from (7,8) lands (7,10)
      '#.##.##.#', // 10 rock A at 4,10
      '#.......#', // 11 lower hub; rock B 3,11; marks 4,11 5,11
      '#.#####v#', // 12 west stair | east ledge: hop from (7,11) lands (7,13)
      '#.#####.#', // 13 torches; sign at 1,13
      '........#', // 14 lane; exit at the west edge
      '#########' // 15
    ],
    exits: [{ gx: 0, gy: 14, to: 'rookhaven', sx: 4, sy: 2, facing: 'down' }],
    // Big game: a covenant holds the west trail (the only climb), howls
    // roam the upper hub, and the queen waits in her glade with her guard.
    monsters: [
      { id: 'night-covenant', gx: 1, gy: 9, guard: true }, // epic — holds the west trail
      { id: 'pale-howl', gx: 6, gy: 6, pack: ['pale-howl'] }, // howls come in twos
      { id: 'oath-knight', gx: 3, gy: 1, pack: ['oath-knight'] }, // rare — glade patrol
      { id: 'thorn-queen', gx: 4, gy: 2, boss: true, pack: ['oath-knight', 'oath-knight'] } // warlord — royal guard
    ],
    decor: [
      { gx: 2, gy: 2, fx: 'wisp' },
      { gx: 6, gy: 1, fx: 'wisp' }
    ],
    signs: [{ gx: 1, gy: 13, talk: 'sign-deep' }],
    blocks: [{ gx: 4, gy: 10 }, { gx: 3, gy: 11 }],
    switches: [{ gx: 4, gy: 11 }, { gx: 5, gy: 11 }],
    locks: [{ gx: 4, gy: 4, needSwitch: [{ gx: 4, gy: 11 }, { gx: 5, gy: 11 }] }]
  },
  // Crow Road (Act 2): a single-file switchback through the dead forest, off
  // the village's west road. Rows authored against assets/crow-map-grid.png.
  // The q3 familiar pool prowls the bends; a rare oracle guards the rookery
  // clearing by the ballista wreck.
  crow: {
    map: 'map-crow',
    nameKey: 'ow-crow',
    rows: [
      '#########', // 0  dead canopy
      '###....##', // 1  rookery clearing, north lip under the crow tree
      '##.....##', // 2  clearing floor
      '###....##', // 3  clearing south lip, ballista wreck east
      '###.#####', // 4  top bend (lantern)
      '###.#####', // 5  upper descent
      '###.#####', // 6
      '##..#####', // 7  bend toward the west lantern
      '##.....##', // 8  middle run, east lantern at the far end
      '######.##', // 9  mid descent
      '######.##', // 10
      '##.....##', // 11 lower run (lantern west end)
      '##.######', // 12 lower descent
      '##.######', // 13
      '##.......', // 14 bottom lane out to the village (east edge)
      '#########' // 15
    ],
    // Bottom lane back to the village; the rookery clearing's north lip
    // climbs out to Rookhaven, the Act 2 town.
    exits: [
      { gx: 8, gy: 14, to: 'village', sx: 1, sy: 9, facing: 'up' },
      { gx: 4, gy: 1, to: 'rookhaven', sx: 4, sy: 13, facing: 'up' }
    ],
    // Crows flock: most encounters here are murder-of-crows packs.
    monsters: [
      { id: 'moor-crow', gx: 4, gy: 14, pack: ['moor-crow'] }, // bottom lane pair
      { id: 'moor-crow', gx: 5, gy: 8, pack: ['moor-crow', 'moor-crow'] }, // middle-run flock
      { id: 'grave-pike', gx: 3, gy: 5 }, // uncommon — upper descent
      { id: 'rust-ballista', gx: 4, gy: 11, guard: true, pack: ['moor-crow'] }, // holds the lower run
      { id: 'dusk-oracle', gx: 4, gy: 2 } // rare — rookery clearing
    ]
  },
  // Act 1, stage 2 — Whistling Fen: a bog maze north-east of the wilds.
  // One trunk trail climbs the map; side branches dead-end at wisp pools,
  // except the west pair which join into a loop. Exit top-left to the gate.
  fen: {
    map: 'map-fen',
    nameKey: 'ow-fen',
    // Rows trace the painted boardwalks (see assets/fen-map-grid.png):
    // one trunk with a west loop, three wisp-pool dead ends, exit top-left.
    rows: [
      '#########', // 0  drowned reeds
      '###.#####', // 1  true exit (3,1) to the Moor Gate
      '###.....#', // 2  upper east branch to the NE wisp pool
      '###.#####', // 3  exit run (guarded)
      '#....####', // 4  loop top bar, jog onto the trunk
      '#.##.####', // 5  loop west rung / trunk
      '#.##.####', // 6  loop west rung / trunk
      '#.##.####', // 7  loop west rung / trunk
      '#....####', // 8  loop bottom bar
      '####....#', // 9  mid east branch, wisp dead end (guarded junction)
      '####.####', // 10 trunk
      '####.####', // 11 trunk
      '####...##', // 12 lower east branch, wisp dead end
      '#....####', // 13 lower west branch
      '#.##.####', // 14 bone-pool pocket / entry from the wilds
      '####.####' // 15 bottom mouth back to the wilds
    ],
    exits: [
      { gx: 4, gy: 15, to: 'wilds', sx: 6, sy: 2, facing: 'down' },
      { gx: 3, gy: 1, to: 'crypt', sx: 4, sy: 14, facing: 'up' }
    ],
    // Guards hold the two single-file chokepoints (no way to the gate
    // without both fights); the rest wander the optional branches.
    monsters: [
      { id: 'ash-hound', gx: 4, gy: 9, guard: true, pack: ['lamp-imp'] }, // trunk junction
      { id: 'grave-pike', gx: 3, gy: 3, guard: true, pack: ['lamp-imp', 'lamp-imp'] }, // exit run
      { id: 'cinder-wight', gx: 1, gy: 6, pack: ['cinder-wight'] }, // west loop pair
      { id: 'lamp-imp', gx: 6, gy: 9 }, // common — mid east branch
      { id: 'lamp-imp', gx: 2, gy: 13 } // common — lower west branch
    ]
  },
  // Act 1 dungeon — the Reed Crypt, between the fen and the Moor Gate.
  // Push the stone onto the mark to open the north lock; the sigil in the
  // chest beyond opens the gate. Reuses the fen painting under a cave tint.
  crypt: {
    map: 'map-crypt',
    over: 'map-crypt-over', // the gate arch, drawn over the avatar: -over row 5 '###ooo###', -floor 4,4
    nameKey: 'ow-crypt',
    // Act 1 puzzle, kept easy: one rock, one hole, the gate. The treasury's
    // back stair (col 7) ends in a ledge that drops you into the chamber -
    // the "found the loot, hop home" beat that teaches ledges for Act 2.
    // Rows authored against assets/crypt-map-grid.png.
    rows: [
      '#########', // 0
      '####.####', // 1  exit to the Moor Gate (needs the sigil)
      '##......#', // 2  treasury
      '##......#', // 3  plinths: chests 2,3 sigil / 5,3 coins
      '####.##.#', // 4  gate corridor | stair (7,4)
      '####.##.#', // 5  the arch (walk under it) | stair (7,5)
      '####.##v#', // 6  iron gate (4,6) | ledge: hop from (7,5) lands (7,7)
      '##......#', // 7  chamber; ledge landing (7,7)
      '##.....##', // 8
      '##.....##', // 9  hole at 4,9
      '##.....##', // 10
      '##.....##', // 11 rock starts at 4,11 — push north onto the hole
      '####.####', // 12
      '####.####', // 13
      '####.####', // 14 entry from the fen
      '####.####' // 15
    ],
    exits: [
      { gx: 4, gy: 15, to: 'fen', sx: 3, sy: 2, facing: 'down' },
      { gx: 4, gy: 1, to: 'moorgate', sx: 4, sy: 14, facing: 'up', needItem: 'gate-sigil' }
    ],
    monsters: [],
    decor: [
      { gx: 6, gy: 1, fx: 'shaft' },
      { gx: 2, gy: 8, fx: 'shaft' }
    ],
    signs: [{ gx: 2, gy: 11, talk: 'sign-crypt' }],
    chests: [
      { gx: 2, gy: 3, id: 'chest-crypt-sigil', loot: { item: 'gate-sigil' } },
      { gx: 5, gy: 3, id: 'chest-crypt-coins', loot: { coins: 20 } }
    ],
    blocks: [{ gx: 4, gy: 11 }],
    switches: [{ gx: 4, gy: 9 }],
    locks: [{ gx: 4, gy: 6, needSwitch: [{ gx: 4, gy: 9 }] }]
  },
  // Act 1 finale — the Moor Gate: a straight brazier-lit approach to the
  // warlord's door. The Moor Ogre himself holds the approach; his card is
  // the elder's thanks (owQuests 'gate').
  moorgate: {
    map: 'map-moorgate',
    nameKey: 'ow-moorgate',
    rows: [
      '#########', // 0  gate pillars
      '#########', // 1
      '#########', // 2
      '###...###', // 3  door plaza — center tile is the gate itself
      '###...###', // 4  brazier landing
      '####.####', // 5  approach
      '####.####', // 6
      '####.####', // 7
      '####...##', // 8  east stub into the heather
      '####.####', // 9
      '##...####', // 10 west stub past the standing stones
      '####.####', // 11
      '####...##', // 12 east stub
      '####.####', // 13
      '####.####', // 14 entry from the fen
      '####.####' // 15 bottom mouth back to the fen
    ],
    // The door itself opens into the Oath Hall (Act 4) once the seer has
    // paid for the abbot; until then it is sealed.
    exits: [
      { gx: 4, gy: 15, to: 'crypt', sx: 4, sy: 2, facing: 'down' },
      { gx: 4, gy: 3, to: 'hall', sx: 4, sy: 14, facing: 'up', needFlag: 'well-reward' }
    ],
    // The warlord holds the single-file approach: the only way to the door
    // is through him. Lesser roamers wander the stubs.
    monsters: [
      { id: 'moor-ogre', gx: 4, gy: 7, boss: true, pack: ['cinder-wight', 'cinder-wight'] }, // warlord + retinue
      { id: 'cinder-wight', gx: 5, gy: 12 }, // common — east stub
      { id: 'ash-hound', gx: 3, gy: 10 } // common — west stub
    ]
  },
  // Act 3 finale — the Veiled Well: the fen painting under a blood tint,
  // read as a sunken abbey. A nave climbs to a cloister walk that rings the
  // well shaft; the Crimson Abbot waits at its head. His card is the seer's
  // thanks (owQuests 'well'). Reached down Rookhaven's west road.
  well: {
    map: 'map-well',
    over: 'map-well-over', // the cloister arcade arches: -over rows 4-5 '#oo###oo#', -floor 4,9
    nameKey: 'ow-well',
    // Act 3 puzzle: the transept is one long row with a mark carved at each
    // end. Three stones: one in the row, one at the top of each side
    // passage. The row stone reaches either mark straight off; a passage
    // stone has to be pushed up into the row first, and once it is there
    // it can only travel away from its own side - so pushing the row stone
    // west *before* raising the west spare leaves that spare useless (the
    // east spare still saves the run). Both marks held at once opens the
    // cloister. The abbot's door wants the bone key, kept in the east chapel
    // behind the leech. Rows authored against assets/well-map-grid.png.
    rows: [
      '#########', // 0  altar wall
      '###...###', // 1  sanctum: abbot at 4,1
      '####.####', // 2  the abbot's door (bone key)
      '##.....##', // 3  head of the cloister; door sign 6,3
      '##.###.##', // 4  the well shaft (light falls down it); arcade arches over the walks
      '##.###.##', // 5
      '##.###.##', // 6
      '##.....##', // 7  foot of the cloister; chest 6,7
      '####.####', // 8  double lock: marks (0,9) and (8,9)
      '.........', // 9  transept: mark 0,9 | row stone 3,9 | mark 8,9
      '##.#.#.##', // 10 west spare 2,10 / center passage / east spare 6,10
      '##.#.#.##', // 11
      '##.#.#..#', // 12 leech holds 6,12; bone key chest in the chapel 7,12
      '##.....##', // 13 lower transept; sign 5,13
      '####.####', // 14 nave: spawn from Rookhaven
      '####.####' // 15 mouth back up to Rookhaven
    ],
    exits: [{ gx: 4, gy: 15, to: 'rookhaven', sx: 1, sy: 9, facing: 'right' }],
    // The q4 pool: veil sisters and leeches. A leech keeps the key.
    monsters: [
      { id: 'veil-sister', gx: 3, gy: 13, pack: ['veil-sister'] }, // sisters walk in pairs
      { id: 'blood-leech', gx: 6, gy: 12, guard: true, pack: ['veil-sister'] }, // keeps the east chapel
      { id: 'dusk-oracle', gx: 2, gy: 6 }, // rare — west walk
      { id: 'crimson-abbot', gx: 4, gy: 1, boss: true, pack: ['veil-sister', 'veil-sister'] } // warlord + choir
    ],
    decor: [
      { gx: 4, gy: 5, fx: 'shaft' },
      { gx: 7, gy: 12, fx: 'wisp' }
    ],
    signs: [
      { gx: 5, gy: 13, talk: 'sign-well' },
      { gx: 6, gy: 3, talk: 'sign-well-door' }
    ],
    chests: [
      { gx: 6, gy: 7, id: 'chest-well-coins', loot: { coins: 20 } },
      { gx: 7, gy: 12, id: 'chest-well-key', loot: { item: 'bone-key' } }
    ],
    blocks: [{ gx: 3, gy: 9 }, { gx: 2, gy: 10 }, { gx: 6, gy: 10 }],
    switches: [{ gx: 0, gy: 9 }, { gx: 8, gy: 9 }],
    locks: [
      { gx: 4, gy: 8, needSwitch: [{ gx: 0, gy: 9 }, { gx: 8, gy: 9 }] },
      { gx: 4, gy: 2, needItem: 'bone-key' }
    ]
  },
  // Act 4 finale — the Oath Hall: the Moor Gate painting under ash, the
  // same straight approach now read as the regent's throne walk. The Ashen
  // Regent holds the brazier landing; his card is the elder's thanks
  // (owQuests 'hall'). Entered through the Moor Gate's door.
  hall: {
    map: 'map-hall',
    over: 'map-hall-over', // the colonnade arch and the east arch: -over row 3 '###ooo###', row 6 '######ooo', -floor 4,9
    nameKey: 'ow-hall',
    // Act 4 puzzle, a sequence. The west alcove's stone onto its mark opens
    // gate 1. Behind it the corridors form a loop around one stone at 4,6:
    // push it up into the upper corridor, then walk the loop to its east
    // side and drive it west onto the mark at 1,5 (east is a dead corner;
    // stones reset when you leave and come back). That opens gate 2; the
    // regent's door wants the oath key from the west col. The east col ends
    // in a balcony with a ledge back down to the lower hall. Rows authored
    // against assets/hall-map-grid.png.
    rows: [
      '#########', // 0  throne wall
      '###...###', // 1  dais: regent at 4,1
      '####.####', // 2  the regent's door (oath key)
      '####.####', // 3  throne walk (colonnade arch overhead)
      '####.####', // 4  gate 2: mark (1,5)
      '#.......#', // 5  upper corridor; mark 1,5
      '#.##.##.#', // 6  west col (oath key chest 1,6) / stone 4,6 / east col (arch)
      '#.......#', // 7  lower corridor; braziers 1,7 / 5,7
      '####.##.#', // 8  the walk down | east balcony 7,8 (brazier)
      '####.##v#', // 9  gate 1: mark (2,11) | balcony ledge: hop from (7,8) lands (7,10)
      '####....#', // 10 lower hall; sign 5,10
      '##....###', // 11 west alcove: mark 2,11; stone 3,11; brazier 5,11
      '####.####', // 12 approach; covenant holds it
      '####...##', // 13 east alcove
      '####.####', // 14 spawn from the Moor Gate door
      '####.####' // 15 mouth back out to the gate
    ],
    exits: [{ gx: 4, gy: 15, to: 'moorgate', sx: 4, sy: 4, facing: 'down' }],
    // The q6 pool: covenant, howls, knights. The covenant holds the approach.
    monsters: [
      { id: 'night-covenant', gx: 4, gy: 12, guard: true, pack: ['pale-howl'] }, // holds the approach
      { id: 'pale-howl', gx: 5, gy: 13, pack: ['pale-howl'] }, // east alcove pair
      { id: 'oath-knight', gx: 6, gy: 7 }, // rare — walks the loop
      { id: 'ashen-regent', gx: 4, gy: 1, boss: true, pack: ['night-covenant', 'pale-howl'] } // warlord + court
    ],
    decor: [
      { gx: 1, gy: 7, fx: 'brazier' },
      { gx: 5, gy: 7, fx: 'brazier' },
      { gx: 7, gy: 8, fx: 'brazier' },
      { gx: 5, gy: 11, fx: 'brazier' }
    ],
    signs: [{ gx: 5, gy: 10, talk: 'sign-hall' }],
    chests: [{ gx: 1, gy: 6, id: 'chest-hall-key', loot: { item: 'oath-key' } }],
    blocks: [{ gx: 3, gy: 11 }, { gx: 4, gy: 6 }],
    switches: [{ gx: 2, gy: 11 }, { gx: 1, gy: 5 }],
    locks: [
      { gx: 4, gy: 9, needSwitch: [{ gx: 2, gy: 11 }] },
      { gx: 4, gy: 4, needSwitch: [{ gx: 1, gy: 5 }] },
      { gx: 4, gy: 2, needItem: 'oath-key' }
    ]
  }
}

export function owWalkable(realm: OwRealmId, gx: number, gy: number, has?: (flag: string) => boolean): boolean {
  if (gx < 0 || gy < 0 || gx >= GRID_W || gy >= GRID_H) return false
  // NPCs occupy their tile: you stop on the square in front and talk.
  if (owNpcAt(realm, gx, gy, has)) return false
  return OW_REALMS[realm].rows[gy].charAt(gx) === '.'
}

/** The one direction this ledge tile may be hopped in, or undefined if it is
 * not a ledge. */
export function owLedgeDir(realm: OwRealmId, gx: number, gy: number): OwDir | undefined {
  if (gx < 0 || gy < 0 || gx >= GRID_W || gy >= GRID_H) return undefined
  return LEDGE_DIR[OW_REALMS[realm].rows[gy].charAt(gx)]
}

export function owExitAt(realm: OwRealmId, gx: number, gy: number): OwExit | undefined {
  return OW_REALMS[realm].exits.find((exit) => exit.gx === gx && exit.gy === gy)
}

/** The door whose front you just walked into: an exit listing this blocked
 * tile in `also` (see DOOR_TL). */
export function owDoorInto(realm: OwRealmId, gx: number, gy: number): OwExit | undefined {
  return OW_REALMS[realm].exits.find((exit) => exit.also?.some((tile) => tile.gx === gx && tile.gy === gy))
}

export function owNpcAt(realm: OwRealmId, gx: number, gy: number, has?: (flag: string) => boolean): OwNpc | undefined {
  return OW_REALMS[realm].npcs?.find((npc) => npc.gx === gx && npc.gy === gy && owNpcPresent(npc, has))
}

export function owSignAt(realm: OwRealmId, gx: number, gy: number): OwSign | undefined {
  return OW_REALMS[realm].signs?.find((sign) => sign.gx === gx && sign.gy === gy)
}

export function owChestAt(realm: OwRealmId, gx: number, gy: number): OwChest | undefined {
  return OW_REALMS[realm].chests?.find((chest) => chest.gx === gx && chest.gy === gy)
}

export function owLockAt(realm: OwRealmId, gx: number, gy: number): OwLock | undefined {
  return OW_REALMS[realm].locks?.find((lock) => lock.gx === gx && lock.gy === gy)
}

export function owSwitchAt(realm: OwRealmId, gx: number, gy: number): OwSwitch | undefined {
  return OW_REALMS[realm].switches?.find((plate) => plate.gx === gx && plate.gy === gy)
}

/** Spawn def behind a shared-monster key (`realm:gx,gy` of the SPAWN tile),
 * so contact with a roamer can pull in its full pack. */
/** Personal warlord key: never on the wire, only in the local mirror. */
export function owBossKey(realm: OwRealmId, id: string): string {
  return `boss:${realm}:${id}`
}

export function isOwBossKey(key: string): boolean {
  return key.startsWith('boss:')
}

/** Spawn def behind a sync key: shared `realm:gx,gy` or personal `boss:realm:id`. */
export function owSpawnByKey(key: string): OwMonsterSpawn | undefined {
  if (isOwBossKey(key)) {
    const [, realm, id] = key.split(':')
    return OW_REALMS[realm as OwRealmId]?.monsters.find((spawn) => spawn.boss && spawn.id === id)
  }
  const [realm, coords] = key.split(':')
  if (!coords || !OW_REALMS[realm as OwRealmId]) return undefined
  const [gx, gy] = coords.split(',').map(Number)
  return OW_REALMS[realm as OwRealmId].monsters.find((spawn) => spawn.gx === gx && spawn.gy === gy)
}
