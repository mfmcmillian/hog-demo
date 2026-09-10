import { AssetLoad, engine, executeTask } from '@dcl/sdk/ecs'
import { boot } from '../game/boot'
import { rollDailyTasks } from '../game/daily'
import { getDef, HERO_IDS } from '../game/familiars'
import { OW_REALMS, OwRealmId } from '../game/owdefs'
import { owRealmId } from '../game/overworld'
import { STORIES } from '../game/stories'
import { game } from '../game/store'
import { Phase } from '../game/types'
import { AVATAR_SRCS, avatarSrcs } from './avatar'
import { myLook } from '../mp/looks'
import { ARMORS, OUTFITS } from '../mp/protocol'
import './labels.wardrobe.gen'
import { FACE_ATLAS_SRC } from './faces.gen'
import { allFxSrcs, campfireSheet, sheetSrcOf } from './flipbook'
import { BEACON_SHAFT_SRC, BEACON_SRC } from './fx/beacon'
import { BURST_SRC, RAY_SRC, SPARKS_SRC } from './fx/reveal'
import { cardBackArt, hallSrc } from './halls'
import { charArt } from './widgets'
import { giftDayOf } from '../mp/protocol'
import './labels.daily.gen'
import './labels.duel.gen'
import './labels.feed.gen'
import './labels.hall.gen'
import { BOSS_LABELS } from './labels.boss.gen'
import { LABELS } from './labels.gen'
import { ROADS } from '../game/quests'
import { bossView } from '../mp/views'

/** Every lair word strip plus the hall strips the lair borrows. */
/** What the lair draws the moment it opens (the tab rail, the title, the
 * warlord's page): the neighbor warm-up from home binds only these, so the
 * home screen carries ~20 hidden tiles for the lair rather than ~46. */
const BOSS_FIRST_KEYS = [
  'boss-tab-lair',
  'boss-tab-board',
  'boss-title',
  'boss-hint',
  'tier',
  'boss-kills',
  'boss-fighting',
  'world-hp',
  'boss-ends-in',
  'attacks-left',
  'your-best',
  'your-rank',
  'rank-hash',
  'unranked',
  'attack',
  'boss-minute',
  'no-attacks',
  'road-slash',
  'dot'
]
/** Everything the lair can show: the board, the fight, the verdict, the spoils. */
const BOSS_KEYS = [...Object.keys(BOSS_LABELS), ...BOSS_FIRST_KEYS, 'hall-first', 'road-laurel', 'lv']
import { INTRO_LABELS } from './labels.intro.gen'
import { OW_LABELS } from './labels.ow.gen'

const BOOT_SRCS = [
  'images/boot/keyart-a.png',
  'images/boot/logo-a.png',
  'images/boot/start-a.png',
  'images/boot/bar-frame-a.png',
  'images/boot/bar-fill-a.png',
  'images/boot/bar-head-a.png',
  'images/boot/spin-ring-a.png'
]

function uniq(srcs: string[]): string[] {
  const seen: Record<string, true> = {}
  const out: string[] = []
  for (const src of srcs) {
    if (!src || seen[src]) continue
    seen[src] = true
    out.push(src)
  }
  return out
}

function labelSrcs(keys: string[]): string[] {
  return keys.map((key) => LABELS[key]?.src ?? '')
}

const INTRO_PAGES = STORIES.main
const INTRO_FIRST = [INTRO_PAGES[0].art, INTRO_PAGES[0].vo]
const INTRO_FIRST_LABELS = Object.entries(INTRO_LABELS)
  .filter(([key]) => key.startsWith('intro-1'))
  .map(([, info]) => info.src)

