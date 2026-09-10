import { Color4 } from '@dcl/sdk/math'
import ReactEcs from '@dcl/sdk/react-ecs'
import { UiEntity } from './ui'
import { playLevelUp, tap } from '../game/audio'
import { energyCapFor, LEVEL_CAP, levelProgress, PACK_LEVELS } from '../game/level'
import { openHeroCard } from '../game/menu'
import { game } from '../game/store'
import { Phase } from '../game/types'
import { LABELS } from './labels.gen'
import './labels.level.gen'
import { ModalScrim, TalkPanel } from './panels'
import { cream, gold, muted, xpBlue } from './theme'
import { Digits, Face, FillBar, Gain, Halo, Img, NameTag, Stars } from './widgets'

// Account level UI: the level-up ceremony (queued by game/level.ts, played the
// moment the player is somewhere it can interrupt) and the level card behind
// the HUD badge. Layout is canvas column-reverse = phone rows, like the rest.

/** Screens where a ceremony may take over; fights, reveals and the intro finish first. */
const CEREMONY_PHASES: Phase[] = [
  'home',
  'festival',
  'party',
  'fuse',
  'shop',
  'quest',
  'levels',
  'overworld',
  'rift',
  'boss',
  'trade',
  'allies'
]

let sounded = 0

export function LevelUpCeremony() {
  const up = game.levelUp
  if (!up || CEREMONY_PHASES.indexOf(game.phase) < 0) return null
  if (sounded !== up.level) {
    sounded = up.level
    playLevelUp()
  }
  const capGrew = energyCapFor(up.level) > energyCapFor(up.from)
  const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 500)
  const dismiss = tap(() => {
    const card = up.card
    game.levelUp = undefined
    // The milestone hero gets its own reveal, straight from the ceremony.
    if (card) openHeroCard(card.uid, game.phase)
  })
  return (
    <ModalScrim alpha={0.9} flexDirection="row" onMouseDown={dismiss}>
      {/* the glow + title: a big pulsing LEVEL UP over a halo */}
      <UiEntity uiTransform={{ width: 120, height: 340, alignItems: 'center', justifyContent: 'center', margin: 4 }}>
        <Halo w={120} h={340} scale={1.1} />
        <Img k="level-up" w={Math.round(56 + 4 * pulse)} tint={gold} margin={0} />
      </UiEntity>
      {/* the number */}
      <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: 6 }}>
        <Img k="acct-level" w={26} tint={cream} margin={4} />
        <Digits value={up.level} w={44} tint={gold} tight />
        <FillBar frac={1} w={12} h={120} fill={xpBlue} />
      </UiEntity>
      {/* rewards: coins, refill (and the cap when it grew), the milestone hero */}
      <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: 6 }}>
        <Img k="icon-coins" w={30} tint={Color4.White()} margin={3} />
        <Gain value={up.coins} w={26} tint={gold} />
        <UiEntity uiTransform={{ width: 14 }} />
        <Img k="icon-bolt" w={26} tint={Color4.White()} margin={3} />
        {capGrew ? (
          <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center' }}>
            <Img k="max-energy" w={18} tint={cream} margin={3} />
            <Digits value={up.energyMax} w={22} tint={gold} tight />
          </UiEntity>
        ) : (
          <Img k="energy-refilled" w={18} tint={cream} margin={3} />
        )}
      </UiEntity>
      {up.card ? (
        <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: 6 }}>
          <Img k="new-hero-joins" w={18} tint={gold} margin={4} />
          <Face id={up.card.defId} w={96} h={96} />
          <Stars count={up.card.stars} w={14} />
        </UiEntity>
      ) : null}
      <Img k="tut-continue" w={14} tint={Color4.create(gold.r, gold.g, gold.b, 0.55 + 0.45 * pulse)} margin={6} />
    </ModalScrim>
  )
}

/** Next level that hands out a free hero, or 0 past the last one. */
function nextPackLevel(level: number): number {
  for (const at of PACK_LEVELS) if (at > level) return at
  return 0
}

/** The level card behind the HUD badge: where you are, what is left to the
 * next level, what levels pay, and when the next free hero lands. */
export function LevelCard() {
  if (!game.levelCard) return null
  const p = levelProgress(game.axp)
  const capped = p.level >= LEVEL_CAP
  const packAt = nextPackLevel(p.level)
  const close = tap(() => {
    game.levelCard = false
  })
  if (!LABELS['acct-level']) return null
  return (
    <ModalScrim alpha={0.8} onMouseDown={close}>
      <UiEntity
        uiTransform={{ positionType: 'absolute', position: { left: '58%', top: '6%' }, width: 360, height: '88%' }}
      >
        <TalkPanel width="100%" height="100%" onMouseDown={close}>
          <UiEntity
            uiTransform={{
              width: '100%',
              height: '100%',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
              pointerFilter: 'none'
            }}
          >
            {/* row 1: LEVEL n */}
            <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: 6 }}>
              <Img k="acct-level" w={26} tint={cream} margin={4} />
              <Digits value={p.level} w={34} tint={gold} tight />
            </UiEntity>
            {/* row 2: the bar with into / need */}
            <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: 6 }}>
              <FillBar frac={capped ? 1 : p.into / p.need} w={14} h={200} fill={xpBlue} />
              {capped ? (
                <Img k="max-level" w={18} tint={gold} margin={6} />
              ) : (
                <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: { top: 6 } }}>
                  <Digits value={p.into} w={16} tint={gold} tight />
                  <NameTag name="/" w={12} tint={muted} />
                  <Digits value={p.need} w={16} tint={cream} tight />
                  <UiEntity uiTransform={{ width: 8 }} />
                  <Img k="xp-to-next" w={16} tint={muted} margin={0} />
                </UiEntity>
              )}
            </UiEntity>
            {/* row 3: what levels pay */}
            <Img k="level-rewards" w={18} tint={cream} margin={6} />
            {packAt ? (
              <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: 6 }}>
                <Img k="free-hero-at" w={18} tint={cream} margin={4} />
                <Digits value={packAt} w={20} tint={gold} tight />
              </UiEntity>
            ) : null}
            {/* row 4: how to earn */}
            <Img k="level-hint" w={18} tint={muted} margin={6} />
            <Img k="tut-continue" w={14} tint={Color4.create(gold.r, gold.g, gold.b, 0.7)} margin={6} />
          </UiEntity>
        </TalkPanel>
      </UiEntity>
    </ModalScrim>
  )
}
