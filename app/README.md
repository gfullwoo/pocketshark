# PocketShark app (iOS first, Android later)

The cozy care game from `design/game-design.md` in the PocketShark project: keep one of the rarest sharks on Earth fed, safe and happy. Built with Expo (React Native) and Skia, in TypeScript, so one codebase ships to iPhone and Android.

## Run it on your iPhone (no Apple Developer account needed)

1. On your iPhone, install **Expo Go** from the App Store.
2. On your Mac:
   ```bash
   cd app
   npm install
   npx expo start
   ```
3. Scan the QR code in the terminal with the iPhone Camera app. It opens in Expo Go.

Your Mac and iPhone need to be on the same Wi-Fi. If they aren't, run `npx expo start --tunnel`.

Saving a file reloads the app on the phone. Shake the phone for the developer menu.

**Quick look in a browser:** `npm run web`. This is handy for checking layout, but it isn't the real thing: haptics don't work, and drawing is slower than on a phone.

## What's in v0.1

- **Home reef:** drag to swim. The cave on the left is home. Tap **Home** to swim there.
- **Glow:** tap **Glow** to light the pockets. Snacks swim toward the light and dart away from a dark shark. Glow drains while lit and recharges fastest at home.
- **Big shark:** passes every 25–45 seconds after a yellow "!" warning. If it catches you glowing, you get a scare (less safety and health) and dart home. It never eats you. Staying dim or at home earns +5 GP.
- **Meters:** fullness, glow, safety, health, plus a mood (happy, content, peckish, uneasy, resting). At 0 health the shark sleeps at home until it recovers.
- **While you're away:** the shark rests at home, gets hungrier but never drops below the floors, and recharges. A "welcome back" card shows what changed. Catch-up stops after 72 hours.
- **Glow Points:** snacks (1 / 3 / 10), +5 per hour spent happy, +10 daily visit, +5 for a dodge.
- Everything is saved on the phone.

Not yet: exploring other zones, more homes, mates and the colony, sound, notifications, and an app icon.

## Code

| Path | What |
|---|---|
| `src/model/care.ts` | Care rules: meters, mood, decay, offline catch-up, Glow Points (pure TS, unit-tested) |
| `src/game/world.ts` | Reef simulation and drawing: shark, snacks, big shark, cave |
| `src/game/scenery.ts` | Cave, reef and kelp art (shared look with the web game) |
| `src/game/ctx2d.ts` | Canvas-style drawing API on top of Skia, so the web game's art runs unchanged |
| `src/screens/HomeReef.tsx` | The screen: game loop, buttons, meters, cards |

```bash
npm test           # care model unit tests
npm run typecheck
npx expo-doctor    # dependency health
```

## Getting it on TestFlight / the App Store (later)

1. Join the Apple Developer Program ($99/yr).
2. `npx eas-cli@latest login`, then `npx eas-cli@latest build --platform ios`. EAS builds and signs in the cloud, so you don't need Xcode for this.
3. `npx eas-cli@latest submit --platform ios` uploads it to TestFlight.

The bundle ID is `com.mypocketshark.app` (in `app.json`). Change it before the first build if you want something else, because it can't change after release.
