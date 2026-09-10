# Roadmap: when this turns into a real game

Things to add once Heroes of Genesis moves past the demo. Add to the list as
ideas come up; keep the order roughly by priority.

## 1. Combat stats on the results screen

After a fight, the report should show what actually happened, per hero:

- Damage dealt and damage taken
- Healing done
- Kills / knockouts
- Skills used (how many times each fired)
- Turns survived
- Fight length (turns, and real time)

Notes: the battle sim already runs turn by turn on the server for duels and
raids (`src/server/duel.ts`, `src/server/rift.ts`) and on the client for
roads (`src/game/campaign.ts`), so the numbers can be tallied where the hits
happen and handed to `src/ui/results.tsx`. A compact per-hero row (face,
name, dmg, taken, heal) fits the current report layout; a "details" tap can
open the full breakdown.

## 2. Multiple saved parties

Four party slots instead of one:

- Save up to 4 parties, each with its own 4 heroes and a name (or A/B/C/D)
- Switch the active party from the party screen and from the pre-fight
  screens (roads, raids, duels)
- Remember which party was last used for each mode (e.g. a raid party and a
  duel party)
- A hero can sit in more than one saved party

Notes: today the party is a single `game.party` array of uids in
`src/game/store.ts`, synced through `PlayerSave` (`src/mp/protocol.ts`,
`src/mp/saveSync.ts`) and sanitized server-side in `src/server/saves.ts`.
Turning it into `parties: uid[][]` plus an `activeParty` index touches those
three, the party screen (`src/ui/party.tsx`), and the seat-picking code in
the friendzone (`src/ui/rift.tsx`).
