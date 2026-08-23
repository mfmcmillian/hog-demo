import { PlayerSave } from '../mp/protocol'

export const present = new Set<string>()
export const displayNames = new Map<string, string>()

function shortAddress(address: string): string {
  return address.length > 10 ? `${address.slice(0, 6)}..${address.slice(-4)}` : address
}

export function nameFor(address: string): string {
  return displayNames.get(address) || shortAddress(address)
}

export type ServerCtx = {
  saves: Map<string, PlayerSave>
  isSaveReady: (address: string) => boolean
  persistSave: (address: string) => void
  pushSave: (address: string, reason?: 'load' | 'update') => void
  present: Set<string>
  displayNames: Map<string, string>
  nameFor: (address: string) => string
}
