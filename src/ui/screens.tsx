import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { familiarForKin, listOathkin } from '../game/allies'
import { HEROES, collectionSize, getDef, statsOf, xpProgress } from '../game/familiars'
import { playCancel, playClick, tap } from '../game/audio'
import { MENU_WINDOW, back, focused, lockNav, open, primary, setCursor, shiftBench, shiftFromPad, windowed } from '../game/nav'
import { FLOORS, ROADS, dropStarsFor } from '../game/quests'
import { PACKS, PackDef } from '../game/packs'
import { DEBUG, advanceBanner, benchUnits, cancelPack, canFuse, confirmPack, cycleHero, cycleTier, findOwned, frontierFloor, fuse, fuseCount, fuseFaces, game, goHome, goRoad, leaveResult, openHeroCard, openLevels, pickFuse, pickFuseHero, pickFuseRank, pickHero, pickedStarOf, requestPack, resetAccount, resumeFloor, roadStarOf, skipBattle, startFloor, tapBenchHero, tapPartySlot, toggleParty } from '../game/state'
import { BattleUnit, MAX_STARS, OwnedFamiliar, PARTY_SIZE, Rarity, XpLine } from '../game/types'
import { chestFx, chestOpenSheet, chestWobble, dmgPops, dropRaySheet, giftFx, loopSparksUvs, revealBurstSheet, revealBurstUvs, foeLungeAmt, heroPoster, idleMotion, idlePoster, posterDrive, posterPunch, reportFx, revealFx, revealReady, shownHp, skillFxUvs, skipReveal, sparksSheet, starBurstFx, startChestFx, stopGiftFx, SKILL_FX_KINDS, SKILL_FX_SRC, unitHit, unitSkillFx } from './flipbook'
import { cardBackArt, hallArt } from './halls'
import { LABELS } from './labels.gen'
import { boot, enterGame } from '../game/boot'
import { CRITICAL_SRCS, PRELOAD_SRCS, startPreload } from './preload'
import {
  canGiftToday,
  festView,
  getMyAddress,
  getMyName,
  gift,
  giftSend,
  mySeat,
  presentPlayers,
  pushAccountReset,
  riftReady,
  riftSit,
  riftView,
  trade,
  tradeAccept,
  tradeDecline,
  tradeInvite,
  tradeLock,
  tradeOffer,
  tradeSides
} from '../mp/session'
import { DAY_MS } from '../mp/protocol'

// 2D UI built from pre-rotated label images (see tools/gen-labels.ps1).
// Native E/F are hidden; ACTION/BACK plaques call primary()/back().
// The dark field is a 3D room in src/scene/shell.ts. Only cards capture touch.
// The app is landscape; the phone is held in a portrait grip:
//   physical TOP    = landscape LEFT   -> screens read left-to-right as columns
//   physical LEFT   = landscape BOTTOM -> inside a column, content flows bottom-to-top

// ---- palette ----------------------------------------------------------------
const ink = Color4.create(0.07, 0.045, 0.06, 1)
const panelDim = Color4.create(0.13, 0.08, 0.1, 1)
const navySoft = Color4.create(0.28, 0.08, 0.1, 1)
const cream = Color4.create(0.95, 0.9, 0.84, 1)
const muted = Color4.create(0.62, 0.53, 0.51, 1)
const gold = Color4.create(0.82, 0.62, 0.28, 1)
const danger = Color4.create(0.45, 0.1, 0.12, 1)
const good = Color4.create(0.12, 0.28, 0.15, 1)

function rarityBg(rarity: Rarity): Color4 {
  if (rarity === 'mythic') return Color4.create(0.42, 0.18, 0.08, 1)
  if (rarity === 'legendary') return Color4.create(0.36, 0.24, 0.08, 1)
  if (rarity === 'epic') return Color4.create(0.24, 0.1, 0.28, 1)
  if (rarity === 'rare') return Color4.create(0.1, 0.16, 0.3, 1)
  if (rarity === 'uncommon') return Color4.create(0.1, 0.24, 0.14, 1)
  return Color4.create(0.16, 0.14, 0.15, 1)
}

// ---- primitives --------------------------------------------------------------

/** A pre-rotated label image. `w` is its on-screen width; height keeps aspect. */
function Img(props: { k: string; w: number; tint?: Color4; margin?: number; key?: string | number }) {
  const info = LABELS[props.k]
  if (!info) return null
  return (
    <UiEntity
      uiTransform={{
        width: props.w,
        height: Math.round((props.w * info.h) / info.w),
        margin: props.margin ?? 2
      }}
      uiBackground={{
        textureMode: 'stretch',
        texture: { src: info.src },
        color: props.tint ?? cream
      }}
    />
  )
}

/** A number as stacked digit images, reading physically left-to-right. */
function Digits(props: { value: number; w: number; tint?: Color4; key?: string | number; tight?: boolean; across?: boolean }) {
  const chars = String(Math.max(0, Math.floor(props.value))).split('')
  const gap = props.tight ? -Math.round(props.w * 0.2) : 0
  return (
    <UiEntity uiTransform={{ flexDirection: props.across ? 'row' : 'column-reverse', alignItems: 'center' }}>
      {chars.map((c, i) => (
        <Img key={i} k={`d${c}`} w={props.w} tint={props.tint} margin={gap} />
      ))}
    </UiEntity>
  )
}

function MinusMark(props: { s: number; tint?: Color4 }) {
  const s = props.s
  const t = Math.max(5, Math.round(s * 0.22))
  return (
    <UiEntity
      uiTransform={{
        width: s,
        height: s,
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <UiEntity
        uiTransform={{ width: s, height: t }}
        uiBackground={{ color: props.tint ?? cream }}
      />
    </UiEntity>
  )
}

function PlusMark(props: { s: number; tint?: Color4 }) {
  const s = props.s
  const t = Math.max(5, Math.round(s * 0.22))
  const tint = props.tint ?? gold
  return (
    <UiEntity
      uiTransform={{
        width: s,
        height: s,
        alignItems: 'center',
        justifyContent: 'center',
        margin: { top: 2, bottom: 2 }
      }}
    >
      <UiEntity
        uiTransform={{ positionType: 'absolute', width: t, height: s }}
        uiBackground={{ color: tint }}
      />
      <UiEntity
        uiTransform={{ positionType: 'absolute', width: s, height: t }}
        uiBackground={{ color: tint }}
      />
    </UiEntity>
  )
}

/** +N as a gain, reading physically left-to-right. */
function Gain(props: { value: number; w: number; tint?: Color4 }) {
  return (
    <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center' }}>
      <PlusMark s={Math.round(props.w * 0.4)} tint={props.tint} />
      <Digits value={props.value} w={props.w} tint={props.tint} tight />
    </UiEntity>
  )
}

function Stars(props: { count: number; w?: number; burst?: boolean; key?: string | number }) {
  const fx = props.burst ? starBurstFx() : undefined
  const shown = fx && fx.active ? fx.shown : props.count
  const items = [] as number[]
  const w = props.w ?? 14
  for (let i = 0; i < shown; i++) items.push(i)
  return (
    <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center' }}>
      {items.map((i) => {
        const newest = !!(fx && fx.popping && i === shown - 1)
        const grow = newest ? Math.round(w * 0.55 * fx.pop) : 0
        return (
          <UiEntity
            key={i}
            uiTransform={{
              width: w + grow,
              height: w + grow,
              margin: 1,
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Img k="star" w={w + grow} tint={gold} margin={0} />
            {newest && fx.sparks ? (
              <UiEntity
                uiTransform={{
                  positionType: 'absolute',
                  position: { left: -w, top: -w },
                  width: w * 3 + grow,
                  height: w * 3 + grow,
                  pointerFilter: 'none'
                }}
                uiBackground={{
                  textureMode: 'stretch',
                  texture: { src: sparksSheet() },
                  uvs: fx.sparksUvs,
                  color: Color4.create(1, 0.92, 0.55, 1)
                }}
              />
            ) : null}
          </UiEntity>
        )
      })}
    </UiEntity>
  )
}

/** Number + word. Default reads "40 coins". `wordFirst` reads "HP 23". */
function Stat(props: {
  value: number
  word: string
  tint?: Color4
  key?: string | number
  w?: number
  wordFirst?: boolean
}) {
  const w = props.w ?? 22
  const value = <Digits value={props.value} w={w} tint={props.tint ?? cream} />
  const word = <Img k={props.word} w={Math.round(w * 0.82)} tint={muted} margin={4} />
  return (
    <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: { left: 4, right: 4 } }}>
      {props.wordFirst ? word : value}
      {props.wordFirst ? value : word}
    </UiEntity>
  )
}

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

const PASS: { pointerFilter: 'none' } = { pointerFilter: 'none' }

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

let padFlash = ''
let padFlashUntil = 0

function tapPad(dir: string, delta: number) {
  padFlash = dir
  padFlashUntil = Date.now() + 220
  shiftFromPad(delta)
}

const PAD = 236
const HUD_BTN = 140
const PAD_HIT = Math.round(PAD * 0.35)
const PAD_EDGE = Math.round(PAD * 0.04)
const PAD_MID = Math.round((PAD - PAD_HIT) / 2)

function PadHit(props: { dir: string; top: number; left: number; onTap: () => void }) {
  const lit = padFlash === props.dir && Date.now() < padFlashUntil
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: props.top, left: props.left },
        width: PAD_HIT,
        height: PAD_HIT
      }}
      uiBackground={{ color: lit ? Color4.create(0.82, 0.62, 0.28, 0.42) : Color4.create(0, 0, 0, 0.02) }}
      onMouseDown={props.onTap}
    />
  )
}

function Dpad() {
  const disc = LABELS['pad-disc']
  return (
    <UiEntity uiTransform={{ width: PAD, height: PAD }}>
      {disc ? (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 0, left: 0 },
            width: PAD,
            height: PAD,
            pointerFilter: 'none'
          }}
          uiBackground={{
            textureMode: 'stretch',
            texture: { src: disc.src },
            color: Color4.White()
          }}
        />
      ) : null}
      <PadHit dir="right" top={PAD_EDGE} left={PAD_MID} onTap={() => tapPad('right', 1)} />
      <PadHit dir="up" top={PAD_MID} left={PAD_EDGE} onTap={() => tapPad('up', -1)} />
      <PadHit dir="down" top={PAD_MID} left={PAD - PAD_HIT - PAD_EDGE} onTap={() => tapPad('down', 1)} />
      <PadHit dir="left" top={PAD - PAD_HIT - PAD_EDGE} left={PAD_MID} onTap={() => tapPad('left', -1)} />
    </UiEntity>
  )
}

function HudBtn(props: { k: string; onTap: () => void }) {
  return (
    <UiEntity
      uiTransform={{
        width: HUD_BTN,
        height: HUD_BTN,
        alignItems: 'center',
        justifyContent: 'center'
      }}
      onMouseDown={props.onTap}
    >
      <Img k={props.k} w={HUD_BTN} tint={Color4.White()} margin={0} />
    </UiEntity>
  )
}

function PlayHud() {
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: '4%', right: '1%' },
        width: 268,
        height: '82%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: { top: 4, bottom: 4 }
      }}
    >
      <Dpad />
      <HudBtn k="btn-back" onTap={() => back()} />
      <HudBtn k="btn-action" onTap={() => primary()} />
    </UiEntity>
  )
}

function showsMenuBack() {
  if (game.phase === 'heroCard' && game.reveal && !revealReady()) return false
  switch (game.phase) {
    case 'start':
    case 'home':
    case 'battle':
    case 'banner':
    case 'report':
      return false
    default:
      return true
  }
}

function MenuBack() {
  if (!showsMenuBack()) return null
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { bottom: 18, left: 22 },
        width: 96,
        height: 96
      }}
    >
      <CardBtn k="btn-back" w={96} onTap={() => back()} />
    </UiEntity>
  )
}

function ScreenChrome(props: { children?: ReactEcs.JSX.Component[] | ReactEcs.JSX.Component }) {
  const frame = LABELS['screen-frame']
  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        ...PASS
      }}
    >
      <UiEntity uiTransform={{ width: '94%', height: '90%', ...PASS }}>{props.children}</UiEntity>
      {frame ? (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 0, left: 0 },
            width: '100%',
            height: '100%',
            pointerFilter: 'none'
          }}
          uiBackground={{
            textureMode: 'stretch',
            texture: { src: frame.src },
            color: Color4.White()
          }}
        />
      ) : null}
      <MenuBack />
    </UiEntity>
  )
}

function Notice() {
  if (!game.notice) return null
  return (
    <UiEntity
      uiTransform={{
        flexDirection: 'column-reverse',
        alignItems: 'center',
        alignSelf: 'flex-start',
        margin: { left: 8, top: 10 }
      }}
    >
      <Img k={game.notice} w={24} tint={gold} />
      {game.noticeArg ? <Img k={game.noticeArg} w={24} tint={cream} /> : null}
    </UiEntity>
  )
}

// ---- cards -------------------------------------------------------------------

function OwnedCard(props: {
  owned: OwnedFamiliar
  selected: boolean
  focused: boolean
  onTap: () => void
  key?: string | number
}) {
  const def = getDef(props.owned.defId)
  const stats = statsOf(props.owned)
  return (
    <Card bg={rarityBg(def.rarity)} selected={props.selected} focused={props.focused} onTap={props.onTap}>
      <Img k={def.id} w={26} />
      <Stars count={props.owned.stars} />
      <Digits value={stats.hp} w={18} tint={cream} />
      <Img k="hp" w={14} tint={muted} />
      <Digits value={stats.atk} w={18} tint={cream} />
      <Img k="atk" w={14} tint={muted} />
    </Card>
  )
}

function UnitCard(props: { unit: BattleUnit; key?: string | number }) {
  const dead = props.unit.hp <= 0
  const base = props.unit.side === 'foe' ? danger : good
  const frac = Math.max(0, Math.min(1, props.unit.hp / props.unit.maxHp))
  return (
    <Card bg={dead ? panelDim : base} width={64}>
      <Img k={props.unit.defId} w={22} tint={dead ? muted : cream} />
      <UiEntity
        uiTransform={{
          width: 14,
          height: 110,
          margin: 4,
          flexDirection: 'column',
          justifyContent: 'flex-end'
        }}
        uiBackground={{ color: ink }}
      >
        <UiEntity
          uiTransform={{ width: '100%', height: `${Math.round(frac * 100)}%` }}
          uiBackground={{ color: dead ? muted : cream }}
        />
      </UiEntity>
    </Card>
  )
}

// ---- screens -----------------------------------------------------------------

