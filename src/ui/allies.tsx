import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { familiarForKin, listOathkin } from '../game/allies'
import { tap } from '../game/audio'
import { focused, setCursor, windowed } from '../game/nav'
import { game } from '../game/store'
import { cream, gold, muted, navySoft, panelDim, PASS } from './theme'
import { Digits, Img, Notice } from './widgets'

/** Tall card. Gold wrap is the selector; cream border marks a recruit/fuse pick. */
function Card(props: {
  bg: Color4
  selected?: boolean
  focused?: boolean
  onTap?: () => void
  children?: ReactEcs.JSX.Component[] | ReactEcs.JSX.Component
  width?: number
  key?: string | number
}) {
  const w = props.width ?? 84
  return (
    <UiEntity
      uiTransform={{
        width: w + (props.focused ? 10 : 0),
        height: props.focused ? '86%' : '82%',
        margin: { left: 4, right: 4 },
        alignItems: 'center',
        justifyContent: 'center',
        padding: props.focused ? 5 : 0
      }}
      uiBackground={{ color: props.focused ? gold : Color4.create(0, 0, 0, 0) }}
    >
      <UiEntity
        uiTransform={{
          width: w,
          height: '100%',
          flexDirection: 'column-reverse',
          alignItems: 'center',
          justifyContent: 'flex-start',
          padding: 8,
          borderWidth: 3,
          borderColor: props.selected && !props.focused ? cream : Color4.create(0, 0, 0, 0)
        }}
        uiBackground={{ color: props.bg }}
        onMouseDown={tap(props.onTap)}
      >
        {props.children}
      </UiEntity>
    </UiEntity>
  )
}

function ScreenTitle(props: { k: string; key?: string | number }) {
  return (
    <UiEntity uiTransform={{ flexDirection: 'column', alignItems: 'center', margin: { left: 6, right: 10 }, ...PASS }}>
      <Img k={props.k} w={44} tint={gold} />
    </UiEntity>
  )
}

/** Row of cards. Sized to its children — does not stretch over the HUD. */
function CardList(props: { children?: ReactEcs.JSX.Component[] | ReactEcs.JSX.Component }) {
  return (
    <UiEntity
      uiTransform={{
        height: '100%',
        maxWidth: 380,
        flexDirection: 'row',
        alignItems: 'center',
        ...PASS
      }}
    >
      {props.children}
    </UiEntity>
  )
}

function ScreenRow(props: { children?: ReactEcs.JSX.Component[] | ReactEcs.JSX.Component }) {
  return (
    <UiEntity
      uiTransform={{
        width: 'auto',
        height: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        ...PASS
      }}
    >
      {props.children}
    </UiEntity>
  )
}

export function AlliesScreen() {
  const kin = listOathkin()
  return (
    <ScreenRow>
      <ScreenTitle k="heroes-of-genesis" />
      {kin.length === 0 ? (
        <UiEntity uiTransform={{ flexDirection: 'column', alignItems: 'center' }}>
          <Img k="empty-hall" w={24} tint={muted} />
        </UiEntity>
      ) : (
        <CardList>
          {windowed(kin.map((person, i) => ({ person, i }))).map(({ person, i }) => {
            const lend = familiarForKin(person.userId)
            const selected = game.selectedAlly === person.userId
            return (
              <Card
                key={person.userId}
                bg={selected ? navySoft : panelDim}
                selected={selected}
                focused={focused(i)}
                onTap={() => {
                  setCursor(i)
                  game.selectedAlly = selected ? '' : person.userId
                }}
              >
                <Img k="traveler" w={24} />
                <Digits value={i + 1} w={18} tint={muted} />
                <Img k="lends" w={14} tint={muted} margin={6} />
                <Img k={lend.defId} w={20} tint={gold} />
              </Card>
            )
          })}
        </CardList>
      )}
      <Notice />
    </ScreenRow>
  )
}
