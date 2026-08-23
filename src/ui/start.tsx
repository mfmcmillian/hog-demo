import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { cycleHero, pickHero } from '../game/account'
import { tap } from '../game/audio'
import { HEROES } from '../game/familiars'
import { game } from '../game/store'
import { ElderTalk } from './elderTalk'
import { heroPoster, idleMotion } from './flipbook'
import { gold, muted } from './theme'
import { Backdrop, Img, Plate } from './widgets'

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
  const poster = heroPoster(hero.id)
  // Portrait grip: physical up = landscape left, physical side = top.
  const idle = idleMotion()
  const grow = Math.round(idle.grow)
  const posterBox = {
    positionType: 'absolute' as const,
    position: {
      top: -Math.round(grow / 2) + Math.round(idle.sway),
      left: -Math.round(grow / 2) - Math.round(idle.lift)
    },
    width: 460 + grow,
    height: 460 + grow
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
      {/* The Gauntlet shrine itself: the intro's final shot is where you swear. */}
      {Backdrop({ src: 'images/halls/oath-chamber-a.png' })}
      <UiEntity
        uiTransform={{
          width: 120,
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 6
        }}
        uiBackground={{
          textureMode: 'stretch',
          texture: { src: 'images/home/land-nav.png' },
          color: Color4.White()
        }}
      >
        <Plate k="swear-your-oath" w={108} h={620} />
      </UiEntity>
      <UiEntity
        uiTransform={{
          width: 640,
          height: '100%',
          flexDirection: 'column-reverse',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: { top: 6, bottom: 6 }
        }}
      >
        <UiEntity
          uiTransform={{ width: 76, height: 76, alignItems: 'center', justifyContent: 'center' }}
          onMouseDown={tap(() => cycleHero(-1))}
        >
          <Img k="sel-arrow-left" w={72} tint={Color4.White()} margin={0} />
        </UiEntity>
        {poster ? (
          // Fixed 460 box keeps layout stable. Idle only — no attack preview.
          <UiEntity uiTransform={{ width: 460, height: 460 }}>
            <UiEntity
              uiTransform={posterBox}
              uiBackground={{
                textureMode: 'stretch',
                texture: { src: poster.src },
                uvs: poster.uvs,
                color: Color4.White()
              }}
            />
          </UiEntity>
        ) : null}
        <UiEntity
          uiTransform={{ width: 76, height: 76, alignItems: 'center', justifyContent: 'center' }}
          onMouseDown={tap(() => cycleHero(1))}
        >
          <Img k="sel-arrow-right" w={72} tint={Color4.White()} margin={0} />
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
          <Plate k="select" w={88} h={280} onTap={() => pickHero(hero.id)} />
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
    </UiEntity>
  )
}