function FillBar(props: { frac: number; w: number; h: number; fill: Color4; track?: Color4 }) {
  const filled = Math.max(0, Math.min(props.h, Math.round(props.frac * props.h)))
  return (
    <UiEntity
      uiTransform={{
        width: props.w,
        height: props.h,
        flexDirection: 'column',
        justifyContent: 'flex-end'
      }}
      uiBackground={{ color: props.track ?? ink }}
    >
      <UiEntity
        uiTransform={{ width: '100%', height: filled }}
        uiBackground={{ color: props.fill }}
      />
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
      <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: 6 }}>
        <Img k="icon-bolt" w={20} tint={Color4.White()} />
        <FillBar frac={game.energy / game.energyMax} w={14} h={90} fill={gold} />
        <Digits value={game.energy} w={16} tint={gold} />
      </UiEntity>
      <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: 6 }}>
        <Img k="icon-coins" w={22} tint={Color4.White()} />
        <Digits value={game.coins} w={16} tint={gold} />
      </UiEntity>
      {/* live presence: green dot + count + "players online" */}
      <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: 6 }}>
        <Img k="dot" w={12} tint={Color4.create(0.28, 0.85, 0.35, 1)} margin={3} />
        <Digits value={online} w={16} tint={cream} tight />
        <Img k="players-online" w={14} tint={muted} margin={3} />
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
  onTap?: () => void
}) {
  const info = LABELS[props.k]
  const plate = LABELS[props.label]
  if (!info) return null
  const plateW = 22
  const plateH = plate ? Math.round((plateW * plate.h) / plate.w) : 0
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { left: props.left, top: props.top },
        width: props.size + plateW + 6,
        height: Math.max(props.size, plateH)
      }}
      onMouseDown={tap(props.onTap)}
    >
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { left: 0, top: 0 },
          width: props.size,
          height: props.size
        }}
        uiBackground={{
          textureMode: 'stretch',
          texture: { src: info.src },
          color: Color4.White()
        }}
      />
      {plate ? (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: {
              left: props.size + 2,
              top: Math.max(0, Math.round((props.size - plateH) / 2))
            },
            width: plateW,
            height: plateH
          }}
          uiBackground={{
            textureMode: 'stretch',
            texture: { src: plate.src },
            color: cream
          }}
        />
      ) : null}
    </UiEntity>
  )
}

function HomeField() {
  const road = ROADS[game.cleared]
  const face = road ? LABELS[`char-${road.boss}`] : undefined
  const village = LABELS['map-home']
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
      {face ? (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { left: '32%', top: '41%' },
            width: 170,
            height: 170
          }}
          uiBackground={{
            textureMode: 'stretch',
            texture: { src: face.src },
            color: Color4.White()
          }}
        />
      ) : null}
      <HomePoi k="home-shop" label="shop" left="8%" top="14%" size={132} onTap={() => open('shop')} />
      <HomePoi k="home-trade" label="trade" left="50%" top="68%" size={140} onTap={() => open('trade')} />
      <HomePoi k="home-rift" label="friendzone" left="54%" top="13%" size={148} onTap={() => open('rift')} />
      <HomePoi k="home-fuse" label="fuse" left="10%" top="62%" size={136} onTap={() => open('fuse')} />
    </UiEntity>
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
      {[0, 1, 2, 3].map((i) => {
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
      })}
    </UiEntity>
  )
}

function NavBtn(props: { k: string; big?: boolean; onTap: () => void }) {
  const w = props.big ? 118 : 78
  return (
    <UiEntity
      uiTransform={{
        width: w,
        height: w,
        margin: 2,
        alignItems: 'center',
        justifyContent: 'center'
      }}
      onMouseDown={tap(props.onTap)}
    >
      <Img k={props.k} w={w} tint={Color4.White()} margin={0} />
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
          armRestart = false
          open('settings')
        }}
      />
      <NavBtn k="btn-event" onTap={() => open('festival')} />
    </UiEntity>
  )
}

function HomeScreen() {
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
      {/* game logo pushed up past the chrome inset, toward the real screen top */}
      {LABELS['boot-logo'] ? (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { left: -185, top: 0 },
            width: 170,
            height: '100%',
            alignItems: 'center',
            justifyContent: 'center',
            pointerFilter: 'none'
          }}
        >
          <UiEntity
            uiTransform={{ width: 160, height: 320, pointerFilter: 'none' }}
            uiBackground={{ textureMode: 'stretch', texture: { src: LABELS['boot-logo'].src }, color: Color4.White() }}
          />
        </UiEntity>
      ) : null}
    </UiEntity>
  )
}

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
  return (
    <UiEntity
      uiTransform={{ width: w, height: h, margin: 5 }}
      uiBackground={{ textureMode: 'stretch', texture: { src: plate.src }, color: Color4.White() }}
      onMouseDown={() => {
        playClick()
        props.onFlip()
        lockNav(200)
      }}
    >
      {toggle ? (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            // physical right-center of the row = landscape top-center
            position: { top: 14, left: Math.round((w - tw) / 2) },
            width: tw,
            height: th,
            pointerFilter: 'none'
          }}
          uiBackground={{ textureMode: 'stretch', texture: { src: toggle.src }, color: Color4.White() }}
        />
      ) : null}
    </UiEntity>
  )
}

/** Time left in the festival window on the kit's hourglass plate. */
function FestCountdown() {
  const plate = LABELS['fest-plate']
  if (!plate) return null
  const left = Math.max(0, festView.pub.endsAt - Date.now())
  const days = Math.floor(left / DAY_MS)
  const hours = Math.floor((left % DAY_MS) / (60 * 60 * 1000))
  const w = 66
  const h = Math.round((w * plate.h) / plate.w)
  return (
    <UiEntity
      uiTransform={{
        width: w,
        height: h,
        flexDirection: 'column-reverse',
        alignItems: 'center',
        justifyContent: 'center',
        margin: 4,
        padding: { top: Math.round(h * 0.18), bottom: 10 }
      }}
      uiBackground={{ textureMode: 'stretch', texture: { src: plate.src }, color: Color4.White() }}
    >
      <Img k="ends-in" w={24} tint={cream} margin={5} />
      <Digits value={days} w={30} tint={gold} tight />
      <NameTag name="d" w={26} tint={gold} />
      <UiEntity uiTransform={{ height: 10 }} />
      <Digits value={hours} w={30} tint={gold} tight />
      <NameTag name="h" w={26} tint={gold} />
    </UiEntity>
  )
}

/** Shared realm goal: everyone's rift floors fill one bar. */
function FestGoalPanel() {
  const panel = LABELS['fest-panel']
  const barFrame = LABELS['fest-bar-frame']
  const barFill = LABELS['fest-bar-fill']
  if (!panel) return null
  const pub = festView.pub
  const frac = pub.target > 0 ? Math.min(1, pub.count / pub.target) : 0
  const done = pub.done || frac >= 1
  const barW = 54 // physical bar height
  const barH = 560 // physical bar length
  const pad = 8
  return (
    <UiEntity
      uiTransform={{
        width: 268,
        height: 700,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        margin: 4,
        padding: 14
      }}
      uiBackground={{ textureMode: 'stretch', texture: { src: panel.src }, color: Color4.White() }}
    >
      <Img k="fest-realm-goal" w={42} tint={Color4.White()} margin={3} />
      <Img k="fest-goal-hint" w={22} tint={muted} margin={2} />
      <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: 2 }}>
        <Digits value={pub.count} w={32} tint={gold} tight />
        <Img k="road-slash" w={26} tint={gold} margin={2} />
        <Digits value={pub.target} w={32} tint={cream} tight />
      </UiEntity>
      <UiEntity uiTransform={{ width: barW, height: barH, margin: 4 }}>
        {barFrame ? (
          <UiEntity
            uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%', pointerFilter: 'none' }}
            uiBackground={{ textureMode: 'stretch', texture: { src: barFrame.src }, color: Color4.White() }}
          />
        ) : null}
        {barFill && frac > 0 ? (
          <UiEntity
            uiTransform={{
              positionType: 'absolute',
              position: { bottom: pad, left: pad },
              width: barW - pad * 2,
              height: Math.round((barH - pad * 2) * frac),
              pointerFilter: 'none'
            }}
            uiBackground={{ textureMode: 'stretch', texture: { src: barFill.src }, color: Color4.White() }}
          />
        ) : null}
        {done ? (
          <UiEntity
            uiTransform={{ positionType: 'absolute', position: { top: -20, left: -20 }, width: barW + 40, height: barH + 40, pointerFilter: 'none' }}
            uiBackground={{ textureMode: 'stretch', texture: { src: sparksSheet() }, uvs: loopSparksUvs(), color: Color4.create(1, 0.9, 0.6, 0.9) }}
          />
        ) : null}
      </UiEntity>
      {/* the promised spoils: a crown chest for every contributor */}
      <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: 2 }}>
        <Img k="road-laurel" w={44} tint={done ? gold : Color4.White()} margin={4} />
        <Img k="crate-crown" w={56} tint={Color4.White()} margin={4} />
      </UiEntity>
      <Img k="fest-reward-hint" w={22} tint={done ? gold : muted} margin={2} />
    </UiEntity>
  )
}

/** Daily gift bay: the ribbon chest, SEND, and the sender's blessing toast. */
function FestGiftPanel() {
  const panel = LABELS['fest-panel']
  const chest = LABELS['fest-gift']
  const send = LABELS['fest-send']
  if (!panel) return null
  const can = canGiftToday()
  return (
    <UiEntity
      uiTransform={{
        width: 268,
        height: 700,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        margin: 4,
        padding: 14
      }}
      uiBackground={{ textureMode: 'stretch', texture: { src: panel.src }, color: Color4.White() }}
    >
      <Img k="fest-daily-gift" w={42} tint={Color4.White()} margin={3} />
      <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: 2 }}>
        <Img k="fest-gift-hint" w={22} tint={muted} margin={2} />
        <UiEntity uiTransform={{ height: 12 }} />
        <Img k="fest-gift-hint2" w={22} tint={muted} margin={2} />
      </UiEntity>
      <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', justifyContent: 'center' }}>
        {chest ? (
          <UiEntity
            uiTransform={{ width: 132, height: Math.round((132 * chest.h) / chest.w), margin: 8 }}
            uiBackground={{ textureMode: 'stretch', texture: { src: chest.src }, color: can ? Color4.White() : muted }}
          />
        ) : null}
        {send ? (
          <UiEntity
            uiTransform={{ width: 102, height: Math.round((102 * send.h) / send.w), margin: 8 }}
            uiBackground={{ textureMode: 'stretch', texture: { src: send.src }, color: can ? Color4.White() : muted }}
            onMouseDown={() => {
              if (!can) return
              if (presentPlayers.size === 0) {
                gift.blocked = 'gone'
                gift.blockedAge = 0
                return
              }
              gift.picking = true
            }}
          />
        ) : null}
      </UiEntity>
      {gift.blessing > 0 ? (
        <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: 2 }}>
          <Img k="gift-sent" w={26} tint={gold} margin={3} />
          <Img k="icon-coins" w={30} tint={Color4.White()} margin={2} />
          <Gain value={gift.blessing} w={26} tint={gold} />
        </UiEntity>
      ) : !can ? (
        <Img k="gift-sent" w={24} tint={muted} margin={2} />
      ) : gift.blocked === 'gone' ? (
        <Img k="no-travelers" w={24} tint={danger} margin={2} />
      ) : null}
    </UiEntity>
  )
}

/** Pick who gets today's gift, from everyone else in the hall. */
function GiftPicker() {
  if (!gift.picking) return null
  const panel = LABELS['fest-panel']
  const ring = LABELS['road-ring']
  const chest = LABELS['fest-gift']
  const cancel = LABELS['fest-cancel']
  const list = [...presentPlayers.entries()].slice(0, 4)
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 0, left: 0 },
        width: '100%',
        height: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      uiBackground={{ color: Color4.create(0.02, 0.01, 0.02, 0.86) }}
      onMouseDown={() => {
        gift.picking = false
      }}
    >
      <UiEntity
        uiTransform={{
          width: 660,
          height: 740,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24
        }}
        uiBackground={panel ? { textureMode: 'stretch', texture: { src: panel.src }, color: Color4.White() } : { color: panelDim }}
        onMouseDown={() => {}}
      >
        <Img k="fest-send-a-gift" w={44} tint={gold} margin={5} />
        <Img k="choose-a-player" w={26} tint={cream} margin={3} />
        {list.map(([address, name]) => (
          <UiEntity
            key={address}
            uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', justifyContent: 'center', margin: 8 }}
            onMouseDown={() => giftSend(address)}
          >
            {ring ? (
              <UiEntity
                uiTransform={{ width: 74, height: 74, margin: { bottom: 8 } }}
                uiBackground={{ textureMode: 'stretch', texture: { src: ring.src }, color: Color4.White() }}
              />
            ) : null}
            <NameTag name={name} w={30} tint={cream} />
            {chest ? (
              <UiEntity
                uiTransform={{ width: 44, height: Math.round((44 * chest.h) / chest.w), margin: { top: 8 } }}
                uiBackground={{ textureMode: 'stretch', texture: { src: chest.src }, color: gold }}
              />
            ) : null}
          </UiEntity>
        ))}
        {cancel ? (
          <UiEntity
            uiTransform={{ width: 76, height: Math.round((76 * cancel.h) / cancel.w), margin: 10 }}
            uiBackground={{ textureMode: 'stretch', texture: { src: cancel.src }, color: Color4.White() }}
            onMouseDown={() => {
              gift.picking = false
            }}
          />
        ) : null}
      </UiEntity>
    </UiEntity>
  )
}

/** The festival hall: countdown, realm goal, daily gift. */
function FestivalScreen() {
  const hall = LABELS['map-settings']
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
      {hall ? (
        <UiEntity
          uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%', pointerFilter: 'none' }}
          uiBackground={{ textureMode: 'stretch', texture: { src: hall.src }, color: Color4.White() }}
        />
      ) : null}
      <UiEntity
        uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%', pointerFilter: 'none' }}
        uiBackground={{ color: Color4.create(0.02, 0.01, 0.02, 0.55) }}
      />
      <Img k="fest-banner" w={148} tint={Color4.White()} margin={6} />
      <FestCountdown />
      <FestGoalPanel />
      <FestGiftPanel />
      <GiftPicker />
    </UiEntity>
  )
}

