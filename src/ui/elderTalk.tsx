import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { villagerSheet, villagerTalkUvs } from './flipbook'
import { ModalScrim, TalkPanel } from './panels'
import { cream, gold, muted } from './theme'
import { Img, SlashCount } from './widgets'

// Shared one-page elder dialog: dimming scrim + leather band in the lower third
// of the phone + talking portrait + line strips + breathing continue hint.
// Used by the oath-chamber welcome and the first-fight explainer; the tutorial
// overlay keeps its own copy because it adds paging and a page counter.

/** One dialog line: a LABELS key plus an optional tint (default cream). */
export type ElderLine = { k: string; tint?: Color4 }

export function ElderTalk(props: {
  lines: ElderLine[]
  onTap?: () => void
  page?: { at: number; of: number }
  /** Extra content shown over the scrim above the band (e.g. a card back). */
  children?: ReactEcs.JSX.Component[] | ReactEcs.JSX.Component
}) {
  const hintAlpha = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(Date.now() / 400))
  return (
    <ModalScrim alpha={0.72} onMouseDown={props.onTap}>
      {props.children}
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { left: '64%', top: 0 },
          width: 300,
          height: '100%'
        }}
      >
        <TalkPanel width="100%" height="100%" onMouseDown={props.onTap}>
          {/* framed elder portrait, phone-left (same chrome as FireTalk) */}
          <UiEntity
            uiTransform={{
              width: 156,
              height: 156,
              margin: { bottom: 14 },
              alignItems: 'center',
              justifyContent: 'center',
              pointerFilter: 'none'
            }}
            uiBackground={{ color: Color4.create(0.62, 0.46, 0.2, 1) }}
          >
            <UiEntity
              uiTransform={{
                width: 148,
                height: 148,
                alignItems: 'center',
                justifyContent: 'center',
                pointerFilter: 'none'
              }}
              uiBackground={{ color: Color4.create(0.09, 0.07, 0.06, 1) }}
            >
              <UiEntity
                uiTransform={{ width: 140, height: 140, pointerFilter: 'none' }}
                uiBackground={{
                  textureMode: 'stretch',
                  texture: { src: villagerSheet() },
                  uvs: villagerTalkUvs(),
                  color: Color4.White()
                }}
              />
            </UiEntity>
          </UiEntity>
          {/* the lines, phone-right of the portrait */}
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
            {props.lines.map((line, i) => (
              <Img key={i} k={line.k} w={21} tint={line.tint ?? cream} margin={5} />
            ))}
            {/* footer: optional page count + breathing continue hint */}
            <UiEntity
              uiTransform={{
                flexDirection: 'column-reverse',
                alignItems: 'center',
                justifyContent: 'center',
                margin: { left: 8 },
                pointerFilter: 'none'
              }}
            >
              {props.page ? (
                <SlashCount at={props.page.at} of={props.page.of} w={16} slashW={13} atTint={gold} ofTint={muted} />
              ) : null}
              {props.page ? <UiEntity uiTransform={{ height: 14, pointerFilter: 'none' }} /> : null}
              <Img k="tut-continue" w={14} tint={Color4.create(gold.r, gold.g, gold.b, hintAlpha)} margin={0} />
            </UiEntity>
          </UiEntity>
        </TalkPanel>
      </UiEntity>
    </ModalScrim>
  )
}
