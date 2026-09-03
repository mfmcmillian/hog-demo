import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { tap } from '../game/audio'
import { getDef } from '../game/familiars'
import { canFuse, fuse, fuseCount, fuseFaces, pickFuse, pickFuseHero, pickFuseRank } from '../game/fuse'
import { focused, MENU_WINDOW, setCursor, shiftBench, windowed } from '../game/nav'
import { findOwned, game } from '../game/store'
import { MAX_STARS, OwnedFamiliar } from '../game/types'
import { press, pressShrink, pressTint } from './fx/press'
import { LABELS } from './labels.gen'
import { PagedColumn } from './panels'
import { cream, gold, muted } from './theme'
import { Backdrop, Digits, Face, Img, MenuTitle, Notice, PartyTile, SeatCard, Stars } from './widgets'

function FuseSeat(props: { which: 'a' | 'b' }) {
  const uid = props.which === 'a' ? game.fuseA : game.fuseB
  const owned = findOwned(uid)
  const def = owned ? getDef(owned.defId) : undefined
  return (
    <SeatCard
      empty={!owned}
      h={112}
      faceId={owned?.defId}
      face={82}
      faceLeft={30}
      faceFallback={32}
      name={def?.name}
      nameW={9}
      nameLeft={6}
      nameBox={22}
      onTap={owned ? tap(() => pickFuse(owned.uid)) : undefined}
    >
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
    </SeatCard>
  )
}

function FuseResult() {
  const a = findOwned(game.fuseA)
  const b = findOwned(game.fuseB)
  const ready = canFuse(a, b)
  // Same seat frame as the ingredients so the child card reads the same way up.
  const preview = ready && a ? { ...a, uid: 'preview', stars: a.stars + 1 } : undefined
  return (
    <SeatCard
      empty={!ready}
      h={112}
      faceId={preview?.defId}
      face={82}
      faceLeft={30}
      faceFallback={32}
      frameTint={ready ? Color4.create(1, 0.92, 0.66, 1) : Color4.create(0.55, 0.55, 0.55, 1)}
      onTap={ready ? tap(() => fuse()) : undefined}
    >
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
    </SeatCard>
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
    <PartyTile
      w={w}
      wrap={6}
      glow={lit ? Color4.create(0.95, 0.78, 0.35, 0.35) : Color4.create(0, 0, 0, 0)}
      onTap={() => {
        setCursor(props.index)
        pickFuseHero(props.owned.defId)
      }}
    >
      <Face id={props.owned.defId} w={Math.round(w * 0.78)} h={Math.round(h * 0.78)} fallback={28} />
    </PartyTile>
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
  return (
    <PartyTile
      w={w}
      wrap={2}
      margin={1}
      glow={lit ? Color4.create(0.95, 0.78, 0.35, 0.35) : Color4.create(0, 0, 0, 0)}
      onTap={top ? undefined : tap(() => pickFuseRank(props.stars))}
    >
      <Digits value={n} w={34} tint={ready ? gold : n > 0 ? cream : muted} tight />
      <UiEntity uiTransform={{ positionType: 'absolute', position: { left: 6, top: 16 }, pointerFilter: 'none' }}>
        <Stars count={props.stars} w={11} />
      </UiEntity>
    </PartyTile>
  )
}

export function FuseScreen() {
  const faces = fuseFaces()
  const page = windowed(faces.map((owned, i) => ({ owned, i })))
  const canPage = faces.length > MENU_WINDOW
  const ready = canFuse(findOwned(game.fuseA), findOwned(game.fuseB))
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
      {Backdrop({ label: 'hall-party', dim: 0.42 })}
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
      <UiEntity
        uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', justifyContent: 'center', height: '92%' }}
      >
        <FuseSeat which="a" />
        <UiEntity uiTransform={{ width: 5, height: 44, margin: 2 }} uiBackground={{ color: gold }} />
        <FuseSeat which="b" />
      </UiEntity>
      {/* vertical drop line from between the parents down to the child */}
      <UiEntity uiTransform={{ width: 36, height: 5, margin: 2 }} uiBackground={{ color: gold }} />
      <FuseResult />
      <UiEntity
        uiTransform={{ width: 66, height: 210, alignItems: 'center', justifyContent: 'center', margin: 4 }}
        onMouseDown={
          ready
            ? press(
                'fuse:go',
                tap(() => fuse())
              )
            : undefined
        }
      >
        <Img
          k="shop-accept"
          w={60 - pressShrink('fuse:go', 60)}
          tint={pressTint('fuse:go', ready ? Color4.White() : muted)}
          margin={0}
        />
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
        <PagedColumn
          show={canPage}
          leftK="party-arrow-l"
          rightK="party-arrow-r"
          boxW={60}
          boxH={48}
          imgW={54}
          onLeft={tap(() => shiftBench(-1))}
          onRight={tap(() => shiftBench(1))}
        >
          {page.map(({ owned, i }) => (
            <FuseHeroTile key={owned.defId} owned={owned} index={i} />
          ))}
        </PagedColumn>
      </UiEntity>
      <Notice />
      <MenuTitle k="fuse-banner" />
    </UiEntity>
  )
}