/** Full-screen ribbon-chest ceremony when someone sends you a gift. */
function GiftCeremony() {
  const got = gift.received
  if (!got) return null
  const fx = giftFx()
  const sheet = chestOpenSheet('gift')
  const stage = 330
  const light = Color4.create(1, 0.78, 0.35, 1)
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 0, left: 0 },
        width: '100%',
        height: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      uiBackground={{ color: Color4.create(0.02, 0.01, 0.02, 0.9) }}
      onMouseDown={() => {
        // Dismiss once the lid is open (or if the fx clock never started).
        if (fx.active && !fx.settled) return
        gift.received = undefined
        stopGiftFx()
      }}
    >
      <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: 6 }}>
        <Img k="fest-gift-from" w={30} tint={gold} margin={4} />
        <NameTag name={got.name} w={26} tint={cream} />
      </UiEntity>
      <UiEntity uiTransform={{ width: stage, height: stage, margin: 8 }}>
        {fx.raysAlpha > 0 ? (
          <UiEntity
            uiTransform={{ positionType: 'absolute', position: { left: -35, top: -35 }, width: stage + 70, height: stage + 70, pointerFilter: 'none' }}
            uiBackground={{
              textureMode: 'stretch',
              texture: { src: dropRaySheet() },
              uvs: fx.raysUvs,
              color: Color4.create(light.r, light.g, light.b, fx.raysAlpha)
            }}
          />
        ) : null}
        {fx.glow > 0 ? (
          <UiEntity
            uiTransform={{ positionType: 'absolute', position: { left: -25, top: -25 }, width: stage + 50, height: stage + 50, pointerFilter: 'none' }}
            uiBackground={{
              textureMode: 'stretch',
              texture: { src: revealBurstSheet() },
              uvs: fx.swirlUvs,
              color: Color4.create(light.r, light.g, light.b, 0.9 * fx.glow)
            }}
          />
        ) : null}
        {sheet ? (
          <UiEntity
            uiTransform={{
              positionType: 'absolute',
              position: { left: Math.round(-fx.grow / 2) + fx.jx, top: Math.round(-fx.grow / 2) + fx.jy },
              width: stage + fx.grow,
              height: stage + fx.grow,
              pointerFilter: 'none'
            }}
            uiBackground={{ textureMode: 'stretch', texture: { src: sheet }, uvs: fx.chestUvs, color: Color4.White() }}
          />
        ) : null}
        {fx.sparks ? (
          <UiEntity
            uiTransform={{ positionType: 'absolute', position: { left: -25, top: -25 }, width: stage + 50, height: stage + 50, pointerFilter: 'none' }}
            uiBackground={{
              textureMode: 'stretch',
              texture: { src: sparksSheet() },
              uvs: fx.sparksUvs,
              color: Color4.create(1, 0.95, 0.85, 1)
            }}
          />
        ) : null}
        {fx.flash > 0 ? (
          <UiEntity
            uiTransform={{ positionType: 'absolute', position: { left: -40, top: -40 }, width: stage + 80, height: stage + 80, pointerFilter: 'none' }}
            uiBackground={{ color: Color4.create(1, 1, 1, fx.flash) }}
          />
        ) : null}
      </UiEntity>
      {fx.settled ? (
        <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: 6 }}>
          <Img k="icon-coins" w={34} tint={Color4.White()} margin={3} />
          <Gain value={got.coins} w={28} tint={gold} />
          {got.dropDefId ? (
            <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: { top: 10 } }}>
              <Face id={got.dropDefId} w={92} h={92} />
            </UiEntity>
          ) : null}
        </UiEntity>
      ) : (
        <UiEntity uiTransform={{ width: 40, height: 40 }} />
      )}
      {fx.settled ? <NameTag name={'continue'} w={14} tint={muted} /> : null}
    </UiEntity>
  )
}

function SettingsScreen() {
  const restart = LABELS['set-row-restart']
  const accept = LABELS['shop-accept']
  const decline = LABELS['shop-decline']
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
      <Img k="set-banner" w={150} tint={Color4.White()} margin={12} />
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
          uiTransform={{ width: rw, height: rh, margin: 5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
          uiBackground={{
            textureMode: 'stretch',
            texture: { src: restart.src },
            color: armRestart ? Color4.create(0.45, 0.4, 0.4, 1) : Color4.White()
          }}
          onMouseDown={() => {
            if (!armRestart) {
              armRestart = true
              lockNav()
            }
          }}
        >
          {armRestart ? (
            <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
              <Img k="are-you-sure" w={24} tint={danger} margin={3} />
              <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center' }}>
                {accept ? (
                  <UiEntity
                    uiTransform={{ width: 38, height: Math.round((38 * accept.h) / accept.w), margin: 6 }}
                    uiBackground={{ textureMode: 'stretch', texture: { src: accept.src }, color: Color4.White() }}
                    onMouseDown={() => {
                      armRestart = false
                      resetAccount()
                      pushAccountReset()
                      lockNav()
                    }}
                  />
                ) : null}
                {decline ? (
                  <UiEntity
                    uiTransform={{ width: 38, height: Math.round((38 * decline.h) / decline.w), margin: 6 }}
                    uiBackground={{ textureMode: 'stretch', texture: { src: decline.src }, color: Color4.White() }}
                    onMouseDown={() => {
                      armRestart = false
                      lockNav()
                    }}
                  />
                ) : null}
              </UiEntity>
            </UiEntity>
          ) : null}
        </UiEntity>
      ) : null}
    </UiEntity>
  )
}

function RoadPips(props: { at: number }) {
  const marks = [] as number[]
  for (let i = 1; i <= FLOORS; i++) marks.push(i)
  return (
    <UiEntity
      uiTransform={{
        flexDirection: 'column-reverse',
        alignItems: 'center',
        justifyContent: 'center',
        height: '80%'
      }}
    >
      {marks.map((n) => {
        const boss = n === FLOORS
        const here = n === props.at
        return (
          <Digits key={n} value={n} w={here || boss ? 22 : 16} tint={here ? gold : cream} tight />
        )
      })}
    </UiEntity>
  )
}

