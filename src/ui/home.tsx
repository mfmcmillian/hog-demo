import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { playCancel, tap } from '../game/audio'
import { openHeroCard } from '../game/menu'
import { open, openOverworld } from '../game/nav'
import { ElderTalk } from './elderTalk'
import { goRoad } from '../game/roads'
import { findOwned, game } from '../game/store'
import { goPointerShowing, partyPointerShowing } from '../game/tutorial'
import { duelSeatCount, getMyName, presentPlayers } from '../mp/session'
import { riftView } from '../mp/views'
import { campfireSheet, campfireUvs, villagerSheet, villagerTalkUvs } from './flipbook'
import { press, pressShrink, pressTint } from './fx/press'
import { cardBackArt } from './halls'
import { LABELS } from './labels.gen'
import { ModalScrim, TalkPanel, TravelerPlate } from './panels'
import { disarmRestart } from './settings'
import { cream, gold, muted, panelDim } from './theme'
import { TutPointer } from './tutorial'
import { Digits, Face, FillBar, GameLogo, Img, Stars } from './widgets'

function HomeHud() {
  const online = presentPlayers.size + 1
  return (
    <UiEntity
      uiTransform={{
        width: 84,
        height: '100%',
        flexDirection: 'column-reverse',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 6
      }}
      uiBackground={{ color: Color4.create(0.09, 0.05, 0.06, 0.94) }}
    >
      <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: 6 }}>
        <Img k="icon-bolt" w={20} tint={Color4.White()} />
        <FillBar frac={game.energy / game.energyMax} w={14} h={90} fill={gold} />
        <Digits value={game.energy} w={16} tint={gold} />
      </UiEntity>
      <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: 6 }}>
        <Img k="icon-coins" w={22} tint={Color4.White()} />
        <Digits value={game.coins} w={16} tint={gold} />
      </UiEntity>
      {/* live presence: tap the header to open the who's-online roster.
          Fills the rail width so the tap target is thumb-sized, not glyph-sized. */}
      <UiEntity
        uiTransform={{
          width: '100%',
          flexDirection: 'column-reverse',
          alignItems: 'center',
          justifyContent: 'center',
          margin: 6,
          padding: 4
        }}
        onMouseDown={tap(() => {
          game.onlineOpen = !game.onlineOpen
        })}
      >
        <Img k="dot" w={12} tint={Color4.create(0.28, 0.85, 0.35, 1)} margin={3} />
        <Digits value={online} w={16} tint={game.onlineOpen ? gold : cream} tight />
        <Img k="players-online" w={14} tint={game.onlineOpen ? gold : muted} margin={3} />
      </UiEntity>
    </UiEntity>
  )
}

function HomePoi(props: {
  k: string
  label: string
  left: `${number}%`
  top: `${number}%`
  size: number
  /** Players seated inside; >0 shows a green presence dot by the label. */
  badge?: number
  onTap?: () => void
}) {
  const info = LABELS[props.k]
  const plate = LABELS[props.label]
  if (!info) return null
  const drawn = props.size
  const plateW = 22
  const plateH = plate ? Math.round((plateW * plate.h) / plate.w) : 0
  const plateTop = Math.max(0, Math.round((drawn - plateH) / 2))
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { left: props.left, top: props.top },
        width: drawn + plateW + 16,
        height: Math.max(drawn, plateH)
      }}
      onMouseDown={tap(props.onTap)}
    >
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { left: 0, top: 0 },
          width: drawn,
          height: drawn
        }}
        uiBackground={{
          textureMode: 'stretch',
          texture: { src: info.src },
          uvs: info.uvs,
          color: Color4.White()
        }}
      />
      {plate ? (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: {
              left: drawn + 2,
              top: plateTop
            },
            width: plateW,
            height: plateH
          }}
          uiBackground={{
            textureMode: 'stretch',
            texture: { src: plate.src },
            uvs: plate.uvs,
            color: cream
          }}
        />
      ) : null}
      {props.badge ? (
        // presence badge: canvas-above the plate = physically right of the label
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { left: drawn + 4, top: plateTop - 46 },
            width: plateW,
            flexDirection: 'column-reverse',
            alignItems: 'center',
            pointerFilter: 'none'
          }}
        >
          <Img k="dot" w={12} tint={Color4.create(0.28, 0.85, 0.35, 1)} margin={2} />
          <Digits value={props.badge} w={13} tint={cream} tight />
        </UiEntity>
      ) : null}
    </UiEntity>
  )
}

