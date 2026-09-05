import { bossSlain } from './owQuests'
import { game } from './store'

// Walk-up overworld talk. Same shape as tutorial tips (pages of line-strip
// keys) so ElderTalk can render it. Talks are local: other players do not
// see your dialog.

export type OwTalkPage = { lines: string[] }
/** `face`: 'elder' = the painted talking portrait; any other value is a
 * labels.gen walk-sheet key whose standing cell fills the frame; omitted =
 * portrait-less band (signs, coin finds). */
/** `then`: what happens when the talk closes. 'reward:<quest>' hands out a
 * side-quest prize. Handled in nav.ts (runOwTalkThen). */
export type OwTalk = { face?: string; pages: OwTalkPage[]; then?: string }

export const OW_TALKS: Record<string, OwTalk> = {
  // First step onto the map: how to walk, what the light is, how to leave.
  'guide-village': {
    face: 'elder',
    pages: [{ lines: ['ow-guide-1a', 'ow-guide-1b'] }, { lines: ['ow-guide-2a', 'ow-guide-2b'] }]
  },
  'elder-hint': {
    face: 'elder',
    pages: [{ lines: ['ow-elder-hint-1a', 'ow-elder-hint-1b', 'ow-elder-hint-1c'] }]
  },
  // The key item shows itself: the lamp sprite is the portrait when it is
  // found and when the elder confirms it (the notice strip names it).
  'elder-lamp': {
    face: 'ow-lamp',
    pages: [{ lines: ['ow-elder-lamp-1a', 'ow-elder-lamp-1b', 'ow-elder-lamp-1c'] }]
  },
  // Quest 'gate' paid: the Moor Ogre is felled, the elder hands over his
  // card and the west road opens (village exit needFlag 'gate-reward').
  'elder-thanks': {
    face: 'elder',
    pages: [{ lines: ['ow-elder-thanks-1a', 'ow-elder-thanks-1b'] }],
    then: 'reward:gate'
  },
  'elder-done': {
    face: 'elder',
    pages: [{ lines: ['ow-elder-done-1a', 'ow-elder-done-1b'] }]
  },
  // Quest 'hall': once the seer has paid for the abbot, the elder sends you
  // back through the Moor Gate's door; the regent's card closes the line.
  'elder-hall': {
    face: 'elder',
    pages: [{ lines: ['ow-elder-hall-1a', 'ow-elder-hall-1b'] }]
  },
  'elder-crown': {
    face: 'elder',
    pages: [{ lines: ['ow-elder-crown-1a', 'ow-elder-crown-1b'] }],
    then: 'reward:hall'
  },
  'elder-again': {
    face: 'elder',
    pages: [{ lines: ['ow-elder-again-1a', 'ow-elder-again-1b'] }]
  },
  'sign-well': {
    pages: [{ lines: ['ow-sign-well-1a', 'ow-sign-well-1b'] }]
  },
  'sign-wilds': {
    pages: [{ lines: ['ow-sign-wilds-1a', 'ow-sign-wilds-1b'] }]
  },
  'chest-coins': {
    pages: [{ lines: ['ow-chest-coins-1a'] }]
  },
  'chest-lamp': {
    face: 'ow-lamp',
    pages: [{ lines: ['ow-chest-lamp-1a', 'ow-chest-lamp-1b'] }]
  },
  'chest-key': {
    pages: [{ lines: ['ow-chest-key-1a', 'ow-chest-key-1b'] }]
  },
  // Keyed doors (owdefs OwLock.needItem): the key sprite is the portrait.
  'chest-bone': {
    face: 'ow-key',
    pages: [{ lines: ['ow-chest-bone-1a', 'ow-chest-bone-1b'] }]
  },
  'chest-oath': {
    face: 'ow-key',
    pages: [{ lines: ['ow-chest-oath-1a', 'ow-chest-oath-1b'] }]
  },
  'sign-crypt': {
    pages: [{ lines: ['ow-sign-crypt-1a', 'ow-sign-crypt-1b'] }]
  },
  // Dungeon rule signs: one per puzzle, stating the rule and nothing else.
  'sign-deep': {
    pages: [{ lines: ['ow-sign-deep-1a', 'ow-sign-deep-1b'] }]
  },
  'sign-well-door': {
    pages: [{ lines: ['ow-sign-well-door-1a', 'ow-sign-well-door-1b'] }]
  },
  'sign-hall': {
    pages: [{ lines: ['ow-sign-hall-1a', 'ow-sign-hall-1b'] }]
  },
  // Village folk. Each hint points at one Act 1 beat or one battle rule.
  fisher: { face: 'fisher-walk', pages: [{ lines: ['ow-fisher-1a', 'ow-fisher-1b'] }] },
  boy: { face: 'child-walk', pages: [{ lines: ['ow-boy-1a', 'ow-boy-1b'] }] },
  // Cottage hosts: one hint page each.
  weaver: { face: 'woman-walk', pages: [{ lines: ['ow-weaver-1a', 'ow-weaver-1b'] }] },
  hunter: { face: 'man-walk', pages: [{ lines: ['ow-hunter-1a', 'ow-hunter-1b'] }] },
  merchant: { face: 'man-walk', pages: [{ lines: ['ow-merchant-1a'] }] },
  inn: { face: 'man-walk', pages: [{ lines: ['ow-inn-1a', 'ow-inn-1b'] }] },
  // Lost-boy side quest: ask -> find him on the green -> come back for his
  // father's card -> done.
  'mother-ask': { face: 'woman-walk', pages: [{ lines: ['ow-mother-1a', 'ow-mother-1b'] }] },
  'mother-thanks': { face: 'woman-walk', pages: [{ lines: ['ow-mother-2a', 'ow-mother-2b'] }], then: 'reward:boy' },
  'mother-done': { face: 'woman-walk', pages: [{ lines: ['ow-mother-3a'] }] },
  'boy-home': { face: 'child-walk', pages: [{ lines: ['ow-boy-2a', 'ow-boy-2b'] }] },
  // Rookhaven, the Act 2 town beyond Crow Road.
  'rook-fisher': { face: 'fisher-walk', pages: [{ lines: ['ow-rook-fisher-1a', 'ow-rook-fisher-1b'] }] },
  'rook-boy': { face: 'child-walk', pages: [{ lines: ['ow-rook-boy-1a', 'ow-rook-boy-1b'] }] },
  // Quest 'widow': her husband rode for the Crow Lord and never came back.
  // Fell the Thorn Queen north of the circle and she gives you his oath.
  'rook-widow': {
    face: 'woman-walk',
    pages: [{ lines: ['ow-rook-widow-1a', 'ow-rook-widow-1b'] }, { lines: ['ow-rook-widow-2a', 'ow-rook-widow-2b'] }]
  },
  'widow-thanks': {
    face: 'woman-walk',
    pages: [{ lines: ['ow-widow-thanks-1a', 'ow-widow-thanks-1b'] }],
    then: 'reward:widow'
  },
  'widow-done': { face: 'woman-walk', pages: [{ lines: ['ow-widow-done-1a'] }] },
  'rook-warden': { face: 'man-walk', pages: [{ lines: ['ow-rook-warden-1a', 'ow-rook-warden-1b'] }] },
  'rook-merchant': { face: 'man-walk', pages: [{ lines: ['ow-rook-merchant-1a'] }] },
  'rook-seer': { face: 'woman-walk', pages: [{ lines: ['ow-rook-seer-1a', 'ow-rook-seer-1b'] }] },
  // Quest 'well': with the queen down, the seer names the mist's true
  // source, the well down the west road; the abbot's card is her thanks.
  'seer-ask': { face: 'woman-walk', pages: [{ lines: ['ow-seer-ask-1a', 'ow-seer-ask-1b'] }] },
  'seer-thanks': {
    face: 'woman-walk',
    pages: [{ lines: ['ow-seer-thanks-1a', 'ow-seer-thanks-1b'] }],
    then: 'reward:well'
  },
  'seer-done': { face: 'woman-walk', pages: [{ lines: ['ow-seer-done-1a'] }] },
  'rook-inn': { face: 'man-walk', pages: [{ lines: ['ow-rook-inn-1a'] }] }
}