/** How far a road has come, shown on the right end of its row. */
function RoadProgress(props: { at: number; tint: Color4 }) {
  return (
    <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center' }}>
      <Digits value={props.at} w={26} tint={props.tint} tight />
      <Img k="road-slash" w={22} tint={props.tint} margin={2} />
      <Digits value={FLOORS} w={26} tint={props.tint} tight />
    </UiEntity>
  )
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

function QuestScreen() {
  const cave = LABELS['map-cave']
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
      {cave ? (
        <UiEntity
          uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%', pointerFilter: 'none' }}
          uiBackground={{ textureMode: 'stretch', texture: { src: cave.src }, color: Color4.White() }}
        />
      ) : null}
      <UiEntity
        uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%', pointerFilter: 'none' }}
        uiBackground={{ color: Color4.create(0.02, 0.01, 0.02, 0.52) }}
      />
      <Img k="road-banner" w={132} tint={Color4.White()} margin={10} />
      {ROADS.map((road, i) => (
        <RoadRow key={road.id} index={i} />
      ))}
      <UiEntity uiTransform={{ positionType: 'absolute', position: { right: 60, top: '42%' }, pointerFilter: 'none' }}>
        <Notice />
      </UiEntity>
    </UiEntity>
  )
}

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
      uiBackground={frame ? { textureMode: 'stretch', texture: { src: frame.src }, color: tint } : { color: panelDim }}
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
function LevelsScreen() {
  const road = ROADS[game.roadPick]
  const cave = LABELS['map-cave']
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
      {cave ? (
        <UiEntity
          uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%', pointerFilter: 'none' }}
          uiBackground={{ textureMode: 'stretch', texture: { src: cave.src }, color: Color4.White() }}
        />
      ) : null}
      <UiEntity
        uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%', pointerFilter: 'none' }}
        uiBackground={{ color: Color4.create(0.02, 0.01, 0.02, 0.52) }}
      />
      {banner ? (
        <UiEntity
          uiTransform={{
            width: 120,
            height: Math.round((120 * banner.h) / banner.w),
            alignItems: 'center',
            justifyContent: 'center',
            margin: 8
          }}
          uiBackground={{ textureMode: 'stretch', texture: { src: banner.src }, color: Color4.White() }}
        >
          <Img k={`road-name-${road.id}`} w={42} tint={Color4.White()} />
        </UiEntity>
      ) : null}
      {/* tier picker + boss drop preview, physically under the banner */}
      <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: 4 }}>
        {star > 1 ? <CardBtn k="party-arrow-l" w={46} onTap={() => cycleTier(road.id, -1)} /> : null}
        <Stars count={picked} w={20} />
        {star > 1 ? <CardBtn k="party-arrow-r" w={46} onTap={() => cycleTier(road.id, 1)} /> : null}
        <UiEntity uiTransform={{ height: 22 }} />
        <Img k="spoils" w={16} tint={muted} />
        <Stars count={dropStarsFor(picked)} w={13} />
      </UiEntity>
      {ranks.map((rank, r) => (
        <UiEntity key={r} uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', justifyContent: 'center' }}>
          {rank.map((floor) => (
            <LevelTile key={floor} floor={floor} />
          ))}
        </UiEntity>
      ))}
      {bossFrame ? (
        <UiEntity
          uiTransform={{ width: bossLit ? 208 : 188, height: bossLit ? 208 : 188, alignItems: 'center', justifyContent: 'center', margin: 6 }}
          uiBackground={{ textureMode: 'stretch', texture: { src: bossFrame.src }, color: bossTint }}
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
            <UiEntity uiTransform={{ positionType: 'absolute', position: { top: '38%', left: '38%' }, pointerFilter: 'none' }}>
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

function SlotChrome(props: {
  size: number
  empty?: boolean
  lit?: boolean
  hall?: string
  onTap: () => void
  children?: ReactEcs.JSX.Component[] | ReactEcs.JSX.Component
  key?: string | number
}) {
  const pad = props.lit ? 7 : 3
  return (
    <UiEntity
      uiTransform={{
        width: props.size,
        height: props.size,
        alignItems: 'center',
        justifyContent: 'center',
        padding: pad,
        margin: 3
      }}
      uiBackground={{ color: props.lit ? gold : Color4.create(0.82, 0.62, 0.28, 0.5) }}
      onMouseDown={tap(props.onTap)}
    >
      <UiEntity
        uiTransform={{
          width: '100%',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        uiBackground={
          props.hall
            ? { textureMode: 'stretch', texture: { src: props.hall }, color: Color4.White() }
            : { color: props.empty ? Color4.create(0.08, 0.05, 0.06, 0.88) : ink }
        }
      >
        {props.children}
      </UiEntity>
    </UiEntity>
  )
}

/** One ornate kit seat: gold frame, hero in the leather, name in the banner. */
function TeamSlot(props: { slot: number }) {
  const uid = game.party[props.slot]
  const owned = findOwned(uid)
  const lit = game.selectedSlot === props.slot || focused(props.slot)
  const starter = !!owned && owned.uid === game.heroUid
  const frame = LABELS[owned ? 'party-seat' : 'party-seat-empty']
  if (!frame) return null
  const def = owned ? getDef(owned.defId) : undefined
  const h = 250 // landscape height = physical card width
  const w = Math.round((h * frame.w) / frame.h)
  return (
    <UiEntity
      uiTransform={{ width: w + 8, height: h + 8, margin: 3, alignItems: 'center', justifyContent: 'center' }}
      uiBackground={{ color: lit ? Color4.create(0.95, 0.78, 0.35, 0.35) : Color4.create(0, 0, 0, 0) }}
      onMouseDown={() => {
        setCursor(props.slot)
        tapPartySlot(props.slot)
      }}
    >
      <UiEntity
        uiTransform={{ width: w, height: h }}
        uiBackground={{ textureMode: 'stretch', texture: { src: frame.src }, color: Color4.White() }}
      >
        {owned ? (
          <UiEntity
            uiTransform={{ positionType: 'absolute', position: { left: 68, top: Math.round((h - 195) / 2) }, width: 195, height: 195, pointerFilter: 'none' }}
          >
            <Face id={owned.defId} w="100%" h="100%" fallback={36} />
          </UiEntity>
        ) : null}
        {def ? (
          // name glyphs over the baked banner (physical top of the card)
          <UiEntity
            uiTransform={{
              positionType: 'absolute',
              position: { left: 10, top: 0 },
              width: 42,
              height: '100%',
              alignItems: 'center',
              justifyContent: 'center',
              pointerFilter: 'none'
            }}
          >
            <NameTag name={def.name} w={17} tint={gold} />
          </UiEntity>
        ) : null}
        {starter ? (
          <UiEntity
            uiTransform={{ positionType: 'absolute', position: { top: 12, left: 62 }, width: 28, height: 28, pointerFilter: 'none' }}
          >
            <Img k="star" w={26} tint={gold} margin={0} />
          </UiEntity>
        ) : null}
      </UiEntity>
    </UiEntity>
  )
}

function BenchTile(props: { owned: OwnedFamiliar; index: number; key?: string }) {
  const abs = PARTY_SIZE + props.index
  const lit = focused(abs)
  const frame = LABELS['party-tile']
  if (!frame) return null
  const w = lit ? 148 : 138
  const h = Math.round((w * frame.h) / frame.w)
  return (
    <UiEntity
      uiTransform={{ width: w + 6, height: h + 6, margin: 2, alignItems: 'center', justifyContent: 'center' }}
      uiBackground={{ color: lit ? Color4.create(0.95, 0.78, 0.35, 0.35) : Color4.create(0, 0, 0, 0) }}
      onMouseDown={() => {
        setCursor(abs)
        tapBenchHero(props.owned.uid)
      }}
    >
      <UiEntity
        uiTransform={{ width: w, height: h, alignItems: 'center', justifyContent: 'center' }}
        uiBackground={{ textureMode: 'stretch', texture: { src: frame.src }, color: Color4.White() }}
      >
        <Face id={props.owned.defId} w={Math.round(w * 0.78)} h={Math.round(h * 0.78)} fallback={28} />
      </UiEntity>
    </UiEntity>
  )
}

function PartyScreen() {
  const bench = windowed(benchUnits())
  const canPage = benchUnits().length > PARTY_SIZE
  const board = LABELS['hall-party']
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
      {board ? (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 0, left: 0 },
            width: '100%',
            height: '100%'
          }}
          uiBackground={{
            textureMode: 'stretch',
            texture: { src: board.src },
            color: Color4.White()
          }}
        />
      ) : null}
      {/* dim the hall so the gold kit reads like the mock */}
      <UiEntity
        uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%', pointerFilter: 'none' }}
        uiBackground={{ color: Color4.create(0.02, 0.01, 0.02, 0.42) }}
      />
      <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', margin: { left: 8, right: 4 } }}>
        <Img k="party-banner" w={132} tint={Color4.White()} margin={2} />
        <UiEntity
          uiTransform={{ width: 52, height: 140, alignItems: 'center', justifyContent: 'center', margin: 4 }}
          onMouseDown={tap(() => open('fuse'))}
        >
          <Img k="fuse" w={36} tint={gold} margin={0} />
        </UiEntity>
        {/* collection tally: unique cards owned vs everything collectible */}
        <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: 2 }}>
          <Digits value={new Set(game.collection.map((owned) => owned.defId)).size} w={26} tint={gold} tight />
          <Img k="road-slash" w={22} tint={gold} margin={2} />
          <Digits value={collectionSize()} w={26} tint={cream} tight />
        </UiEntity>
      </UiEntity>
      <UiEntity
        uiTransform={{
          height: '96%',
          flexDirection: 'column-reverse',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <TeamSlot slot={0} />
        <TeamSlot slot={1} />
      </UiEntity>
      <UiEntity
        uiTransform={{
          height: '96%',
          flexDirection: 'column-reverse',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <TeamSlot slot={2} />
        <TeamSlot slot={3} />
      </UiEntity>
      <UiEntity
        uiTransform={{
          flexDirection: 'row',
          alignItems: 'center',
          height: '96%',
          margin: { left: 4 }
        }}
      >
        <Img k="party-bench-plate" w={38} tint={Color4.White()} margin={2} />
        <UiEntity
          uiTransform={{
            height: '96%',
            flexDirection: 'column-reverse',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {canPage ? (
            <UiEntity
              uiTransform={{ width: 60, height: 48, alignItems: 'center', justifyContent: 'center' }}
              onMouseDown={tap(() => shiftBench(-1))}
            >
              <Img k="party-arrow-l" w={54} tint={Color4.White()} margin={0} />
            </UiEntity>
          ) : null}
          {bench.map((owned, i) => (
            <BenchTile key={owned.uid} owned={owned} index={i} />
          ))}
          {canPage ? (
            <UiEntity
              uiTransform={{ width: 60, height: 48, alignItems: 'center', justifyContent: 'center' }}
              onMouseDown={tap(() => shiftBench(1))}
            >
              <Img k="party-arrow-r" w={54} tint={Color4.White()} margin={0} />
            </UiEntity>
          ) : null}
        </UiEntity>
      </UiEntity>
      <Notice />
    </UiEntity>
  )
}

function FuseSeat(props: { which: 'a' | 'b' }) {
  const uid = props.which === 'a' ? game.fuseA : game.fuseB
  const owned = findOwned(uid)
  const frame = LABELS[owned ? 'party-seat' : 'party-seat-empty']
  if (!frame) return null
  const def = owned ? getDef(owned.defId) : undefined
  const h = 112
  const w = Math.round((h * frame.w) / frame.h)
  const face = 82
  return (
    <UiEntity
      uiTransform={{ width: w + 8, height: h + 8, margin: 3, alignItems: 'center', justifyContent: 'center' }}
      onMouseDown={owned ? tap(() => pickFuse(owned.uid)) : undefined}
    >
      <UiEntity uiTransform={{ width: w, height: h }} uiBackground={{ textureMode: 'stretch', texture: { src: frame.src }, color: Color4.White() }}>
        {owned ? (
          <UiEntity
            uiTransform={{
              positionType: 'absolute',
              position: { left: 30, top: Math.round((h - face) / 2) },
              width: face,
              height: face,
              pointerFilter: 'none'
            }}
          >
            <Face id={owned.defId} w="100%" h="100%" fallback={32} />
          </UiEntity>
        ) : null}
        {def ? (
          <UiEntity
            uiTransform={{
              positionType: 'absolute',
              position: { left: 6, top: 0 },
              width: 22,
              height: '100%',
              alignItems: 'center',
              justifyContent: 'center',
              pointerFilter: 'none'
            }}
          >
            <NameTag name={def.name} w={9} tint={gold} />
          </UiEntity>
        ) : null}
        {owned ? (
          <UiEntity
            uiTransform={{
              positionType: 'absolute',
              position: { left: 6, top: 16 },
              pointerFilter: 'none'
            }}
          >
            <Stars count={owned.stars} w={12} />
          </UiEntity>
        ) : null}
      </UiEntity>
    </UiEntity>
  )
}

function FuseResult() {
  const a = findOwned(game.fuseA)
  const b = findOwned(game.fuseB)
  const ready = canFuse(a, b)
  // Same seat frame as the ingredients so the child card reads the same way up.
  const frame = LABELS[ready ? 'party-seat' : 'party-seat-empty']
  if (!frame) return null
  const preview = ready && a ? { ...a, uid: 'preview', stars: a.stars + 1 } : undefined
  const h = 112
  const w = Math.round((h * frame.w) / frame.h)
  const face = 82
  return (
    <UiEntity
      uiTransform={{ width: w + 8, height: h + 8, margin: 3, alignItems: 'center', justifyContent: 'center' }}
      onMouseDown={ready ? tap(() => fuse()) : undefined}
    >
      <UiEntity
        uiTransform={{ width: w, height: h }}
        uiBackground={{
          textureMode: 'stretch',
          texture: { src: frame.src },
          color: ready ? Color4.create(1, 0.92, 0.66, 1) : Color4.create(0.55, 0.55, 0.55, 1)
        }}
      >
        {preview ? (
          <UiEntity
            uiTransform={{
              positionType: 'absolute',
              position: { left: 30, top: Math.round((h - face) / 2) },
              width: face,
              height: face,
              pointerFilter: 'none'
            }}
          >
            <Face id={preview.defId} w="100%" h="100%" fallback={32} />
          </UiEntity>
        ) : null}
        {preview ? (
          <UiEntity
            uiTransform={{
              positionType: 'absolute',
              position: { left: 6, top: 16 },
              pointerFilter: 'none'
            }}
          >
            <Stars count={preview.stars} w={12} />
          </UiEntity>
        ) : null}
      </UiEntity>
    </UiEntity>
  )
}

function FuseHeroTile(props: { owned: OwnedFamiliar; index: number; key?: string }) {
  const lit = game.fuseId === props.owned.defId || focused(props.index)
  const frame = LABELS['party-tile']
  if (!frame) return null
  // Same tile size as the TEAM bench.
  const w = lit ? 148 : 138
  const h = Math.round((w * frame.h) / frame.w)
  return (
    <UiEntity
      uiTransform={{ width: w + 6, height: h + 6, margin: 2, alignItems: 'center', justifyContent: 'center' }}
      uiBackground={{ color: lit ? Color4.create(0.95, 0.78, 0.35, 0.35) : Color4.create(0, 0, 0, 0) }}
      onMouseDown={() => {
        setCursor(props.index)
        pickFuseHero(props.owned.defId)
      }}
    >
      <UiEntity
        uiTransform={{ width: w, height: h, alignItems: 'center', justifyContent: 'center' }}
        uiBackground={{ textureMode: 'stretch', texture: { src: frame.src }, color: Color4.White() }}
      >
        <Face id={props.owned.defId} w={Math.round(w * 0.78)} h={Math.round(h * 0.78)} fallback={28} />
      </UiEntity>
    </UiEntity>
  )
}

function FuseRankNode(props: { stars: number; key?: string | number }) {
  const n = game.fuseId ? fuseCount(game.fuseId, props.stars) : 0
  const top = props.stars >= MAX_STARS
  const ready = !top && n >= 2
  const lit = game.fuseRank === props.stars
  const frame = LABELS['party-tile']
  if (!frame) return null
  // Same tile as the bench; the copy count is the hero of the tile.
  const w = lit ? 104 : 100
  const h = Math.round((w * frame.h) / frame.w)
  return (
    <UiEntity
      uiTransform={{ width: w + 2, height: h + 2, margin: 1, alignItems: 'center', justifyContent: 'center' }}
      uiBackground={{ color: lit ? Color4.create(0.95, 0.78, 0.35, 0.35) : Color4.create(0, 0, 0, 0) }}
      onMouseDown={top ? undefined : tap(() => pickFuseRank(props.stars))}
    >
      <UiEntity
        uiTransform={{ width: w, height: h, alignItems: 'center', justifyContent: 'center' }}
        uiBackground={{ textureMode: 'stretch', texture: { src: frame.src }, color: Color4.White() }}
      >
        <Digits value={n} w={34} tint={ready ? gold : n > 0 ? cream : muted} tight />
        <UiEntity
          uiTransform={{ positionType: 'absolute', position: { left: 6, top: 16 }, pointerFilter: 'none' }}
        >
          <Stars count={props.stars} w={11} />
        </UiEntity>
      </UiEntity>
    </UiEntity>
  )
}

function FuseScreen() {
  const faces = fuseFaces()
  const page = windowed(faces.map((owned, i) => ({ owned, i })))
  const canPage = faces.length > MENU_WINDOW
  const ready = canFuse(findOwned(game.fuseA), findOwned(game.fuseB))
  const board = LABELS['hall-party']
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
      {board ? (
        <UiEntity
          uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%' }}
          uiBackground={{ textureMode: 'stretch', texture: { src: board.src }, color: Color4.White() }}
        />
      ) : null}
      <UiEntity
        uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%', pointerFilter: 'none' }}
        uiBackground={{ color: Color4.create(0.02, 0.01, 0.02, 0.42) }}
      />
      <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', margin: { left: 6, right: 2 } }}>
        <Img k="fuse-banner" w={112} tint={Color4.White()} margin={2} />
      </UiEntity>
      {/* two physical rows: 1-3 stars over 4-5 stars, so the tiles can be big */}
      <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', margin: 2 }}>
        <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', justifyContent: 'center' }}>
          {[1, 2, 3].map((stars) => (
            <FuseRankNode key={stars} stars={stars} />
          ))}
        </UiEntity>
        <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', justifyContent: 'center' }}>
          {[4, 5].map((stars) => (
            <FuseRankNode key={stars} stars={stars} />
          ))}
        </UiEntity>
      </UiEntity>
      <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', justifyContent: 'center', height: '92%' }}>
        <FuseSeat which="a" />
        <UiEntity uiTransform={{ width: 5, height: 44, margin: 2 }} uiBackground={{ color: gold }} />
        <FuseSeat which="b" />
      </UiEntity>
      {/* vertical drop line from between the parents down to the child */}
      <UiEntity uiTransform={{ width: 36, height: 5, margin: 2 }} uiBackground={{ color: gold }} />
      <FuseResult />
      <UiEntity
        uiTransform={{ width: 66, height: 210, alignItems: 'center', justifyContent: 'center', margin: 4 }}
        onMouseDown={ready ? tap(() => fuse()) : undefined}
      >
        <Img k="shop-accept" w={60} tint={ready ? Color4.White() : muted} margin={0} />
      </UiEntity>
      <UiEntity
        uiTransform={{
          flexDirection: 'row',
          alignItems: 'center',
          height: '96%',
          margin: { left: 4 }
        }}
      >
        <Img k="party-bench-plate" w={38} tint={Color4.White()} margin={2} />
        <UiEntity
          uiTransform={{
            height: '96%',
            flexDirection: 'column-reverse',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {canPage ? (
            <UiEntity
              uiTransform={{ width: 60, height: 48, alignItems: 'center', justifyContent: 'center' }}
              onMouseDown={tap(() => shiftBench(-1))}
            >
              <Img k="party-arrow-l" w={54} tint={Color4.White()} margin={0} />
            </UiEntity>
          ) : null}
          {page.map(({ owned, i }) => (
            <FuseHeroTile key={owned.defId} owned={owned} index={i} />
          ))}
          {canPage ? (
            <UiEntity
              uiTransform={{ width: 60, height: 48, alignItems: 'center', justifyContent: 'center' }}
              onMouseDown={tap(() => shiftBench(1))}
            >
              <Img k="party-arrow-r" w={54} tint={Color4.White()} margin={0} />
            </UiEntity>
          ) : null}
        </UiEntity>
      </UiEntity>
      <Notice />
    </UiEntity>
  )
}

/** Gem pips on the pack cards: rarity color + count, like the approved mock. */
const SHOP_GEMS: Record<string, { gem: string; count: number }> = {
  ember: { gem: 'shop-gem-red', count: 1 },
  vow: { gem: 'shop-gem-blue', count: 2 },
  crown: { gem: 'shop-gem-purple', count: 3 }
}

/** The colored light each chest bursts open with. */
const PACK_LIGHT: Record<string, Color4> = {
  ember: Color4.create(1, 0.52, 0.22, 1),
  vow: Color4.create(0.42, 0.64, 1, 1),
  crown: Color4.create(0.85, 0.5, 1, 1)
}

/** Cost plate from the kit with the coin count overlaid. */
function CostPlate(props: { cost: number; afford: boolean; w?: number }) {
  const plate = LABELS['shop-cost-plate']
  const w = props.w ?? 46
  if (!plate) return null
  return (
    <UiEntity
      uiTransform={{
        width: w,
        height: Math.round((w * plate.h) / plate.w),
        alignItems: 'center',
        justifyContent: 'center',
        margin: 3,
        flexDirection: 'column-reverse'
      }}
      uiBackground={{ textureMode: 'stretch', texture: { src: plate.src }, color: Color4.White() }}
    >
      <Img k="icon-coins" w={Math.round(w * 0.52)} tint={props.afford ? Color4.White() : muted} margin={2} />
      <Digits value={props.cost} w={Math.round(w * 0.44)} tint={props.afford ? gold : danger} />
    </UiEntity>
  )
}

/** One vertical chest card, framed by the kit card art. */
function PackBay(props: { pack: PackDef; index: number; key?: string | number }) {
  const art = LABELS[props.pack.art]
  const lit = focused(props.index)
  const afford = game.coins >= props.pack.cost
  const frame = LABELS[lit ? 'shop-card-lit' : 'shop-card']
  const gems = SHOP_GEMS[props.pack.id]
  const cardW = lit ? 240 : 208 // physical width (landscape height)
  const cardH = Math.round(cardW * 1.7) // frame aspect 512:301
  return (
    <UiEntity
      uiTransform={{
        width: cardH,
        height: cardW,
        margin: { top: 5, bottom: 5 },
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16
      }}
      onMouseDown={tap(() => {
        setCursor(props.index)
        requestPack(props.pack.id)
      })}
    >
      {frame ? (
        <UiEntity
          uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%', pointerFilter: 'none' }}
          uiBackground={{ textureMode: 'stretch', texture: { src: frame.src }, color: Color4.White() }}
        />
      ) : null}
      <Img k={`shop-name-${props.pack.id}`} w={40} tint={Color4.White()} margin={2} />
      {art ? (
        <UiEntity
          uiTransform={{
            width: lit ? 150 : 130,
            height: lit ? 150 : 130,
            // Compensated margins: the focused crate rattles without
            // shoving its plate and cost siblings around.
            margin: lit
              ? (() => {
                  const wob = chestWobble()
                  return { left: 4 + wob.jx, right: 4 - wob.jx, top: wob.jy, bottom: -wob.jy }
                })()
              : 4
          }}
          uiBackground={{ textureMode: 'stretch', texture: { src: art.src }, color: afford ? Color4.White() : muted }}
        />
      ) : null}
      <CostPlate cost={props.pack.cost} afford={afford} w={lit ? 44 : 40} />
      {gems ? (
        <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center' }}>
          {Array.from({ length: gems.count }, (_, i) => (
            <Img key={i} k={gems.gem} w={20} tint={Color4.White()} margin={1} />
          ))}
        </UiEntity>
      ) : null}
    </UiEntity>
  )
}

/** AAA chest confirmation: dim the shop, show the crate, ask ACCEPT/DECLINE.
 * ACCEPT starts the flipbook ceremony (shake -> colored burst) and the actual
 * purchase fires when the ceremony finishes, flowing into the card reveal. */
function PackConfirm() {
  const pack = PACKS.find((entry) => entry.id === game.pendingPack)
  if (!pack) return null
  const fx = chestFx()
  if (fx.done) {
    confirmPack() // opens the chest for real; the hero card reveal takes over
    return null
  }
  const art = LABELS[pack.art]
  const frame = LABELS['shop-card']
  const afford = game.coins >= pack.cost
  const gems = SHOP_GEMS[pack.id]
  const accept = LABELS['shop-accept']
  const decline = LABELS['shop-decline']
  const light = PACK_LIGHT[pack.id] ?? gold
  const stage = 370
  const chestSize = 308 + fx.grow
  const chestOff = Math.round((stage - chestSize) / 2)
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 0, left: 0 },
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      uiBackground={{ color: Color4.create(0.02, 0.01, 0.02, 0.85) }}
      onMouseDown={() => {
        if (!fx.active) {
          playCancel()
          cancelPack()
        }
      }}
    >
      <UiEntity
        uiTransform={{
          width: 820,
          height: 620,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 30
        }}
        onMouseDown={() => {}}
      >
        {frame ? (
          <UiEntity
            uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%', pointerFilter: 'none' }}
            uiBackground={{ textureMode: 'stretch', texture: { src: frame.src }, color: Color4.White() }}
          />
        ) : null}
        <Img k="shop-open-chest" w={66} tint={Color4.White()} margin={4} />
        <UiEntity uiTransform={{ width: stage, height: stage, margin: 4 }}>
          {/* light rays wheel behind the crate at the burst */}
          {fx.raysAlpha > 0 ? (
            <UiEntity
              uiTransform={{ positionType: 'absolute', position: { left: -35, top: -35 }, width: stage + 70, height: stage + 70, pointerFilter: 'none' }}
              uiBackground={{
                textureMode: 'stretch',
                texture: { src: dropRaySheet() },
                uvs: fx.raysUvs,
                color: Color4.create(light.r, light.g, light.b, fx.raysAlpha)
              }}
            />
          ) : null}
          {/* colored swirl glows up through the shake, blows out at the burst */}
          {fx.glow > 0 ? (
            <UiEntity
              uiTransform={{ positionType: 'absolute', position: { left: -25, top: -25 }, width: stage + 50, height: stage + 50, pointerFilter: 'none' }}
              uiBackground={{
                textureMode: 'stretch',
                texture: { src: revealBurstSheet() },
                uvs: fx.swirlUvs,
                color: Color4.create(light.r, light.g, light.b, 0.9 * fx.glow)
              }}
            />
          ) : null}
          {(() => {
            // painted lid-opening flipbook; falls back to the static crate art
            const sheet = chestOpenSheet(pack.id)
            const src = sheet ?? art?.src
            if (!src) return null
            return (
              <UiEntity
                uiTransform={{
                  positionType: 'absolute',
                  position: { left: chestOff + fx.jx, top: chestOff + fx.jy },
                  width: chestSize,
                  height: chestSize,
                  pointerFilter: 'none'
                }}
                uiBackground={{
                  textureMode: 'stretch',
                  texture: { src },
                  uvs: sheet ? fx.chestUvs : undefined,
                  color: Color4.White()
                }}
              />
            )
          })()}
          {/* ember sparks fly over the crate */}
          {fx.sparks ? (
            <UiEntity
              uiTransform={{ positionType: 'absolute', position: { left: -25, top: -25 }, width: stage + 50, height: stage + 50, pointerFilter: 'none' }}
              uiBackground={{
                textureMode: 'stretch',
                texture: { src: sparksSheet() },
                uvs: fx.sparksUvs,
                color: Color4.create(1, 0.95, 0.85, 1)
              }}
            />
          ) : null}
          {fx.flash > 0 ? (
            <UiEntity
              uiTransform={{ positionType: 'absolute', position: { left: -40, top: -40 }, width: stage + 80, height: stage + 80, pointerFilter: 'none' }}
              uiBackground={{ color: Color4.create(1, 1, 1, fx.flash) }}
            />
          ) : null}
        </UiEntity>
        <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center' }}>
          <Img k={`shop-name-${pack.id}`} w={54} tint={Color4.White()} margin={3} />
          {gems
            ? Array.from({ length: gems.count }, (_, i) => (
                <Img key={i} k={gems.gem} w={26} tint={Color4.White()} margin={1} />
              ))
            : null}
          <CostPlate cost={pack.cost} afford={afford} w={58} />
        </UiEntity>
        {!fx.active ? (
          <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center' }}>
            {accept ? (
              <UiEntity
                uiTransform={{ width: 82, height: Math.round((82 * accept.h) / accept.w), margin: 10 }}
                uiBackground={{
                  textureMode: 'stretch',
                  texture: { src: accept.src },
                  color: afford ? Color4.White() : muted
                }}
                onMouseDown={tap(() => {
                  if (afford) startChestFx()
                })}
              />
            ) : null}
            {decline ? (
              <UiEntity
                uiTransform={{ width: 82, height: Math.round((82 * decline.h) / decline.w), margin: 10 }}
                uiBackground={{ textureMode: 'stretch', texture: { src: decline.src }, color: Color4.White() }}
                onMouseDown={() => {
                  playCancel()
                  cancelPack()
                }}
              />
            ) : null}
          </UiEntity>
        ) : (
          <UiEntity uiTransform={{ width: 82, height: 255, margin: 10 }} />
        )}
      </UiEntity>
    </UiEntity>
  )
}

function ShopScreen() {
  const hall = LABELS['map-shop']
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
      {hall ? (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 0, left: 0 },
            width: '100%',
            height: '100%'
          }}
          uiBackground={{
            textureMode: 'stretch',
            texture: { src: hall.src },
            color: Color4.White()
          }}
        />
      ) : null}
      {LABELS['shop-title'] ? (
        <UiEntity
          uiTransform={{
            width: 156,
            height: 386,
            margin: { left: 12, right: 4 }
          }}
          uiBackground={{
            textureMode: 'stretch',
            texture: { src: LABELS['shop-title'].src },
            color: Color4.White()
          }}
        />
      ) : null}
      {LABELS['shop-chip'] ? (
        <UiEntity
          uiTransform={{
            width: 54,
            height: 118,
            flexDirection: 'column-reverse',
            alignItems: 'center',
            justifyContent: 'center',
            margin: { left: 4, right: 8 }
          }}
          uiBackground={{ textureMode: 'stretch', texture: { src: LABELS['shop-chip'].src }, color: Color4.White() }}
        >
          <Img k="icon-coins" w={26} tint={Color4.White()} margin={1} />
          <Digits value={game.coins} w={22} tint={gold} />
        </UiEntity>
      ) : null}
      <UiEntity
        uiTransform={{
          flexDirection: 'column-reverse',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {PACKS.map((pack, i) => (
          <PackBay key={pack.id} pack={pack} index={i} />
        ))}
      </UiEntity>
      <PackConfirm />
      {/* physically lower on screen: landscape right = portrait bottom */}
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { right: 80, top: '40%' },
          pointerFilter: 'none'
        }}
      >
        <Notice />
      </UiEntity>
    </UiEntity>
  )
}

