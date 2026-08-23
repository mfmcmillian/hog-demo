// Generates the intro story narration via ElevenLabs TTS: one clip per page
// into sounds/vo/intro-N.mp3. Designs a solemn female seer voice on the first
// run and caches its id in sounds/vo/voice-id.txt.
// Reads ELEVENLABS_API_KEY from env, the repo .env, or the KoA bots .env.
// Does not print the key.
//
//   node tools/gen-intro-vo.mjs

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BOTS_ENV = join(process.env.USERPROFILE ?? '', 'OneDrive', 'Documents', 'GitHub', 'koa', 'bots', '.env')
const OUT_DIR = join(ROOT, 'sounds', 'vo')
const VOICE_CACHE = join(OUT_DIR, 'voice-id.txt')

function readKeyFromEnvFile(path) {
  try {
    const text = readFileSync(path, 'utf8')
    const match = text.match(/^\s*ELEVENLABS_API_KEY\s*=\s*(.+)\s*$/m)
    return match ? match[1].trim().replace(/^['"]|['"]$/g, '') : ''
  } catch {
    return ''
  }
}

const apiKey =
  process.env.ELEVENLABS_API_KEY ||
  readKeyFromEnvFile(join(ROOT, '.env')) ||
  readKeyFromEnvFile(BOTS_ENV)

if (!apiKey) {
  console.error('No ELEVENLABS_API_KEY found')
  process.exit(1)
}

const VOICE_DESCRIPTION =
  'A solemn, ancient female seer narrating a dark fantasy legend. Low, hushed, reverent voice with quiet gravity, unhurried and mystical, weathered oracle rather than a polished commercial narrator. Speaks English clearly.'

const VOICE_SETTINGS = { stability: 0.55, similarity_boost: 0.75, style: 0.35 }

// Natural sentence-case reads of the on-screen page copy.
const PAGES = [
  'In the heart of Genesis City stands the village of Antrom.',
  "Its fire is no common flame. It burns from the Heroes' Gauntlet, fed by every oath ever sworn.",
  'While the flame burns, no demon may pass our walls. So the Demon King will not come himself.',
  'He has sent four warlords to seize the kingdoms around us. The Moor Ogre. The Thorn Queen. The Crimson Abbot. The Ashen Regent.',
  'Each now raises an army. If those armies march as one, even the flame will drown. So we strike first.',
  'Take the old roads. Slip into their kingdoms. Fell each warlord before his army rises. But first, hero... swear your oath to the flame.'
]

async function designSeerVoice() {
  try {
    const cached = readFileSync(VOICE_CACHE, 'utf8').trim()
    if (cached) {
      console.log('using cached seer voice')
      return cached
    }
  } catch {
    // first run
  }

  const design = await fetch('https://api.elevenlabs.io/v1/text-to-voice/design', {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      voice_description: VOICE_DESCRIPTION,
      auto_generate_text: true,
      model_id: 'eleven_multilingual_ttv_v2'
    })
  })

  if (!design.ok) {
    const detail = await design.text()
    throw new Error(`voice design failed (${design.status}): ${detail.slice(0, 160)}`)
  }

  const designed = await design.json()
  const preview = designed.previews?.[0]
  if (!preview?.generated_voice_id) throw new Error('voice design returned no preview')

  const created = await fetch('https://api.elevenlabs.io/v1/text-to-voice', {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      voice_name: 'HoG Seer Narrator',
      voice_description: VOICE_DESCRIPTION,
      generated_voice_id: preview.generated_voice_id
    })
  })

  if (!created.ok) {
    const detail = await created.text()
    throw new Error(`voice create failed (${created.status}): ${detail.slice(0, 160)}`)
  }

  const voice = await created.json()
  if (!voice.voice_id) throw new Error('voice create returned no id')
  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(VOICE_CACHE, voice.voice_id)
  console.log('created seer narrator voice')
  return voice.voice_id
}

async function generate(voiceId, index, attempt = 1) {
  const file = join(OUT_DIR, `intro-${index + 1}.mp3`)
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg'
    },
    body: JSON.stringify({
      text: PAGES[index],
      model_id: 'eleven_multilingual_v2',
      voice_settings: VOICE_SETTINGS
    })
  })

  if (response.status === 429 && attempt < 6) {
    const wait = attempt * 3500
    console.log(`rate limited, retry intro-${index + 1} in ${wait}ms`)
    await new Promise((resolve) => setTimeout(resolve, wait))
    return generate(voiceId, index, attempt + 1)
  }

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`intro-${index + 1} HTTP ${response.status}: ${detail.slice(0, 240)}`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length < 800) throw new Error(`intro-${index + 1} empty`)
  writeFileSync(file, buffer)
  console.log(`wrote sounds/vo/intro-${index + 1}.mp3 (${(buffer.length / 1024).toFixed(1)} KB)`)
}

mkdirSync(OUT_DIR, { recursive: true })
const voiceId = await designSeerVoice()
console.log(`generating ${PAGES.length} narration clips`)
for (let i = 0; i < PAGES.length; i++) {
  await generate(voiceId, i)
  await new Promise((resolve) => setTimeout(resolve, 250))
}
console.log('done')
