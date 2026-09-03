export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic'
type Role = 'melee' | 'ranged' | 'support'

type SkillKind = 'strike' | 'drain' | 'rally' | 'volley'
export type BattleFx = SkillKind | 'bolt'

export type FamiliarDef = {
  id: string
  name: string
  lineage: string
  rarity: Rarity
  role: Role
  hp: number
  atk: number
  skill: SkillKind
  skillText: string
}

export type OwnedFamiliar = {
  uid: string
  defId: string
  stars: number
  level: number
  xp: number
  isHero?: boolean
}

export type RoadRun = {
  roadId: string
  floor: number
  /** Ascension tier this fight runs at; equals the road's tier when climbing. */
  star?: number
  /** Fighting a floor already beaten: reduced rewards, no drops, no progression. */
  replay?: boolean
  /** Where the fight was launched from, so the report returns there. */
  via?: 'map' | 'go'
}

export type XpLine = {
  uid: string
  defId: string
  xpBefore: number
  needBefore: number
  levelBefore: number
  xpAfter: number
  needAfter: number
  levelAfter: number
  levels: number
}

export type Phase =
  | 'intro'
  | 'start'
  | 'home'
  | 'quest'
  | 'levels'
  | 'party'
  | 'fuse'
  | 'shop'
  | 'allies'
  | 'battle'
  | 'banner'
  | 'report'
  | 'heroCard'
  | 'trade'
  | 'rift'
  | 'settings'
  | 'festival'
  | 'credits'
  | 'overworld'

/** First-press tutorial tips: one per nav button and village building, plus
 * 'go' — the dialogless pointer on the home GO button after the first party
 * visit (persists via tutSeen like the rest). */
export const TIP_IDS = ['party', 'map', 'settings', 'events', 'fuse', 'shop', 'trade', 'friendzone', 'go'] as const
export type TipId = (typeof TIP_IDS)[number]

/** Once-per-account story slideshows that persist in the save: one per road
 * (played before its first fight), the final-battle prelude, and the victory
 * epilogue (replays after every Gates win, then the credits roll). The main
 * intro persists separately as the `intro` flag. */
export const STORY_IDS = ['q1', 'q3', 'q4', 'q6', 'final', 'epilogue'] as const
export type SeenStoryId = (typeof STORY_IDS)[number]
export type StoryId = 'main' | SeenStoryId

/**
 * Notices are codes, not sentences: every code matches a pre-rotated label
 * image (images/labels/<code>.png). 'recruited' and 'fused' pair with noticeArg
 * (a familiar defId) to show the familiar's name image after the word.
 */
export type NoticeCode =
  | ''
  | 'clear-road'
  | 'recruit-first'
  | 'no-coin'
  | 'fuse-rule'
  | 'road-failed'
  | 'recruited'
  | 'fused'
  | 'need-four'
  | 'need-item'
  | 'sealed'

type BattleSide = 'you' | 'foe'

export type BattleUnit = {
  uid: string
  defId: string
  name: string
  side: BattleSide
  hp: number
  maxHp: number
  atk: number
  skill: SkillKind
  ally?: boolean
  level?: number
  /** Actions taken so far; used to pace boss specials. */
  acts?: number
}

export type LogLine = { text: string; side?: BattleSide }

export type BattleState = {
  you: BattleUnit[]
  foe: BattleUnit[]
  log: LogLine[]
  queue: LogLine[]
  turn: number
  actingUid: string
  targetUid: string
  hitUids: string[]
  fx?: BattleFx
  fxUids: string[]
  damage: number
  oathClash?: boolean
  /** The Gates of Antrom: all four warlords at once (see startFinalBattle). */
  finalBattle?: boolean
  /** Friendzone duel: both sides are player heroes, so boss-lineage units
   * fire their specials every turn on either side (no foe-side holdback). */
  duel?: boolean
  winner?: 'you' | 'foe'
  coins: number
  dropId?: string
  kills: number
  xpEarned: number
  /** Other players in the scene when the fight started (oathkin). */
  kin?: number
  /** Extra coins in `coins` that the oathkin presence bonus added. */
  kinCoins?: number
}

export const PARTY_SIZE = 4
export const MAX_STARS = 5
export const MAX_LEVEL = 30
