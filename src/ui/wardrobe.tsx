import { Color4 } from '@dcl/sdk/math'
import ReactEcs from '@dcl/sdk/react-ecs'
import { UiEntity } from './ui'
import { playClick, tap } from '../game/audio'
import { lockNav } from '../game/nav'
import { game } from '../game/store'
import { myAvatarLook, myLook } from '../mp/looks'
import { ARMORS, HAIR_COLORS, LookChoice, OUTFITS, rgbOfHex, SKIN_TONES } from '../mp/protocol'
import { wardrobe, WardrobeTab } from '../mp/views'
import { AvatarBust } from './avatar'
import { press, pressShrink, pressTint } from './fx/press'
import './labels.feed.gen'
import './labels.wardrobe.gen'
import { LABELS } from './labels.gen'
import { AcceptDecline } from './panels'
import { danger, gold, muted } from './theme'
import { btnDark, Digits, Img, LabelBtn, MpBackdrop } from './widgets'

// ---- the tailor's rack ------------------------------------------------------------
//
// The wardrobe behind the tailor in the weaver's cottage (owdefs 'hut-weaver',
// talk 'tailor' -> then 'wardrobe'), also one tap from settings. Three pages
// along the physical top: COLORS (skin, hair, hair length), CLOTHES (the
// tunic dyes) and ARMOR (suits bought with coins, worn over the tunic).
// Everything is a pick into game.look, which lives in the save and is
// published by the server, so the map, seat plates, hall rows and feed lines
// all draw the same walker (mp/looks.ts). Bought suits live in game.armory.
//
// Sizes: the chrome well is ~1230 canvas units along x (phone-tall) by ~648
// along y (phone-wide); the panels fill most of it so the figures read.

const plate = Color4.create(0.05, 0.03, 0.04, 0.72)
const tabDark = Color4.create(0.06, 0.04, 0.05, 0.7)
const tabLit = Color4.create(0.28, 0.17, 0.06, 0.85)
const swatchDark = Color4.create(0.05, 0.03, 0.04, 0.85)

/** Panel extent along y (phone-wide). */
const PANEL_H = 640

function colorOfHex(hex: string): Color4 {
  const c = rgbOfHex(hex)
  return c ? Color4.create(c.r, c.g, c.b, 1) : Color4.White()
}

/** Current pick, or one seeded from the avatar read, ready to patch. */
function currentPick(): LookChoice {
  if (game.look) return game.look
  const seen = myAvatarLook()
  return {
    skin: SKIN_TONES[seen.skin] ?? SKIN_TONES[1],
    hair: HAIR_COLORS[seen.hair] ?? HAIR_COLORS[2],
    body: seen.body
  }
}

function patch(delta: Partial<LookChoice>) {
  game.look = { ...currentPick(), ...delta }
}

// ---- tabs ----

const TAB_W = 96 // phone-tall
const TAB_H = 200 // phone-wide

function Tab(props: { key?: string; page: WardrobeTab }) {
  const live = wardrobe.tab === props.page
  const id = `wardrobe:tab-${props.page}`
  return (
    <UiEntity
      uiTransform={{ width: TAB_W, height: TAB_H, margin: { top: 6, bottom: 6 }, flexDirection: 'row' }}
      onMouseDown={
        live
          ? undefined
          : press(
              id,
              tap(() => {
                wardrobe.tab = props.page
                pendingArmor = 0
              })
            )
      }
    >
      <UiEntity
        uiTransform={{
          flexGrow: 1,
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          pointerFilter: 'none'
        }}
        uiBackground={{ color: pressTint(id, live ? tabLit : tabDark) }}
      >
        <Img k={`tab-${props.page}`} w={38} tint={live ? gold : muted} margin={0} />
      </UiEntity>
      <UiEntity
        uiTransform={{ width: 6, height: '100%', pointerFilter: 'none' }}
        uiBackground={{ color: live ? gold : Color4.create(0, 0, 0, 0) }}
      />
    </UiEntity>
  )
}

function Tabs() {
  return (
    <UiEntity
      uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', justifyContent: 'center', margin: 4 }}
    >
      <Tab key="colors" page="colors" />
      <Tab key="clothes" page="clothes" />
      <Tab key="armor" page="armor" />
    </UiEntity>
  )
}

