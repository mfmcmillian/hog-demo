import ReactEcs, { ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { boot } from '../game/boot'
import { DEBUG } from '../game/debug'
import { game } from '../game/store'
import { AlliesScreen } from './allies'
import { BattleScreen } from './battle'
import { BootFade, LoadingScreen } from './boot'
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
import { PASS } from './theme'
import { TradeInviteToast, TradeScreen } from './trade'
import { TutorialOverlay } from './tutorial'

// 2D UI built from pre-rotated label images (see tools/gen-labels.ps1).
// Native E/F are hidden; ACTION/BACK plaques call primary()/back().
// The dark field is a 3D room in src/scene/shell.ts. Only cards capture touch.
// The app is landscape; the phone is held in a portrait grip:
//   physical TOP    = landscape LEFT   -> screens read left-to-right as columns
//   physical LEFT   = landscape BOTTOM -> inside a column, content flows bottom-to-top

// ---- root ---------------------------------------------------------------------

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