function HomeField() {
  const village = LABELS['map-home']
  // The village fire grows with every player in the scene.
  const online = presentPlayers.size + 1
  const fireSize = Math.min(220, 84 + (online - 1) * 32)
  return (
    <UiEntity
      uiTransform={{
        width: 735,
        height: '100%'
      }}
      uiBackground={{
        textureMode: 'stretch',
        texture: { src: village ? village.src : 'images/maps/home-a.png' },
        color: Color4.White()
      }}
    >
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { left: '32%', top: '41%' },
          width: 170,
          height: 170,
          alignItems: 'center',
          justifyContent: 'center',
          pointerFilter: 'none'
        }}
      >
        <UiEntity
          uiTransform={{ width: fireSize, height: fireSize }}
          uiBackground={{
            textureMode: 'stretch',
            texture: { src: campfireSheet() },
            uvs: campfireUvs(),
            color: Color4.White()
          }}
          onMouseDown={tap(() => {
            game.fireTalk = !game.fireTalk
          })}
        />
      </UiEntity>
      <HomePoi k="home-shop" label="shop" left="8%" top="14%" size={132} onTap={() => open('shop')} />
      <HomePoi k="home-trade" label="trade" left="50%" top="68%" size={140} onTap={() => open('trade')} />
      <HomePoi
        k="home-rift"
        label="friendzone"
        left="54%"
        top="13%"
        size={148}
        badge={riftView.pub.seats.length + duelSeatCount()}
        onTap={() => open('rift')}
      />
      <HomePoi k="home-fuse" label="fuse" left="10%" top="62%" size={136} onTap={() => open('fuse')} />
      {/* The quest map: resumes where you left it this session. */}
      <HomePoi k="home-overworld" label="questing" left="30%" top="8%" size={130} onTap={() => openOverworld()} />
    </UiEntity>
  )
}

/** Campfire quest dialog: classic MMO NPC box over the home party strip.
 *  On the phone this strip is horizontal: the elder's framed portrait sits on
 *  the left (UI bottom, column-reverse), his lines to the right of it, all
 *  left-aligned (UI flex-end). Tap anywhere to dismiss. */
function FireTalk() {
  return (
    <TalkPanel
      width="100%"
      height="100%"
      onMouseDown={tap(() => {
        game.fireTalk = false
      })}
    >
      {/* framed portrait, phone-left */}
      <UiEntity
        uiTransform={{
          width: 176,
          height: 176,
          margin: { bottom: 14 },
          alignItems: 'center',
          justifyContent: 'center',
          pointerFilter: 'none'
        }}
        uiBackground={{ color: Color4.create(0.62, 0.46, 0.2, 1) }}
      >
        <UiEntity
          uiTransform={{
            width: 168,
            height: 168,
            alignItems: 'center',
            justifyContent: 'center',
            pointerFilter: 'none'
          }}
          uiBackground={{ color: Color4.create(0.09, 0.07, 0.06, 1) }}
        >
          <UiEntity
            uiTransform={{ width: 160, height: 160, pointerFilter: 'none' }}
            uiBackground={{
              textureMode: 'stretch',
              texture: { src: villagerSheet() },
              uvs: villagerTalkUvs(),
              color: Color4.White()
            }}
          />
        </UiEntity>
      </UiEntity>
      {/* speech lines, phone-right of the portrait, left-aligned */}
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
        <Img k="fire-grows" w={26} tint={gold} margin={6} />
        <Img k="fire-line1" w={20} tint={cream} margin={4} />
        <Img k="fire-line2" w={20} tint={cream} margin={4} />
        <Img k="fire-line3" w={20} tint={cream} margin={4} />
        <Img k="fire-line4" w={20} tint={cream} margin={4} />
      </UiEntity>
    </TalkPanel>
  )
}

