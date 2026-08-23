import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { resumeFloor, roadStarOf } from '../game/progress'
import { FLOORS, ROADS } from '../game/quests'
import { openLevels } from '../game/roads'
import { game } from '../game/store'
import { MAX_STARS } from '../game/types'
import { LABELS } from './labels.gen'
import { cream, gold } from './theme'
import { Backdrop, Face, GameLogo, Img, Notice, SlashCount, Stars } from './widgets'

/** How far a road has come, shown on the right end of its row. */
function RoadProgress(props: { at: number; tint: Color4 }) {
  return <SlashCount at={props.at} of={FLOORS} w={26} slashW={22} atTint={props.tint} ofTint={props.tint} />
}

/** One leather road plate: boss portrait ring, baked name, progress or lock. */
function RoadRow(props: { index: number; key?: string }) {
  const road = ROADS[props.index]
  const row = LABELS['road-row']
  if (!road || !row) return null
  const locked = props.index > game.cleared
  const star = roadStarOf(road.id)
  const mastered = star >= MAX_STARS
  const at = Math.max(0, resumeFloor(road.id) - 1)
  const tint = locked ? Color4.create(0.42, 0.38, 0.48, 1) : Color4.White()
  const rowW = 196 // physical row height
  const rowH = Math.round((rowW * row.h) / row.w)
  return (
    <UiEntity
      uiTransform={{
        width: rowW,
        height: rowH,
        margin: 5,
        flexDirection: 'column-reverse',
        alignItems: 'center',
        justifyContent: 'flex-start',
        padding: { top: 16, bottom: 16, left: 12, right: 12 }
      }}
      uiBackground={{ textureMode: 'stretch', texture: { src: row.src }, color: tint }}
      onMouseDown={() => {
        if (locked) game.notice = 'clear-road'
        else openLevels(props.index)
      }}
    >
      <UiEntity
        uiTransform={{ width: 150, height: 150, alignItems: 'center', justifyContent: 'center', margin: 4 }}
        uiBackground={{ textureMode: 'stretch', texture: { src: LABELS['road-ring']!.src }, color: tint }}
      >
        <Face id={road.boss} w={110} h={110} tint={locked ? Color4.create(0.07, 0.05, 0.1, 1) : Color4.White()} />
      </UiEntity>
      {/* name plate with the tier stars physically beneath it */}
      <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', margin: 8 }}>
        <Img k={`road-name-${road.id}`} w={44} tint={tint} margin={0} />
        {locked ? null : <Stars count={star} w={14} />}
      </UiEntity>
      <UiEntity uiTransform={{ flexGrow: 1 }} />
      {locked ? (
        <Img k="road-lock" w={70} tint={Color4.White()} margin={8} />
      ) : mastered ? (
        <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center' }}>
          <Img k="road-laurel" w={68} tint={Color4.White()} margin={4} />
          <RoadProgress at={at} tint={gold} />
        </UiEntity>
      ) : (
        <RoadProgress at={at} tint={gold} />
      )}
    </UiEntity>
  )
}

export function QuestScreen() {
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
      <Img k="road-banner" w={132} tint={Color4.White()} margin={10} />
      {ROADS.map((road, i) => (
        <RoadRow key={road.id} index={i} />
      ))}
      <UiEntity uiTransform={{ positionType: 'absolute', position: { right: 60, top: '42%' }, pointerFilter: 'none' }}>
        <Notice />
      </UiEntity>
      <GameLogo />
    </UiEntity>
  )
}