// Chrome + the screens a new or returning player hits in the first seconds.
// Everything else binds when its phase mounts, plus a one-tap warm set.
const CHROME_KEYS = ['pad-disc', 'btn-back', 'btn-action', 'screen-frame', 'continue', 'skip']
const START_KEYS = ['oath-select', 'select', 'sel-arrow-left', 'sel-arrow-right', 'oath-banner', 'swear-your-oath']
const HOME_KEYS = [
  'icon-bolt',
  'icon-coins',
  'dot',
  'players-online',
  'map-home',
  'home-shop',
  'home-trade',
  'home-rift',
  'home-fuse',
  'home-overworld',
  'home-hall',
  'home-boss',
  'shop',
  'trade',
  'fuse',
  'questing',
  'hall-of-heroes',
  'world-boss',
  'fire-grows',
  'fire-line1',
  'fire-line2',
  'fire-line3',
  'fire-line4',
  'btn-party',
  'btn-map',
  'btn-go',
  'btn-settings',
  'btn-event',
  'fest-panel',
  'no-travelers',
  // the elder's sealed-gate talk (LockTalk) and its pointer
  'tut-lock-1a',
  'tut-lock-1b',
  'tut-lock-1c',
  'tut-continue',
  'road-lock',
  // account level: HUD badge, level card, level-up ceremony (can fire anywhere)
  'lv',
  'acct-level',
  'level-up',
  'max-level',
  'xp-to-next',
  'energy-refilled',
  'max-energy',
  'new-hero-joins',
  'free-hero-at',
  'level-hint',
  'level-rewards'
]
// The map is one tap from home, so the village cast rides in the critical set.
// (The player's own walker is the layered AVATAR_SRCS set, not 'player-walk'.)
const OW_BASE_KEYS = [
  'elder-walk',
  'fisher-walk',
  'child-walk',
  'ow-chest',
  'ow-sign',
  'ow-rock',
  'ow-hole',
  'ow-gate',
  'map-overworld',
  'map-hut'
]

// Feed toasts can land on any screen: their verbs ride the critical set.
const FEED_KEYS = [
  'feed-entered',
  'feed-found',
  'feed-cleared',
  'feed-raid-won',
  'feed-defeated',
  'feed-felled',
  'feed-reached',
  'feed-streak',
  'feed-beat-ghost',
  'feed-ghost-fell',
  'feed-raided-with',
  'feed-passed-you',
  'feed-yours',
  'ghost',
  'legendary',
  'mythic'
]

const EXTRA = [
  ...BOOT_SRCS,
  // the customizable walker (map, seat plates, feed busts)
  ...AVATAR_SRCS,
  // every hero's small face, one texture (home party, benches, seats, feed)
  FACE_ATLAS_SRC,
  'images/maps/home-b.png',
  'images/ads/koa-c.png',
  'images/ads/decentracraft-c.png',
  // the button halo (widgets.Halo) and the tutorial pointer, used on most screens
  'images/hud/tut-ring.png',
  'images/hud/tut-pointer.png',
  // rarity light behind hero faces (widgets.RarityAura) on party / fuse tiles
  'images/hud/aura.png',
  'images/hud/select-frame.png',
  campfireSheet()
]

export const CRITICAL_SRCS = uniq([
  ...BOOT_SRCS,
  ...INTRO_FIRST,
  ...INTRO_FIRST_LABELS,
  ...labelSrcs([...CHROME_KEYS, ...START_KEYS, ...HOME_KEYS, ...OW_BASE_KEYS, ...FEED_KEYS]),
  ...HERO_IDS.map((id) => sheetSrcOf(id) ?? ''),
  ...HERO_IDS.map((id) => hallSrc(id)),
  ...EXTRA
])

/** `live`: we are on the map. A neighbor warm-up (home, the report) skips
 * the talk strips: ~90 word textures nobody sees until an NPC is tapped,
 * which was ~90 hidden tiles on every frame at home. */
function realmSrcs(id: OwRealmId, live: boolean): string[] {
  const realm = OW_REALMS[id]
  const keys = [
    realm.map,
    realm.nameKey ?? '',
    'ow-chest',
    'ow-sign',
    'ow-rock',
    'ow-hole',
    'ow-gate',
    'ow-lamp',
    'ow-key',
    'ow-quest',
    realm.over ?? '',
    realm.fog ? 'fog-a' : ''
  ]
  for (const npc of realm.npcs ?? []) keys.push(npc.sheet)
  // Ledge landings puff the sparks sheet; the quest beacon is baked gold;
  // decor reuses the fx flipbooks.
  const fx = [SPARKS_SRC, BEACON_SRC, BEACON_SHAFT_SRC]
  for (const decor of realm.decor ?? []) {
    fx.push(decor.fx === 'brazier' ? campfireSheet() : decor.fx === 'wisp' ? SPARKS_SRC : RAY_SRC)
  }
  return uniq([
    ...labelSrcs(keys),
    ...fx,
    ...AVATAR_SRCS,
    ...avatarSrcs(myLook()),
    ...(live ? Object.values(OW_LABELS).map((info) => info.src) : [])
  ])
}

/** `live` is the screen we're on; a neighbor warm-up skips the skill FX
 * sheets (the biggest textures here), which bind on entering the fight and
 * are first needed seconds later. */
