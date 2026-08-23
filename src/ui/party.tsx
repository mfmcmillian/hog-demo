import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { tap } from '../game/audio'
import { collectionSize, getDef } from '../game/familiars'
import { focused, setCursor, shiftBench, windowed } from '../game/nav'
import { lockedNftHeroes, nftPieces, ownsUrn } from '../game/nftHeroes'
import { benchUnits, tapBenchHero, tapPartySlot } from '../game/party'
import { findOwned, game } from '../game/store'
import { benchPointerShowing } from '../game/tutorial'
import { OwnedFamiliar, PARTY_SIZE } from '../game/types'
import { LABELS } from './labels.gen'
import { ModalScrim, PagedColumn, TalkPanel } from './panels'
import { cream, gold } from './theme'
import { TutPointer } from './tutorial'
import { Backdrop, Face, GameLogo, Img, Notice, PartyTile, SeatCard, SlashCount } from './widgets'

/** One ornate kit seat: gold frame, hero in the leather, name in the banner. */
function TeamSlot(props: { slot: number }) {
  const uid = game.party[props.slot]
  const owned = findOwned(uid)
  const lit = game.selectedSlot === props.slot || focused(props.slot)
  const starter = !!owned && owned.uid === game.heroUid
  const def = owned ? getDef(owned.defId) : undefined
  const h = 250 // landscape height = physical card width
  return (
    <SeatCard
      empty={!owned}
      h={h}
      faceId={owned?.defId}
      face={195}
      faceLeft={68}
      faceFallback={36}
      name={def?.name}
      nameW={17}
      nameLeft={10}
      nameBox={42}
      glow={lit ? Color4.create(0.95, 0.78, 0.35, 0.35) : Color4.create(0, 0, 0, 0)}
      onTap={() => {
        setCursor(props.slot)
        tapPartySlot(props.slot)
      }}
    >
      {starter ? (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 12, left: 62 },
            width: 28,
            height: 28,
            pointerFilter: 'none'
          }}
        >
          <Img k="star" w={26} tint={gold} margin={0} />
        </UiEntity>
      ) : null}
    </SeatCard>
  )
}

/**
 * Wearable-gated heroes the player has not unlocked yet: dark silhouette
 * tiles with a lock. Owning the full NFT wearable set turns each into a
 * real card (see nftHeroes.ts), and the tile disappears from here.
 */
function NftTeaser() {
  const locked = lockedNftHeroes()
  if (!locked.length) return null
  const frame = LABELS['party-tile']
  if (!frame) return null
  const w = 74
  const h = Math.round((w * frame.h) / frame.w)
  return (
    <UiEntity uiTransform={{ flexDirection: 'column-reverse', alignItems: 'center', margin: 2 }}>
      {locked.map((id) => (
        <PartyTile
          key={id}
          w={w}
          frameTint={Color4.create(0.5, 0.45, 0.5, 1)}
          onTap={tap(() => {
            game.nftTalk = id
          })}
        >
          <Face
            id={id}
            w={Math.round(w * 0.78)}
            h={Math.round(h * 0.78)}
            tint={Color4.create(0.07, 0.05, 0.09, 0.96)}
          />
          <UiEntity
            uiTransform={{
              positionType: 'absolute',
              position: { top: Math.round(h / 2) - 14, left: Math.round(w / 2) - 20 },
              width: 40,
              height: 28,
              alignItems: 'center',
              justifyContent: 'center',
              pointerFilter: 'none'
            }}
          >
            <Img k="road-lock" w={38} tint={gold} margin={0} />
          </UiEntity>
        </PartyTile>
      ))}
    </UiEntity>
  )
}

/** Locked NFT hero dialog: same NPC quest box as the campfire elder, but
 *  the darkened hero explains the wearable gate. Tap anywhere to dismiss. */
