import { AssetLoad, engine, executeTask } from '@dcl/sdk/ecs'
import { boot } from '../game/boot'
import { rollDailyTasks } from '../game/daily'
import { HERO_IDS } from '../game/familiars'
import { OW_REALMS, OwRealmId } from '../game/owdefs'
import { owRealmId } from '../game/overworld'
import { STORIES } from '../game/stories'
import { game } from '../game/store'
import { Phase } from '../game/types'
import { allFxSrcs, campfireSheet, sheetSrcOf } from './flipbook'
import { RAY_SRC, SPARKS_SRC } from './fx/reveal'
import { hallSrc } from './halls'
import { giftDayOf } from '../mp/protocol'
import './labels.daily.gen'
import './labels.duel.gen'
import './labels.hall.gen'
import { LABELS } from './labels.gen'
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
  'shop',
  'trade',
  'fuse',
  'questing',
  'hall-of-heroes',
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
const OW_BASE_KEYS = [
  'player-walk',
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

const EXTRA = [
  ...BOOT_SRCS,
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
  ...labelSrcs([...CHROME_KEYS, ...START_KEYS, ...HOME_KEYS, ...OW_BASE_KEYS]),
  ...HERO_IDS.map((id) => sheetSrcOf(id) ?? ''),
  ...HERO_IDS.map((id) => hallSrc(id)),
  ...EXTRA
])

function realmSrcs(id: OwRealmId): string[] {
  const realm = OW_REALMS[id]
  const keys = [
    realm.map,
    realm.nameKey ?? '',
    'player-walk',
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
  // Ledge landings puff the sparks sheet; decor reuses the fx flipbooks.
  const fx = [SPARKS_SRC]
  for (const decor of realm.decor ?? []) {
    fx.push(decor.fx === 'brazier' ? campfireSheet() : decor.fx === 'wisp' ? SPARKS_SRC : RAY_SRC)
  }
  return uniq([...labelSrcs(keys), ...fx, ...Object.values(OW_LABELS).map((info) => info.src)])
}

function ownedSheetSrcs(): string[] {
  return uniq(game.collection.map((owned) => sheetSrcOf(owned.defId) ?? ''))
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
    ...ids.map((id) => hallSrc(id)),
    ...(live ? allFxSrcs() : []),
    ...labelSrcs(['map-clash-q1', 'map-clash-q3', 'map-clash-q4', 'map-clash-q6', 'win', 'lose', 'xp'])
  ])
}

function phaseSrcs(phase: Phase | 'overworld-next', live: boolean): string[] {
  if (phase === 'overworld' || phase === 'overworld-next') {
    const here = owRealmId()
    const next = OW_REALMS[here].exits.map((exit) => exit.to)
    return uniq([
      ...realmSrcs(here),
      ...next.flatMap(realmSrcs),
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
      return uniq([...labelSrcs(HOME_KEYS), campfireSheet(), ...ownedSheetSrcs()])
    case 'party':
    case 'fuse':
    case 'allies':
      return uniq([
        ...ownedSheetSrcs(),
        ...game.collection.map((owned) => hallSrc(owned.defId)),
        hallSrc('inspect'),
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
        ...ownedSheetSrcs()
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
          'no-energy'
        ]),
        ...ownedSheetSrcs()
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
        'wins'
      ])
    case 'settings':
    case 'quest':
    case 'levels':
      return []
    case 'battle':
    case 'banner':
    case 'report':
    case 'heroCard':
      return battleSrcs(live)
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
  home: ['overworld', 'party', 'settings', 'shop', 'quest', 'trade', 'fuse', 'hall'],
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
  settings: ['home'],
  festival: ['home'],
  hall: ['home'],
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
    giftDayOf(Date.now())
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
