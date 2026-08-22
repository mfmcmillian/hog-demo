import { AudioSource, Transform, engine, type Entity } from '@dcl/sdk/ecs'
import { riftView } from '../mp/session'
import { BattleFx, Phase, Rarity } from './types'
import { game } from './state'

const SFX = {
  click: 'sounds/ui/click.mp3',
  cancel: 'sounds/ui/cancel.mp3',
  error: 'sounds/ui/error.mp3',
  chest: 'sounds/loot/chest.mp3',
  reveal: 'sounds/loot/reveal.mp3',
  legendary: 'sounds/loot/legendary.mp3',
  coin: 'sounds/loot/coin.mp3',
  strike: 'sounds/combat/strike.mp3',
  volley: 'sounds/combat/volley.mp3',
  drain: 'sounds/combat/drain.mp3',
  rally: 'sounds/combat/rally-b.mp3',
  crit: 'sounds/combat/crit-b.mp3',
  start: 'sounds/combat/start.mp3',
  rift: 'sounds/fx/rift-c.mp3',
  levelup: 'sounds/fx/levelup.mp3'
}

const MUSIC = {
  hub: 'sounds/music/hub-e.mp3',
  match: 'sounds/music/match.mp3',
  victory: 'sounds/music/victory.mp3',
  defeat: 'sounds/music/defeat.mp3'
}

const VOL = {
  sfx: 0.72,
  click: 0.55,
  musicHub: 0.28,
  musicMatch: 0.42,
  sting: 0.48,
  rift: 1
}

const MATCH_PHASES: Phase[] = ['battle']
const ERROR_NOTICES = new Set(['clear-road', 'recruit-first', 'no-coin', 'fuse-rule', 'road-failed'])

const POOL = 3
const sfxPool: Entity[] = []
let sfxAt = 0
let music: Entity | undefined
let sting: Entity | undefined
let lastRiftPub = ''

let lastPhase: Phase | '' = ''
let lastNotice = ''
let lastCoins = -1
let lastMusicKey = ''
let lastMusicOn = true
let lastPlayed = new Map<string, number>()

function throttled(key: string, ms: number) {
  const now = Date.now()
  if (now - (lastPlayed.get(key) ?? 0) < ms) return true
  lastPlayed.set(key, now)
  return false
}

function musicBed(phase: Phase): { clip: string; loop: boolean; volume: number; key: string } {
  if (phase === 'banner' || phase === 'report') {
    const win = game.battle?.winner === 'you'
    return {
      clip: win ? MUSIC.victory : MUSIC.defeat,
      loop: false,
      volume: VOL.sting,
      key: win ? 'victory' : 'defeat'
    }
  }
  if (MATCH_PHASES.includes(phase) || (phase === 'rift' && riftView.pub.phase === 'battle')) {
    return { clip: MUSIC.match, loop: true, volume: VOL.musicMatch, key: 'match' }
  }
  return { clip: MUSIC.hub, loop: true, volume: VOL.musicHub, key: 'hub' }
}

function getSfx(): Entity {
  if (sfxPool.length < POOL) {
    const entity = engine.addEntity()
    Transform.create(entity, { parent: engine.PlayerEntity })
    sfxPool.push(entity)
  }
  const entity = sfxPool[sfxAt]
  sfxAt = (sfxAt + 1) % POOL
  return entity
}

function getMusic(): Entity {
  if (music === undefined) {
    music = engine.addEntity()
    Transform.create(music, { parent: engine.PlayerEntity })
  }
  return music
}

function getSting(): Entity {
  if (sting === undefined) {
    sting = engine.addEntity()
    Transform.create(sting, { parent: engine.PlayerEntity })
  }
  return sting
}

export function playSfx(id: keyof typeof SFX, volume = VOL.sfx) {
  if (!game.soundOn) return
  AudioSource.createOrReplace(getSfx(), {
    audioClipUrl: SFX[id],
    playing: true,
    loop: false,
    volume
  })
}

export function playClick() {
  if (throttled('click', 70)) return
  playSfx('click', VOL.click)
}

export function playCancel() {
  if (throttled('cancel', 120)) return
  playSfx('cancel')
}

export function playError() {
  if (throttled('error', 280)) return
  playSfx('error')
}

export function playChest() {
  playSfx('chest')
}

export function playReveal(rarity: Rarity) {
  playSfx(rarity === 'legendary' || rarity === 'mythic' ? 'legendary' : 'reveal')
}

export function playLevelUp() {
  playSfx('levelup')
}

/** Portal sting on its own voice so a UI click cannot steal the slot. */
export function playRift() {
  if (!game.soundOn) return
  if (!Transform.has(engine.PlayerEntity)) return
  AudioSource.createOrReplace(getSting(), {
    audioClipUrl: SFX.rift,
    playing: true,
    loop: false,
    volume: VOL.rift
  })
}

export function playSkill(kind: BattleFx | '' | undefined) {
  if (kind === 'strike') playSfx('strike')
  else if (kind === 'volley') playSfx('volley')
  else if (kind === 'drain') playSfx('drain')
  else if (kind === 'rally') playSfx('rally')
  else if (kind === 'bolt') playSfx('crit')
}

export function tap(handler?: () => void): (() => void) | undefined {
  if (!handler) return undefined
  return () => {
    playClick()
    handler()
  }
}

function stopMusic() {
  if (music === undefined) return
  const audio = AudioSource.getMutableOrNull(music)
  if (audio) audio.playing = false
  lastMusicKey = ''
}

function syncMusic() {
  if (!game.musicOn) {
    if (lastMusicOn) stopMusic()
    lastMusicOn = false
    return
  }
  const bed = musicBed(game.phase)
  if (bed.key === lastMusicKey && lastMusicOn) return
  lastMusicOn = true
  lastMusicKey = bed.key
  AudioSource.createOrReplace(getMusic(), {
    audioClipUrl: bed.clip,
    playing: true,
    loop: bed.loop,
    volume: bed.volume
  })
}

function watchPhase() {
  if (game.phase === lastPhase) return
  const prev = lastPhase
  lastPhase = game.phase
  if (game.phase === 'battle' && prev !== 'rift') playSfx('start')
}

function watchRiftStart() {
  const phase = riftView.pub.phase
  if (phase === lastRiftPub) return
  const prev = lastRiftPub
  lastRiftPub = phase
  if (phase === 'battle' && prev === 'lobby') playRift()
}

function watchNotice() {
  if (game.notice === lastNotice) return
  lastNotice = game.notice
  if (ERROR_NOTICES.has(game.notice)) playError()
  if (game.notice === 'fused') playLevelUp()
}

function watchCoins() {
  if (lastCoins < 0) {
    lastCoins = game.coins
    return
  }
  if (game.coins < lastCoins) playSfx('coin')
  lastCoins = game.coins
}

/** Client tick: music bed follows the screen; one-shots fire on state edges. */
export function tickAudio() {
  if (!Transform.has(engine.PlayerEntity)) return
  syncMusic()
  watchPhase()
  watchRiftStart()
  watchNotice()
  watchCoins()
}
