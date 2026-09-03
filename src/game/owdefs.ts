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

export const OW_DX: Record<OwDir, number> = { down: 0, left: -1, right: 1, up: 0 }
export const OW_DY: Record<OwDir, number> = { down: 1, left: 0, right: 0, up: -1 }

// Stepping onto (gx,gy) fades the screen and drops the player at (sx,sy)
// in the target realm, keeping their facing so a held direction carries on.
// `need` = roads cleared required (the Snorlax pattern): a locked exit shows
// the clear-road notice instead of fading (see tickOverworld).
export type OwExit = {
  gx: number
  gy: number
  to: OwRealmId
  sx: number
  sy: number
  facing: OwDir
  need?: number
  /** Zelda gate: must own this key item (see game.owItems). */
  needItem?: string
}
/** `sheet` = labels.gen key of the 4x4 walk sheet drawn on the map (cell 0)
 * and used as the talk portrait. `talk` = OW_TALKS id ('elder' picks by state). */
export type OwNpc = { gx: number; gy: number; id: string; talk: string; sheet: string }
export type OwSign = { gx: number; gy: number; talk: string }
/** Landing here opens a menu screen in place (rift at the stone circle). */
export type OwPortal = { gx: number; gy: number; opens: string }
export type OwChest = { gx: number; gy: number; id: string; loot: { coins?: number; item?: string } }
/** Pushable stone. Resets on re-enter; a switch under it opens locks. */
export type OwBlock = { gx: number; gy: number }
/** Floor plate. Open while any block sits on it. */
export type OwSwitch = { gx: number; gy: number }
/** Sealed tile. Walkable only while a block rests on `needSwitch`. */
export type OwLock = { gx: number; gy: number; needSwitch: { gx: number; gy: number } }
// `guard` = trainer-block pattern: never wanders, so on a single-file trail
// the only way past is through the fight (respawns like any roamer).
// `pack` = MMBN-style group encounter: these foes join the fight alongside
// the map sprite (the leader). Only the leader roams; the pack is implied.
export type OwMonsterSpawn = { id: string; gx: number; gy: number; guard?: boolean; pack?: string[] }

export type OwRealm = {
  map: string // labels.gen key for the pre-rotated backdrop
  rows: string[] // '#' blocked, '.' walkable; row = gy, column = gx
  exits: OwExit[]
  monsters: OwMonsterSpawn[]
  /** Optional map tint so a reused backdrop still reads as a new place. */
  tint?: { r: number; g: number; b: number }
  /** labels.gen key of the area-name strip; shown as a toast on entry. */
  nameKey?: string
  /** Warlord landmark door: landing here opens the road's floor-select. */
  roadGate?: { gx: number; gy: number; road: number }
  npcs?: OwNpc[]
  signs?: OwSign[]
  chests?: OwChest[]
  portals?: OwPortal[]
  blocks?: OwBlock[]
  switches?: OwSwitch[]
  locks?: OwLock[]
}

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
  more: Pick<OwRealm, 'tint' | 'chests'> = {}
): OwRealm {
  return {
    map: 'map-hut',
    rows: HUT_ROWS,
    exits: [{ gx: 4, gy: 12, to: town, sx: door.gx, sy: door.gy + 1, facing: 'down' }],
    monsters: [],
    npcs: [{ ...HUT_HOST, ...npc }],
    ...more
  }
}

// Town door tiles: the walkable square at the foot of each cottage lot.
// Stepping onto it fades into that home; leaving drops you on the lane below.
// Both towns share the village painting, so the lots line up.
const DOOR_TL = { gx: 2, gy: 4 }
const DOOR_TR = { gx: 6, gy: 4 }
const DOOR_ML = { gx: 2, gy: 8 }
const DOOR_MR = { gx: 6, gy: 8 }
const DOOR_BL = { gx: 2, gy: 12 }

// Village painting collision, shared by every town on that art: cottage
// lots, pines, and the pond are '#'; lanes, lawns, and the five doors '.'.
const TOWN_ROWS = [
  '#########', // 0  border pines
  '###...###', // 1  stone circle (rift portal at its heart, 4,1)
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
  '#......##', // 13 bottom lane (sign 5,13); pier 6,13; fisher in his boat 7,13
  '####.####', // 14 spine off the map
  '#########' // 15
]

