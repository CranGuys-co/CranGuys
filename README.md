# CranGuys

**A free 60-player jelly-bean party royale that runs in your web browser.** Race through obstacle courses, survive the knock-out rounds and be the last bean standing to grab the crown. Everything (the 3D graphics, every sound and the music) is made by the game's own code, so there's nothing to download.

**Play it:** https://harryxgreenhalgh-prog.github.io/CranGuys/ (no download and no account needed)

> **Disclaimer.** CranGuys is an independent fan-made party game. It is not affiliated with, endorsed by, or connected to Fall Guys, Mediatonic or Epic Games.

## How to play

1. Accept the quick safety rules (they show on every visit).
2. Pick **Solo** (you and 59 bots), **Online** (real players from anywhere, with bots filling the empty spots), **Friends** (a private room with a 5-letter code) or **Ranked**.
3. Press **PLAY**. A show is four rounds: two races, a survival round, then the final. Qualify each round to stay in, and win the final to take the crown.

### Controls

| Action | Keyboard and mouse | Controller | Touch |
| --- | --- | --- | --- |
| Run | W A S D or the arrow keys | Left stick | Floating stick (left half of the screen) |
| Jump | Space | A | JUMP |
| Dive | Ctrl, C or X | X or B | DIVE |
| Grab | E | Any bumper or trigger | GRAB |
| Look around | Click the game to lock the mouse, or drag; J / L turn the camera | Right stick | Drag on the right half |

Mouse sensitivity, invert Y and chat options are in **Settings**.

## What's in it

- **12 rounds**, picked at random for every show:
  - **Races:** Whirl Way, Hammer Hills, Trust Tiles, Slime Surge, Rope Rumble and Red Light Rush.
  - **Survival:** Tile Tumble, Jump Ring, Wall Rush, Colour Clash and Boulder Bash. Each one also has a smaller **final** version.
  - **Final:** Crown Peak, a climb up a mountain while boulders roll down at you.
  - Plus **Waiting Island**, the lobby where you bounce around while the show fills up.
- **Locker:** colours, patterns, faces and hats for your bean, with **try-on** before you buy.
- **Shop:** a rotating daily selection, paid for with Cranberries and Crowns that you earn by playing.
- **CranPass:** a free reward road. Every level pays out, and some items are only available here.
- **Codes:** promo codes unlock exclusive items.
- **Ranked:** 1v1 duels (first to 3 round wins) and ranked shows (5+ real players), with tiers from Bronze upwards and a global leaderboard.
- **World records:** the fastest time ever on each race.
- **Save codes:** move your bean to another device without an account.

### Online (optional, free, no account)

There's no game server. One player's browser **hosts** the show and runs the same rules a server would, and everyone else connects to it directly (WebRTC). Public MQTT brokers are only used to help browsers find each other, and as a slower relay when a direct connection is blocked (strict school or office networks). If the host leaves, the show moves to another player ("Switching hosts…") and carries on.

Chat is filtered twice (before sending and on arrival), you can mute anyone, and you can switch to quick-chat only or turn chat off.

## Privacy

Playing Solo sends nothing anywhere. Your bean, items and progress are kept in your browser. Online, other players in your show see your nickname, your bean and your chat messages. The global leaderboard and world records publish your nickname, bean colour and score. There are no accounts, emails or passwords.

**Ads:** a small native banner may appear on the main menu and the end-of-show screen, never during a round. It only runs on the github.io site, inside its own frame, and is controlled by `ADS_ON` in `src/ui/ads.js`.

## For developers

```bash
npm install
npm run dev      # play locally at the address Vite prints
npm test         # the test suites
npm run build    # static files in dist/
```

The game has no runtime dependencies (its WebGL2 renderer, physics, audio and networking are all its own code), so `index.html` and `src/` also run as they are, from any static web server, without a build.

- **Hosting:** `.github/workflows/deploy.yml` tests, builds and publishes `dist/` to GitHub Pages on every push to `main` (repository **Settings → Pages → Source: GitHub Actions**).
- **Builds and multiplayer:** players can only play together on exactly the same build. `npm run build` stamps a fingerprint of the code into `src/sim/config.js` (`BUILD`) and into the `cg-build` tag in `index.html` (see `vite.config.js`). A game that's already open checks the website every few minutes and offers a reload when a newer build is live. `npm run dev` and the unbuilt files use `__BUILD__`, which turns that check off. Change `PROTO` in `src/sim/config.js` when the message format changes.
- **Promo codes:** `npm run promo-key -- THECODE` prints the fingerprint to add to `PROMOS` in `src/economy/promo.js`. Only fingerprints are stored, so keep the codes themselves out of this public repo.
- **Optional server:** the game can also use a dedicated CranGuys server (`RemoteConn` in `src/online/net.js`, `RemoteBackend` in `src/online/api.js`, address in Settings). None is needed. On GitHub Pages it asks the site for one at startup, gets a harmless 404 in the console, and uses peer-to-peer instead.
- **Test hooks** (set from the browser console): `CG_SHOW = ['wallrush:final']` picks the rounds, `CG.autopilot = true` lets the bot AI drive your bean in Solo, `CG_BROKERS = ['ws://…']` uses your own MQTT broker, and `?addebug` shows why the ad did or didn't load.

```
index.html        the page: every screen's markup, plus the stylesheet and entry script
src/main.js       entry point: boots everything, runs the frame loop and the show flow
src/play.js       a show on this device: prediction, interpolation, what you see happen
src/input.js      keyboard, mouse, controllers and the touch layout
src/util.js       DOM helpers, safe storage, settings, colours
src/styles.css    the candy UI
src/sim/          the deterministic game: maths, config, collisions, world, the bean controller,
                  bots, the authoritative show (game.js) and the wire protocol
src/levels/       the level kit, the registry and every round (each a pure function of a seed)
src/render/       WebGL2 renderer, procedural geometry, bean animation, scenes, cameras
src/audio/        synthesised sound effects and music
src/ui/           menus, Locker, Shop, Pass, HUD and results, chat panel, icons, rank badges, ads
src/online/       peer-to-peer hosting, local and remote connections, the save/economy backends,
                  names, the chat filter and ranked points
src/economy/      the cosmetics catalogue and shop rules, CranPass rewards, promo codes
tools/            promo-key.mjs
tests/            node:test suites
```

Levels and the show are built from a seed, and the simulation runs at a fixed 30 ticks a second, so every browser in a show builds an identical world. Bots press the same buttons a human would.