function battleSrcs(live: boolean): string[] {
  const ids = [
    ...game.party.filter(Boolean).map((uid) => game.collection.find((owned) => owned.uid === uid)?.defId ?? ''),
    ...(game.battle?.you.map((unit) => unit.defId) ?? []),
    ...(game.battle?.foe.map((unit) => unit.defId) ?? [])
  ]
  return uniq([
    ...ids.map((id) => sheetSrcOf(id) ?? ''),
    // hall art only for the foes: one of them may drop its card (hero card)
    ...(game.battle?.foe.map((unit) => hallSrc(unit.defId)) ?? []),
    ...(live ? allFxSrcs() : []),
    ...labelSrcs(['map-clash-q1', 'map-clash-q3', 'map-clash-q4', 'map-clash-q6', 'win', 'lose', 'xp'])
  ])
}

/** The hero card: one hero's hall art and portrait, the card back, and the
 * reveal swirl only for a legendary or mythic pull. */
function heroCardSrcs(): string[] {
  const owned = game.reveal ?? game.collection.find((entry) => entry.uid === game.inspectUid)
  const id = owned?.defId ?? ''
  const rarity = id ? getDef(id).rarity : 'common'
  return uniq([
    cardBackArt().src,
    id ? hallSrc(id) : '',
    id ? (charArt(id)?.src ?? '') : '',
    game.reveal && (rarity === 'legendary' || rarity === 'mythic') ? BURST_SRC : '',
    ...labelSrcs(['herocard-banner', 'oath', 'sel-arrow-left', 'sel-arrow-right', 'plaque-stats'])
  ])
}

