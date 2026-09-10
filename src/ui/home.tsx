import { Color4 } from '@dcl/sdk/math'
import ReactEcs from '@dcl/sdk/react-ecs'
import { UiEntity } from './ui'
import { playCancel, tap } from '../game/audio'
import { openHeroCard } from '../game/menu'
import { open, openOverworld } from '../game/nav'
import { ElderTalk } from './elderTalk'
import { goRoad } from '../game/roads'
import { dailyClaimable } from '../game/daily'
import { msToNextEnergy } from '../game/energy'
import { levelProgress } from '../game/level'
import { findOwned, game } from '../game/store'
import { goPointerShowing, partyPointerShowing, questingPointerShowing, questingUnlocked } from '../game/tutorial'
import { lookOf } from '../mp/looks'
import { canGiftToday, duelSeatCount, getMyAddress, getMyName, levelOf, myBoss, presentPlayers } from '../mp/session'
import './labels.boss.gen' // the lair's POI plate (world-boss)
import { riftView } from '../mp/views'
import { AvatarBust } from './avatar'
import { campfireSheet, campfireUvs, villagerSheet, villagerTalkUvs } from './flipbook'
import { press, pressShrink, pressTint } from './fx/press'
import { cardBackArt } from './halls'
import { LABELS } from './labels.gen'
import { LevelCard } from './level'
import { ModalScrim, TalkPanel, TravelerPlate } from './panels'
import { disarmRestart } from './settings'
import { cream, gold, muted, panelDim, PASS, xpBlue } from './theme'
import { TutPointer } from './tutorial'
import { Digits, Face, FillBar, GameLogo, Img, NameTag, Stars } from './widgets'

/** m:ss until the next energy refills, under the bolt; hidden at the cap. */
function EnergyClock() {
  const left = msToNextEnergy()
  if (left <= 0) return null
  const mins = Math.floor(left / 60000)
  const secs = Math.floor((left % 60000) / 1000)
  return (
    <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: { top: 4 } }}>
      <Digits value={mins} w={11} tint={muted} tight />
      <NameTag name="m" w={10} tint={muted} />
      <UiEntity uiTransform={{ width: 3 }} />
      <Digits value={secs} w={11} tint={muted} tight />
      <NameTag name="s" w={10} tint={muted} />
    </UiEntity>
  )
}

/** Account level on the HUD rail: LV badge, the number, and the XP bar to the
 * next level (full and still at the cap). Tap opens the level card. */
export function LevelMeter() {
  const p = levelProgress(game.axp)
  const frac = p.need > 0 ? p.into / p.need : 1
  return (
    <UiEntity
      uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: 6, padding: 2 }}
      onMouseDown={tap(() => {
        game.levelCard = !game.levelCard
      })}
    >
      <Img k="lv" w={20} tint={game.levelCard ? gold : cream} />
      <FillBar frac={frac} w={14} h={90} fill={xpBlue} />
      <Digits value={p.level} w={16} tint={gold} />
    </UiEntity>
  )
}

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
      <LevelMeter />
      <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: 6 }}>
        <Img k="icon-bolt" w={20} tint={Color4.White()} />
        <FillBar frac={game.energy / game.energyMax} w={14} h={90} fill={gold} />
        <Digits value={game.energy} w={16} tint={gold} />
        <EnergyClock />
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
  /** Not yet earned: drawn dark under the road padlock (same look as a locked road plate). */
  locked?: boolean
  onTap?: () => void
}) {
  const info = LABELS[props.k]
  const plate = LABELS[props.label]
  if (!info) return null
  const drawn = props.size
  const plateW = 22
  const plateH = plate ? Math.round((plateW * plate.h) / plate.w) : 0
  const plateTop = Math.max(0, Math.round((drawn - plateH) / 2))
  const tint = props.locked ? Color4.create(0.42, 0.38, 0.48, 1) : Color4.White()
  const lockW = Math.round(drawn * 0.5)
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
          color: tint
        }}
      />
      {props.locked ? (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { left: Math.round((drawn - lockW) / 2), top: Math.round((drawn - lockW) / 2) },
            width: lockW,
            height: lockW,
            alignItems: 'center',
            justifyContent: 'center',
            pointerFilter: 'none'
          }}
        >
          <Img k="road-lock" w={lockW} tint={Color4.White()} margin={0} />
        </UiEntity>
      ) : null}
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
            color: props.locked ? tint : cream
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

