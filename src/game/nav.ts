import { listOathkin } from './allies'
import { playCancel, playClick, playRift } from './audio'
import { gift, mySeat, riftLeave, riftView, tradeCancel } from '../mp/session'
import { enterGame, isBootFilled, isBootReady } from './boot'
import { PACKS, packAt } from './packs'
import { ROADS } from './quests'
import { chestFxActive, startChestFx } from '../ui/flipbook'
import { advanceBanner, benchUnits, cancelPack, canFuse, cycleHero, findOwned, frontierFloor, fuse, fuseFaces, game, goHome, leaveHeroCard, leaveResult, openLevels, pickFuseHero, pickHero, prepareFuse, requestPack, resetMenu, skipBattle, startFloor, tapBenchHero, tapPartySlot } from './state'
import { PARTY_SIZE, Phase } from './types'

export const MENU_WINDOW = 4

const HOME: Phase[] = ['quest', 'party', 'fuse', 'shop', 'allies']

export function open(phase: Phase) {
  game.phase = phase
  game.selectedSlot = -1
  resetMenu()
  if (phase === 'quest') game.cursor = Math.min(game.cleared, ROADS.length - 1)
  if (phase === 'rift') playRift()
  if (phase === 'fuse') prepareFuse()
}

function menuLen(): number {
  if (game.phase === 'home') return HOME.length
  if (game.phase === 'quest') return Math.min(game.cleared + 1, ROADS.length)
  if (game.phase === 'party') return PARTY_SIZE + Math.min(MENU_WINDOW, benchUnits().length)
  if (game.phase === 'fuse') return fuseFaces().length
  if (game.phase === 'allies') return Math.max(0, listOathkin().length)
  if (game.phase === 'shop') return PACKS.length
  return 0
}

function keepCursorInView() {
  if (game.phase === 'party') {
    const bench = benchUnits()
    const max = Math.max(0, bench.length - MENU_WINDOW)
    if (game.menuShift > max) game.menuShift = max
    const vis = Math.min(MENU_WINDOW, bench.length)
    const last = vis > 0 ? PARTY_SIZE + vis - 1 : PARTY_SIZE - 1
    if (game.cursor > last) game.cursor = last
    if (game.cursor < 0) game.cursor = 0
    return
  }
  if (game.cursor < game.menuShift) game.menuShift = game.cursor
  if (game.cursor >= game.menuShift + MENU_WINDOW) game.menuShift = game.cursor - MENU_WINDOW + 1
  if (game.menuShift < 0) game.menuShift = 0
}

export function shiftBench(delta: number) {
  if (game.phase !== 'party' && game.phase !== 'fuse') return
  const len = game.phase === 'fuse' ? fuseFaces().length : benchUnits().length
  const max = Math.max(0, len - MENU_WINDOW)
  game.menuShift += delta
  if (game.menuShift < 0) game.menuShift = 0
  if (game.menuShift > max) game.menuShift = max
}

let padAt = 0
let lockUntil = 0

export function lockNav(ms = 400) {
  lockUntil = Date.now() + ms
}

export function padTappedRecently(): boolean {
  return Date.now() - padAt < 180
}

export function shiftFromPad(delta: number) {
  padAt = Date.now()
  shiftMenu(delta)
}

/** Move the selector. Stops at the ends — no wrap. */
export function shiftMenu(delta: number) {
  if (!isBootReady()) return
  if (game.phase === 'start') {
    cycleHero(delta)
    return
  }
  const len = menuLen()
  if (len <= 0) return
  game.cursor += delta
  if (game.cursor < 0) game.cursor = 0
  if (game.cursor > len - 1) game.cursor = len - 1
  keepCursorInView()
}

export function setCursor(index: number) {
  game.cursor = index
  const len = menuLen()
  if (game.cursor < 0) game.cursor = 0
  if (len > 0 && game.cursor > len - 1) game.cursor = len - 1
  keepCursorInView()
}

export function windowed<T>(items: T[]): T[] {
  const max = Math.max(0, items.length - MENU_WINDOW)
  if (game.menuShift > max) game.menuShift = max
  return items.slice(game.menuShift, game.menuShift + MENU_WINDOW)
}

export function focused(abs: number): boolean {
  return game.cursor === abs
}

/** E — use the highlighted card, or skip/continue in battle. */
export function primary() {
  if (!isBootReady()) {
    if (isBootFilled()) {
      playClick()
      enterGame()
    }
    return
  }
  if (Date.now() < lockUntil) return
  playClick()
  if (game.phase === 'start') {
    pickHero()
    return
  }
  if (game.phase === 'home') return
  if (game.phase === 'quest') {
    openLevels(game.cursor)
    return
  }
  if (game.phase === 'levels') {
    startFloor(game.roadPick, frontierFloor(game.roadPick))
    return
  }
  if (game.phase === 'party') {
    if (game.cursor < PARTY_SIZE) {
      tapPartySlot(game.cursor)
      return
    }
    const face = windowed(benchUnits())[game.cursor - PARTY_SIZE]
    if (face) tapBenchHero(face.uid)
    return
  }
  if (game.phase === 'fuse') {
    const a = findOwned(game.fuseA)
    const b = findOwned(game.fuseB)
    if (canFuse(a, b)) {
      fuse()
      return
    }
    const face = fuseFaces()[game.cursor]
    if (face) pickFuseHero(face.defId)
    return
  }
  if (game.phase === 'shop') {
    if (game.pendingPack) startChestFx()
    else requestPack(packAt(game.cursor).id)
    return
  }
  if (game.phase === 'allies') {
    const person = listOathkin()[game.cursor]
    if (!person) return
    game.selectedAlly = game.selectedAlly === person.userId ? '' : person.userId
    return
  }
  if (game.phase === 'battle') {
    skipBattle()
    return
  }
  dismissOverlay()
}

function dismissOverlay() {
  if (game.phase === 'banner') {
    advanceBanner()
    lockNav()
    return true
  }
  if (game.phase === 'report') {
    leaveResult()
    lockNav()
    return true
  }
  if (game.phase === 'heroCard') {
    leaveHeroCard()
    lockNav()
    return true
  }
  return false
}

/** F — leave the current screen. */
export function back() {
  if (!isBootReady()) return
  if (game.phase === 'home' && game.fireTalk) {
    playCancel()
    game.fireTalk = false
    lockNav()
    return
  }
  if (game.phase === 'party' && game.nftTalk) {
    playCancel()
    game.nftTalk = ''
    lockNav()
    return
  }
  if (game.phase === 'start' || game.phase === 'home') return
  playCancel()
  if (game.phase === 'battle') {
    skipBattle()
    return
  }
  if (dismissOverlay()) return
  if (game.phase === 'shop' && game.pendingPack) {
    if (chestFxActive()) return // the chest is already opening
    cancelPack()
    lockNav()
    return
  }
  if (game.phase === 'levels') {
    open('quest')
    lockNav()
    return
  }
  if (game.phase === 'festival' && gift.picking) {
    gift.picking = false
    lockNav()
    return
  }
  if (game.phase === 'fuse' && game.fuseHelp) {
    game.fuseHelp = false
    lockNav()
    return
  }
  if (game.phase === 'trade' || game.phase === 'rift') {
    leaveMultiplayerScreen()
    return
  }
  goHome()
  lockNav()
}

/** Trade + Rift screens exit through here so the server hears about it. */
export function leaveMultiplayerScreen() {
  if (game.phase === 'trade') tradeCancel()
  if (game.phase === 'rift' && riftView.pub.phase === 'lobby' && mySeat()) riftLeave()
  goHome()
  lockNav()
}
