import ReactEcs, { ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { boot } from '../game/boot'
import { DEBUG } from '../game/debug'
import { game } from '../game/store'
import { AlliesScreen } from './allies'
import { BattleScreen } from './battle'
import { BootFade, LoadingBackdrop, LoadingScreen } from './boot'
import { startCanvasWatch } from './canvas'
import { AdBanner, PhaseFade, PlayHud, PreloadTiles, ScreenChrome } from './chrome'
import { CreditsScreen } from './credits'
import { FestivalScreen, GiftCeremony } from './festival'
import { FuseScreen } from './fuse'
import { HeroCardScreen } from './heroCard'
import { HomeScreen } from './home'
import { IntroScreen } from './intro'
import { LevelsScreen } from './levels'
import { PartyScreen } from './party'
import { startPreload } from './preload'
import { QuestScreen } from './quest'
import { BannerScreen, ReportScreen } from './results'
import { RiftScreen } from './rift'
import { SettingsScreen } from './settings'
import { ShopScreen } from './shop'
import { StartScreen } from './start'
import { PASS, STAGE_H, STAGE_W } from './theme'
import { TradeInviteToast, TradeScreen } from './trade'
import { TutorialOverlay } from './tutorial'

// 2D UI built from pre-rotated label images (see tools/gen-labels.ps1).
// Native E/F are hidden; ACTION/BACK plaques call primary()/back().
// The dark field is a 3D room in src/scene/shell.ts. Only cards capture touch.
// The app is landscape; the phone is held in a portrait grip:
//   physical TOP    = landscape LEFT   -> screens read left-to-right as columns
//   physical LEFT   = landscape BOTTOM -> inside a column, content flows bottom-to-top

// ---- stage --------------------------------------------------------------------

// The SDK contain-fits the 1600x720 virtual canvas, so on any screen that is
// not exactly 20:9 the canvas is *larger* than 1600x720 in virtual units on
// one axis (16:9 desktop gets 1600x900, a 4:3 tablet gets 1600x1200). All the
// hand-tuned compositions assume 1600x720, so they live inside this fixed,
// centered stage: pixel-identical everywhere, with the leftover canvas as
// symmetric gutters that the 3D room backdrop fills. Full-bleed layers
// (backdrops, fades, scrims) and edge-anchored chrome stay outside on the
// real canvas so the gutters are never uncovered.
function Stage(props: { children?: ReactEcs.JSX.Component[] | ReactEcs.JSX.Component }) {
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
      <UiEntity uiTransform={{ width: STAGE_W, height: STAGE_H, ...PASS }}>{props.children}</UiEntity>
    </UiEntity>
  )
}

// ---- root ---------------------------------------------------------------------

// Chrome well inside the stage: the old '11%' left gutter / '78%' width of the
// design canvas, as stage pixels so they no longer drift with the device.
const WELL_LEFT = 176
const WELL_W = 1248

function Root() {
  if (!boot.ready) {
    return (
      <UiEntity uiTransform={{ width: '100%', height: '100%' }}>
        <PreloadTiles />
        <LoadingBackdrop />
        <Stage>
          <LoadingScreen />
        </Stage>
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
      <Stage>
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 0, left: WELL_LEFT },
            width: WELL_W,
            height: STAGE_H,
            flexDirection: 'row',
            alignItems: 'center',
            ...PASS
          }}
        >
          <ScreenChrome>
            {game.phase === 'intro' ? <IntroScreen /> : null}
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
            {game.phase === 'credits' ? <CreditsScreen /> : null}
            <TradeInviteToast />
            <GiftCeremony />
            <TutorialOverlay />
          </ScreenChrome>
        </UiEntity>
      </Stage>
      {DEBUG.showPlayHud ? <PlayHud /> : null}
      <AdBanner />
      <PreloadTiles />
      <PhaseFade />
    </UiEntity>
  )
}

export function setupUi() {
  // Virtual canvas is the DCL landscape frame; the UI itself stays portrait-grip
  // (columns left-to-right = physical top-to-bottom). The client contain-fits
  // this size, so the canvas can exceed it on one axis — the Stage above pins
  // the composition to exactly 1600x720. screenInset stays 'none' so full-bleed
  // layers reach the physical edges; edge-anchored chrome wraps itself in
  // ScreenInsetArea instead (see chrome.tsx).
  startPreload()
  startCanvasWatch()
  ReactEcsRenderer.setUiRenderer(Root, {
    virtualWidth: STAGE_W,
    virtualHeight: STAGE_H,
    screenInset: 'none'
  })
}
