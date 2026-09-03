import { startFinalBattle } from './campaign'
import { goVillage } from './overworld'
import { resumePendingRun } from './roads'
import { STORIES } from './stories'
import { game } from './store'

// Story slideshow player: full-bleed art + narrator lines + VO per page,
// shown in the 'intro' phase. game.storyId picks which story is playing -
// the main intro (once per account, between boot and the oath chamber), a
// road's story (before its first fight), the final-battle prelude, or the
// victory epilogue. audio.ts watches phase/storyId/introPage each tick and
// starts/stops the matching VO clip.

export function storyPages() {
  return STORIES[game.storyId]
}

/** Tap / E: next page; the last page ends the story. */
export function advanceIntro(): void {
  if (game.phase !== 'intro') return
  if (game.introPage >= storyPages().length - 1) {
    finishStory()
    return
  }
  game.introPage++
}

/** F: skip the whole story (it still counts as seen). */
export function skipIntro(): void {
  if (game.phase !== 'intro') return
  finishStory()
}

function finishStory(): void {
  const id = game.storyId
  game.introPage = 0
  game.storyId = 'main'
  if (id === 'main') {
    game.introSeen = true
    game.phase = 'start'
    // The elder greets the new hero on the oath chamber (one tap dismisses).
    game.welcomeTalk = true
    return
  }
  game.storySeen[id] = true
  if (id === 'final') {
    startFinalBattle()
    return
  }
  if (id === 'epilogue') {
    // Every Gates win: ending story, then credits, then home.
    game.phase = 'credits'
    game.creditsAt = Date.now()
    return
  }
  // Road stories: the fight that was interrupted launches now.
  resumePendingRun()
}

/** Credits finished crawling (or were tapped/F-skipped): back to the village.
 *  A short grace beat ignores the tap/E/F that just closed the epilogue, so
 *  the roll can't vanish on the same press. */
export function endCredits(): void {
  if (game.phase !== 'credits') return
  if (game.creditsAt && Date.now() - game.creditsAt < 800) return
  game.creditsAt = 0
  goVillage()
}