function AlliesScreen() {
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

// ---- multiplayer: trade + rift -------------------------------------------------

/** A player name as stacked letter glyphs, reading physically left-to-right. */
function NameTag(props: { name: string; w: number; tint?: Color4; key?: string | number }) {
  const chars = props.name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 10)
    .split('')
  if (chars.length === 0) chars.push('x')
  return (
    <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center' }}>
      {chars.map((c, i) => (
        <Img key={i} k={c >= '0' && c <= '9' ? `d${c}` : `g${c}`} w={props.w} tint={props.tint ?? cream} margin={0} />
      ))}
    </UiEntity>
  )
}

/** Full-bleed hall backdrop for the multiplayer screens. */
function MpBackdrop(props: { k: string }) {
  const art = LABELS[props.k]
  if (!art) return null
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 0, left: 0 },
        width: '100%',
        height: '100%',
        pointerFilter: 'none'
      }}
      uiBackground={{ textureMode: 'stretch', texture: { src: art.src }, color: Color4.White() }}
    />
  )
}

function tradeables(): OwnedFamiliar[] {
  return game.collection.filter((owned) => !owned.isHero)
}

const PICK_WINDOW = 4
let pickShift = 0

/**
 * One entry per hero like the party bench - no dupe faces. Trade offers your
 * spare copy (lowest stars/level); the rift fields your best one.
 */
function pickerPool(withHero: boolean): OwnedFamiliar[] {
  const pool = withHero ? game.collection : tradeables()
  const byDef = new Map<string, OwnedFamiliar>()
  for (const owned of pool) {
    const kept = byDef.get(owned.defId)
    if (!kept) {
      byDef.set(owned.defId, owned)
      continue
    }
    const better = owned.stars !== kept.stars ? owned.stars > kept.stars : owned.level > kept.level
    // withHero = rift (keep the strongest copy); otherwise trade (keep the spare).
    if (withHero === better) byDef.set(owned.defId, owned)
  }
  return [...byDef.values()]
}

