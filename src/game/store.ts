import { PackId } from './packs'
import { BattleState, NoticeCode, OwnedFamiliar, Phase, RoadRun, XpLine } from './types'

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
  fuseHelp: false,
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
  starBurstTo: 0
}

export function findOwned(uid: string) {
  if (!uid) return undefined
  return game.collection.find((owned) => owned.uid === uid)
}
