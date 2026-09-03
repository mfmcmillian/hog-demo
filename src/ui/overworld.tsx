import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { DEBUG } from '../game/debug'
import { getDef } from '../game/familiars'
import {
  GRID_H,
  GRID_W,
  MAP_H,
  MAP_W,
  OW_SUB,
  TILE,
  ow,
  owAvatarCell,
  owAvatarRect,
  owBlockRects,
  owChestRects,
  owFadeAlpha,
  owHintRect,
  owLockRects,
  owMapKey,
  owMapTint,
  owMonsterRects,
  owNpcRects,
  owRemoteRects,
  owSignRects,
  owSwitchRects,
  owToast
} from '../game/overworld'
import { Rarity } from '../game/types'
import { owSlayToast } from '../mp/owClient'
import { cellUvs, idlePoster } from './fx/sheets'
import { LABELS } from './labels.gen'
import { cream } from './theme'
import { Face, Img, NameTag, Notice } from './widgets'

const AVATAR = 100
const MONSTER_SIZE: Record<Rarity, number> = {
  common: 86,
  uncommon: 96,
  rare: 108,
  epic: 120,
  legendary: 132,
  mythic: 144
}
// Fellow travelers take a cool moonlit cast so your own avatar stays obvious.
const REMOTE_TINT = Color4.create(0.78, 0.86, 1, 0.96)

// Pokemon-style overworld: the current realm's pre-rotated map backdrop,
// the shared wilds monsters and every other player mirrored from the server,
// and the walk-sheet avatar on top, under a black quad that runs the
// realm-swap fade. Walking is driven by the OverworldHud d-pad (chrome.tsx)
// or hardware keys - see tickOverworld. Exit is the standard MenuBack chrome.
function monsterDrawSize(id: string): number {
  try {
    return MONSTER_SIZE[getDef(id).rarity]
  } catch {
    return MONSTER_SIZE.common
  }
}

