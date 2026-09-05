import { AssetLoad, engine, executeTask } from '@dcl/sdk/ecs'
import { boot } from '../game/boot'
import { HERO_IDS } from '../game/familiars'
import { OW_REALMS, OwRealmId } from '../game/owdefs'
import { owRealmId } from '../game/overworld'
import { STORIES } from '../game/stories'
import { game } from '../game/store'
import { Phase } from '../game/types'
import { allFxSrcs, campfireSheet, sheetSrcOf } from './flipbook'
import { RAY_SRC, SPARKS_SRC } from './fx/reveal'
import { hallSrc } from './halls'
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
  'shop',
  'trade',
  'fuse',
  'questing',
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
  'no-travelers'
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

function battleSrcs(): string[] {
  const ids = [
    ...game.party.filter(Boolean).map((uid) => game.collection.find((owned) => owned.uid === uid)?.defId ?? ''),
    ...(game.battle?.you.map((unit) => unit.defId) ?? []),
    ...(game.battle?.foe.map((unit) => unit.defId) ?? [])
  ]
  return uniq([
    ...ids.map((id) => sheetSrcOf(id) ?? ''),
    ...ids.map((id) => hallSrc(id)),
    ...allFxSrcs(),
    ...labelSrcs(['map-clash-q1', 'map-clash-q3', 'map-clash-q4', 'map-clash-q6', 'win', 'lose', 'xp'])
  ])
}

function phaseSrcs(phase: Phase | 'overworld-next'): string[] {
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
    case 'rift':
    case 'festival':
    case 'settings':
    case 'quest':
    case 'levels':
      return []
    case 'battle':
    case 'banner':
    case 'report':
    case 'heroCard':
      return battleSrcs()
    case 'credits':
      return []
    default:
      return []
  }
}

const NEIGHBORS: Record<string, Phase[]> = {
  intro: ['start'],
  start: ['home'],
  home: ['overworld', 'party', 'settings', 'festival', 'shop', 'quest'],
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
  credits: ['home']
}

/** Hidden tiles bind only what the current screen (and one tap away) draws.
 * The screen's own Img/uiBackground still fetch anything we missed; PhaseFade
 * covers the first 400ms. This is what keeps decoded GPU memory flat. */
export function bindSrcs(): string[] {
  if (!boot.ready) return CRITICAL_SRCS
  const phase = game.phase
  const srcs = [...labelSrcs(CHROME_KEYS), ...phaseSrcs(phase)]
  for (const next of NEIGHBORS[phase] ?? []) srcs.push(...phaseSrcs(next))
  return uniq(srcs)
}

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