/** A physical line of things, centered. */
function Line(props: { children?: ReactEcs.JSX.Element | ReactEcs.JSX.Element[]; margin?: number; key?: number }) {
  return (
    <UiEntity
      uiTransform={{
        flexDirection: 'column-reverse',
        alignItems: 'center',
        justifyContent: 'center',
        margin: { top: props.margin ?? 4, bottom: props.margin ?? 4 }
      }}
    >
      {props.children}
    </UiEntity>
  )
}

// ---- COLORS: skin, hair, hair length ----

const SWATCH = 50

function Swatch(props: { hex: string; on: boolean; id: string; onTap: () => void; key?: string }) {
  const shrink = pressShrink(props.id, SWATCH)
  return (
    <UiEntity
      uiTransform={{ width: SWATCH, height: SWATCH, margin: 4, alignItems: 'center', justifyContent: 'center' }}
      onMouseDown={press(props.id, () => {
        playClick()
        props.onTap()
        lockNav(150)
      })}
    >
      <UiEntity
        uiTransform={{
          width: SWATCH - shrink,
          height: SWATCH - shrink,
          pointerFilter: 'none',
          ...(props.on ? { borderWidth: 4, borderColor: gold } : { borderWidth: 1, borderColor: swatchDark })
        }}
        uiBackground={{ color: pressTint(props.id, colorOfHex(props.hex)) }}
      />
    </UiEntity>
  )
}

/** One physical line of the block: label, then the swatches. */
function SwatchLine(props: { label: string; hexes: string[]; picked?: string; set: (hex: string) => void }) {
  return (
    <Line>
      <Img k={props.label} w={24} tint={muted} margin={6} />
      <UiEntity uiTransform={{ width: 8 }} />
      {props.hexes.map((hex) => (
        <Swatch
          key={hex}
          hex={hex}
          on={props.picked === hex}
          id={`look:${props.label}:${hex}`}
          onTap={() => props.set(hex)}
        />
      ))}
    </Line>
  )
}