function phaseSrcs(phase: Phase | 'overworld-next', live: boolean): string[] {
  if (phase === 'overworld' || phase === 'overworld-next') {
    const here = owRealmId()
    const next = OW_REALMS[here].exits.map((exit) => exit.to)
    return uniq([
      ...realmSrcs(here, live),
      ...next.flatMap((id) => realmSrcs(id, false)),
      ...labelSrcs(['need-item', 'sealed', 'recruit-first'])
    ])
  }
  switch (phase) {
    case 'intro':
      return uniq([...INTRO_FIRST, ...INTRO_FIRST_LABELS, ...labelSrcs(['continue', 'skip'])])
    case 'start':
      return uniq([
        ...labelSrcs(START_KEYS),
        ...HERO_IDS.map((id) => sheetSrcOf(id) ?? ''),
        ...HERO_IDS.map((id) => hallSrc(id))
      ])
    case 'home':
      // The fireside figures bind the other travelers' sheets themselves the
      // moment they are drawn; only my own walker is worth warming here.
      return uniq([...labelSrcs(HOME_KEYS), campfireSheet(), FACE_ATLAS_SRC, ...avatarSrcs(myLook())])
    case 'party':
    case 'fuse':
    case 'allies':
      // Bench faces come off the atlas. The hero card's 1024x576 hall art
      // (one per owned hero) is warmed only once we are on the bench itself,
      // not from home: it grew with the collection, 2.4 MB a hero.
      return uniq([
        FACE_ATLAS_SRC,
        ...(live ? game.collection.map((owned) => hallSrc(owned.defId)) : []),
        ...(live ? [hallSrc('inspect')] : []),
        ...labelSrcs(['fuse-none'])
      ])
    case 'shop':
      return labelSrcs(['map-shop', 'shop-title', 'ember', 'pack-vow', 'crown'])
    case 'trade':
      return uniq([
        ...labelSrcs([
          'map-trade',
          'trade-title',
          'trade-name',
          'trade-card',
          'trade-swap',
          'trade-lock-off',
          'trade-lock-on',
          'invite',
          'waiting',
          'accept',
          'decline',
          'no-travelers',
          'offer-card',
          'cancelled',
          'declined',
          'left',
          'failed',
          'wants-trade',
          'trade-none',
          'empty-seat'
        ]),
        FACE_ATLAS_SRC
      ])
    case 'rift':
      return uniq([
        ...labelSrcs([
          'map-rift',
          'rift-title',
          'fest-panel',
          'rift-seat',
          'rift-enter',
          'rift-floors',
          'rift-ready-on',
          'rift-ready-off',
          'rift-energy',
          'rift-ribbon',
          'road-ring',
          'fest-cancel',
          'empty-seat',
          'players-online',
          // hub cards + lobby chrome
          'choose-your-arena',
          'arena-raid',
          'duel-1v1',
          'duel-4v4',
          'coop-hint',
          'pvp-hint',
          'pvp4-hint',
          'lobby-open',
          'in-battle',
          'starting-in',
          'reopens-in',
          'join',
          'spectate',
          'seated',
          'ready',
          'invite',
          'invite-hint',
          'invite-sent',
          'choose-a-player',
          'no-travelers',
          'pick-your-champion',
          'tap-enter-ready',
          'waiting-for-allies',
          'player-vs-player',
          'join-raid',
          'join-duel',
          'swap-hero',
          'invites-you',
          'play-again',
          'leave',
          'next-raid-in',
          'next-duel-in',
          'spoils',
          'watching',
          'win',
          'lose',
          'no-energy',
          // ghosts + free social
          'ghost',
          'fight-a-ghost',
          'ghost-hint',
          'ghost-allies',
          'ghost-called',
          'raid-free',
          'spoils-left',
          'spoils-spent',
          'duel-free'
        ]),
        ...AVATAR_SRCS,
        ...avatarSrcs(myLook()),
        FACE_ATLAS_SRC
      ])
    case 'festival':
      return labelSrcs([
        'map-settings',
        'fest-banner',
        'fest-panel',
        'fest-plate',
        'fest-bar-frame',
        'fest-bar-fill',
        'fest-gift',
        'fest-send',
        'fest-realm-goal',
        'fest-daily-gift',
        'crate-crown',
        'crate-ember',
        'crate-vow',
        'road-laurel',
        'daily-rewards',
        'daily-tasks',
        'task-go',
        'page-dailies',
        'page-realm',
        'dot',
        'streak',
        'day',
        'claim',
        'claimed',
        'come-back-tomorrow',
        'streak-hint',
        'all-done-bonus',
        'new-tasks-in',
        'icon-bolt',
        'icon-coins',
        ...rollDailyTasks(giftDayOf(Date.now())).map((id) => `task-${id}`)
      ])
    case 'hall':
      return labelSrcs([
        'map-hall-of-heroes',
        'hall-title',
        'hall-hint',
        'board-level',
        'board-roads',
        'board-raids',
        'board-duels',
        'your-rank',
        'rank-hash',
        'unranked',
        'hall-empty',
        'hall-first',
        'road-laurel',
        'lv',
        'wins',
        'feed-title',
        // the realm news page is a tab away once inside: not for the warm-up
        ...(live
          ? [
              'feed-empty',
              'feed-hint',
              'feed-now',
              'feed-ago-m',
              'feed-ago-h',
              'feed-ago-d',
              'icon-coins',
              ...FEED_KEYS
            ]
          : [])
      ])
    case 'boss':
      // the lair: its word strips, the warlord's portrait and name, the
      // clash floor behind it; a running attack binds the fight's sheets
      // (battleSrcs) on top when it is live
      return uniq([
        ...labelSrcs([
          ...(live ? BOSS_KEYS : BOSS_FIRST_KEYS),
          bossView.pub.defId,
          `map-clash-${ROADS.find((road) => road.boss === bossView.pub.defId)?.id ?? 'q1'}`,
          'map-cave'
        ]),
        charArt(bossView.pub.defId)?.src ?? '',
        // the fight is one tap away: keep the party's and the warlord's swing
        // sheets bound in the lair so the first blow lands on time
        ...(live ? [sheetSrcOf(bossView.pub.defId) ?? '', ...battleSrcs(!!bossView.fight)] : [])
      ])
    case 'settings':
      return labelSrcs(['set-appearance'])
    case 'wardrobe':
      // the tailor's rack: its word strips, the walker as it is, and every
      // tunic on the rack (the bust previews wear them all at once)
      return [
        ...labelSrcs([
          'wardrobe-title',
          'tab-colors',
          'tab-clothes',
          'fit-hint',
          'look-skin',
          'look-hair',
          'look-short',
          'look-long',
          'look-avatar',
          'look-hint',
          'tab-armor',
          'armor-hint',
          'armor-none',
          'armor-owned',
          'armor-worn',
          'armor-buy',
          'armor-poor',
          'icon-coins',
          'shop-accept',
          'shop-decline',
          ...OUTFITS.map((fit) => fit.name),
          ...ARMORS.map((suit) => suit.name)
        ]),
        ...AVATAR_SRCS,
        ...avatarSrcs(myLook()),
        ...OUTFITS.map((_, k) => `images/chars/player-walk-fit-${k}.png`),
        ...ARMORS.map((_, k) => `images/chars/player-walk-arm-${k + 1}.png`)
      ]
    case 'quest':
    case 'levels':
      return []
    case 'battle':
      return battleSrcs(live)
    case 'banner':
    case 'report':
      // after the fight: the units' sheets and the result labels, no skill FX
      return battleSrcs(false)
    case 'heroCard':
      return heroCardSrcs()
    case 'credits':
      return []
    default:
      return []
  }
}

