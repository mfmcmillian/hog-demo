import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { tap } from '../game/audio'
import { advanceIntro, storyPages } from '../game/intro'
import { game } from '../game/store'
import './labels.intro.gen'
import './labels.story.gen'
import { gold, muted } from './theme'
import { Backdrop, GameLogo, Img } from './widgets'

// ---- story slideshows ------------------------------------------------------------
// Full-bleed generated painting per page with a translucent narrator band along
// the phone-bottom (landscape right). Which story plays comes from game.storyId
// (main intro, road stories, final prelude, epilogue - see game/stories.ts).
// Tap anywhere / E advances; F skips. Page VO is driven from audio.ts by
// watching phase + storyId + introPage.

function PageDots(props: { index: number; count: number }) {
  const items = [] as number[]
  for (let i = 0; i < props.count; i++) items.push(i)
  return (
    <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', pointerFilter: 'none' }}>
      {items.map((i) => (
        <UiEntity
          key={i}
          uiTransform={{
            width: i === props.index ? 11 : 8,
            height: i === props.index ? 11 : 8,
            margin: 3,
            pointerFilter: 'none'
          }}
          uiBackground={{ color: i === props.index ? gold : muted }}
        />
      ))}
    </UiEntity>
  )
}

export function IntroScreen() {
  const pages = storyPages()
  const page = Math.min(game.introPage, pages.length - 1)
  const lines = pages[page].lines
  // "tap to continue" breathes so the next step is obvious
  const hintAlpha = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(Date.now() / 400))
  return (
    <UiEntity uiTransform={{ width: '100%', height: '100%' }} onMouseDown={tap(() => advanceIntro())}>
      {Backdrop({ src: pages[page].art, pass: true })}
      {/* narrator band: lower quarter of the phone (landscape right) */}
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { left: '73%', top: 0 },
          width: '27%',
          height: '100%',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          padding: { left: 14, right: 10, top: 12, bottom: 12 },
          pointerFilter: 'none'
        }}
        uiBackground={{ color: Color4.create(0.02, 0.01, 0.02, 0.66) }}
      >
        {lines.map((k, i) => (
          <Img key={i} k={k} w={22} margin={6} />
        ))}
        {/* footer: page dots + breathing continue hint */}
        <UiEntity
          uiTransform={{
            flexDirection: 'column-reverse',
            alignItems: 'center',
            justifyContent: 'center',
            margin: { left: 10 },
            pointerFilter: 'none'
          }}
        >
          <PageDots index={page} count={pages.length} />
          <UiEntity uiTransform={{ height: 16, pointerFilter: 'none' }} />
          <Img k="tut-continue" w={14} tint={Color4.create(gold.r, gold.g, gold.b, hintAlpha)} margin={0} />
        </UiEntity>
      </UiEntity>
      <GameLogo />
    </UiEntity>
  )
}