function ColorsPanel() {
  const pick = game.look
  const look = myLook()
  const body = pick?.body ?? look.body
  return (
    <UiEntity
      uiTransform={{
        width: 560,
        height: PANEL_H,
        margin: 6,
        padding: { top: 12, bottom: 12, left: 10, right: 10 },
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      uiBackground={{ color: plate }}
    >
      {/* the walker as everyone sees it, and the two dyes it wears as chips */}
      <Line>
        <AvatarBust look={look} w={240} margin={4} />
        <UiEntity uiTransform={{ width: 16 }} />
        <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center' }}>
          <UiEntity
            uiTransform={{ width: 40, height: 40, margin: 3 }}
            uiBackground={{ color: colorOfHex(SKIN_TONES[look.skin] ?? SKIN_TONES[1]) }}
          />
          <UiEntity
            uiTransform={{ width: 40, height: 40, margin: 3 }}
            uiBackground={{ color: colorOfHex(HAIR_COLORS[look.hair] ?? HAIR_COLORS[2]) }}
          />
        </UiEntity>
      </Line>
      <SwatchLine label="look-skin" hexes={SKIN_TONES} picked={pick?.skin} set={(skin) => patch({ skin })} />
      <SwatchLine label="look-hair" hexes={HAIR_COLORS} picked={pick?.hair} set={(hair) => patch({ hair })} />
      {/* hair length, and the way back to the avatar's own colors */}
      <Line>
        <LabelBtn
          k={body === 'f' ? 'look-long' : 'look-short'}
          id="look:body"
          w={56}
          h={220}
          labelW={26}
          bg={btnDark}
          onTap={() => patch({ body: body === 'f' ? 'm' : 'f' })}
        />
        <UiEntity uiTransform={{ width: 16 }} />
        {pick ? (
          <LabelBtn
            k="look-avatar"
            id="look:avatar"
            w={56}
            h={360}
            labelW={22}
            bg={btnDark}
            onTap={() => {
              game.look = undefined
            }}
          />
        ) : (
          <Img k="look-hint" w={18} tint={muted} margin={6} />
        )}
      </Line>
    </UiEntity>
  )
}

// ---- CLOTHES: the rack ----

const TILE_W = 400 // phone-tall: bust, then its name
const TILE_H = 200 // phone-wide; three to a line
const BUST_W = 260

/** One tunic on the rack: the wearer's own walker in that dye, named. */
function Outfit(props: { key?: number; index: number; worn: number }) {
  const look = myLook()
  const on = props.worn === props.index
  const id = `fit:${props.index}`
  const shrink = pressShrink(id, TILE_W)
  const name = OUTFITS[props.index]?.name ?? ''
  const label = LABELS[name]
  return (
    <UiEntity
      uiTransform={{ width: TILE_W, height: TILE_H, margin: 5, alignItems: 'center', justifyContent: 'center' }}
      onMouseDown={
        on
          ? undefined
          : press(id, () => {
              playClick()
              patch({ outfit: props.index })
              lockNav(150)
            })
      }
    >
      <UiEntity
        uiTransform={{
          width: TILE_W - shrink,
          height: TILE_H - Math.round((shrink * TILE_H) / TILE_W),
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          pointerFilter: 'none',
          ...(on ? { borderWidth: 4, borderColor: gold } : { borderWidth: 1, borderColor: swatchDark })
        }}
        uiBackground={{ color: pressTint(id, on ? tabLit : tabDark) }}
      >
        <AvatarBust look={{ ...look, outfit: props.index }} w={BUST_W} margin={4} />
        {label ? <Img k={name} w={26} tint={on ? gold : muted} margin={6} /> : null}
      </UiEntity>
    </UiEntity>
  )
}

function ClothesPanel() {
  const worn = myLook().outfit
  const rows: number[][] = []
  for (let i = 0; i < OUTFITS.length; i += 3) rows.push(OUTFITS.slice(i, i + 3).map((_, j) => i + j))
  return (
    <UiEntity
      uiTransform={{
        width: 900,
        height: PANEL_H,
        margin: 6,
        padding: { top: 8, bottom: 8, left: 10, right: 10 },
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      uiBackground={{ color: plate }}
    >
      <Img k="fit-hint" w={22} tint={muted} margin={6} />
      {rows.map((row, r) => (
        <Line key={r} margin={2}>
          {row.map((index) => (
            <Outfit key={index} index={index} worn={worn} />
          ))}
        </Line>
      ))}
    </UiEntity>
  )
}

// ---- ARMOR: the stand ----
//
// Suits are bought with coins (client-owned, like packs) into game.armory and
// worn through game.look.armor; the server only publishes a suit the save
// also holds. A tap on an unowned suit arms it; ACCEPT in the header pays.

/** The unowned suit whose price is up in the header (0 = none). */
let pendingArmor = 0

const ARM_TILE_W = 420 // phone-tall: bust, name, then price or status
const ARM_TILE_H = 200 // phone-wide

function owned(id: number): boolean {
  return game.armory.indexOf(id) >= 0
}

function buyArmor(id: number) {
  const suit = ARMORS[id - 1]
  if (!suit || owned(id) || game.coins < suit.cost) return
  game.coins -= suit.cost
  game.armory = [...game.armory, id]
  patch({ armor: id })
}

/** The header line: your purse, or the armed suit's price with ACCEPT / DECLINE. */
function ArmorHeader() {
  const suit = pendingArmor > 0 ? ARMORS[pendingArmor - 1] : undefined
  if (!suit) {
    return (
      <Line>
        <Img k="icon-coins" w={40} tint={Color4.White()} margin={4} />
        <Digits value={game.coins} w={34} tint={gold} />
      </Line>
    )
  }
  const afford = game.coins >= suit.cost
  return (
    <Line>
      <Img k={afford ? 'armor-buy' : 'armor-poor'} w={26} tint={afford ? gold : danger} margin={6} />
      <Img k="icon-coins" w={36} tint={afford ? Color4.White() : muted} margin={4} />
      <Digits value={suit.cost} w={32} tint={afford ? gold : danger} />
      <UiEntity uiTransform={{ width: 20 }} />
      {afford ? (
        <AcceptDecline
          w={56}
          margin={6}
          onAccept={() => {
            const id = pendingArmor
            pendingArmor = 0
            buyArmor(id)
            lockNav()
          }}
          onDecline={() => {
            pendingArmor = 0
            lockNav()
          }}
        />
      ) : (
        <LabelBtn
          k="shop-decline"
          id="armor:poor-decline"
          w={56}
          h={56}
          labelW={24}
          bg={btnDark}
          onTap={() => {
            pendingArmor = 0
          }}
        />
      )}
    </Line>
  )
}

/** One suit on the stand: your walker wearing it, its name, and its price
 * (or OWNED / WORN). `id` 0 is the bare tunic. */
function ArmorTile(props: { key?: number; id: number; worn: number }) {
  const look = myLook()
  const suit = props.id > 0 ? ARMORS[props.id - 1] : undefined
  const have = props.id === 0 || owned(props.id)
  const on = props.worn === props.id
  const armed = pendingArmor === props.id && !have
  const tid = `armor:${props.id}`
  const shrink = pressShrink(tid, ARM_TILE_W)
  const name = suit?.name ?? 'armor-none'
  const afford = suit ? game.coins >= suit.cost : true
  return (
    <UiEntity
      uiTransform={{
        width: ARM_TILE_W,
        height: ARM_TILE_H,
        margin: 5,
        alignItems: 'center',
        justifyContent: 'center'
      }}
      onMouseDown={
        on
          ? undefined
          : press(tid, () => {
              playClick()
              if (have) {
                pendingArmor = 0
                patch({ armor: props.id })
              } else {
                pendingArmor = props.id
              }
              lockNav(150)
            })
      }
    >
      <UiEntity
        uiTransform={{
          width: ARM_TILE_W - shrink,
          height: ARM_TILE_H - Math.round((shrink * ARM_TILE_H) / ARM_TILE_W),
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          pointerFilter: 'none',
          ...(on || armed ? { borderWidth: 4, borderColor: gold } : { borderWidth: 1, borderColor: swatchDark })
        }}
        uiBackground={{ color: pressTint(tid, on || armed ? tabLit : tabDark) }}
      >
        <AvatarBust look={{ ...look, armor: props.id }} w={BUST_W} margin={4} />
        <Img k={name} w={24} tint={on || armed ? gold : muted} margin={4} />
        {suit ? (
          have ? (
            <Img k={on ? 'armor-worn' : 'armor-owned'} w={22} tint={on ? gold : muted} margin={4} />
          ) : (
            <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', pointerFilter: 'none' }}>
              <Img k="icon-coins" w={26} tint={afford ? Color4.White() : muted} margin={2} />
              <Digits value={suit.cost} w={24} tint={afford ? gold : danger} />
            </UiEntity>
          )
        ) : (
          <UiEntity uiTransform={{ width: 26, height: 1 }} />
        )}
      </UiEntity>
    </UiEntity>
  )
}

function ArmorPanel() {
  const worn = myLook().armor
  // The bare tunic, then the suits, three to a physical line.
  const ids = [0, ...ARMORS.map((_, i) => i + 1)]
  const rows: number[][] = []
  for (let i = 0; i < ids.length; i += 3) rows.push(ids.slice(i, i + 3))
  return (
    <UiEntity
      uiTransform={{
        width: 1010,
        height: PANEL_H,
        margin: 6,
        padding: { top: 8, bottom: 8, left: 10, right: 10 },
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      uiBackground={{ color: plate }}
    >
      <Img k="armor-hint" w={20} tint={muted} margin={4} />
      <ArmorHeader />
      {rows.map((row, r) => (
        <Line key={r} margin={2}>
          {row.map((id) => (
            <ArmorTile key={id} id={id} worn={worn} />
          ))}
        </Line>
      ))}
    </UiEntity>
  )
}

/** The word strip in the gutter where menu titles sit (physical top). */
function Title() {
  return (
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
      <Img k="wardrobe-title" w={44} tint={gold} margin={0} />
    </UiEntity>
  )
}

export function WardrobeScreen() {
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
      <MpBackdrop k="map-hut" />
      <Tabs />
      {wardrobe.tab === 'colors' ? <ColorsPanel /> : wardrobe.tab === 'clothes' ? <ClothesPanel /> : <ArmorPanel />}
      <Title />
    </UiEntity>
  )
}