export function OverworldScreen() {
  const map = LABELS[owMapKey()]
  const tint = owMapTint()
  const mapColor = tint ? Color4.create(tint.r, tint.g, tint.b, 1) : Color4.White()
  const sheet = LABELS['player-walk']
  const chestSheet = LABELS['ow-chest']
  const signSheet = LABELS['ow-sign']
  const rockSheet = LABELS['ow-rock']
  const holeSheet = LABELS['ow-hole']
  const gateSheet = LABELS['ow-gate']
  const av = owAvatarRect(AVATAR)
  const remotes = owRemoteRects(AVATAR)
  const fadeAlpha = owFadeAlpha()
  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <UiEntity
        uiTransform={{ width: MAP_W, height: MAP_H }}
        uiBackground={
          map
            ? {
                textureMode: 'stretch',
                texture: { src: map.src },
                uvs: map.uvs,
                color: mapColor
              }
            : { color: Color4.create(0.09, 0.05, 0.06, 1) }
        }
      >
        {DEBUG.showOwGrid ? <OwGrid /> : null}
        <PathLight />
        {holeSheet
          ? owSwitchRects(AVATAR).map((plate, i) => (
              <UiEntity
                key={`sw${i}`}
                uiTransform={{
                  positionType: 'absolute',
                  position: { left: plate.left, top: plate.top },
                  width: AVATAR,
                  height: AVATAR,
                  pointerFilter: 'none'
                }}
                uiBackground={{
                  textureMode: 'stretch',
                  texture: { src: holeSheet.src },
                  uvs: cellUvs(plate.pressed ? 4 : 0),
                  color: Color4.White()
                }}
              />
            ))
          : null}
        {gateSheet
          ? owLockRects(AVATAR).map((lock, i) => (
              <UiEntity
                key={`lk${i}`}
                uiTransform={{
                  positionType: 'absolute',
                  position: { left: lock.left, top: lock.top },
                  width: AVATAR,
                  height: AVATAR,
                  pointerFilter: 'none'
                }}
                uiBackground={{
                  textureMode: 'stretch',
                  texture: { src: gateSheet.src },
                  uvs: cellUvs(lock.open ? 4 : 0),
                  color: Color4.White()
                }}
              />
            ))
          : null}
        {rockSheet
          ? owBlockRects(AVATAR).map((block, i) => (
              <UiEntity
                key={`bk${i}`}
                uiTransform={{
                  positionType: 'absolute',
                  position: { left: block.left, top: block.top },
                  width: AVATAR,
                  height: AVATAR,
                  pointerFilter: 'none'
                }}
                uiBackground={{
                  textureMode: 'stretch',
                  texture: { src: rockSheet.src },
                  uvs: cellUvs(0),
                  color: Color4.White()
                }}
              />
            ))
          : null}
        {signSheet
          ? owSignRects(AVATAR).map((sign, i) => (
              <UiEntity
                key={`sg${i}`}
                uiTransform={{
                  positionType: 'absolute',
                  position: { left: sign.left, top: sign.top },
                  width: AVATAR,
                  height: AVATAR,
                  pointerFilter: 'none'
                }}
                uiBackground={{
                  textureMode: 'stretch',
                  texture: { src: signSheet.src },
                  uvs: cellUvs(0),
                  color: Color4.White()
                }}
              />
            ))
          : null}
        {chestSheet
          ? owChestRects(AVATAR).map((chest) => (
              <UiEntity
                key={chest.id}
                uiTransform={{
                  positionType: 'absolute',
                  position: { left: chest.left, top: chest.top },
                  width: AVATAR,
                  height: AVATAR,
                  pointerFilter: 'none'
                }}
                uiBackground={{
                  textureMode: 'stretch',
                  texture: { src: chestSheet.src },
                  uvs: cellUvs(chest.open ? 4 : 0),
                  color: Color4.White()
                }}
              />
            ))
          : null}
        {owNpcRects(AVATAR).map((npc) => {
          const npcSheet = LABELS[npc.sheet]
          if (!npcSheet) return null
          return (
            <UiEntity
              key={npc.id}
              uiTransform={{
                positionType: 'absolute',
                position: { left: npc.left, top: npc.top },
                width: AVATAR,
                height: AVATAR,
                pointerFilter: 'none'
              }}
              uiBackground={{
                textureMode: 'stretch',
                texture: { src: npcSheet.src },
                uvs: cellUvs(0),
                color: Color4.White()
              }}
            />
          )
        })}
        {owMonsterRects(monsterDrawSize).map((mon) => {
          const poster = idlePoster(mon.id)
          if (!poster) return null
          return (
            <UiEntity
              uiTransform={{
                positionType: 'absolute',
                position: { left: mon.left, top: mon.top },
                width: mon.size,
                height: mon.size,
                pointerFilter: 'none'
              }}
              uiBackground={{
                textureMode: 'stretch',
                texture: { src: poster.src },
                uvs: poster.uvs,
                color: Color4.White()
              }}
            />
          )
        })}
        {/* Remotes render as DIRECT absolute children of the map (same as the
            monsters): a zero-sized wrapper clips its children on some
            explorers, which hid fellow travelers entirely. */}
        {sheet
          ? remotes.map((remote, i) => (
              <UiEntity
                key={`r${i}`}
                uiTransform={{
                  positionType: 'absolute',
                  position: { left: remote.left, top: remote.top },
                  width: AVATAR,
                  height: AVATAR,
                  pointerFilter: 'none'
                }}
                uiBackground={{
                  textureMode: 'stretch',
                  texture: { src: sheet.src },
                  uvs: cellUvs(remote.cell),
                  color: REMOTE_TINT
                }}
              />
            ))
          : null}
        {/* name tags physically above the heads: stage -x of the quad */}
        {remotes.map((remote, i) => (
          <UiEntity
            key={`rn${i}`}
            uiTransform={{
              positionType: 'absolute',
              position: { left: remote.left - 16, top: remote.top },
              width: 18,
              height: AVATAR,
              alignItems: 'center',
              justifyContent: 'center',
              pointerFilter: 'none'
            }}
          >
            <NameTag name={remote.name} w={11} tint={cream} />
          </UiEntity>
        ))}
        {sheet ? (
          <UiEntity
            uiTransform={{
              positionType: 'absolute',
              position: { left: av.left, top: av.top },
              width: AVATAR,
              height: AVATAR,
              pointerFilter: 'none'
            }}
            uiBackground={{
              textureMode: 'stretch',
              texture: { src: sheet.src },
              uvs: cellUvs(owAvatarCell()),
              color: Color4.White()
            }}
          />
        ) : null}
        {/* gate/recruit notices float over the map (cleared on the next step) */}
        <UiEntity
          uiTransform={{ positionType: 'absolute', position: { right: 60, top: '42%' }, pointerFilter: 'none' }}
        >
          <Notice />
        </UiEntity>
        <AreaToast />
        <SlayToast />
        {fadeAlpha > 0 ? (
          <UiEntity
            uiTransform={{
              positionType: 'absolute',
              position: { top: 0, left: 0 },
              width: '100%',
              height: '100%',
              pointerFilter: 'none'
            }}
            uiBackground={{ color: Color4.create(0, 0, 0, fadeAlpha) }}
          />
        ) : null}
      </UiEntity>
    </UiEntity>
  )
}

