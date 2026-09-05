import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { cycleHero, pickHero } from '../game/account'
import { tap } from '../game/audio'
import { HEROES } from '../game/familiars'
import { game } from '../game/store'
import { ElderTalk } from './elderTalk'
import { idleMotion } from './flipbook'
import { press, pressShrink, pressTint } from './fx/press'
import { LABELS } from './labels.gen'
import { gold, muted } from './theme'
import { Backdrop, charArt, Img, MenuTitle, Plate } from './widgets'

// ---- start (oath chamber) ----------------------------------------------------

function SelectDots(props: { index: number; count: number }) {
  const items = [] as number[]
  for (let i = 0; i < props.count; i++) items.push(i)
  return (
    <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: 6 }}>
      {items.map((i) => (
        <UiEntity
          key={i}
          uiTransform={{
            width: i === props.index ? 14 : 10,
            height: i === props.index ? 14 : 10,
            margin: 3
          }}
          uiBackground={{ color: i === props.index ? gold : muted }}
        />
      ))}
    </UiEntity>
  )
}

/** The molten SELECT plaque, same ornate button family as ENTER RIFT. */
function OathSelectBtn(props: { onTap: () => void }) {
  const art = LABELS['oath-select']
  if (!art) return <Plate k="select" w={88} h={280} onTap={props.onTap} />
  const w = 112
  const id = 'oath:select'
  const iw = w - pressShrink(id, w)
  return (
    <UiEntity
      uiTransform={{
        width: w,
        height: Math.round((w * art.h) / art.w),
        alignItems: 'center',
        justifyContent: 'center'
      }}
      onMouseDown={press(id, tap(props.onTap))}
    >
      <UiEntity
        uiTransform={{ width: iw, height: Math.round((iw * art.h) / art.w), pointerFilter: 'none' }}
        uiBackground={{ textureMode: 'stretch', texture: { src: art.src }, uvs: art.uvs, color: pressTint(id) }}
      />
    </UiEntity>
  )
}

/** One-tap elder greeting right after the intro story lands on the oath chamber. */
function WelcomeTalk() {
  return (
    <ElderTalk
      lines={[{ k: 'intro-w1' }, { k: 'intro-w2' }, { k: 'intro-w3', tint: gold }]}
      onTap={tap(() => {
        game.welcomeTalk = false
      })}
    />
  )
}

export function StartScreen() {
  const hero = HEROES[game.heroIndex] ?? HEROES[0]
  // The standalone 1024px portrait, not the 512px sheet cell: at 500 stage
  // units the sheet cell blurs (same fix as the hero card's big face).
  const art = charArt(hero.id)
  // Portrait grip: physical up = landscape left, physical side = top.
  const idle = idleMotion()
  const grow = Math.round(idle.grow)
  const posterBox = {
    positionType: 'absolute' as const,
    position: {
      top: -Math.round(grow / 2) + Math.round(idle.sway),
      left: -Math.round(grow / 2) - Math.round(idle.lift)
    },
    width: 500 + grow,
    height: 500 + grow
  }
  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%',
        flexDirection: 'row',
        alignItems: 'stretch'
      }}
    >
      {/* The Gauntlet shrine itself: the intro's final shot is where you swear.
          A light veil keeps the gold kit readable against the flame. */}
      {Backdrop({ src: 'images/halls/oath-chamber-a.png', dim: 0.24 })}
      <UiEntity
        uiTransform={{
          flexGrow: 1,
          height: '100%',
          flexDirection: 'column-reverse',
          justifyContent: 'space-between',
          alignItems: 'center',
          // Cross axis is the physical vertical: eating 80 units on the
          // landscape-left edge drops the centered group ~40 physically down.
          padding: { top: 6, bottom: 6, left: 80 }
        }}
      >
        <UiEntity
          uiTransform={{ width: 96, height: 96, margin: -10, alignItems: 'center', justifyContent: 'center' }}
          onMouseDown={press(
            'oath:left',
            tap(() => cycleHero(-1))
          )}
        >
          <Img k="sel-arrow-left" w={72 - pressShrink('oath:left', 72)} tint={pressTint('oath:left')} margin={0} />
        </UiEntity>
        {art ? (
          // Fixed 500 box keeps layout stable. Idle only — no attack preview.
          <UiEntity uiTransform={{ width: 500, height: 500 }}>
            <UiEntity
              uiTransform={posterBox}
              uiBackground={{
                textureMode: 'stretch',
                texture: { src: art.src },
                uvs: art.uvs,
                color: Color4.White()
              }}
            />
          </UiEntity>
        ) : null}
        <UiEntity
          uiTransform={{ width: 96, height: 96, margin: -10, alignItems: 'center', justifyContent: 'center' }}
          onMouseDown={press(
            'oath:right',
            tap(() => cycleHero(1))
          )}
        >
          <Img k="sel-arrow-right" w={72 - pressShrink('oath:right', 72)} tint={pressTint('oath:right')} margin={0} />
        </UiEntity>
      </UiEntity>
      {/* leather rail (physical bottom) carrying the name, select, and dots */}
      <UiEntity
        uiTransform={{
          width: 320,
          height: '100%',
          flexDirection: 'row',
          alignItems: 'stretch'
        }}
        uiBackground={{
          textureMode: 'stretch',
          texture: { src: 'images/home/land-nav.png' },
          color: Color4.White()
        }}
      >
        <UiEntity
          uiTransform={{
            width: 90,
            height: '100%',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Plate k={`name-${hero.id}`} w={78} h={300} />
        </UiEntity>
        <UiEntity
          uiTransform={{
            width: 180,
            height: '100%',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <OathSelectBtn onTap={() => pickHero(hero.id)} />
        </UiEntity>
        <UiEntity
          uiTransform={{
            width: 50,
            height: '100%',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <SelectDots index={game.heroIndex} count={HEROES.length} />
        </UiEntity>
      </UiEntity>
      {game.welcomeTalk ? <WelcomeTalk /> : null}
      <MenuTitle k="oath-banner" />
    </UiEntity>
  )
}