let talkId = ''
let talkPage = 0

export function hasOwItem(id: string): boolean {
  return game.owItems.indexOf(id) >= 0
}

export function grantOwItem(id: string): void {
  if (game.owItems.indexOf(id) >= 0) return
  game.owItems.push(id)
}

export function hasOwFlag(id: string): boolean {
  return game.owFlags.indexOf(id) >= 0
}

export function setOwFlag(id: string): void {
  if (game.owFlags.indexOf(id) >= 0) return
  game.owFlags.push(id)
}

/** Which talk an NPC gives right now: most are fixed, story folk branch on
 * progress. Walking up to the boy is what "finds" him for his mother. */
export function npcTalkId(talk: string): string {
  switch (talk) {
    case 'elder':
      setOwFlag('elder-met') // the light stops pointing at him
      if (hasOwFlag('hall-reward')) return 'elder-again'
      if (bossSlain('ashen-regent')) return 'elder-crown'
      if (hasOwFlag('well-reward')) return 'elder-hall'
      if (hasOwFlag('gate-reward')) return 'elder-done'
      if (bossSlain('moor-ogre')) return 'elder-thanks'
      return hasOwItem('reed-lamp') ? 'elder-lamp' : 'elder-hint'
    case 'rook-widow':
      if (hasOwFlag('widow-reward')) return 'widow-done'
      return bossSlain('thorn-queen') ? 'widow-thanks' : 'rook-widow'
    case 'rook-seer':
      if (hasOwFlag('well-reward')) return 'seer-done'
      if (bossSlain('crimson-abbot')) return 'seer-thanks'
      return hasOwFlag('widow-reward') ? 'seer-ask' : 'rook-seer'
    case 'mother':
      if (hasOwFlag('boy-reward')) return 'mother-done'
      return hasOwFlag('boy-found') ? 'mother-thanks' : 'mother-ask'
    case 'boy':
      setOwFlag('boy-found')
      return 'boy'
    default:
      return talk
  }
}

export function startOwTalk(id: string): boolean {
  if (!OW_TALKS[id]) return false
  talkId = id
  talkPage = 0
  return true
}

export function owTalkActive(): boolean {
  return talkId !== ''
}

export function owTalkView(): { face?: string; lines: string[]; at: number; of: number } | undefined {
  const talk = OW_TALKS[talkId]
  if (!talk) return undefined
  const page = talk.pages[Math.min(talkPage, talk.pages.length - 1)]
  return { face: talk.face, lines: page.lines, at: talkPage + 1, of: talk.pages.length }
}

/** Advance one page. Returns the closed talk's `then` action ('' when the
 * talk is still open or has no follow-up). */
export function advanceOwTalk(): string {
  const talk = OW_TALKS[talkId]
  if (!talk) return ''
  if (talkPage + 1 < talk.pages.length) {
    talkPage += 1
    return ''
  }
  return dismissOwTalk()
}

/** Close the talk; a quest reward still pays out when cancelled. */
export function dismissOwTalk(): string {
  const then = OW_TALKS[talkId]?.then ?? ''
  talkId = ''
  talkPage = 0
  return then
}
