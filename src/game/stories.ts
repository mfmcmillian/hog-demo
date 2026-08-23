import { StoryId } from './types'

// Every cinematic slideshow in the game: full-bleed painting + narrator line
// strips + one VO clip per page. The 'main' intro plays between boot and the
// oath chamber; road stories play before a road's first fight; 'final' plays
// before the Gates of Antrom battle and 'epilogue' after every Gates win.
// Art lives in images/intro (main) and images/story (the rest); label strips
// come from tools/gen-intro-labels.ps1 and tools/gen-story-labels.ps1; VO from
// tools/gen-intro-vo.mjs and tools/gen-story-vo.mjs.

export type StoryPage = {
  /** Full-bleed painting, pre-rotated to the hall convention. */
  art: string
  /** Narrator label keys, phone top-to-bottom. */
  lines: string[]
  /** ElevenLabs narration clip for the page. */
  vo: string
}

function roadPages(id: string): StoryPage[] {
  return [1, 2].map((n) => ({
    art: `images/story/story-${id}-${n}.jpg`,
    lines: ['a', 'b', 'c'].map((s) => `story-${id}-${n}${s}`),
    vo: `sounds/vo/story-${id}-${n}.mp3`
  }))
}

export const STORIES: Record<StoryId, StoryPage[]> = {
  main: [
    { art: 'images/intro/intro-1.jpg', lines: ['intro-1a', 'intro-1b'], vo: 'sounds/vo/intro-1.mp3' },
    { art: 'images/intro/intro-2.jpg', lines: ['intro-2a', 'intro-2b', 'intro-2c'], vo: 'sounds/vo/intro-2.mp3' },
    { art: 'images/intro/intro-3.jpg', lines: ['intro-3a', 'intro-3b', 'intro-3c'], vo: 'sounds/vo/intro-3.mp3' },
    { art: 'images/intro/intro-4.jpg', lines: ['intro-4a', 'intro-4b', 'intro-4c', 'intro-4d'], vo: 'sounds/vo/intro-4.mp3' },
    { art: 'images/intro/intro-5.jpg', lines: ['intro-5a', 'intro-5b', 'intro-5c', 'intro-5d'], vo: 'sounds/vo/intro-5.mp3' },
    { art: 'images/intro/intro-6.jpg', lines: ['intro-6a', 'intro-6b', 'intro-6c', 'intro-6d'], vo: 'sounds/vo/intro-6.mp3' }
  ],
  q1: roadPages('q1'),
  q3: roadPages('q3'),
  q4: roadPages('q4'),
  q6: roadPages('q6'),
  final: roadPages('final'),
  epilogue: roadPages('epilogue')
}