// ---- the fireside ------------------------------------------------------------------
//
// Everyone in the scene right now sits in a ring around the village fire as
// their walker (mp/looks.ts: their picked skin, hair, tunic and armor, or
// their DCL avatar snapped to the palette), you included. Seats are dealt in
// wallet order so nobody hops when someone arrives; the far side draws
// before the fire so the flames overlap them, the near side after. Tapping
// a figure shows its name.

/** The fire quad's center in the field: left 32% of the 735 field + 85,
 * top 41% of the chrome well (90% of the 720 stage) + 85. */
const FIRE_CX = Math.round(0.32 * 735) + 85
/** A seated figure: the bust's zoomed figure rect, phone-tall by phone-wide. */
const SEAT_W = 90
const SEAT_H = Math.round((SEAT_W * 0.42) / 0.72)
/** Walk-sheet rows (game/overworld FACING_ROW): down, left, right, up. */
const FACE_DOWN = 0
const FACE_LEFT = 1
const FACE_RIGHT = 2
const FACE_UP = 3

/** Fireside seats, hand-placed in the clear ground between the village's
 * buildings (canvas left/top of the figure's box; x runs physically down, y
 * physically right-to-left). Dealt in this order, so a lone traveler sits at
 * the fire's left, facing it. Fire quad: x 235..405, y 266..436; the trade
 * post starts at x 367 / y 441, the hall at x 514, the fuse forge ends at
 * x 209 above y 402, the shop ends at x 191 below y 223. */
const FIRE_SEATS: { left: number; top: number; cell: number }[] = [
  { left: 255, top: 445, cell: FACE_RIGHT }, // left of the fire
  { left: 262, top: 205, cell: FACE_LEFT }, // right of the fire
  { left: 415, top: 300, cell: FACE_UP }, // in front, before the hall
  { left: 155, top: 348, cell: FACE_DOWN }, // behind, left of center
  { left: 155, top: 258, cell: FACE_DOWN }, // behind, right of center
  { left: 60, top: 330, cell: FACE_DOWN } // up the lane
]
const FIRESIDE_MAX = FIRE_SEATS.length

/** Whose name is up at the fire (their address), if any. */
let fireTagged = ''

type Seat = { address: string; name: string; left: number; top: number; cell: number; near: boolean }

function firesideSeats(): Seat[] {
  const me = getMyAddress()
  const addresses = [...presentPlayers.keys()].filter((address) => address !== me)
  addresses.sort()
  addresses.unshift(me)
  // Seated still: nudging six layered figures every frame re-laid-out the
  // whole home tree each frame for a two-pixel breath nobody saw.
  return addresses.slice(0, FIRESIDE_MAX).map((address, i) => {
    const spot = FIRE_SEATS[i]
    return {
      address,
      name: address === me ? getMyName() : (presentPlayers.get(address) ?? address.slice(0, 8)),
      left: spot.left,
      top: spot.top,
      cell: spot.cell,
      // Below the fire's center draws over the flames; above, behind them.
      near: spot.left + SEAT_W / 2 > FIRE_CX
    }
  })
}

function FiresideFigure(props: { key?: string; seat: Seat }) {
  const { seat } = props
  const tagged = fireTagged === seat.address
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { left: seat.left, top: seat.top },
        width: SEAT_W,
        height: SEAT_H
      }}
      onMouseDown={tap(() => {
        fireTagged = tagged ? '' : seat.address
      })}
    >
      <AvatarBust look={lookOf(seat.address)} cell={seat.cell} w={SEAT_W} margin={0} />
      {tagged ? (
        // The name, physically under the figure, on a dark strip.
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { left: SEAT_W - 2, top: -40 },
            width: 22,
            height: SEAT_H + 80,
            flexDirection: 'column-reverse',
            alignItems: 'center',
            justifyContent: 'center',
            pointerFilter: 'none'
          }}
          uiBackground={{ color: Color4.create(0.02, 0.01, 0.02, 0.7) }}
        >
          <NameTag name={seat.name} w={14} tint={gold} />
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
  const seats = firesideSeats()
  if (fireTagged && !seats.some((seat) => seat.address === fireTagged)) fireTagged = ''
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
      {seats
        .filter((seat) => !seat.near)
        .map((seat) => (
          <FiresideFigure key={seat.address} seat={seat} />
        ))}
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
      {seats
        .filter((seat) => seat.near)
        .map((seat) => (
          <FiresideFigure key={seat.address} seat={seat} />
        ))}
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
      {/* The Hall of Heroes: the leaderboards, in the clear ground on the
          village's east side between the friendzone gate and the trade post. */}
      <HomePoi k="home-hall" label="hall-of-heroes" left="70%" top="37%" size={134} onTap={() => open('hall')} />
      {/* The world boss lair: a war banner on the village's south-east edge.
          The badge counts the attacks you still have today. */}
      <HomePoi
        k="home-boss"
        label="world-boss"
        left="73%"
        top="66%"
        size={140}
        badge={myBoss().left}
        onTap={() => open('boss')}
      />
      {/* The quest map: locked until the Moor Gate road is cleared, then
          resumes where you left it this session. */}
      <HomePoi
        k="home-overworld"
        label="questing"
        left="30%"
        top="8%"
        size={130}
        locked={!questingUnlocked()}
        onTap={() => openOverworld()}
      />
      {questingPointerShowing() ? (
        // Freshly unlocked: aim the pointer at the POI's center — 30% of the
        // 735 field + half of 130 across, 8% of the 720 Stage + 65 down —
        // with the cursor tip's 13/66 offset. Last child so it draws on top.
        <TutPointer left={285 - 13} top={123 - 66} />
      ) : null}
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

