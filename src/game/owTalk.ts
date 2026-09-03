import { game } from './store'

// Walk-up overworld talk. Same shape as tutorial tips (pages of line-strip
// keys) so ElderTalk can render it. Talks are local: other players do not
// see your dialog.

export type OwTalkPage = { lines: string[] }
/** `face`: 'elder' = the painted talking portrait; any other value is a
 * labels.gen walk-sheet key whose standing cell fills the frame; omitted =
 * portrait-less band (signs, coin finds). */
/** `then`: what happens when the talk closes. 'open:<phase>' opens a menu
 * screen in place (the Zelda shopkeeper pattern), 'reward:<quest>' hands
 * out a side-quest prize. Handled in nav.ts (runOwTalkThen). */
export type OwTalk = { face?: string; pages: OwTalkPage[]; then?: string }

export const OW_TALKS: Record<string, OwTalk> = {
  // First landing on the plaza (after the oath clash): walk, follow the
  // light, the inn keeps your card, back is the camp, then the road south.
  'guide-village': {
    face: 'elder',
    pages: [
      { lines: ['ow-guide-1a', 'ow-guide-1b'] },
      { lines: ['intro-d1', 'ow-guide-2b'] },
      { lines: ['ow-guide-3a', 'ow-guide-3b'] }
    ]
  },
  'elder-hint': {
    face: 'elder',
    pages: [{ lines: ['ow-elder-hint-1a', 'ow-elder-hint-1b', 'ow-elder-hint-1c'] }]
  },
  'elder-lamp': {
    face: 'elder',
    pages: [{ lines: ['ow-elder-lamp-1a', 'ow-elder-lamp-1b', 'ow-elder-lamp-1c'] }]
  },
  'sign-wilds': {
    pages: [{ lines: ['ow-sign-wilds-1a', 'ow-sign-wilds-1b'] }]
  },
  'chest-coins': {
    pages: [{ lines: ['ow-chest-coins-1a'] }]
  },
  'chest-lamp': {
    face: 'elder',
    pages: [{ lines: ['ow-chest-lamp-1a', 'ow-chest-lamp-1b'] }]
  },
  'chest-key': {
    pages: [{ lines: ['ow-chest-key-1a', 'ow-chest-key-1b'] }]
  },
  'sign-crypt': {
    pages: [{ lines: ['ow-sign-crypt-1a', 'ow-sign-crypt-1b'] }]
  },
  // Village folk. Each hint points at one Act 1 beat or one battle rule.
  fisher: { face: 'fisher-walk', pages: [{ lines: ['ow-fisher-1a', 'ow-fisher-1b'] }] },
  boy: { face: 'child-walk', pages: [{ lines: ['ow-boy-1a', 'ow-boy-1b'] }] },
  // Hosts whose homes are the menu: a hint page, then the invitation page,
  // then the screen itself.
  weaver: {
    face: 'woman-walk',
    pages: [{ lines: ['ow-weaver-1a', 'ow-weaver-1b'] }, { lines: ['ow-weaver-2a', 'ow-weaver-2b'] }],
    then: 'open:fuse'
  },
  hunter: {
    face: 'man-walk',
    pages: [{ lines: ['ow-hunter-1a', 'ow-hunter-1b'] }, { lines: ['ow-hunter-2a', 'ow-trade-go'] }],
    then: 'open:trade'
  },
  merchant: { face: 'man-walk', pages: [{ lines: ['ow-merchant-1a', 'ow-shop-go'] }], then: 'open:shop' },
  inn: {
    face: 'man-walk',
    pages: [{ lines: ['ow-inn-1a', 'ow-inn-1b'] }, { lines: ['ow-inn-2a', 'ow-party-go'] }],
    then: 'open:party'
  },
  // Lost-boy side quest: ask -> find him on the green -> come back for his
  // father's card -> done.
  'mother-ask': { face: 'woman-walk', pages: [{ lines: ['ow-mother-1a', 'ow-mother-1b'] }] },
  'mother-thanks': { face: 'woman-walk', pages: [{ lines: ['ow-mother-2a', 'ow-mother-2b'] }], then: 'reward:boy' },
  'mother-done': { face: 'woman-walk', pages: [{ lines: ['ow-mother-3a'] }] },
  // Rookhaven, the Act 2 town beyond Crow Road.
  'rook-fisher': { face: 'fisher-walk', pages: [{ lines: ['ow-rook-fisher-1a', 'ow-rook-fisher-1b'] }] },
  'rook-boy': { face: 'child-walk', pages: [{ lines: ['ow-rook-boy-1a', 'ow-rook-boy-1b'] }] },
  'rook-widow': { face: 'woman-walk', pages: [{ lines: ['ow-rook-widow-1a', 'ow-rook-widow-1b'] }] },
  'rook-warden': { face: 'man-walk', pages: [{ lines: ['ow-rook-warden-1a', 'ow-rook-warden-1b'] }] },
  'rook-merchant': { face: 'man-walk', pages: [{ lines: ['ow-rook-merchant-1a', 'ow-shop-go'] }], then: 'open:shop' },
  'rook-seer': { face: 'woman-walk', pages: [{ lines: ['ow-rook-seer-1a', 'ow-rook-seer-1b'] }] },
  'rook-inn': { face: 'man-walk', pages: [{ lines: ['ow-rook-inn-1a', 'ow-party-go'] }], then: 'open:party' }
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
      return hasOwItem('reed-lamp') ? 'elder-lamp' : 'elder-hint'
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

/** Close the talk. Cancelling a shopkeeper still opens the shop: the talk is
 * only the greeting, and the walk-up is the intent. */
export function dismissOwTalk(): string {
  const then = OW_TALKS[talkId]?.then ?? ''
  talkId = ''
  talkPage = 0
  return then
}
