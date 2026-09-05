import { hasOwFlag, setOwFlag } from './owTalk'
import { game } from './store'

// The questing area's storyline: five quests, each paid in one card by the
// NPC who asked. Quests are personal (flags in the save); the map is shared.
//
//   <id>-reward       set when the giver hands over the card (one-time)
//   slain-<boss>-c<n> set when *you* beat the warlord on the map during
//                     questline run n
//   cycle-<n>         run n finished (last quest paid): every warlord stands
//                     again for run n+1, for coins (cards never repeat)
//
// Flags are only ever added (saveSync unions local and stored flags, so a
// removal would come back); "resetting" the bosses is bumping the cycle.
// Flag names are [a-z0-9-] only: the server's save filter drops anything
// else. Exits gate on the -reward flags, never on slain flags, so nothing
// re-locks when the warlords return.

export type OwQuest = {
  id: string
  /** Warlord to fell on the map before the giver pays. */
  boss?: string
  /** familiars.ts def handed out by the giver. */
  card: string
}

export const OW_QUESTS: OwQuest[] = [
  { id: 'boy', card: 'dusk-oracle' }, // the lost boy, Antrom green
  { id: 'gate', boss: 'moor-ogre', card: 'moor-ogre' }, // the gate that walks, Moor Gate
  { id: 'widow', boss: 'thorn-queen', card: 'oath-knight' }, // the widow's knight, Deep Woods
  { id: 'well', boss: 'crimson-abbot', card: 'crimson-abbot' }, // the veiled well, seer
  { id: 'hall', boss: 'ashen-regent', card: 'ashen-regent' } // the oath hall, elder
]

export function owQuest(id: string): OwQuest | undefined {
  return OW_QUESTS.find((quest) => quest.id === id)
}

export function questRewardFlag(id: string): string {
  return `${id}-reward`
}

export function questRewarded(id: string): boolean {
  return hasOwFlag(questRewardFlag(id))
}

/** Completed questline runs so far. */
export function questCycle(): number {
  let n = 0
  for (const flag of game.owFlags) if (flag.startsWith('cycle-')) n++
  return n
}

export function bossSlainFlag(id: string): string {
  return `slain-${id}-c${questCycle()}`
}

export function bossSlain(id: string): boolean {
  return hasOwFlag(bossSlainFlag(id))
}

export function isLastQuest(id: string): boolean {
  return OW_QUESTS[OW_QUESTS.length - 1].id === id
}

/** Questline complete: every warlord stands again for the next run. */
export function resetBosses(): void {
  setOwFlag(`cycle-${questCycle() + 1}`)
}
