import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { cycleHero, pickHero } from '../game/account'
import { tap } from '../game/audio'
import { HEROES } from '../game/familiars'
import { game } from '../game/store'
import { heroPoster, idleMotion } from './flipbook'
import { hallArt } from './halls'
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

export function StartScreen() {
  const hero = HEROES[game.heroIndex] ?? HEROES[0]
  const hall = hallArt(hero.id)
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
      {Backdrop({ src: hall.src })}
      <UiEntity
        uiTransform={{
          width: 120,
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 6
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
  )
}