// Collision rows hand-authored from the 9x16 grid overlays.
export const OW_REALMS: Record<OwRealmId, OwRealm> = {
  village: {
    map: 'map-overworld',
    rows: TOWN_ROWS,
    // Where the art's roads visibly leave the map: the spine's south end
    // fades to the wilds (Act 1), the west road's edge gap to Crow Road
    // (Act 2, gated on the first road clear). Five cottage doors fade inside.
    exits: [
      { gx: 4, gy: 14, to: 'wilds', sx: 7, sy: 13, facing: 'left' },
      { gx: 0, gy: 9, to: 'crow', sx: 7, sy: 14, facing: 'left', need: 1 },
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
      { gx: 2, gy: 10, id: 'boy', talk: 'boy', sheet: 'child-walk' }
    ],
    signs: [{ gx: 5, gy: 13, talk: 'sign-wilds' }],
    chests: [{ gx: 5, gy: 12, id: 'chest-village-lake', loot: { coins: 20 } }],
    // The stone circle is the rift: step into its heart to meet other players.
    portals: [{ gx: 4, gy: 1, opens: 'rift' }]
  },
  // Village homes double as the menu (Zelda shops): each host's talk ends by
  // opening a screen, and backing out of it lands you back in the room.
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
    { tint: { r: 0.88, g: 0.86, b: 1 } }
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
    map: 'map-overworld',
    nameKey: 'ow-rookhaven',
    tint: { r: 0.66, g: 0.8, b: 1 },
    rows: TOWN_ROWS,
    exits: [
      { gx: 4, gy: 14, to: 'crow', sx: 4, sy: 2, facing: 'down' },
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
    chests: [{ gx: 5, gy: 12, id: 'chest-rook-lake', loot: { coins: 20 } }],
    portals: [{ gx: 4, gy: 1, opens: 'rift' }]
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
    // lip is the Act 1 trail (fen, needs the reed lamp). The west lip is the
    // dusk woods, sealed until every road is cleared — not the obvious walk.
    exits: [
      { gx: 8, gy: 13, to: 'village', sx: 4, sy: 13, facing: 'up' },
      { gx: 4, gy: 1, to: 'fen', sx: 4, sy: 14, facing: 'up', needItem: 'reed-lamp' },
      { gx: 2, gy: 1, to: 'deep', sx: 7, sy: 13, facing: 'left', need: 4 }
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
  // Dusk woods: same trail art, cooler tint, rarer roamers. Reached from
  // the north of the wilds glade. A third distinct map needs new backdrop art.
  deep: {
    map: 'map-wilds',
    nameKey: 'ow-deep',
    tint: { r: 0.58, g: 0.48, b: 0.92 },
    rows: [
      '#########', // 0  border pines
      '##.....##', // 1  inner glade
      '##.....##', // 2
      '##.....##', // 3
      '##.###.##', // 4
      '##.###.##', // 5
      '##.###.##', // 6
      '##.###.##', // 7
      '##.....##', // 8
      '##.###.##', // 9
      '##.###.##', // 10
      '##.###.##', // 11
      '##.###.##', // 12
      '##.......', // 13 lane back to the wilds (east edge)
      '#########', // 14
      '#########' // 15
    ],
    exits: [{ gx: 8, gy: 13, to: 'wilds', sx: 4, sy: 2, facing: 'down' }],
    // Post-game big game: mostly fearsome solos, but the queen keeps court.
    monsters: [
      { id: 'oath-knight', gx: 4, gy: 2 }, // rare — inner glade
      { id: 'night-covenant', gx: 6, gy: 6 }, // epic — east trail
      { id: 'pale-howl', gx: 2, gy: 10, pack: ['pale-howl'] }, // howls come in twos
      { id: 'moor-ogre', gx: 4, gy: 8 }, // epic — crossroad
      { id: 'thorn-queen', gx: 3, gy: 3, pack: ['oath-knight', 'oath-knight'] } // legendary — royal guard
    ]
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
    map: 'map-fen',
    nameKey: 'ow-crypt',
    tint: { r: 0.62, g: 0.56, b: 0.72 },
    rows: [
      '#########', // 0
      '####.####', // 1  exit to the Moor Gate (needs the sigil)
      '###...###', // 2
      '###...###', // 3  chests 2,3 sigil / 6,3 coins
      '####.####', // 4
      '####.####', // 5  iron gate — only north tile, cannot walk around
      '##.....##', // 6
      '##.....##', // 7
      '##.....##', // 8  hole at 4,8
      '##.....##', // 9
      '##.....##', // 10 rock starts at 4,10 — push north onto the hole
      '####.####', // 11
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
    signs: [{ gx: 2, gy: 10, talk: 'sign-crypt' }],
    chests: [
      { gx: 2, gy: 3, id: 'chest-crypt-sigil', loot: { item: 'gate-sigil' } },
      { gx: 6, gy: 3, id: 'chest-crypt-coins', loot: { coins: 20 } }
    ],
    blocks: [{ gx: 4, gy: 10 }],
    switches: [{ gx: 4, gy: 8 }],
    locks: [{ gx: 4, gy: 5, needSwitch: { gx: 4, gy: 8 } }]
  },
  // Act 1 landmark — the Moor Gate: a straight brazier-lit approach to the
  // warlord's door. Landing on the door tile opens road 1's floor-select.
  moorgate: {
    map: 'map-moorgate',
    nameKey: 'ow-moorgate',
    roadGate: { gx: 4, gy: 3, road: 0 },
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
    exits: [{ gx: 4, gy: 15, to: 'crypt', sx: 4, sy: 2, facing: 'down' }],
    // The warlord's gatekeeper holds the single-file approach: the only way
    // to the door is through him. Lesser roamers wander the stubs.
    monsters: [
      { id: 'moor-ogre', gx: 4, gy: 7, guard: true, pack: ['cinder-wight', 'cinder-wight'] }, // gatekeeper + retinue
      { id: 'cinder-wight', gx: 5, gy: 12 }, // common — east stub
      { id: 'ash-hound', gx: 3, gy: 10 } // common — west stub
    ]
  }
}

export function owWalkable(realm: OwRealmId, gx: number, gy: number): boolean {
  if (gx < 0 || gy < 0 || gx >= GRID_W || gy >= GRID_H) return false
  // NPCs occupy their tile: you stop on the square in front and talk.
  if (OW_REALMS[realm].npcs?.some((npc) => npc.gx === gx && npc.gy === gy)) return false
  return OW_REALMS[realm].rows[gy].charAt(gx) === '.'
}

export function owExitAt(realm: OwRealmId, gx: number, gy: number): OwExit | undefined {
  return OW_REALMS[realm].exits.find((exit) => exit.gx === gx && exit.gy === gy)
}

export function owNpcAt(realm: OwRealmId, gx: number, gy: number): OwNpc | undefined {
  return OW_REALMS[realm].npcs?.find((npc) => npc.gx === gx && npc.gy === gy)
}

export function owSignAt(realm: OwRealmId, gx: number, gy: number): OwSign | undefined {
  return OW_REALMS[realm].signs?.find((sign) => sign.gx === gx && sign.gy === gy)
}

export function owChestAt(realm: OwRealmId, gx: number, gy: number): OwChest | undefined {
  return OW_REALMS[realm].chests?.find((chest) => chest.gx === gx && chest.gy === gy)
}

export function owPortalAt(realm: OwRealmId, gx: number, gy: number): OwPortal | undefined {
  return OW_REALMS[realm].portals?.find((portal) => portal.gx === gx && portal.gy === gy)
}

export function owLockAt(realm: OwRealmId, gx: number, gy: number): OwLock | undefined {
  return OW_REALMS[realm].locks?.find((lock) => lock.gx === gx && lock.gy === gy)
}

export function owSwitchAt(realm: OwRealmId, gx: number, gy: number): OwSwitch | undefined {
  return OW_REALMS[realm].switches?.find((plate) => plate.gx === gx && plate.gy === gy)
}

/** Spawn def behind a shared-monster key (`realm:gx,gy` of the SPAWN tile),
 * so contact with a roamer can pull in its full pack. */
export function owSpawnByKey(key: string): OwMonsterSpawn | undefined {
  const [realm, coords] = key.split(':')
  if (!coords || !OW_REALMS[realm as OwRealmId]) return undefined
  const [gx, gy] = coords.split(',').map(Number)
  return OW_REALMS[realm as OwRealmId].monsters.find((spawn) => spawn.gx === gx && spawn.gy === gy)
}