function NavBtn(props: { k: string; big?: boolean; alert?: boolean; onTap: () => void }) {
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
      {props.alert ? (
        // Something to collect inside: a red pip on the button's physical top-right.
        <UiEntity
          uiTransform={{ positionType: 'absolute', position: { top: 4, right: 4 }, width: 16, height: 16, ...PASS }}
        >
          <Img k="dot" w={16} tint={Color4.create(0.9, 0.22, 0.18, 1)} margin={0} />
        </UiEntity>
      ) : null}
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
      {/* pip: a reward waits, or today's gift is unsent while there's someone to give it to */}
      <NavBtn
        k="btn-event"
        alert={dailyClaimable() || (canGiftToday() && presentPlayers.size > 0)}
        onTap={() => open('festival')}
      />
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
      <LockTalk />
      <LevelCard />
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

/** Tapped the sealed questing gate: the elder explains the lock and the
 * pointer lands on the map button, where the Moor Gate road is. */
function LockTalk() {
  if (!game.lockTalk) return null
  return (
    <ElderTalk
      lines={[{ k: 'tut-lock-1a' }, { k: 'tut-lock-1b' }, { k: 'tut-lock-1c', tint: gold }]}
      onTap={tap(() => {
        game.lockTalk = false
      })}
    >
      {/* A box the size and place of the nav rail (canvas right = phone
          bottom), so the pointer math matches HomeNav: the map button is the
          second from the phone-left, centered at (70, 426) - 99 slack + event
          82 + settings 82 + GO 122 + half of map 82 - less the tip offset. */}
      <UiEntity
        uiTransform={{ positionType: 'absolute', position: { top: 0, right: 0 }, width: 140, height: '100%', ...PASS }}
      >
        <TutPointer left={70 - 13} top={426 - 66} />
      </UiEntity>
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
    <ModalScrim alpha={0.86} left={84} flexDirection="row" justifyContent="flex-start" buttons onMouseDown={close}>
      <UiEntity
        uiTransform={{
          width: Math.min(820, 200 + 86 * (1 + Math.max(others.length, 1))),
          height: 740,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
          margin: { left: 12 },
          pointerFilter: 'block' // not a close; no handler (see shop PackConfirm)
        }}
        uiBackground={
          panel
            ? { textureMode: 'stretch', texture: { src: panel.src }, uvs: panel.uvs, color: Color4.White() }
            : { color: panelDim }
        }
      >
        <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: 8 }}>
          <Img k="dot" w={14} tint={Color4.create(0.28, 0.85, 0.35, 1)} margin={4} />
          <Digits value={presentPlayers.size + 1} w={28} tint={gold} tight />
          <Img k="players-online" w={28} tint={cream} margin={4} />
        </UiEntity>
        <TravelerPlate name={mine} tint={gold} level={levelProgress(game.axp).level}>
          <Img k="dot" w={14} tint={Color4.create(0.28, 0.85, 0.35, 1)} />
        </TravelerPlate>
        {others.length === 0 ? (
          <Img k="no-travelers" w={26} tint={muted} margin={8} />
        ) : (
          others.map(([address, name]) => (
            <TravelerPlate key={address} name={name} tint={cream} level={levelOf(address)} />
          ))
        )}
      </UiEntity>
    </ModalScrim>
  )
}
