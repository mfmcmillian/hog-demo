import { getPlayer, onEnterScene, onLeaveScene } from '@dcl/sdk/src/players'
import { room } from './transport'

let myAddress = ''
let myName = ''

/** Other players currently in the scene: address -> display name. */
export const presentPlayers = new Map<string, string>()

export function getMyAddress(): string {
  return myAddress
}

export function getMyName(): string {
  return myName
}

export function setupPresence(): void {
  onEnterScene((player) => {
    if (!player.userId) return
    const address = player.userId.toLowerCase()
    const me = (getPlayer()?.userId ?? '').toLowerCase()
    if (address === me) return
    presentPlayers.set(address, (player.name ?? '').trim() || address.slice(0, 8))
  })

  onLeaveScene((userId) => {
    presentPlayers.delete(userId.toLowerCase())
  })
}

/** Resolve local identity and send the hello saveRequest. False until we already had an address. */
export function tickIdentity(): boolean {
  if (myAddress) return true
  const player = getPlayer()
  if (player?.userId) {
    // Guests play too - their address is just ephemeral, so the save
    // they build up only lives for the session.
    myAddress = player.userId.toLowerCase()
    myName = (player.name ?? '').trim() || myAddress.slice(0, 8)
    room.send('saveRequest', { json: '' }) // hello: ask for my save
  }
  return false
}
