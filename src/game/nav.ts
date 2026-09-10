import { cycleHero, pickHero } from './account'
import { listOathkin } from './allies'
import { playCancel, playClick, playRift } from './audio'
import { duelLeave, duelSit, myDuelSeat, mySeat, presentPlayers, riftLeave, riftSit, tradeCancel } from '../mp/session'
import { bossView, duelViews, fz, gift, hall, riftView, wardrobe } from '../mp/views'
import { Arena, DUEL_ENERGY_COST, DUEL_MODES, DUEL_SEATS, RIFT_ENERGY_COST, RIFT_SEATS } from '../mp/protocol'
import type { DailyTaskId } from './daily'
import { DEBUG } from './debug'
import { enterGame, isBootFilled, isBootReady } from './boot'
import { advanceBanner, advanceFightTalk, openFinalBattle, skipBattle } from './campaign'
import { canFuse, fuse, fuseFaces, pickFuseHero, prepareFuse } from './fuse'
import { advanceIntro, endCredits, skipIntro } from './intro'
import { cycleHeroCard, goHome, resetMenu, revealAcquisition } from './menu'
import { PACKS, packAt } from './packs'
import { benchUnits, partyUnits, strongestOwned, tapBenchHero, tapPartySlot } from './party'
import { frontierFloor } from './progress'
import { ROADS } from './quests'
import { makeOwned } from './familiars'
import { enterOverworld, owVisited, resumeOverworld } from './overworld'
import { isLastQuest, owQuest, questRewardFlag, questRewarded, resetBosses } from './owQuests'
import { advanceOwTalk, dismissOwTalk, owTalkActive, setOwFlag } from './owTalk'
import { leaveHeroCard, leaveResult, openLevels, startFloor } from './roads'
import { cancelPack, openPendingChest, requestPack } from './shop'
import { grantAccountXp, XP } from './level'
import { findOwned, game } from './store'
import { advanceTip, dismissTip, maybeStartTip, questingUnlocked, tipShowing } from './tutorial'
import { PARTY_SIZE, Phase, TipId } from './types'

export const MENU_WINDOW = 4

const HOME: Phase[] = ['quest', 'party', 'fuse', 'shop', 'allies']

const MENU_LEN: { [P in Phase]?: () => number } = {
  home: () => HOME.length,
  // Every unlocked road, plus the Gates of Antrom row once all are cleared.
  quest: () => Math.min(game.cleared + 1, ROADS.length) + (game.cleared >= ROADS.length ? 1 : 0),
  party: () => PARTY_SIZE + Math.min(MENU_WINDOW, benchUnits().length),
  fuse: () => fuseFaces().length,
  allies: () => Math.max(0, listOathkin().length),
  shop: () => PACKS.length
}

const OVERLAY_LEAVE: { [P in Phase]?: () => void } = {
  banner: advanceBanner,
  report: leaveResult,
  heroCard: leaveHeroCard
}

/** Screens that teach themselves the first time they open. */
const PHASE_TIP: { [P in Phase]?: TipId } = {
  party: 'party',
  quest: 'map',
  settings: 'settings',
  festival: 'events',
  fuse: 'fuse',
  shop: 'shop',
  trade: 'trade',
  rift: 'friendzone',
  hall: 'hall'
}

/** A home screen opened from inside a cottage (the merchant's shop, the
 * inn's bench): back returns to the map where you stood, not to home. */
let screenFromOverworld: Phase | '' = ''

export function open(phase: Phase) {
  game.phase = phase
  game.selectedSlot = -1
  screenFromOverworld = '' // opened from the home screen: back goes home
  resetMenu()
  if (phase === 'quest') game.cursor = Math.min(game.cleared, ROADS.length - 1)
  if (phase === 'rift') {
    playRift()
    // The friendzone always opens on the arena hub, overlays closed.
    fz.tab = 'hub'
    fz.inviting = false
  }
  if (phase === 'fuse') prepareFuse()
  if (phase === 'festival') game.festPage = 0 // the dailies are the reason you came
  if (phase === 'hall') hall.tab = 'level' // the board everyone is on
  if (phase === 'boss') {
    // A fresh look at the lair: last attack's verdict is gone. An attack
    // still running on the server re-attaches on its next step.
    bossView.result = undefined
    bossView.blocked = ''
    bossView.tab = 'lair'
  }
  if (phase === 'overworld') enterOverworld()
  // Fresh cards are discovered the moment the bench is on screen.
  if (phase === 'party') game.freshUids = []
  const tip = PHASE_TIP[phase]
  if (tip) maybeStartTip(tip)
}

/** Accept a raid/duel invite toast: land in that room and take a seat. */
export function acceptFzInvite() {
  const invite = fz.invite
  if (!invite) return
  fz.invite = undefined
  open('rift')
  enterArena(invite.arena)
  lockNav()
}

