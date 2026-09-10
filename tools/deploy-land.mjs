// Deploy to Genesis City (the -17,123 parcels). scene.json carries the
// worldConfiguration for hogdemo.dcl.eth, and sdk-commands refuses a LAND
// deploy while it is present, so this strips it for the duration of the
// deploy and puts the original file back whatever happens.
//
//   npm run deploy         -> this script
//   npm run deploy:world   -> the World (worlds content server)

import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const path = 'scene.json'
const original = readFileSync(path, 'utf8')
const scene = JSON.parse(original)
delete scene.worldConfiguration
writeFileSync(path, JSON.stringify(scene, null, 2) + '\n')

const restore = () => writeFileSync(path, original)
process.on('exit', restore)
process.on('SIGINT', () => process.exit(130))

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const result = spawnSync(npx, ['sdk-commands', 'deploy', ...process.argv.slice(2)], { stdio: 'inherit', shell: true })
restore()
process.exit(result.status ?? 1)
