// Generates the road-story / final-battle / epilogue narration via ElevenLabs
// TTS with the same cached seer voice as the intro (sounds/vo/voice-id.txt):
// one clip per page into sounds/vo/story-<id>-<n>.mp3.
// Reads ELEVENLABS_API_KEY from env, the repo .env.
// Does not print the key.
//
//   node tools/gen-story-vo.mjs
//
// !! Run tools/gen-intro-vo.mjs at least once first so the voice id exists.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
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
  readKeyFromEnvFile(join(ROOT, '.env'))

if (!apiKey) {
  console.error('No ELEVENLABS_API_KEY found')
  process.exit(1)
}

const VOICE_SETTINGS = { stability: 0.55, similarity_boost: 0.75, style: 0.35 }

// Natural sentence-case reads of the on-screen page copy (see gen-story-labels.ps1).
const PAGES = {
  'story-q1-1': 'The first road runs through the moor, where the Ogre has taken the gate. His hounds and wights hunt the crossing.',
  'story-q1-2': 'No grain, no word, no help passes him. Antrom starves behind its walls. Break the gate. Fell the Ogre.',
  'story-q3-1': "The Crow Road carried our messengers. Now the Thorn Queen's briars strangle it, and her crows pick the silence clean.",
  'story-q3-2': 'No warning can reach the other kingdoms. She will bury them blind, one by one. Cut the briar. Take back our voice.',
  'story-q4-1': "The well beneath the veil fed our flame - every oath drawn from its water. The Crimson Abbot bleeds it dry.",
  'story-q4-2': 'With every drop he drinks, our fire dims. When the well runs red, the flame dies. Spill the Abbot, before he spills us.',
  'story-q6-1': 'The old Oath Hall, where heroes swore, now seats a king of cinders. The Ashen Regent turns oaths to ash.',
  'story-q6-2': 'Every broken oath swells his ranks. His army is nearly risen. Unseat him, or kneel to ash.',
  'story-final-1': 'You broke them each alone, hero. So the Demon King played his last card: all four, risen, marching as one.',
  'story-final-2': 'There are no more roads. No more time. They come for the flame itself. Stand at the gate. End this war.',
  'story-epilogue-1': "The warlords lie broken at our gate. The Demon King's reach ends here - he dares not face what felled them.",
  'story-epilogue-2': 'The flame burns taller than ever, fed by the oath you kept. Antrom remembers its hero.'
}

let voiceId = ''
try {
  voiceId = readFileSync(VOICE_CACHE, 'utf8').trim()
} catch {
  // fall through to error below
}
if (!voiceId) {
  console.error('No cached seer voice (sounds/vo/voice-id.txt) - run tools/gen-intro-vo.mjs first')
  process.exit(1)
}

async function generate(key, text, attempt = 1) {
  const file = join(OUT_DIR, `${key}.mp3`)
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg'
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: VOICE_SETTINGS
    })
  })

  if (response.status === 429 && attempt < 6) {
    const wait = attempt * 3500
    console.log(`rate limited, retry ${key} in ${wait}ms`)
    await new Promise((resolve) => setTimeout(resolve, wait))
    return generate(key, text, attempt + 1)
  }

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`${key} HTTP ${response.status}: ${detail.slice(0, 240)}`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length < 800) throw new Error(`${key} empty`)
  writeFileSync(file, buffer)
  console.log(`wrote sounds/vo/${key}.mp3 (${(buffer.length / 1024).toFixed(1)} KB)`)
}

mkdirSync(OUT_DIR, { recursive: true })
const entries = Object.entries(PAGES)
console.log(`generating ${entries.length} narration clips with the cached seer voice`)
for (const [key, text] of entries) {
  await generate(key, text)
  await new Promise((resolve) => setTimeout(resolve, 250))
}
console.log('done')