/** JOIN on the hub, ACCEPT on an invite, GO on a daily task: show the room
 * and, when its lobby has a free seat, sit straight down - the strongest
 * card you own for a raid or 1v1, your party for 4v4. One tap to be in.
 * The lobby still offers the hero strip to swap before readying up. */
export function enterArena(arena: Arena) {
  fz.inviting = false
  if (arena === 'raid') {
    fz.tab = 'raids'
  } else {
    fz.tab = 'duels'
    fz.duelMode = arena
  }
  sitInArena(arena)
}

/** Take a seat in `arena` if it is open; false (with a notice) when it is
 * not - the room may be mid-fight (spectate), full, or cost more energy
 * than you have. Server re-checks all of this. */
export function sitInArena(arena: Arena): boolean {
  if (arena === 'raid') {
    const pub = riftView.pub
    if (pub.phase !== 'lobby' || pub.seats.length >= RIFT_SEATS || mySeat()) return false
    if (!DEBUG.unlimitedEnergy && game.energy < RIFT_ENERGY_COST) {
      game.notice = 'no-energy'
      return false
    }
    const card = strongestOwned()
    if (!card) return false
    riftSit(card.uid)
    return true
  }
  const pub = duelViews[arena].pub
  if (pub.phase !== 'lobby' || pub.seats.length >= DUEL_SEATS || myDuelSeat(arena)) return false
  if (arena === '4v4' && partyUnits().length < 4) {
    game.notice = 'need-four'
    return false
  }
  if (!DEBUG.unlimitedEnergy && game.energy < DUEL_ENERGY_COST[arena]) {
    game.notice = 'no-energy'
    return false
  }
  if (arena === '1v1') {
    const card = strongestOwned()
    if (!card) return false
    duelSit('1v1', card.uid)
  } else {
    duelSit('4v4')
  }
  return true
}

/** GO on a daily task row: jump to where that task gets done. */
export function goDailyTask(id: DailyTaskId) {
  if (id === 'floors') open('quest')
  else if (id === 'wild') openOverworld()
  else if (id === 'pack') open('shop')
  else if (id === 'fuse') open('fuse')
  else if (id === 'trade') open('trade')
  else if (id === 'raid' || id === 'duel') {
    open('rift')
    enterArena(id === 'raid' ? 'raid' : '1v1')
  } else if (id === 'gift') {
    // Already on the events page: pop the recipient picker, or say why not.
    if (presentPlayers.size === 0) {
      gift.blocked = 'gone'
      gift.blockedAge = 0
    } else {
      gift.picking = true
    }
  }
  lockNav()
}

/** The home village button: resume the map where you left it this session,
 * or spawn on the plaza the first time. */
export function openOverworld() {
  // Locked until the Moor Gate road is cleared (see tutorial.questingUnlocked):
  // the elder says so and points at the map, rather than a dead tap.
  if (!questingUnlocked()) {
    game.lockTalk = true
    return
  }
  if (!owVisited()) {
    open('overworld')
    return
  }
  resumeOverworld()
  lockNav()
}

/** What a closed talk leaves behind: a quest prize (owQuests table), or a
 * screen the host keeps (merchant -> shop, innkeeper -> party bench, the
 * tailor -> his rack). */
export function runOwTalkThen(then: string) {
  if (!then) return
  const [kind, arg] = then.split(':')
  if (kind === 'wardrobe') {
    // The tailor shows his rack first; back returns to his cottage.
    wardrobe.tab = 'clothes'
    wardrobe.fromSettings = false
  }
  if (kind === 'shop' || kind === 'party' || kind === 'wardrobe') {
    open(kind)
    screenFromOverworld = kind
    lockNav()
    return
  }
  if (kind !== 'reward') return
  const quest = owQuest(arg)
  if (!quest || questRewarded(quest.id)) return
  setOwFlag(questRewardFlag(quest.id))
  grantAccountXp(XP.sideQuest)
  if (isLastQuest(quest.id)) {
    // The line is done: the warlords stand again for a second run (coins
    // only), and closing the regent's card rolls the credits, then home —
    // the same ending beat as a Gates win (leaveHeroCard starts the crawl).
    resetBosses()
    revealAcquisition(makeOwned(quest.card), 'credits')
    return
  }
  // The card ceremony returns to the map in place (closeOverlay keeps the
  // realm and tile; only enterOverworld respawns).
  revealAcquisition(makeOwned(quest.card), 'overworld')
}

/** Tap/E on an open talk: next page, or close and run its follow-up. */
export function owTalkNext() {
  runOwTalkThen(advanceOwTalk())
}