function NftTalk() {
  const id = game.nftTalk
  if (!id) return null
  const frame = LABELS['party-tile']
  if (!frame) return null
  const tileW = 180
  const tileH = Math.round((tileW * frame.h) / frame.w)
  const pieces = nftPieces(id)
  // Panel hugs its widest row (the piece strip) so no dead leather above/below.
  const iconsW = pieces.length * 94
  const panelW = Math.max(tileW, iconsW) + 56
  return (
    <ModalScrim
      color={Color4.create(0, 0, 0, 0.55)}
      onMouseDown={tap(() => {
        game.nftTalk = ''
      })}
    >
      <TalkPanel width={panelW} height="86%" padding={12}>
        {/* the hero's card in the same party-tile frame as the bench, phone-left */}
        <UiEntity
          uiTransform={{
            width: tileW,
            height: tileH,
            margin: { bottom: 12 },
            alignItems: 'center',
            justifyContent: 'center',
            pointerFilter: 'none'
          }}
          uiBackground={{ textureMode: 'stretch', texture: { src: frame.src }, color: Color4.White() }}
        >
          <Face
            id={id}
            w={Math.round(tileW * 0.78)}
            h={Math.round(tileH * 0.78)}
            tint={Color4.create(0.07, 0.05, 0.09, 0.96)}
          />
        </UiEntity>
        {/* the exact pieces: full color = owned, darkened = still missing */}
        <UiEntity
          uiTransform={{
            width: iconsW,
            height: 100,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            margin: { bottom: 6 },
            pointerFilter: 'none'
          }}
        >
          {pieces.map((piece) => {
            const have = ownsUrn(piece.urn)
            return (
              <UiEntity
                key={piece.icon}
                uiTransform={{
                  width: 88,
                  height: 88,
                  margin: 3,
                  alignItems: 'center',
                  justifyContent: 'center',
                  pointerFilter: 'none'
                }}
                uiBackground={{ color: have ? Color4.create(0.95, 0.78, 0.35, 0.3) : Color4.create(0, 0, 0, 0.4) }}
              >
                <Img
                  k={piece.icon}
                  w={80}
                  tint={have ? Color4.White() : Color4.create(0.28, 0.24, 0.3, 1)}
                  margin={0}
                />
              </UiEntity>
            )
          })}
        </UiEntity>
        {/* hero name + speech lines, phone-right of the portrait */}
        <UiEntity
          uiTransform={{
            flexGrow: 1,
            width: '100%',
            flexDirection: 'row',
            alignItems: 'flex-end',
            justifyContent: 'center',
            padding: { bottom: 16, left: 8, right: 8 },
            pointerFilter: 'none'
          }}
        >
          <Img k={id} w={26} tint={gold} margin={6} />
          <Img k="nft-line1" w={20} tint={cream} margin={4} />
          <Img k="nft-line2" w={20} tint={cream} margin={4} />
          <Img k="nft-line3" w={20} tint={cream} margin={4} />
        </UiEntity>
      </TalkPanel>
    </ModalScrim>
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
    <PartyTile
      w={w}
      wrap={6}
      glow={lit ? Color4.create(0.95, 0.78, 0.35, 0.35) : Color4.create(0, 0, 0, 0)}
      onTap={() => {
        setCursor(abs)
        tapBenchHero(props.owned.uid)
      }}
    >
      <Face id={props.owned.defId} w={Math.round(w * 0.78)} h={Math.round(h * 0.78)} fallback={28} />
      {/* onboarding: point at the hound's recruit (tip lands 13,66 from anchor) */}
      {props.index === 0 && benchPointerShowing() ? (
        <TutPointer left={Math.round(w / 2) - 13} top={Math.round(h / 2) - 66} />
      ) : null}
    </PartyTile>
  )
}

export function PartyScreen() {
  const bench = windowed(benchUnits())
  const canPage = benchUnits().length > PARTY_SIZE
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
      {/* dim the hall so the gold kit reads like the mock */}
      {Backdrop({ label: 'hall-party', dim: 0.42 })}
      <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', margin: { left: 8, right: 4 } }}>
        <Img k="party-banner" w={132} tint={Color4.White()} margin={2} />
        {/* unique faces owned vs the full collectible book */}
        <SlashCount
          at={new Set(game.collection.map((owned) => owned.defId)).size}
          of={collectionSize()}
          w={26}
          slashW={22}
          atTint={gold}
          ofTint={cream}
          margin={{ left: 6 }}
        />
      </UiEntity>
      <NftTeaser />
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
          {bench.map((owned, i) => (
            <BenchTile key={owned.uid} owned={owned} index={i} />
          ))}
        </PagedColumn>
      </UiEntity>
      <NftTalk />
      <Notice />
      <GameLogo />
    </UiEntity>
  )
}