/** Soft lantern on the next story tile — chest, exit, switch, or gate. */
function PathLight() {
  const glow = owHintRect(56)
  if (!glow) return null
  const pulse = 0.4 + 0.35 * Math.sin(Date.now() / 260)
  const shaft = 18
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { left: glow.left, top: glow.top },
        width: 56,
        height: 56,
        alignItems: 'center',
        justifyContent: 'center',
        pointerFilter: 'none'
      }}
    >
      <UiEntity
        uiTransform={{ width: 44, height: 44, pointerFilter: 'none' }}
        uiBackground={{ color: Color4.create(1, 0.82, 0.35, 0.22 * pulse) }}
      />
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { left: 28 - shaft / 2, top: 28 - shaft / 2 },
          width: shaft,
          height: shaft,
          pointerFilter: 'none'
        }}
        uiBackground={{ color: Color4.create(1, 0.9, 0.55, 0.55 + 0.4 * pulse) }}
      />
    </UiEntity>
  )
}

/** Gen-3-style area-name toast: the realm's name strip on a dark plate,
 * hanging by the physical top of the map for a beat after arriving. */
function AreaToast() {
  const toast = owToast()
  if (!toast) return null
  const info = LABELS[toast.key]
  if (!info) return null
  const w = 34
  const h = Math.round((w * info.h) / info.w)
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { left: 16, top: Math.round((MAP_H - h) / 2) - 10 },
        width: w + 20,
        height: h + 20,
        alignItems: 'center',
        justifyContent: 'center',
        pointerFilter: 'none'
      }}
      uiBackground={{ color: Color4.create(0.05, 0.03, 0.04, 0.72 * toast.alpha) }}
    >
      <UiEntity
        uiTransform={{ width: w, height: h, pointerFilter: 'none' }}
        uiBackground={{
          textureMode: 'stretch',
          texture: { src: info.src },
          uvs: info.uvs,
          color: Color4.create(1, 1, 1, toast.alpha)
        }}
      />
    </UiEntity>
  )
}

/** Kill feed: another player's fresh slay as a wordless plate by the map's
 * physical bottom — their name, crossed with the fallen monster's face.
 * Guard kills glow gold: someone just opened a blocked path for everyone. */
function SlayToast() {
  const toast = owSlayToast()
  if (!toast) return null
  const a = toast.alpha
  const plate = toast.guard ? Color4.create(0.22, 0.16, 0.03, 0.78 * a) : Color4.create(0.05, 0.03, 0.04, 0.72 * a)
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { left: MAP_W - 92, top: Math.round(MAP_H / 2) - 110 },
        width: 76,
        height: 220,
        flexDirection: 'column-reverse',
        alignItems: 'center',
        justifyContent: 'center',
        pointerFilter: 'none'
      }}
      uiBackground={{ color: plate }}
    >
      <NameTag name={toast.name} w={11} tint={Color4.create(cream.r, cream.g, cream.b, a)} />
      <Img k="strike" w={22} tint={Color4.create(1, toast.guard ? 0.85 : 1, toast.guard ? 0.35 : 1, a)} margin={4} />
      <Face id={toast.id} w={52} h={52} tint={Color4.create(0.6, 0.6, 0.6, a)} />
    </UiEntity>
  )
}

/** Fine walk grid (teal) over the old 9x16 cells (dim gold). */
function OwGrid() {
  const fine = TILE / OW_SUB
  const line = Color4.create(0.2, 0.95, 0.85, 0.4)
  const coarse = Color4.create(1, 0.85, 0.2, 0.35)
  const here = Color4.create(1, 0.85, 0.2, 0.32)
  const v = []
  for (let i = 0; i <= GRID_H * OW_SUB; i++) {
    v.push(
      <UiEntity
        key={`gv${i}`}
        uiTransform={{
          positionType: 'absolute',
          position: { left: i * fine, top: 0 },
          width: i % OW_SUB === 0 ? 2 : 1,
          height: MAP_H,
          pointerFilter: 'none'
        }}
        uiBackground={{ color: i % OW_SUB === 0 ? coarse : line }}
      />
    )
  }
  const h = []
  for (let i = 0; i <= GRID_W * OW_SUB; i++) {
    h.push(
      <UiEntity
        key={`gh${i}`}
        uiTransform={{
          positionType: 'absolute',
          position: { left: 0, top: i * fine },
          width: MAP_W,
          height: i % OW_SUB === 0 ? 2 : 1,
          pointerFilter: 'none'
        }}
        uiBackground={{ color: i % OW_SUB === 0 ? coarse : line }}
      />
    )
  }
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { left: 0, top: 0 },
        width: MAP_W,
        height: MAP_H,
        pointerFilter: 'none'
      }}
    >
      {v}
      {h}
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { left: ow.gy * fine, top: (GRID_W * OW_SUB - 1 - ow.gx) * fine },
          width: fine,
          height: fine,
          pointerFilter: 'none'
        }}
        uiBackground={{ color: here }}
      />
    </UiEntity>
  )
}