const NEIGHBORS: Record<string, Phase[]> = {
  intro: ['start'],
  start: ['home'],
  // The events hall and the friendzone are one tap away too, but their word
  // strips run to ~80 textures between them; PhaseFade hides their first
  // binds. Warming them from home was ~80 extra UI nodes every frame.
  home: ['overworld', 'party', 'settings', 'shop', 'quest', 'trade', 'fuse', 'hall', 'boss'],
  // The questing area only leads home or into a fight (and back via report).
  overworld: ['home', 'battle'],
  quest: ['levels', 'home'],
  levels: ['battle'],
  party: ['home'],
  fuse: ['home'],
  shop: ['home'],
  allies: ['home'],
  battle: ['report', 'banner'],
  banner: ['report'],
  report: ['home', 'overworld', 'heroCard'],
  heroCard: ['overworld', 'home', 'credits'],
  trade: ['home'],
  rift: ['home'],
  settings: ['home', 'wardrobe'],
  wardrobe: ['settings'],
  festival: ['home'],
  hall: ['home'],
  boss: ['home'],
  credits: ['home']
}

/** Hidden tiles bind only what the current screen (and one tap away) draws.
 * The screen's own Img/uiBackground still fetch anything we missed; PhaseFade
 * covers the first 400ms. This is what keeps decoded GPU memory flat. */
export function bindSrcs(): string[] {
  if (!boot.ready) return CRITICAL_SRCS
  // PreloadTiles asks every UI frame; the answer only changes with the
  // screen and what it shows, so rebuild it only when this key moves.
  const key = [
    game.phase,
    game.collection.length,
    game.party.join(','),
    game.battle ? game.battle.foe.map((unit) => unit.defId).join(',') : '',
    owRealmId(),
    giftDayOf(Date.now()),
    game.reveal?.uid ?? game.inspectUid,
    // what my walker wears
    game.look
      ? `${game.look.skin}${game.look.hair}${game.look.body ?? ''}${game.look.outfit ?? 0}${game.look.armor ?? 0}`
      : ''
  ].join('|')
  if (key === bindKey) return bindCache
  const phase = game.phase
  const srcs = [...labelSrcs(CHROME_KEYS), ...phaseSrcs(phase, true)]
  for (const next of NEIGHBORS[phase] ?? []) srcs.push(...phaseSrcs(next, false))
  bindKey = key
  bindCache = uniq(srcs)
  return bindCache
}

let bindKey = ''
let bindCache: string[] = []

boot.total = CRITICAL_SRCS.length

function markFilled() {
  if (boot.filled) return
  boot.loaded = boot.total
  boot.filled = true
}

export function startPreload() {
  const holder = engine.addEntity()
  AssetLoad.create(holder, { assets: CRITICAL_SRCS })

  executeTask(async () => {
    const first = BOOT_SRCS
    const rest = CRITICAL_SRCS.filter((src) => first.indexOf(src) === -1)
    const queue = [...first, ...rest]
    const chunk = 12
    let bootDone = 0
    for (let i = 0; i < queue.length; i += chunk) {
      const slice = queue.slice(i, i + chunk)
      await Promise.all(
        slice.map(async (src) => {
          try {
            await fetch(src)
          } catch {
            // Preview still binds the file from the hidden UI tiles.
          }
          if (!boot.ready) boot.loaded += 1
          if (BOOT_SRCS.indexOf(src) >= 0) {
            bootDone += 1
            if (bootDone >= BOOT_SRCS.length && !boot.artAt) boot.artAt = Date.now()
          }
        })
      )
    }
    if (!boot.artAt) boot.artAt = Date.now()
  })

  let waited = 0
  engine.addSystem((dt) => {
    if (boot.ready) return
    waited += dt
    boot.gate = Math.min(1, waited / 2.2)
    const saveSettled = boot.saveKnown || waited >= 8
    if (boot.loaded >= boot.total && waited >= 2.2 && saveSettled) markFilled()
    else if (waited >= 22) markFilled()
  })
}