/** Physical bottom strip of party-bench style hero tiles; tap = pick, arrows page. */
function HeroPickStrip(props: { hint: string; selectedUid?: string; onPick: (uid: string) => void; withHero?: boolean }) {
  const pool = pickerPool(props.withHero === true)
  const maxShift = Math.max(0, pool.length - PICK_WINDOW)
  if (pickShift > maxShift) pickShift = maxShift
  if (pickShift < 0) pickShift = 0
  const cards = pool.slice(pickShift, pickShift + PICK_WINDOW)
  const canPage = pool.length > PICK_WINDOW
  return (
    <UiEntity uiTransform={{ height: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
      <UiEntity uiTransform={{ width: 26, height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <Img k={props.hint} w={18} tint={gold} margin={0} />
      </UiEntity>
      <UiEntity
        uiTransform={{ height: '96%', flexDirection: 'column-reverse', alignItems: 'center', justifyContent: 'center' }}
      >
        {canPage ? (
          <UiEntity
            uiTransform={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}
            onMouseDown={() => (pickShift -= 1)}
          >
            <Img k="sel-arrow-left" w={48} tint={pickShift > 0 ? Color4.White() : Color4.create(1, 1, 1, 0.3)} margin={0} />
          </UiEntity>
        ) : null}
        {cards.map((owned) => {
          const lit = owned.uid === props.selectedUid
          return (
            <SlotChrome key={owned.uid} size={lit ? 148 : 132} lit={lit} onTap={() => props.onPick(owned.uid)}>
              <Face id={owned.defId} w="100%" h="100%" fallback={28} />
            </SlotChrome>
          )
        })}
        {canPage ? (
          <UiEntity
            uiTransform={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}
            onMouseDown={() => (pickShift += 1)}
          >
            <Img k="sel-arrow-right" w={48} tint={pickShift < maxShift ? Color4.White() : Color4.create(1, 1, 1, 0.3)} margin={0} />
          </UiEntity>
        ) : null}
      </UiEntity>
    </UiEntity>
  )
}

/** One side of the trade table: banner + offer card + lock plate. */
function TradeSide(props: { mine: boolean }) {
  const sides = tradeSides()
  const offer = props.mine ? sides.mine : sides.theirs
  const locked = props.mine ? sides.myLock : sides.theirLock
  const name = props.mine ? getMyName() || 'you' : sides.themName
  const banner = LABELS['trade-name']
  const card = LABELS['trade-card']
  const lock = LABELS[locked ? 'trade-lock-on' : 'trade-lock-off']
  const cardW = 330
  const cardH = card ? Math.round((cardW * card.h) / card.w) : 206
  return (
    <UiEntity uiTransform={{ height: 292, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
      {banner ? (
        <UiEntity
          uiTransform={{ width: 44, height: 235, alignItems: 'center', justifyContent: 'center', margin: { right: 2 } }}
          uiBackground={{ textureMode: 'stretch', texture: { src: banner.src }, color: Color4.White() }}
        >
          <NameTag name={name} w={22} tint={props.mine ? gold : cream} />
        </UiEntity>
      ) : null}
      <UiEntity
        uiTransform={{ width: cardW, height: cardH, alignItems: 'center', justifyContent: 'center' }}
        uiBackground={card ? { textureMode: 'stretch', texture: { src: card.src }, color: Color4.White() } : { color: panelDim }}
      >
        {offer ? (
          <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
            <Face id={offer.defId} w={190} h={190} />
            <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: { left: 4 } }}>
              <Img k={offer.defId} w={20} tint={cream} />
              <Digits value={offer.level} w={18} tint={gold} />
            </UiEntity>
          </UiEntity>
        ) : (
          <Img k="empty-seat" w={18} tint={muted} />
        )}
      </UiEntity>
      {lock ? (
        <UiEntity
          uiTransform={{ width: 64, height: 190, margin: { left: 4 } }}
          uiBackground={{
            textureMode: 'stretch',
            texture: { src: lock.src },
            color: props.mine || locked ? Color4.White() : Color4.create(1, 1, 1, 0.45)
          }}
          onMouseDown={props.mine && offer ? () => tradeLock(!locked) : undefined}
        />
      ) : null}
    </UiEntity>
  )
}

/** Rows of travelers in the scene to invite. */
function TradePartnerList() {
  const people = [...presentPlayers.entries()]
  if (trade.sentTo) {
    return (
      <UiEntity uiTransform={{ height: '100%', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <Img k="waiting" w={30} tint={gold} />
        <NameTag name={presentPlayers.get(trade.sentTo) ?? trade.sentTo.slice(0, 8)} w={24} tint={cream} />
      </UiEntity>
    )
  }
  if (people.length === 0) {
    return (
      <UiEntity uiTransform={{ height: '100%', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <Img k="no-travelers" w={26} tint={muted} />
      </UiEntity>
    )
  }
  const banner = LABELS['trade-name']
  return (
    <UiEntity uiTransform={{ height: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
      {people.slice(0, 5).map(([address, name]) => (
        <UiEntity
          key={address}
          uiTransform={{ width: 74, height: 420, alignItems: 'center', justifyContent: 'center', margin: 4 }}
          uiBackground={banner ? { textureMode: 'stretch', texture: { src: banner.src }, color: Color4.White() } : { color: panelDim }}
          onMouseDown={() => tradeInvite(address)}
        >
          <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center' }}>
            <NameTag name={name} w={24} tint={cream} />
            <UiEntity uiTransform={{ width: 30, height: 8 }} />
            <Img k="invite" w={24} tint={gold} />
          </UiEntity>
        </UiEntity>
      ))}
      {trade.closed ? <Img k="cancelled" w={20} tint={danger} margin={8} /> : null}
    </UiEntity>
  )
}

function TradeScreen() {
  const sides = tradeSides()
  const swap = LABELS['trade-swap']
  return (
    <UiEntity
      uiTransform={{ width: '100%', height: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
    >
      <MpBackdrop k="map-trade" />
      <UiEntity uiTransform={{ width: 120, height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <Img k="trade-title" w={110} tint={Color4.White()} margin={0} />
      </UiEntity>
      {trade.table ? (
        <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', justifyContent: 'center' }}>
          <TradeSide mine={true} />
          <TradeSide mine={false} />
          {swap ? (
            <UiEntity
              uiTransform={{
                positionType: 'absolute',
                position: { top: '44%', left: 175 },
                width: 84,
                height: 78,
                pointerFilter: 'none'
              }}
              uiBackground={{ textureMode: 'stretch', texture: { src: swap.src }, color: Color4.White() }}
            />
          ) : null}
        </UiEntity>
      ) : (
        <TradePartnerList />
      )}
      {trade.table ? (
        <HeroPickStrip hint="offer-card" selectedUid={sides.mine?.uid} onPick={(uid) => tradeOffer(uid)} />
      ) : null}
      <Notice />
    </UiEntity>
  )
}

/** Incoming trade invite toast; rendered over every screen. */
function TradeInviteToast() {
  const invite = trade.invite
  if (!invite || game.phase === 'battle' || game.phase === 'rift' || game.phase === 'start') return null
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: '30%', right: 40 },
        width: 96,
        height: 460,
        flexDirection: 'column-reverse',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      uiBackground={{ color: Color4.create(0.05, 0.03, 0.05, 0.92) }}
    >
      <NameTag name={invite.name} w={22} tint={gold} />
      <Img k="wants-trade" w={20} tint={cream} margin={6} />
      <UiEntity
        uiTransform={{ width: 60, height: 130, alignItems: 'center', justifyContent: 'center', margin: 4 }}
        uiBackground={{ color: good }}
        onMouseDown={() => {
          tradeAccept()
          if (game.phase === 'home') open('trade')
        }}
      >
        <Img k="accept" w={22} tint={cream} />
      </UiEntity>
      <UiEntity
        uiTransform={{ width: 60, height: 130, alignItems: 'center', justifyContent: 'center', margin: 4 }}
        uiBackground={{ color: danger }}
        onMouseDown={() => tradeDecline()}
      >
        <Img k="decline" w={22} tint={cream} />
      </UiEntity>
    </UiEntity>
  )
}

// ---- the rift ------------------------------------------------------------------

const RIFT_PIP_FRAC = [0.08, 0.23, 0.38, 0.53, 0.68, 0.84]

function RiftSeats() {
  const pub = riftView.pub
  const seatArt = LABELS['rift-seat']
  const seatW = 252
  const seatH = seatArt ? Math.round((seatW * seatArt.h) / seatArt.w) : 106
  const slots = [0, 1, 2, 3]
  return (
    <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', justifyContent: 'center' }}>
      {slots.map((i) => {
        const seat = pub.seats[i]
        const ready = LABELS[seat?.ready ? 'rift-ready-on' : 'rift-ready-off']
        return (
          <UiEntity key={i} uiTransform={{ height: 150, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
            <UiEntity
              uiTransform={{ width: seatW, height: seatH, alignItems: 'center', justifyContent: 'center' }}
              uiBackground={
                seatArt
                  ? { textureMode: 'stretch', texture: { src: seatArt.src }, color: seat ? Color4.White() : Color4.create(1, 1, 1, 0.55) }
                  : { color: panelDim }
              }
            >
              {seat ? (
                <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                  <Face id={seat.defId} w={110} h={110} />
                  <NameTag name={seat.name} w={18} tint={cream} />
                </UiEntity>
              ) : (
                <Img k="empty-seat" w={14} tint={muted} />
              )}
            </UiEntity>
            {seat && ready ? (
              <UiEntity
                uiTransform={{ width: 40, height: 112, margin: { left: 2 } }}
                uiBackground={{ textureMode: 'stretch', texture: { src: ready.src }, color: Color4.White() }}
              />
            ) : null}
          </UiEntity>
        )
      })}
    </UiEntity>
  )
}

/** The 1..5 + BOSS strip, with a gold marker on the active floor in battle. */
function RiftFloorTrack(props: { floor?: number }) {
  const art = LABELS['rift-floors']
  if (!art) return null
  const w = 150
  const h = Math.round((w * art.h) / art.w)
  const marker = props.floor ? RIFT_PIP_FRAC[Math.max(0, Math.min(5, props.floor - 1))] : undefined
  return (
    <UiEntity
      uiTransform={{ width: w, height: h, alignSelf: 'center' }}
      uiBackground={{ textureMode: 'stretch', texture: { src: art.src }, color: Color4.White() }}
    >
      {marker !== undefined ? (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { bottom: `${Math.round(marker * 100)}%`, left: '30%' },
            width: Math.round(w * 0.4),
            height: 6
          }}
          uiBackground={{ color: gold }}
        />
      ) : null}
    </UiEntity>
  )
}

function RiftLobby() {
  const pub = riftView.pub
  const seat = mySeat()
  const enter = LABELS['rift-enter']
  const canReady = !!seat
  return (
    <UiEntity
      uiTransform={{ width: '100%', height: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
    >
      <UiEntity uiTransform={{ width: 140, height: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
        <Img k="rift-title" w={104} tint={Color4.White()} margin={0} />
        <Img k="multiplayer-raid" w={16} tint={gold} margin={4} />
      </UiEntity>
      <UiEntity uiTransform={{ width: 48, height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <Img k="rift-ribbon" w={40} tint={Color4.White()} margin={0} />
      </UiEntity>
      <RiftSeats />
      <UiEntity uiTransform={{ width: 170, height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <RiftFloorTrack />
      </UiEntity>
      <UiEntity uiTransform={{ width: 150, height: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
        {enter ? (
          <UiEntity
            uiTransform={{ width: 130, height: Math.round((130 * enter.h) / enter.w) }}
            uiBackground={{
              textureMode: 'stretch',
              texture: { src: enter.src },
              color: canReady ? (seat?.ready ? gold : Color4.White()) : Color4.create(1, 1, 1, 0.4)
            }}
            onMouseDown={canReady ? tap(() => riftReady(!seat!.ready)) : undefined}
          />
        ) : null}
        <Img k="rift-energy" w={56} tint={Color4.White()} margin={6} />
      </UiEntity>
      {!seat && pub.seats.length < 4 ? (
        <HeroPickStrip
          hint="take-seat"
          withHero={true}
          onPick={(uid) => {
            if (!DEBUG.unlimitedEnergy && game.energy < 5) {
              game.notice = 'no-coin'
              return
            }
            riftSit(uid)
          }}
        />
      ) : null}
      <Notice />
    </UiEntity>
  )
}

function RiftBattle() {
  const pub = riftView.pub
  const b = pub.battle
  const seated = !!mySeat()
  return (
    <UiEntity
      uiTransform={{ width: '100%', height: '100%', flexDirection: 'row', alignItems: 'stretch', justifyContent: 'center' }}
    >
      {b ? <BattleRank units={b.foe} actingUid={b.actingUid} hp={danger} /> : null}
      <UiEntity uiTransform={{ width: 70, height: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
        <Digits value={pub.floor} w={20} tint={gold} />
        {!seated ? <Img k="watching" w={16} tint={muted} margin={8} /> : null}
      </UiEntity>
      {b ? <BattleRank units={b.you} actingUid={b.actingUid} hp={good} /> : null}
      <UiEntity uiTransform={{ width: 120, height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <RiftFloorTrack floor={pub.floor} />
      </UiEntity>
    </UiEntity>
  )
}

function RiftEnd() {
  const pub = riftView.pub
  const won = pub.phase === 'won'
  const mine = pub.rewards?.find((reward) => reward.address === getMyAddress())
  const dismiss = () => {
    goHome()
    lockNav()
  }
  return (
    <UiEntity
      uiTransform={{ width: '100%', height: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
      onMouseDown={dismiss}
    >
      <UiEntity uiTransform={{ width: 220, height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <Img k={won ? 'win' : 'lose'} w={190} tint={Color4.White()} margin={0} />
      </UiEntity>
      {won && pub.rewards ? (
        <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
          <Img k="spoils" w={30} tint={gold} margin={6} />
          <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center' }}>
            {pub.rewards.map((reward, i) => {
              const seat = pub.seats.find((entry) => entry.address === reward.address)
              return (
                <UiEntity key={i} uiTransform={{ width: 96, flexDirection: 'row', alignItems: 'center', margin: 4 }}>
                  <NameTag name={seat?.name ?? reward.address.slice(0, 6)} w={16} tint={cream} />
                  <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: { left: 4 } }}>
                    <Img k="icon-coins" w={22} tint={Color4.White()} margin={1} />
                    <Digits value={reward.coins} w={16} tint={gold} />
                  </UiEntity>
                  <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: { left: 4 } }}>
                    <Img k="xp" w={22} tint={cream} margin={1} />
                    <Gain value={reward.xp} w={14} tint={gold} />
                  </UiEntity>
                  {reward.dropDefId ? <Face id={reward.dropDefId} w={54} h={54} /> : null}
                </UiEntity>
              )
            })}
          </UiEntity>
        </UiEntity>
      ) : null}
      {mine?.dropDefId ? (
        <UiEntity uiTransform={{ width: 120, height: '100%', alignItems: 'center', justifyContent: 'center', flexDirection: 'row' }}>
          <Face id={mine.dropDefId} w={104} h={104} />
        </UiEntity>
      ) : null}
      <UiEntity uiTransform={{ width: 60, height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <NameTag name={'continue'} w={14} tint={muted} />
      </UiEntity>
    </UiEntity>
  )
}

function RiftScreen() {
  const pub = riftView.pub
  return (
    <UiEntity
      uiTransform={{ width: '100%', height: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
    >
      <MpBackdrop k="map-rift" />
      {pub.phase === 'lobby' ? <RiftLobby /> : pub.phase === 'battle' ? <RiftBattle /> : <RiftEnd />}
    </UiEntity>
  )
}

function charArt(id: string) {
  return LABELS[`char-${id}`] ?? LABELS['char-ash-hound'] ?? LABELS['char-foe-ogre']
}

function Face(props: {
  id: string
  w: number | `${number}%`
  h?: number | `${number}%`
  fallback?: number
  tint?: Color4
  margin?: { left?: number; top?: number; right?: number; bottom?: number }
}) {
  const sheet = idlePoster(props.id)
  const art = !sheet ? charArt(props.id) : undefined
  if (!sheet && !art) return props.fallback ? <Img k={props.id} w={props.fallback} /> : null
  return (
    <UiEntity
      uiTransform={{ width: props.w, height: props.h ?? props.w, margin: props.margin }}
      uiBackground={{
        textureMode: 'stretch',
        texture: { src: sheet ? sheet.src : art!.src },
        uvs: sheet ? sheet.uvs : undefined,
        color: props.tint ?? Color4.White()
      }}
    />
  )
}

function ArenaPoster(props: {
  src: string
  uvs?: number[]
  size: number
  grow: number
  nudgeLeft: number
  nudgeTop: number
  dim?: boolean
}) {
  const grow = props.grow
  return (
    <UiEntity uiTransform={{ width: props.size, height: props.size }}>
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: {
            top: -Math.round(grow / 2) + props.nudgeTop,
            left: -Math.round(grow / 2) + props.nudgeLeft
          },
          width: props.size + grow,
          height: props.size + grow
        }}
        uiBackground={{
          textureMode: 'stretch',
          texture: { src: props.src },
          uvs: props.uvs,
          color: props.dim ? muted : Color4.White()
        }}
      />
    </UiEntity>
  )
}

function ArenaHp(props: { unit: BattleUnit; fill: Color4; h?: number; w?: number }) {
  const hp = shownHp(props.unit.uid, props.unit.hp)
  const frac = props.unit.maxHp > 0 ? hp / props.unit.maxHp : 0
  const barH = props.h ?? 200
  const barW = props.w ?? 22
  const dead = hp <= 0
  return (
    // 'row' stacks physically top-to-bottom in the portrait grip: the bar
    // group first, the level tag physically underneath it.
    <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', margin: 4 }}>
      <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center' }}>
        <FillBar frac={frac} w={barW} h={barH} fill={dead ? muted : props.fill} />
        <Digits value={Math.max(0, hp)} w={Math.max(14, Math.round(barW * 0.85))} tint={dead ? muted : cream} />
      </UiEntity>
      {props.unit.level ? (
        <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: { left: 4 } }}>
          <NameTag name={`lv${props.unit.level}`} w={Math.max(13, Math.round(barW * 0.8))} tint={dead ? muted : gold} />
        </UiEntity>
      ) : null}
    </UiEntity>
  )
}

function SkillFlash(props: { uid: string; size: number }) {
  const kind = unitSkillFx(props.uid)
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 0, left: 0 },
        width: props.size,
        height: props.size
      }}
    >
      {SKILL_FX_KINDS.map((k) => (
        <UiEntity
          key={k}
          uiTransform={{
            positionType: 'absolute',
            width: '100%',
            height: '100%'
          }}
          uiBackground={{
            textureMode: 'stretch',
            texture: { src: SKILL_FX_SRC[k] },
            uvs: skillFxUvs(),
            color: kind === k ? Color4.White() : Color4.create(1, 1, 1, 0)
          }}
        />
      ))}
    </UiEntity>
  )
}

function DmgPopLayer(props: { uid: string; incoming: boolean }) {
  const hits = dmgPops().filter((pop) => pop.uid === props.uid)
  if (!hits.length) return null
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 0, left: 0 },
        width: '100%',
        height: '100%'
      }}
    >
      {hits.map((pop) => {
        const fade = Math.max(0, 1 - pop.t * pop.t)
        const punch = Math.max(0, 1 - pop.t * 2.4)
        const lift = -Math.round(120 * pop.t)
        const sway = ((pop.id % 3) - 1) * 26
        const w = Math.round(52 + 16 * punch)
        const tint = props.incoming
          ? Color4.create(1, 0.18, 0.08, fade)
          : Color4.create(1, 0.96, 0.22, fade)
        const outline = Color4.create(0.06, 0.02, 0.03, fade)
        return (
          <UiEntity
            key={pop.id}
            uiTransform={{
              positionType: 'absolute',
              position: { top: 110 + sway, left: 72 + lift },
              padding: 8,
              alignItems: 'center',
              justifyContent: 'center'
            }}
            uiBackground={{ color: Color4.create(0.04, 0.01, 0.02, fade * 0.62) }}
          >
            <UiEntity
              uiTransform={{
                positionType: 'absolute',
                position: { top: 3, left: 3 }
              }}
            >
              <Digits value={pop.amount} w={w} tint={outline} tight />
            </UiEntity>
            <Digits value={pop.amount} w={w} tint={tint} tight />
          </UiEntity>
        )
      })}
    </UiEntity>
  )
}

function rankPosterSize(count: number) {
  if (count <= 1) return 300
  if (count === 2) return 230
  if (count === 3) return 170
  return 140
}

function RankFighter(props: {
  key?: string
  unit: BattleUnit
  count: number
  acting: boolean
  hp: Color4
}) {
  const unit = props.unit
  const dead = shownHp(unit.uid, unit.hp) <= 0
  const size = rankPosterSize(props.count)
  const sheet = heroPoster(unit.defId, props.acting)
  const art = !sheet ? charArt(unit.defId) : undefined
  const face = sheet ?? (art ? { src: art.src } : undefined)
  const idle = props.acting ? idleMotion() : { grow: 0, sway: 0, lift: 0 }
  const hasSheet = !!sheet
  const drive = props.acting && hasSheet ? posterDrive() : 0
  const punch = props.acting && hasSheet ? posterPunch() : 0
  const hit = unitHit(unit.uid)
  const lunge = props.acting && unit.side === 'foe' && !hasSheet ? foeLungeAmt() : 0
  const grow = props.acting
    ? Math.round(18 * punch + idle.grow + Math.max(0, drive) * 0.25 + 14 * lunge - 8 * hit)
    : Math.round(-6 * hit)
  const nudgeLeft =
    unit.side === 'you'
      ? -Math.round(drive) - Math.round(10 * hit) - Math.round(idle.lift)
      : Math.round(drive) + Math.round(22 * lunge) - Math.round(12 * hit)
  const nudgeTop = Math.round(idle.sway) + Math.round(6 * hit)
  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: `${Math.round(100 / Math.max(1, props.count))}%`,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <UiEntity uiTransform={{ width: size, height: size, positionType: 'relative' }}>
        {face ? (
          <ArenaPoster
            src={face.src}
            uvs={'uvs' in face ? face.uvs : undefined}
            size={size}
            grow={grow}
            nudgeLeft={nudgeLeft}
            nudgeTop={nudgeTop}
            dim={dead}
          />
        ) : null}
        <SkillFlash uid={unit.uid} size={size} />
        <DmgPopLayer uid={unit.uid} incoming={unit.side === 'you'} />
      </UiEntity>
      <ArenaHp unit={unit} fill={props.hp} h={Math.round(size * 0.62)} w={size <= 170 ? 14 : 18} />
    </UiEntity>
  )
}

function BattleRank(props: { units: BattleUnit[]; actingUid: string; hp: Color4 }) {
  return (
    <UiEntity
      uiTransform={{
        width: 430,
        height: '100%',
        flexDirection: 'column-reverse',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      {props.units.map((unit) => (
        <RankFighter
          key={unit.uid}
          unit={unit}
          count={props.units.length}
          acting={unit.uid === props.actingUid}
          hp={props.hp}
        />
      ))}
    </UiEntity>
  )
}

function clashFloor() {
  const roadId = game.run?.roadId ?? 'q1'
  return LABELS[`map-clash-${roadId}`] ?? LABELS['map-cave']
}

function BattleField(props: { children?: ReactEcs.JSX.Component[] | ReactEcs.JSX.Component }) {
  const floor = clashFloor()
  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%',
        flexDirection: 'row',
        alignItems: 'stretch'
      }}
    >
      {floor ? (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 0, left: 0 },
            width: '100%',
            height: '100%'
          }}
          uiBackground={{
            textureMode: 'stretch',
            texture: { src: floor.src },
            color: Color4.White()
          }}
        />
      ) : null}
      {props.children}
    </UiEntity>
  )
}

function BattleScreen() {
  const b = game.battle
  if (!b) return null
  const floor = game.run?.floor ?? 0
  return (
    <BattleField>
      <BattleRank units={b.foe} actingUid={b.actingUid} hp={danger} />
      <UiEntity
        uiTransform={{
          width: 70,
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {floor > 0 ? (
          <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center' }}>
            <Digits value={floor} w={20} tint={gold} />
            <UiEntity uiTransform={{ height: 8 }} />
            <Stars count={game.run?.star ?? 1} w={11} />
          </UiEntity>
        ) : (
          <Img k="the-clash" w={36} tint={gold} />
        )}
      </UiEntity>
      <BattleRank units={b.you} actingUid={b.actingUid} hp={good} />
      <UiEntity
        uiTransform={{
          width: 80,
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        onMouseDown={() => skipBattle()}
      >
        <Plate k="skip" w={52} h={180} onTap={() => skipBattle()} />
      </UiEntity>
      {/* oathkin nearby: their presence bonus, pinned to the physical bottom */}
      {b.kin && b.kinCoins ? (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { right: 16, top: '38%' },
            flexDirection: 'column-reverse',
            alignItems: 'center',
            pointerFilter: 'none'
          }}
        >
          <Img k="oathkin-bonus" w={16} tint={gold} margin={3} />
          <Img k="icon-coins" w={20} tint={Color4.White()} margin={2} />
          <Gain value={b.kinCoins} w={16} tint={gold} />
        </UiEntity>
      ) : null}
      {/* game logo pushed up past the chrome inset, same as the home screen */}
      {LABELS['boot-logo'] ? (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { left: -185, top: 0 },
            width: 170,
            height: '100%',
            alignItems: 'center',
            justifyContent: 'center',
            pointerFilter: 'none'
          }}
        >
          <UiEntity
            uiTransform={{ width: 160, height: 320, pointerFilter: 'none' }}
            uiBackground={{ textureMode: 'stretch', texture: { src: LABELS['boot-logo'].src }, color: Color4.White() }}
          />
        </UiEntity>
      ) : null}
    </BattleField>
  )
}

function BannerScreen() {
  const b = game.battle
  if (!b || !b.winner) return null
  const win = b.winner === 'you'
  return (
    <BattleField>
      <UiEntity
        uiTransform={{
          width: '100%',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        onMouseDown={() => {
          advanceBanner()
          lockNav()
        }}
      >
        <Plate
          k={win ? 'win' : 'lose'}
          w={300}
          h={620}
          onTap={() => {
            advanceBanner()
            lockNav()
          }}
        />
        {/* physically below the banner: same continue plaque as the report */}
        <UiEntity uiTransform={{ margin: { left: 110 }, pointerFilter: 'none' }}>
          <Plate k="continue" w={56} h={240} />
        </UiEntity>
      </UiEntity>
    </BattleField>
  )
}

function RewardCol(props: {
  children?: ReactEcs.JSX.Component[] | ReactEcs.JSX.Component
  width?: number
}) {
  return (
    <UiEntity
      uiTransform={{
        width: props.width ?? 140,
        height: '100%',
        flexDirection: 'column-reverse',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 8
      }}
    >
      {props.children}
    </UiEntity>
  )
}

function MiniPips(props: { here: number }) {
  const marks = [] as number[]
  for (let i = 1; i <= FLOORS; i++) marks.push(i)
  return (
    <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: 4 }}>
      {marks.map((n) => {
        const here = n === props.here
        const size = here || n === FLOORS ? 11 : 7
        return (
          <UiEntity
            key={n}
            uiTransform={{ width: size, height: size, margin: 2 }}
            uiBackground={{ color: here || n === FLOORS ? gold : muted }}
          />
        )
      })}
    </UiEntity>
  )
}

function xpStatGain(line: XpLine) {
  return {
    hp: line.levels * 3,
    atk: Math.max(1, Math.floor(line.levelAfter * 1.2) - Math.floor(line.levelBefore * 1.2))
  }
}

function XpRow(props: { line: XpLine; solo?: boolean; key?: string }) {
  const fx = reportFx(props.line)
  const burst = fx.burst
  const gain = xpStatGain(props.line)
  const solo = !!props.solo
  const face = solo ? 110 + Math.round(14 * burst) : 72 + Math.round(10 * burst)
  const tint = burst > 0 ? Color4.create(1, 0.88 + 0.12 * burst, 0.6 + 0.4 * burst, 1) : Color4.White()
  return (
    <UiEntity
      uiTransform={{
        width: solo ? 280 : 108,
        height: '100%',
        flexDirection: solo ? 'row' : 'column-reverse',
        alignItems: 'center',
        justifyContent: 'center',
        padding: solo ? 8 : 4
      }}
    >
      <Face
        id={props.line.defId}
        w={face}
        h={face}
        tint={tint}
        margin={solo ? { left: 6 } : undefined}
      />
      <UiEntity
        uiTransform={{
          flexDirection: 'column-reverse',
          alignItems: 'center',
          margin: solo ? { left: 8, right: 8 } : { top: 4, bottom: 4 }
        }}
      >
        {fx.showSeal ? <Img k="icon-level" w={Math.round((solo ? 48 : 40) + (solo ? 14 : 12) * burst)} tint={Color4.White()} /> : null}
        <Img k="level" w={Math.round((solo ? 44 : 40) + (solo ? 8 : 6) * burst)} tint={fx.showSeal ? gold : cream} />
        <Digits value={fx.level} w={Math.round((solo ? 56 : 48) + (solo ? 10 : 8) * burst)} tint={fx.showSeal ? gold : cream} tight />
      </UiEntity>
      <FillBar
        frac={fx.bar}
        w={solo ? 24 : 22}
        h={solo ? 220 : 170}
        fill={burst > 0.15 ? gold : Color4.create(0.25, 0.45, 0.75, 1)}
      />
      {fx.showStats && gain.hp > 0 ? (
        <UiEntity
          uiTransform={{
            flexDirection: 'column-reverse',
            alignItems: 'center',
            margin: solo ? { left: 12 } : { top: 6 }
          }}
        >
          <Img k="hp" w={solo ? 36 : 32} tint={good} />
          <Digits value={gain.hp} w={solo ? 44 : 36} tint={good} tight />
          <Img k="atk" w={solo ? 36 : 32} tint={gold} />
          <Digits value={gain.atk} w={solo ? 44 : 36} tint={gold} tight />
        </UiEntity>
      ) : null}
    </UiEntity>
  )
}

function ReportScreen() {
  const b = game.battle
  if (!b || !b.winner) return null
  const win = b.winner === 'you'
  const floor = game.run?.floor ?? 0
  const cave = LABELS['map-cave']
  const coinGain = win ? b.coins : 0
  const lines = game.xpLines
  const fxXp = lines[0] ? reportFx(lines[0]).xp : game.lastXp
  const dismiss = () => {
    leaveResult()
    lockNav()
  }
  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      onMouseDown={dismiss}
    >
      {cave ? (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 0, left: 0 },
            width: '100%',
            height: '100%'
          }}
          uiBackground={{
            textureMode: 'stretch',
            texture: { src: cave.src },
            color: Color4.create(0.35, 0.3, 0.32, 1)
          }}
        />
      ) : null}
      <RewardCol width={200}>
        <Plate k={win ? 'win' : 'lose'} w={180} h={440} />
      </RewardCol>
      <RewardCol width={140}>
        <Img k="xp" w={88} tint={Color4.White()} />
        <Gain value={fxXp} w={56} tint={gold} />
      </RewardCol>
      {lines.length === 1 ? (
        <XpRow line={lines[0]} solo />
      ) : (
        lines.map((line) => <XpRow key={line.uid} line={line} />)
      )}
      <RewardCol width={160}>
        <Img k="icon-coins" w={64} tint={Color4.White()} />
        <Digits value={coinGain} w={56} tint={gold} tight />
        <Img k="coins" w={40} tint={muted} />
        {win && b.kin && b.kinCoins ? (
          <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: { top: 14 } }}>
            <Img k="oathkin-bonus" w={22} tint={gold} margin={3} />
            <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center' }}>
              <Gain value={b.kinCoins} w={26} tint={gold} />
              <UiEntity uiTransform={{ height: 6 }} />
              <NameTag name={`x${b.kin}`} w={20} tint={cream} />
            </UiEntity>
          </UiEntity>
        ) : null}
      </RewardCol>
      {floor > 0 ? (
        <RewardCol width={130}>
          <Img k="the-road" w={48} tint={gold} />
          <Digits value={floor} w={48} tint={gold} tight />
          <MiniPips here={floor} />
        </RewardCol>
      ) : null}
      {game.ascendedStar > 0 ? (
        <RewardCol width={120}>
          <Img k="road-ascends" w={22} tint={gold} />
          <Stars count={game.ascendedStar} w={18} />
          {game.oathStar > 0 ? (
            <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: { top: 12 } }}>
              <Img k="oath-ascends" w={18} tint={cream} />
              <Stars count={game.oathStar} w={13} />
            </UiEntity>
          ) : null}
        </RewardCol>
      ) : null}
      <UiEntity
        uiTransform={{
          width: 110,
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Plate k="continue" w={64} h={280} />
      </UiEntity>
    </UiEntity>
  )
}

function PlaqueLine(props: { children?: ReactEcs.JSX.Component[] | ReactEcs.JSX.Component }) {
  return (
    <UiEntity
      uiTransform={{
        width: '20%',
        height: '100%',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        padding: { top: 20 }
      }}
    >
      {props.children}
    </UiEntity>
  )
}

function CardBtn(props: { k: string; w: number; onTap?: () => void }) {
  return (
    <UiEntity
      uiTransform={{
        width: props.w,
        height: props.w,
        alignItems: 'center',
        justifyContent: 'center'
      }}
      onMouseDown={props.onTap}
    >
      <Img k={props.k} w={props.w} tint={Color4.White()} margin={0} />
    </UiEntity>
  )
}

/** Full hero card: hall, face, plaque. BACK lives in ScreenChrome. */
function HeroCardScreen() {
  const owned = findOwned(game.inspectUid)
  if (!owned) return null
  const def = getDef(owned.defId)
  const revealing = !!game.reveal
  const fx = revealFx(def.rarity)
  return revealing && !fx.ready ? <HeroCardReveal owned={owned} fx={fx} /> : <HeroCardBody owned={owned} />
}

function RevealSwirl(props: { rarity: Rarity; scale: number }) {
  const uvs = revealBurstUvs(props.rarity)
  if (!uvs) return null
  const pad = -((props.scale - 1) / 2) * 100
  const box = `${props.scale * 100}%` as `${number}%`
  const inset = `${pad}%` as `${number}%`
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: inset, left: inset },
        width: box,
        height: box,
        pointerFilter: 'none'
      }}
      uiBackground={{
        textureMode: 'stretch',
        texture: { src: revealBurstSheet() },
        uvs,
        color: Color4.White()
      }}
    />
  )
}

function HeroCardReveal(props: {
  owned: OwnedFamiliar
  fx: ReturnType<typeof revealFx>
}) {
  const back = cardBackArt()
  const fx = props.fx
  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%'
      }}
      onMouseDown={() => skipReveal()}
    >
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { top: 0, left: 0 },
          width: '100%',
          height: '100%',
          pointerFilter: 'none'
        }}
        uiBackground={{ color: Color4.create(0.02, 0.01, 0.02, 0.72 + fx.glow * 0.12) }}
      />
      {fx.showBurst ? <RevealSwirl rarity={getDef(props.owned.defId).rarity} scale={fx.rayScale} /> : null}
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { top: `${fx.top}%`, left: `${fx.left}%` },
          width: `${fx.w}%`,
          height: `${fx.h}%`,
          pointerFilter: 'none'
        }}
      >
        {fx.showFace ? (
          <HeroCardBody owned={props.owned} swirl={false} />
        ) : (
          <UiEntity
            uiTransform={{ width: '100%', height: '100%' }}
            uiBackground={{
              textureMode: 'stretch',
              texture: { src: back.src },
              color: Color4.create(1, 0.92 + fx.glow * 0.08, 0.7 + fx.glow * 0.3, 1)
            }}
          />
        )}
      </UiEntity>
      {fx.flash > 0.02 ? (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 0, left: 0 },
            width: '100%',
            height: '100%',
            pointerFilter: 'none'
          }}
          uiBackground={{ color: Color4.create(1, 0.88, 0.45, fx.flash * 0.5) }}
        />
      ) : null}
    </UiEntity>
  )
}

