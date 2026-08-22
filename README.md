<p align="center">
  <img src="docs/img/logo.webp" alt="Heroes of Genesis" width="420" />
</p>

<p align="center">
  <b>A dark fantasy card RPG that runs entirely inside Decentraland.</b><br/>
  Recruit legendary heroes, party up with friends, and walk the Roads.<br/>
  Every battle can drop a collectible, and every hero is yours to keep.
</p>

<p align="center">
  <a href="https://decentraland.org/play/?realm=hogdemo.dcl.eth"><b>&#9654;&nbsp; Play the demo</b></a>
  &nbsp;&middot;&nbsp; World: <code>hogdemo.dcl.eth</code>
  &nbsp;&middot;&nbsp; 100% mobile
  &nbsp;&middot;&nbsp; Free to play
</p>

<p align="center"><i>Built for the <b>Regenesis Labs Build Contest</b>.</i></p>

![Heroes of Genesis key art](docs/img/hog-hero-banner.webp)

## What it is

Heroes of Genesis is a full collectible-hero RPG built as a single Decentraland SDK7 scene. You swear an oath to your first hero on the start screen, then build a party and fight through the Roads — floor-by-floor dungeon climbs that end in a boss. Bosses drop hero cards, chests drop hero cards, festivals drop hero cards. Duplicates aren't dead weight: fuse them into rarer, stronger forms.

Everything is designed phone-first. Hold the phone portrait and the whole game — combat, menus, trading, raids — plays like a native mobile card RPG, streamed through Decentraland with no install.

## Features

### Raid with friends

<img src="docs/img/hog-raid.webp" alt="A party of heroes battling a colossal ogre boss" width="640" />

Assemble a live party and descend into the Rift. Chain your heroes' skills — flame strikes, sigil storms, volleys of emerald arrows — and bring down bosses no one survives alone. Every raider walks away with spoils, and the floors get deeper and deadlier.

### Trade face-to-face

<img src="docs/img/hog-trade.webp" alt="Two players trading glowing hero cards across a table" width="640" />

Sit across a real player at the trading table. Offer your cards, lock your side of the deal, and shake on it. No middlemen, no market bots — a lock-in system keeps every deal fair.

### Festivals, realm goals & daily gifts

<img src="docs/img/hog-festival.webp" alt="Heroes celebrating at a festival under fireworks" width="640" />

Join realm-wide festivals where the whole server pushes toward one goal. Send daily gifts to friends, open the ones they send back, and climb the event track for rewards nobody earns alone.

### Fuse duplicates into legends

<img src="docs/img/hog-fuse.webp" alt="Two hero cards fusing into a blazing legendary card" width="640" />

Every chest, raid, and road drops hero cards. Stack duplicates and fuse them into rarer forms, then inspect every hero in their own hall with full art and battle stats.

### Climb the Roads — then climb them again

Each Road ends in a boss. Beat it and the Road ascends to a higher star tier: tougher enemies, richer coin, better drops. Master a Road at five stars and your oath hero ascends with it. A tier picker lets you replay any tier you've conquered to farm the drops you're missing.

## Inside the game

| Clash battles | Build your party | Open chests |
| :---: | :---: | :---: |
| ![Battle screen](docs/img/screens/battle.webp) | ![Party screen](docs/img/screens/party.webp) | ![Shop screen](docs/img/screens/shop.webp) |

## 100% mobile

<img src="docs/img/hog-mobile-portrait.webp" alt="Playing Heroes of Genesis on a phone in portrait" width="300" />

The full game is in your pocket: same raids, trades, and festivals on phone or desktop, same account, same heroes — straight from the browser.

## Run it locally

```
npm install
npm run start
```

Open the Decentraland preview, hold the phone portrait (or narrow the window), and swear in on the start screen.

## Tech notes

- **Decentraland SDK7** scene with an authoritative multiplayer server (`src/server`) — saves, trades, festivals, and raids are validated server-side.
- **React-ECS UI**: the entire game is a screen-space UI rendered over a minimal 3D shell, tuned for portrait phones.
- **Hand-built art pipeline**: every screen, button, and label is pre-rendered imagery; combat uses sprite-sheet flipbooks for hero attack animations.
- Deployed to the Decentraland World <code>hogdemo.dcl.eth</code>.