function HomeParty() {
  return (
    <UiEntity
      uiTransform={{
        width: 280,
        height: '100%',
        flexDirection: 'column-reverse',
        alignItems: 'stretch',
        justifyContent: 'center'
      }}
      uiBackground={{
        textureMode: 'stretch',
        texture: { src: 'images/home/land-party.png' },
        color: Color4.White()
      }}
    >
      {game.fireTalk ? (
        <FireTalk />
      ) : (
        [0, 1, 2, 3].map((i) => {
          const uid = game.party[i]
          const owned = findOwned(uid)
          const info = owned ? LABELS[`char-${owned.defId}`] : undefined
          if (!owned) {
            return (
              <UiEntity
                uiTransform={{
                  width: '86%',
                  height: '18%',
                  margin: { left: '7%', right: '7%', top: 4, bottom: 4 },
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                uiBackground={{ color: Color4.create(0.82, 0.62, 0.28, 0.22) }}
              />
            )
          }
          return (
            <UiEntity
              uiTransform={{
                width: '100%',
                height: '27%',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onMouseDown={tap(() => openHeroCard(owned.uid))}
            >
              {info ? <Face id={owned.defId} w="92%" h="100%" fallback={22} /> : <Img k={owned.defId} w={22} />}
              {/* stars sit physically under the hero (landscape right edge) */}
              <UiEntity
                uiTransform={{
                  positionType: 'absolute',
                  position: { right: 2, top: 0 },
                  height: '100%',
                  alignItems: 'center',
                  justifyContent: 'center',
                  pointerFilter: 'none'
                }}
              >
                <Stars count={owned.stars} w={13} />
              </UiEntity>
            </UiEntity>
          )
        })
      )}
    </UiEntity>
  )
}

function NavBtn(props: { k: string; big?: boolean; onTap: () => void }) {
  const w = props.big ? 118 : 78
  const id = `nav:${props.k}`
  return (
    <UiEntity
      uiTransform={{
        width: w,
        height: w,
        margin: 2,
        alignItems: 'center',
        justifyContent: 'center'
      }}
      onMouseDown={press(id, tap(props.onTap))}
    >
      <Img k={props.k} w={w - pressShrink(id, w)} tint={pressTint(id)} margin={0} />
    </UiEntity>
  )
}

function HomeNav() {
  return (
    <UiEntity
      uiTransform={{
        width: 140,
        height: '100%',
        flexDirection: 'column-reverse',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 4
      }}
      uiBackground={{
        textureMode: 'stretch',
        texture: { src: 'images/home/land-nav.png' },
        color: Color4.White()
      }}
    >
      <NavBtn k="btn-party" onTap={() => open('party')} />
      <NavBtn k="btn-map" onTap={() => open('quest')} />
      <NavBtn k="btn-go" big onTap={() => goRoad()} />
      <NavBtn
        k="btn-settings"
        onTap={() => {
          disarmRestart()
          open('settings')
        }}
      />
      <NavBtn k="btn-event" onTap={() => open('festival')} />
      {goPointerShowing() ? (
        // First-quest nudge: aim the animated pointer at the GO button's
        // center. GO is the middle of the five buttons in this centered
        // rail, so its center sits at (70, 324) - half the 140 rail width,
        // half its 648 height (90% of the 720-unit Stage, which pins these
        // numbers on every device). The cursor tip lands 13px right / 66px
        // down from the pointer's anchor, hence the offset. Last child of
        // the rail so it draws over the buttons; no handlers, taps fall
        // through.
        <TutPointer left={70 - 13} top={324 - 66} />
      ) : null}
      {partyPointerShowing() ? (
        // Undiscovered cards: same pointer, aimed at the party button. In
        // this column-reverse rail it is the bottom button: 99px of centering
        // slack + map (82) + GO (122) + settings (82) + event (82) puts its
        // center at (70, 508).
        <TutPointer left={70 - 13} top={508 - 66} />
      ) : null}
    </UiEntity>
  )
}

export function HomeScreen() {
  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%',
        flexDirection: 'row',
        alignItems: 'stretch'
      }}
    >
      <HomeHud />
      <HomeField />
      <HomeParty />
      <HomeNav />
      <GameLogo />
      <OnlineRoster />
      <DropTalk />
    </UiEntity>
  )
}

/** After the oath clash: the elder teases the hound's card drop over the
 * village, showing the card back so the reveal waits on the party bench. */
function DropTalk() {
  if (!game.dropTalk) return null
  const back = cardBackArt()
  const bob = Math.sin(Date.now() / 480) * 6
  return (
    <ElderTalk
      lines={[{ k: 'intro-d1' }, { k: 'intro-d2' }, { k: 'intro-d3', tint: gold }]}
      onTap={tap(() => {
        game.dropTalk = false
      })}
    >
      {/* the mystery card, face down over the upper phone-half */}
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { left: '20%', top: `${34 + bob / 7.2}%` },
          width: 300,
          height: 150,
          pointerFilter: 'none'
        }}
        uiBackground={{
          textureMode: 'stretch',
          texture: { src: back.src },
          color: Color4.White()
        }}
      />
    </ElderTalk>
  )
}

/** Who's in the hall right now. Opens from the home "players online" header. */
function OnlineRoster() {
  if (!game.onlineOpen) return null
  const panel = LABELS['fest-panel']
  const mine = (getMyName() || 'you').trim()
  const others = [...presentPlayers.entries()].sort((a, b) => a[1].localeCompare(b[1])).slice(0, 8)
  const close = () => {
    playCancel()
    game.onlineOpen = false
  }
  return (
    <ModalScrim alpha={0.86} left={84} flexDirection="row" justifyContent="flex-start" onMouseDown={close}>
      <UiEntity
        uiTransform={{
          width: Math.min(820, 200 + 86 * (1 + Math.max(others.length, 1))),
          height: 740,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
          margin: { left: 12 }
        }}
        uiBackground={
          panel
            ? { textureMode: 'stretch', texture: { src: panel.src }, uvs: panel.uvs, color: Color4.White() }
            : { color: panelDim }
        }
        onMouseDown={() => {}}
      >
        <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: 8 }}>
          <Img k="dot" w={14} tint={Color4.create(0.28, 0.85, 0.35, 1)} margin={4} />
          <Digits value={presentPlayers.size + 1} w={28} tint={gold} tight />
          <Img k="players-online" w={28} tint={cream} margin={4} />
        </UiEntity>
        <TravelerPlate name={mine} tint={gold}>
          <Img k="dot" w={14} tint={Color4.create(0.28, 0.85, 0.35, 1)} />
        </TravelerPlate>
        {others.length === 0 ? (
          <Img k="no-travelers" w={26} tint={muted} margin={8} />
        ) : (
          others.map(([address, name]) => <TravelerPlate key={address} name={name} tint={cream} />)
        )}
      </UiEntity>
    </ModalScrim>
  )
}