function HeroCardBody(props: { owned: OwnedFamiliar; swirl?: boolean }) {
  const owned = props.owned
  const def = getDef(owned.defId)
  const stats = statsOf(owned)
  const hall = hallArt(owned.defId)
  const xp = xpProgress(owned)
  const plaque = LABELS['plaque-stats']
  const seated = game.party.includes(owned.uid)
  const fx = revealFx(def.rarity)
  const swirl = props.swirl !== false && !!game.reveal && fx.showBurst
  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%',
        flexDirection: 'row',
        alignItems: 'center'
      }}
    >
      {hall ? (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 0, left: 0 },
            width: '100%',
            height: '100%',
            pointerFilter: 'none'
          }}
          uiBackground={{
            textureMode: 'stretch',
            texture: { src: hall.src },
            color: Color4.White()
          }}
        />
      ) : null}
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { top: 0, left: 0 },
          width: '100%',
          height: '100%',
          pointerFilter: 'none'
        }}
        uiBackground={{ color: Color4.create(0.04, 0.02, 0.03, 0.28) }}
      />
      {swirl ? <RevealSwirl rarity={def.rarity} scale={fx.rayScale} /> : null}

      <UiEntity uiTransform={{ width: 140, height: '100%' }}>
        <UiEntity
          uiTransform={{
            width: '100%',
            height: '100%',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            pointerFilter: 'none'
          }}
        >
          <Img k={def.rarity} w={28} tint={gold} />
          <Img k={owned.defId} w={44} tint={cream} />
          <Stars count={owned.stars} w={18} burst={!!game.reveal} />
          {seated ? <Img k="oath" w={16} tint={gold} /> : null}
        </UiEntity>
      </UiEntity>

      <UiEntity
        uiTransform={{
          flexGrow: 1,
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Face id={owned.defId} w={560} h={560} fallback={72} margin={{ left: -80 }} />
      </UiEntity>

      <UiEntity
        uiTransform={{
          width: 360,
          height: '92%',
          flexDirection: 'row',
          alignItems: 'stretch',
          margin: { right: 32 },
          padding: { top: 28, bottom: 28, left: 20, right: 20 }
        }}
        uiBackground={
          plaque
            ? { textureMode: 'stretch', texture: { src: plaque.src }, color: Color4.White() }
            : { color: panelDim }
        }
      >
        <PlaqueLine>
          <Stat value={stats.hp} word="hp" tint={cream} w={36} wordFirst />
        </PlaqueLine>
        <PlaqueLine>
          <Stat value={stats.atk} word="atk" tint={cream} w={36} wordFirst />
        </PlaqueLine>
        <PlaqueLine>
          <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center' }}>
            <Img k={def.role} w={30} tint={cream} />
            <Img k={def.skill} w={30} tint={gold} margin={4} />
          </UiEntity>
        </PlaqueLine>
        <PlaqueLine>
          <Stat value={owned.level} word="level" tint={gold} w={36} wordFirst />
        </PlaqueLine>
        <UiEntity
          uiTransform={{
            width: '20%',
            height: '100%',
            flexDirection: 'column',
            alignItems: 'center'
          }}
        >
          <UiEntity
            uiTransform={{
              width: 16,
              flexGrow: 1,
              flexDirection: 'column-reverse',
              margin: { top: 18 }
            }}
            uiBackground={{ color: Color4.create(0.05, 0.03, 0.03, 0.9) }}
          >
            <UiEntity
              uiTransform={{
                width: '100%',
                height: `${Math.min(100, Math.round(xp.frac * 100))}%`
              }}
              uiBackground={{ color: Color4.create(0.86, 0.55, 0.18, 1) }}
            />
          </UiEntity>
          <UiEntity uiTransform={{ width: 16, height: 136 }} />
        </UiEntity>
      </UiEntity>
    </UiEntity>
  )
}

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

