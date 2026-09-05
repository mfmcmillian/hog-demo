import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { tap } from '../game/audio'
import { owTalkNext } from '../game/nav'
import { owTalkView } from '../game/owTalk'
import { ElderTalk } from './elderTalk'
import { cellUvs } from './fx/sheets'
import { LABELS } from './labels.gen'
import './labels.ow.gen'
import { ModalScrim, TalkPanel } from './panels'
import { cream, gold, muted } from './theme'
import { Img, SlashCount } from './widgets'

/** Walk-up overworld talk: ElderTalk when the speaker has a face, a
 * portrait-less band for signs and coin finds. Tap anywhere to advance. */
export function OwTalkOverlay() {
  const view = owTalkView()
  if (!view) return null
  const next = tap(() => {
    owTalkNext()
  })
  const lines = view.lines.map((k) => ({ k }))
  if (view.face) {
    // Villagers speak through their map sprite's standing cell; the elder
    // keeps his painted talking portrait.
    const sheet = view.face === 'elder' ? undefined : LABELS[view.face]
    const portrait = sheet ? { src: sheet.src, uvs: cellUvs(0) } : undefined
    return <ElderTalk lines={lines} onTap={next} page={{ at: view.at, of: view.of }} portrait={portrait} />
  }
  const hintAlpha = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(Date.now() / 400))
  return (
    <ModalScrim alpha={0.72} onMouseDown={next}>
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { left: '64%', top: 0 },
          width: 300,
          height: '100%'
        }}
      >
        <TalkPanel width="100%" height="100%" onMouseDown={next}>
          <UiEntity
            uiTransform={{
              flexGrow: 1,
              width: '100%',
              flexDirection: 'row',
              alignItems: 'flex-end',
              justifyContent: 'center',
              padding: { bottom: 20, left: 10, right: 10 },
              pointerFilter: 'none'
            }}
          >
            {lines.map((line, i) => (
              <Img key={i} k={line.k} w={21} tint={cream} margin={5} />
            ))}
            <UiEntity
              uiTransform={{
                flexDirection: 'column-reverse',
                alignItems: 'center',
                justifyContent: 'center',
                margin: { left: 8 },
                pointerFilter: 'none'
              }}
            >
              {view.of > 1 ? (
                <SlashCount at={view.at} of={view.of} w={16} slashW={13} atTint={gold} ofTint={muted} />
              ) : null}
              <Img k="tut-continue" w={14} tint={Color4.create(gold.r, gold.g, gold.b, hintAlpha)} margin={0} />
            </UiEntity>
          </UiEntity>
        </TalkPanel>
      </UiEntity>
    </ModalScrim>
  )
}