function menuLen(): number {
  return MENU_LEN[game.phase]?.() ?? 0
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
  if (game.phase === 'heroCard') {
    cycleHeroCard(delta)
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
  if (tipShowing()) {
    advanceTip()
    return
  }
  if (owTalkActive()) {
    owTalkNext()
    return
  }
  if (game.phase === 'intro') {
    advanceIntro()
    return
  }
  if (game.phase === 'credits') {
    endCredits()
    lockNav()
    return
  }
  if (game.phase === 'start') {
    if (game.welcomeTalk) {
      game.welcomeTalk = false
      return
    }
    pickHero()
    return
  }
  if (game.phase === 'home') {
    if (game.dropTalk) game.dropTalk = false
    if (game.lockTalk) game.lockTalk = false
    if (game.levelCard) game.levelCard = false
    return
  }
  if (game.phase === 'quest') {
    if (game.cursor >= ROADS.length) openFinalBattle()
    else openLevels(game.cursor)
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
    if (game.pendingPack) openPendingChest()
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
    if (game.fightTalk) {
      advanceFightTalk()
      return
    }
    skipBattle()
    return
  }
  dismissOverlay()
}

function dismissOverlay() {
  const leave = OVERLAY_LEAVE[game.phase]
  if (!leave) return false
  leave()
  lockNav()
  return true
}

/** F — leave the current screen. */
export function back() {
  if (!isBootReady()) return
  if (owTalkActive()) {
    playCancel()
    // Cancelling still pays a quest prize, but doesn't open the host's
    // screen: that needs the talk read through.
    const then = dismissOwTalk()
    if (then.startsWith('reward:')) runOwTalkThen(then)
    lockNav()
    return
  }
  if (tipShowing()) {
    playCancel()
    dismissTip()
    lockNav()
    return
  }
  if (game.phase === 'home' && game.dropTalk) {
    playCancel()
    game.dropTalk = false
    lockNav()
    return
  }
  if (game.phase === 'home' && game.onlineOpen) {
    playCancel()
    game.onlineOpen = false
    lockNav()
    return
  }
  if (game.phase === 'home' && game.fireTalk) {
    playCancel()
    game.fireTalk = false
    lockNav()
    return
  }
  if (game.phase === 'home' && game.lockTalk) {
    playCancel()
    game.lockTalk = false
    lockNav()
    return
  }
  if (game.phase === 'home' && game.levelCard) {
    playCancel()
    game.levelCard = false
    lockNav()
    return
  }
  if (game.phase === 'party' && game.nftTalk) {
    playCancel()
    game.nftTalk = ''
    lockNav()
    return
  }
  if (game.phase === 'intro') {
    playCancel()
    skipIntro()
    lockNav()
    return
  }
  if (game.phase === 'credits') {
    playCancel()
    endCredits()
    lockNav()
    return
  }
  if (game.phase === 'start' && game.welcomeTalk) {
    playCancel()
    game.welcomeTalk = false
    lockNav()
    return
  }
  if (game.phase === 'start' || game.phase === 'home') return
  playCancel()
  if (game.phase === 'battle') {
    if (game.fightTalk) {
      game.fightTalk = 0
      lockNav()
      return
    }
    skipBattle()
    return
  }
  if (dismissOverlay()) return
  if (game.phase === 'shop' && game.pendingPack) {
    if (game.chestOpening) return // the chest is already opening
    cancelPack()
    lockNav()
    return
  }
  if (game.phase === screenFromOverworld) {
    screenFromOverworld = ''
    resumeOverworld()
    lockNav()
    return
  }
  if (game.phase === 'levels') {
    open('quest')
    lockNav()
    return
  }
  if (game.phase === 'wardrobe' && wardrobe.fromSettings) {
    wardrobe.fromSettings = false
    open('settings')
    lockNav()
    return
  }
  if (game.phase === 'festival' && gift.picking) {
    gift.picking = false
    lockNav()
    return
  }
  if (game.phase === 'rift' && fz.inviting) {
    fz.inviting = false
    lockNav()
    return
  }
  if (game.phase === 'rift' && fz.tab !== 'hub') {
    // Inside a room: back steps out to the arena hub (standing up from a
    // lobby seat), not all the way home.
    leaveRoomSeats()
    fz.tab = 'hub'
    lockNav()
    return
  }
  if (game.phase === 'trade' || game.phase === 'rift') {
    leaveMultiplayerScreen()
    return
  }
  if (game.phase === 'boss') {
    // The fight (if any) keeps running on the server and is still scored;
    // only the spectating stops. Drop the borrowed battle snapshot so the
    // combat FX don't linger on the next screen.
    game.battle = undefined
    bossView.result = undefined
  }
  goHome()
  lockNav()
}

/** Stand up from any lobby seat I hold, and forget a pending PLAY AGAIN. */
function leaveRoomSeats() {
  fz.requeue = undefined
  if (riftView.pub.phase === 'lobby' && mySeat()) riftLeave()
  for (const mode of DUEL_MODES) {
    if (duelViews[mode].pub.phase === 'lobby' && myDuelSeat(mode)) duelLeave(mode)
  }
}

/** Trade + Friendzone screens exit through here so the server hears about it. */
function leaveMultiplayerScreen() {
  if (game.phase === 'trade') tradeCancel()
  if (game.phase === 'rift') leaveRoomSeats()
  goHome()
  lockNav()
}
