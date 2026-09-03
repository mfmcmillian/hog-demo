import { PackId } from './packs'
import { BattleState, NoticeCode, OwnedFamiliar, Phase, RoadRun, SeenStoryId, StoryId, TipId, XpLine } from './types'

export const game = {
  phase: 'start' as Phase,
  heroIndex: 0,
  heroUid: '',
  cursor: 0,
  menuShift: 0,
  coins: 40,
  energy: 12,
  energyMax: 30,
  collection: [] as OwnedFamiliar[],
  party: ['', '', '', ''] as string[],
  selectedSlot: -1,
  cleared: 0,
  selectedAlly: '' as string,
  fuseA: '' as string,
  fuseB: '' as string,
  /** Story slideshow currently showing during the intro phase. */
  storyId: 'main' as StoryId,
  /** Intro story page currently showing (0-based). */
  introPage: 0,
  /** Intro story already watched (or skipped); persisted in the save. */
  introSeen: false,
  /** Road/final/epilogue stories this account has watched; persisted. */
  storySeen: {} as Partial<Record<SeenStoryId, boolean>>,
  /** Run stashed while its road's story plays; launched when the story ends. */
  pendingRun: undefined as { index: number; run: RoadRun } | undefined,
  /** Gates of Antrom already beaten (first-win jackpot spent); persisted. */
  finalWon: false,
  /** When the credits roll started (Date.now); drives the crawl position. */
  creditsAt: 0,
  /** Welcome dialog on the oath chamber, armed when the intro ends. */
  welcomeTalk: false,
  /** First-fight explainer page over the oath clash (0 = closed, 1..2 = page).
   * The battle is frozen while it shows. */
  fightTalk: 0,
  /** First-press tutorial dialog currently showing; '' = none. */
  tutTip: '' as TipId | '',
  /** Page of the showing tutorial dialog (0-based). */
  tutPage: 0,
  /** Tips this account has already dismissed; persisted in the save. */
  tutSeen: {} as Partial<Record<TipId, boolean>>,
  /** Cards acquired but never yet seen on the party bench (red PARTY badge). */
  freshUids: [] as string[],
  /** Campfire elder quest dialog open on the home screen. */
  fireTalk: false,
  /** Who's-online roster overlay open on the home screen. */
  onlineOpen: false,
  /** Locked NFT hero dialog on the party screen: the tapped defId, '' = closed. */
  nftTalk: '',
  /** Hero face selected on the fuse tree. */
  fuseId: '',
  /** Ingredient star rank (1..4). Two of these become fuseRank + 1. */
  fuseRank: 1,
  notice: '' as NoticeCode,
  noticeArg: '' as string,
  /** Chest waiting on the shop's ACCEPT/DECLINE confirmation. */
  pendingPack: '' as PackId | '',
  /** ACCEPT tapped: the chest ceremony should play. tickFlipbook owns the clock. */
  chestOpening: false,
  battle: undefined as BattleState | undefined,
  battleWait: 0,
  fightingIndex: 0,
  pendingDrop: undefined as OwnedFamiliar | undefined,
  rewarded: false,
  run: undefined as RoadRun | undefined,
  floorAt: {} as Record<string, number>,
  /** Ascension tier per road (1..MAX_STARS). Missing = tier 1. */
  roadStar: {} as Record<string, number>,
  /** Tier being browsed/fought this session; missing = the road's current tier. */
  pickedStar: {} as Record<string, number>,
  /** Tier the just-won boss fight raised its road to; 0 = no ascension. */
  ascendedStar: 0,
  /** Starter star total granted by the fight just won; 0 = none. */
  oathStar: 0,
  /** Road index being browsed on the level-select screen. */
  roadPick: 0,
  /** Where backing out of the level-select returns: menu or overworld door. */
  levelsBack: 'quest' as 'quest' | 'overworld',
  /** Where backing out of a menu screen lands: home, or the map tile you
   * opened it from (village buildings are the menu). */
  menuBack: 'home' as 'home' | 'overworld',
  lastXp: 0,
  lastLevels: 0,
  xpLines: [] as XpLine[],
  reveal: undefined as OwnedFamiliar | undefined,
  dropBack: 'home' as Phase,
  inspectUid: '',
  heroCardBack: 'home' as Phase,
  /** Settings toggles. `tickAudio` in audio.ts honors these every frame. */
  soundOn: true,
  musicOn: true,
  /** UTC day index of the last daily gift sent (0 = never). */
  giftDay: 0,
  /** Parent star count for the fuse flipbook; 0 = no burst. */
  starBurstFrom: 0,
  starBurstTo: 0,
  /** Opened overworld chests / one-shot flags; persisted. */
  owFlags: [] as string[],
  /** Key items found on the overworld; persisted. */
  owItems: [] as string[]
}

export function findOwned(uid: string) {
  if (!uid) return undefined
  return game.collection.find((owned) => owned.uid === uid)
}
