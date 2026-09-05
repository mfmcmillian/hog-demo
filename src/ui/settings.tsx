import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { resetAccount } from '../game/account'
import { playClick } from '../game/audio'
import { lockNav } from '../game/nav'
import { game } from '../game/store'
import { pushAccountReset } from '../mp/session'
import { press, pressShrink, pressTint } from './fx/press'
import { LABELS } from './labels.gen'
import { AcceptDecline } from './panels'
import { danger } from './theme'
import { Img, MenuTitle, MpBackdrop } from './widgets'

// ---- settings ------------------------------------------------------------------

/** Two-step guard on the account wipe. Reset when the screen opens. */
let armRestart = false

/** One kit setting row (SOUND / MUSIC) with its gold ON / dark OFF toggle. */
function SettingRow(props: { row: string; on: boolean; onFlip: () => void }) {
  const plate = LABELS[props.row]
  const toggle = LABELS[props.on ? 'set-toggle-on' : 'set-toggle-off']
  if (!plate) return null
  const w = 118 // landscape width = physical row height
  const h = Math.round((w * plate.h) / plate.w)
  const tw = 42
  const th = toggle ? Math.round((tw * toggle.h) / toggle.w) : 0
  const id = `set:${props.row}`
  const iw = w - pressShrink(id, w)
  const ih = h - pressShrink(id, h)
  return (
    <UiEntity
      uiTransform={{ width: w, height: h, margin: 5, alignItems: 'center', justifyContent: 'center' }}
      onMouseDown={press(id, () => {
        playClick()
        props.onFlip()
        lockNav(200)
      })}
    >
      <UiEntity
        uiTransform={{ width: iw, height: ih, pointerFilter: 'none' }}
        uiBackground={{ textureMode: 'stretch', texture: { src: plate.src }, uvs: plate.uvs, color: pressTint(id) }}
      >
        {toggle ? (
          <UiEntity
            uiTransform={{
              positionType: 'absolute',
              // physical right-center of the row = landscape top-center
              position: { top: 14, left: Math.round((iw - tw) / 2) },
              width: tw,
              height: th,
              pointerFilter: 'none'
            }}
            uiBackground={{
              textureMode: 'stretch',
              texture: { src: toggle.src },
              uvs: toggle.uvs,
              color: pressTint(id)
            }}
          />
        ) : null}
      </UiEntity>
    </UiEntity>
  )
}

export function disarmRestart() {
  armRestart = false
}

export function SettingsScreen() {
  const restart = LABELS['set-row-restart']
  const rw = 128
  const rh = restart ? Math.round((rw * restart.h) / restart.w) : 0
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
      <MpBackdrop k="map-settings" />
      <SettingRow
        row="set-row-sound"
        on={game.soundOn}
        onFlip={() => {
          game.soundOn = !game.soundOn
        }}
      />
      <SettingRow
        row="set-row-music"
        on={game.musicOn}
        onFlip={() => {
          game.musicOn = !game.musicOn
        }}
      />
      {restart ? (
        <UiEntity
          uiTransform={{
            width: rw,
            height: rh,
            margin: 5,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          uiBackground={{
            textureMode: 'stretch',
            texture: { src: restart.src },
            uvs: restart.uvs,
            color: pressTint('set:restart', armRestart ? Color4.create(0.45, 0.4, 0.4, 1) : Color4.White())
          }}
          onMouseDown={press('set:restart', () => {
            if (!armRestart) {
              armRestart = true
              lockNav()
            }
          })}
        >
          {armRestart ? (
            <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
              <Img k="are-you-sure" w={24} tint={danger} margin={3} />
              <AcceptDecline
                w={38}
                margin={6}
                onAccept={() => {
                  armRestart = false
                  resetAccount()
                  pushAccountReset()
                  lockNav()
                }}
                onDecline={() => {
                  armRestart = false
                  lockNav()
                }}
              />
            </UiEntity>
          ) : null}
        </UiEntity>
      ) : null}
      <MenuTitle k="set-banner" />
    </UiEntity>
  )
}
