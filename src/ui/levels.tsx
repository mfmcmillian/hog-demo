import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { tap } from '../game/audio'
import { cycleTier, frontierFloor, pickedStarOf, roadStarOf } from '../game/progress'
import { dropStarsFor, FLOORS, ROADS } from '../game/quests'
import { startFloor } from '../game/roads'
import { game } from '../game/store'
import { LABELS } from './labels.gen'
import { cream, gold, muted, panelDim } from './theme'
import { Backdrop, CardBtn, Digits, Face, Img, Notice, Stars } from './widgets'

/** One numbered floor tile on the level map. */
function LevelTile(props: { floor: number; key?: number }) {
  const road = ROADS[game.roadPick]
  const frontier = frontierFloor(game.roadPick)
  // Farming a lower tier opens every floor; only the current climb has a lit frontier.
  const farming = road ? pickedStarOf(road.id) < roadStarOf(road.id) : false
  const locked = props.floor > frontier
  const lit = !farming && props.floor === frontier
  const frame = LABELS[lit ? 'level-tile-lit' : 'level-tile']
  const size = lit ? 158 : 142
  const tint = locked ? Color4.create(0.42, 0.38, 0.48, 1) : Color4.White()
  return (
    <UiEntity
      uiTransform={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', margin: 6 }}
      uiBackground={
        frame
          ? { textureMode: 'stretch', texture: { src: frame.src }, uvs: frame.uvs, color: tint }
          : { color: panelDim }
      }
      onMouseDown={tap(() => {
        if (locked) game.notice = 'clear-road'
        else startFloor(game.roadPick, props.floor)
      })}
    >
      {locked ? (
        <Img k="road-lock" w={52} tint={muted} />
      ) : (
        <Digits value={props.floor} w={lit ? 54 : 46} tint={lit ? gold : cream} tight />
      )}
    </UiEntity>
  )
}

/** Floor grid for one road: 1-9 in three ranks, the boss crest below. */
export function LevelsScreen() {
  const road = ROADS[game.roadPick]
  const banner = LABELS['level-banner']
  const bossFrame = LABELS['level-boss-tile']
  if (!road) return null
  const frontier = frontierFloor(game.roadPick)
  const star = roadStarOf(road.id)
  const picked = pickedStarOf(road.id)
  const farming = picked < star
  const bossLocked = !farming && frontier < FLOORS
  const bossLit = !farming && frontier >= FLOORS
  const bossTint = bossLocked ? Color4.create(0.42, 0.38, 0.48, 1) : Color4.White()
  const ranks = [
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9]
  ]
  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      {Backdrop({ label: 'map-cave', dim: 0.52, pass: true })}
      {banner ? (
        <UiEntity
          uiTransform={{
            width: 120,
            height: Math.round((120 * banner.h) / banner.w),
            alignItems: 'center',
            justifyContent: 'center',
            margin: 8
          }}
          uiBackground={{
            textureMode: 'stretch',
            texture: { src: banner.src },
            uvs: banner.uvs,
            color: Color4.White()
          }}
        >
          <Img k={`road-name-${road.id}`} w={42} tint={Color4.White()} />
        </UiEntity>
      ) : null}
      {/* tier picker + boss drop preview, physically under the banner */}
      <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: 4 }}>
        {star > 1 ? <CardBtn k="party-arrow-l" w={46} hit={84} onTap={() => cycleTier(road.id, -1)} /> : null}
        <Stars count={picked} w={20} />
        {star > 1 ? <CardBtn k="party-arrow-r" w={46} hit={84} onTap={() => cycleTier(road.id, 1)} /> : null}
        <UiEntity uiTransform={{ height: 22 }} />
        <Img k="spoils" w={16} tint={muted} />
        <Stars count={dropStarsFor(picked)} w={13} />
      </UiEntity>
      {ranks.map((rank, r) => (
        <UiEntity
          key={r}
          uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', justifyContent: 'center' }}
        >
          {rank.map((floor) => (
            <LevelTile key={floor} floor={floor} />
          ))}
        </UiEntity>
      ))}
      {bossFrame ? (
        <UiEntity
          uiTransform={{
            width: bossLit ? 208 : 188,
            height: bossLit ? 208 : 188,
            alignItems: 'center',
            justifyContent: 'center',
            margin: 6
          }}
          uiBackground={{
            textureMode: 'stretch',
            texture: { src: bossFrame.src },
            uvs: bossFrame.uvs,
            color: bossTint
          }}
          onMouseDown={tap(() => {
            if (bossLocked) game.notice = 'clear-road'
            else startFloor(game.roadPick, FLOORS)
          })}
        >
          <Face
            id={road.boss}
            w={bossLit ? 150 : 134}
            h={bossLit ? 150 : 134}
            tint={bossLocked ? Color4.create(0.07, 0.05, 0.1, 1) : Color4.White()}
          />
          {bossLocked ? (
            <UiEntity
              uiTransform={{ positionType: 'absolute', position: { top: '38%', left: '38%' }, pointerFilter: 'none' }}
            >
              <Img k="road-lock" w={56} tint={Color4.White()} />
            </UiEntity>
          ) : null}
        </UiEntity>
      ) : null}
      <UiEntity uiTransform={{ positionType: 'absolute', position: { right: 60, top: '42%' }, pointerFilter: 'none' }}>
        <Notice />
      </UiEntity>
    </UiEntity>
  )
}
