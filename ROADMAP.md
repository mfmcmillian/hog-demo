# Roadmap: when this turns into a real game

Things to add once Heroes of Genesis moves past the demo. Add to the list as
ideas come up; keep the order roughly by priority.

## 1. Alliances (guilds)

The single biggest missing piece. Last War is unplayable solo past week one
and that's by design. We already have parties, ghost allies, trades, and
gifts, so the plumbing exists. Minimum version:

- Create / join an alliance
- Alliance chat
- An alliance board in the Hall of Heroes
- Alliance-scoped versions of the world boss (alliance damage total, alliance
  rank)
- Gifts and ghost allies get naturally scoped to your alliance

Notes: the server already keys everything by wallet and publishes per-player
`you` blocks (`src/server/boss.ts`, `src/server/boards.ts`); an alliance id
on `PlayerSave` (`src/mp/protocol.ts`, `src/server/saves.ts`) plus a stored
alliance roster is enough to roll the boss board and the gift/ghost pools up
a level. Chat would ride the realm feed's targeted-message path
(`src/server/feed.ts`, `FeedApi.postTo`).

## 2. Arms Race / rotating daily goals ("Realm Race")

Last War's Arms Race is a 4-hour rotating scoring window (today: build; next:
research; next: hero upgrades) with milestone chests. HOG's dailies are a
flat checklist. A rotating Realm Race where the scored activity changes every
few hours (fuse hour, raid hour, roads hour) with tiered chests would push
people to log in at specific times, not just once.

Notes: fits the existing feed and festival spoils chest. The daily-task
counters in `src/game/daily.ts` already tally fuses, raids, road clears and
the rest; a server-published window (`floor(now / RACE_WINDOW_MS)`, like
`bossWindowOf` in `src/mp/protocol.ts`) picks the scored activity, and the
milestone chests pay through `giftUpdate` / the `GiftCeremony` in
`src/ui/festival.tsx`.

## 3. Combat stats on the results screen

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

## 4. Multiple saved parties

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