function Plate(props: { k: string; w: number; h: number; onTap?: () => void }) {
  const info = LABELS[props.k]
  if (!info) return null
  return (
    <UiEntity
      uiTransform={{
        width: props.w,
        height: props.h,
        alignItems: 'center',
        justifyContent: 'center',
        margin: 4
      }}
      uiBackground={{
        textureMode: 'stretch',
        texture: { src: info.src },
        color: Color4.White()
      }}
      onMouseDown={tap(props.onTap)}
    />
  )
}

function StartScreen() {
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
      {hall ? (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 0, left: 0 },
            width: '100%',
            height: '100%'
          }}
          uiBackground={{
            textureMode: 'stretch',
            texture: { src: hall.src },
            color: Color4.White()
          }}
        />
      ) : null}
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

// ---- boot ---------------------------------------------------------------------

function PreloadTiles() {
  // During the boot bar only the critical set binds, so bandwidth goes to
  // what the start screen needs. Once the bar fills (player is reading the
  // oath screen) the rest of the tiles mount and warm the remaining sheets.
  const srcs = boot.filled ? PRELOAD_SRCS : CRITICAL_SRCS
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: -6, left: -6 },
        width: 2,
        height: 2
      }}
    >
      {srcs.map((src) => (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            width: 2,
            height: 2
          }}
          uiBackground={{
            textureMode: 'stretch',
            texture: { src },
            color: Color4.White()
          }}
        />
      ))}
    </UiEntity>
  )
}

// Runic gold ring (texture) with eight ember dots chasing around its band and
// the live load percent in the middle. DCL UI has no rotation transform, so the
// spin is faked with per-dot alpha phase.
function Spinner(props: {
  size: number
  tint: Color4
  fade: Color4
  percent: number
}) {
  const n = 8
  const s = props.size
  const dot = Math.max(6, Math.round(s * 0.1))
  // dots ride the dark band of the ring art (band radius = 118/320 of the image)
  const r = s * (118 / 320)
  const t = (Date.now() % 900) / 900
  const dots: ReactEcs.JSX.Element[] = []
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2
    const phase = (1 + i / n - t) % 1
    const a = 0.1 + 0.9 * (1 - phase)
    dots.push(
      <UiEntity
        key={i}
        uiTransform={{
          positionType: 'absolute',
          position: {
            top: Math.round(s / 2 + Math.sin(ang) * r - dot / 2),
            left: Math.round(s / 2 + Math.cos(ang) * r - dot / 2)
          },
          width: dot,
          height: dot
        }}
        uiBackground={{
          color: Color4.create(props.tint.r, props.tint.g, props.tint.b, a)
        }}
      />
    )
  }
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: (540 - s) / 2, left: -(s + 18) },
        width: s,
        height: s,
        alignItems: 'center',
        justifyContent: 'center',
        ...PASS
      }}
    >
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { top: 0, left: 0 },
          width: s,
          height: s
        }}
        uiBackground={{
          textureMode: 'stretch',
          texture: { src: 'images/boot/spin-ring-a.png' },
          color: props.fade
        }}
      />
      {dots}
      <Digits value={props.percent} w={20} tint={props.tint} tight={true} />
    </UiEntity>
  )
}

// Eased display progress so the bar glides instead of jumping chunk to chunk.
let shownFrac = 0
let shownTick = 0

function LoadingScreen() {
  // Real fetch progress, capped by the minimum-hold ramp: locally everything is
  // cached so raw progress is instantly 100%; the gate keeps the bar sweeping.
  const rawFrac = boot.total > 0 ? boot.loaded / boot.total : 0
  const frac = Math.min(rawFrac, boot.gate)
  const now = Date.now()
  const dt = Math.min(0.1, (now - (shownTick || now)) / 1000)
  shownTick = now
  shownFrac += (frac - shownFrac) * Math.min(1, dt * 9)
  const keyart = LABELS['boot-keyart']
  const logo = LABELS['boot-logo']
  const startBtn = LABELS['boot-start']
  const ember = Color4.create(0.96, 0.72, 0.28, 1)
  // Unbound textures render as the tint color (white), so hold the art at black
  // until its file has landed, then fade up. Kills the white flash at boot.
  const fade = boot.artAt ? Math.min(1, (Date.now() - boot.artAt) / 500) : 0
  const artTint = Color4.create(fade, fade, fade, 1)
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 0, left: 0 },
        width: '100%',
        height: '100%'
      }}
      uiBackground={{ color: ink }}
    >
      {keyart ? (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 0, left: 0 },
            width: '100%',
            height: '100%'
          }}
          uiBackground={{
            textureMode: 'stretch',
            texture: { src: keyart.src },
            color: artTint
          }}
        />
      ) : null}
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { top: 0, left: 0 },
          width: '100%',
          height: '100%'
        }}
        uiBackground={{ color: Color4.create(0.02, 0.01, 0.02, 0.34) }}
      />
      {logo ? (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 70, left: 150 },
            width: 300,
            height: 600
          }}
          uiBackground={{
            textureMode: 'stretch',
            texture: { src: logo.src },
            color: artTint
          }}
        />
      ) : null}
      {boot.filled && startBtn ? (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 160, left: 1180 },
            width: 150,
            height: 400
          }}
          uiBackground={{
            textureMode: 'stretch',
            texture: { src: startBtn.src },
            color: Color4.White()
          }}
          onMouseDown={tap(() => enterGame())}
        />
      ) : (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 90, left: 1252 },
            width: 96,
            height: 540,
            ...PASS
          }}
        >
          <UiEntity
            uiTransform={{
              positionType: 'absolute',
              position: { top: 0, left: 16 },
              width: 64,
              height: 540
            }}
            uiBackground={{
              textureMode: 'stretch',
              texture: { src: 'images/boot/bar-frame-a.png' },
              color: artTint
            }}
          />
          {(() => {
            // frame art has a 16-virtual-px inset to its glass track
            const trackH = 540 - 32
            const hFill = Math.max(0, Math.min(trackH, Math.round(shownFrac * trackH)))
            const tipY = 16 + (trackH - hFill)
            const pulse = 0.62 + 0.38 * Math.sin(Date.now() / 160)
            return (
              <UiEntity uiTransform={{ width: '100%', height: '100%', ...PASS }}>
                {hFill > 2 ? (
                  <UiEntity
                    uiTransform={{
                      positionType: 'absolute',
                      position: { top: tipY, left: 32 },
                      width: 32,
                      height: hFill
                    }}
                    uiBackground={{
                      textureMode: 'stretch',
                      texture: { src: 'images/boot/bar-fill-a.png' },
                      color: artTint
                    }}
                  />
                ) : null}
                <UiEntity
                  uiTransform={{
                    positionType: 'absolute',
                    position: { top: tipY - 28, left: 20 },
                    width: 56,
                    height: 56
                  }}
                  uiBackground={{
                    textureMode: 'stretch',
                    texture: { src: 'images/boot/bar-head-a.png' },
                    color: Color4.create(1, 1, 1, pulse * fade)
                  }}
                />
              </UiEntity>
            )
          })()}
          <Spinner
            size={120}
            tint={ember}
            fade={artTint}
            percent={Math.round(shownFrac * 100)}
          />
        </UiEntity>
      )}
      {boot.filled && LABELS['version'] ? (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 328, left: 1340 },
            width: 22,
            height: 64
          }}
          uiBackground={{
            textureMode: 'stretch',
            texture: { src: LABELS['version'].src },
            color: Color4.create(1, 1, 1, 0.55)
          }}
        />
      ) : null}
    </UiEntity>
  )
}

// ---- root ---------------------------------------------------------------------

// Solid black cover over the whole screen at boot; holds until the boot art has
// downloaded, then dissolves. Gives the fade-from-black entry instead of any flash.
function BootFade() {
  // Long enough to outlast the explorer's own loading curtain, so the player
  // actually sees the tail of the fade when the scene is revealed.
  const HOLD_MS = 600
  const FADE_MS = 1800
  const since = boot.artAt ? Date.now() - boot.artAt - HOLD_MS : 0
  const alpha = boot.artAt ? 1 - Math.min(1, Math.max(0, since) / FADE_MS) : 1
  if (alpha <= 0) return null
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 0, left: 0 },
        width: '100%',
        height: '100%',
        ...PASS
      }}
      uiBackground={{ color: Color4.create(0, 0, 0, alpha) }}
    />
  )
}

// Quick dip-to-black on every phase change: the screen swap happens behind a
// black cover that then fades out, so cuts read as transitions and any late
// texture binds on the incoming screen are hidden.
let lastPhase = ''
let phaseAt = 0

function PhaseFade() {
  if (game.phase !== lastPhase) {
    // First phase after boot arrives under BootFade; no extra dip for it.
    phaseAt = lastPhase === '' ? 0 : Date.now()
    lastPhase = game.phase
  }
  const FADE_MS = 400
  const alpha = phaseAt ? 1 - Math.min(1, (Date.now() - phaseAt) / FADE_MS) : 0
  if (alpha <= 0) return null
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 0, left: 0 },
        width: '100%',
        height: '100%',
        ...PASS
      }}
      uiBackground={{ color: Color4.create(0, 0, 0, alpha) }}
    />
  )
}

const AD_SRCS = ['images/ads/koa-b.png', 'images/ads/decentracraft-b.png']
const AD_ROTATE_MS = 8000

/** Fake 2010 mobile banner on the physical bottom (virtual-canvas right gutter). */
function AdBanner() {
  if (!DEBUG.showAds) return null
  const src = AD_SRCS[Math.floor(Date.now() / AD_ROTATE_MS) % AD_SRCS.length]
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { left: 1484, top: 0 },
        width: 116,
        height: 720,
        pointerFilter: 'none'
      }}
      uiBackground={{
        textureMode: 'stretch',
        texture: { src },
        color: Color4.White()
      }}
    />
  )
}

function Root() {
  if (!boot.ready) {
    return (
      <UiEntity uiTransform={{ width: '100%', height: '100%' }}>
        <PreloadTiles />
        <LoadingScreen />
        <BootFade />
      </UiEntity>
    )
  }
  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%'
      }}
    >
      <UiEntity
        uiTransform={{
          width: '78%',
          maxWidth: '78%',
          height: '100%',
          margin: { left: '11%' },
          flexDirection: 'row',
          alignItems: 'center',
          ...PASS
        }}
      >
        <ScreenChrome>
          {game.phase === 'start' ? <StartScreen /> : null}
          {game.phase === 'home' ? <HomeScreen /> : null}
          {game.phase === 'quest' ? <QuestScreen /> : null}
          {game.phase === 'levels' ? <LevelsScreen /> : null}
          {game.phase === 'party' ? <PartyScreen /> : null}
          {game.phase === 'fuse' ? <FuseScreen /> : null}
          {game.phase === 'shop' ? <ShopScreen /> : null}
          {game.phase === 'allies' ? <AlliesScreen /> : null}
          {game.phase === 'battle' ? <BattleScreen /> : null}
          {game.phase === 'banner' ? <BannerScreen /> : null}
          {game.phase === 'report' ? <ReportScreen /> : null}
          {game.phase === 'heroCard' ? <HeroCardScreen /> : null}
          {game.phase === 'trade' ? <TradeScreen /> : null}
          {game.phase === 'rift' ? <RiftScreen /> : null}
          {game.phase === 'settings' ? <SettingsScreen /> : null}
          {game.phase === 'festival' ? <FestivalScreen /> : null}
          <TradeInviteToast />
          <GiftCeremony />
        </ScreenChrome>
      </UiEntity>
      {DEBUG.showPlayHud ? <PlayHud /> : null}
      <AdBanner />
      <PreloadTiles />
      <PhaseFade />
    </UiEntity>
  )
}

export function setupUi() {
  // Virtual canvas is the DCL landscape frame; the UI itself stays portrait-grip
  // (columns left-to-right = physical top-to-bottom). 1600x720 is the mobile
  // default and is not 16:9, so the client will not remap it. screenInset 'none'
  // keeps the same edge-to-edge positions we already tuned.
  startPreload()
  ReactEcsRenderer.setUiRenderer(Root, {
    virtualWidth: 1600,
    virtualHeight: 720,
    screenInset: 'none'
  })
}
