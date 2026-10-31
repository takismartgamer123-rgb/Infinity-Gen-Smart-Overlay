# Infinity Gen Ultra

**A community-first remake of Infinity Gen Smart Overlay.**  
**Play Together. Build Together. Explore Infinity.**

Infinity Gen Ultra is a modular monolith built around one server-side engine. It connects a live chat adapter, a safe game catalog, shared missions, progression, an auditable virtual economy, the Ultra Store, a Gamma Aurora overlay, a control Studio and an optional FFmpeg publisher.

The remake lives in its own ultra directory. The original prototype files (server.js, games.js and the existing tests) are retained on this branch for comparison and rollback.

## Product principles

- Games are cooperative or challenge-based. No player elimination, public accusations, executions, personal harassment or stealing points.
- Community missions count verified game actions, not raw chat messages. Rewards go to eligible contributors when a shared target is reached.
- Infinity Coins (IC) are earned in-game. There are no cash purchases, donations, player-to-player transfers, paid loot boxes, betting or pay-to-win items.
- Store crafting has known, deterministic recipes. Utility items are optional and never guarantee a win.
- User-provided chat text is not rendered directly into the overlay. Names and displayed content are length-limited and sanitized.
- The Studio API is protected by an admin token. YouTube chat commands that start or stop sessions additionally require configured channel IDs.

## Architecture

| Module | Responsibility |
|---|---|
| Core / Persistence | SQLite WAL, durable profiles, sessions, transaction ledger |
| Safety | Input normalization, duplicate suppression, cooldowns and rate limits |
| Game Engine | Lobby lifecycle, 16 registered games, session snapshots |
| Missions | Live, daily, weekly and world community goals |
| Economy | Atomic IC ledger, XP and levels, idempotent rewards |
| Progression | Achievements and contribution milestones |
| Ultra Store | Catalog, inventory, equip slots and deterministic crafting |
| YouTube Adapter | Masterchat input; optional and separately configured |
| Renderer | Server-side 1920×1080 Gamma Aurora PNG frames |
| Publisher | Optional FFmpeg image-pipe publisher to RTMP/RTMPS |
| Studio / Overlay | Static control dashboard and read-only live overlay |

This is intentionally a **modular monolith**, not a collection of separately hosted microservices. The modules can be separated later if a real operational need appears.

## Game library

1. Quiz Arena — solve five knowledge questions together.
2. Code Breaker — crack a four-digit code using exact/misplaced digit clues.
3. Number Matrix — complete a number sequence.
4. Word Forge — build a shared word chain from a controlled vocabulary.
5. Memory Pulse — memorize and recall a short sequence.
6. Pattern Lab — identify the next symbol in a pattern.
7. Reaction Signal — wait for GO and respond.
8. Typing Sprint — type the exact phrase; record the first finishers.
9. Math Relay — solve five calculations in sequence.
10. Flag Explorer — identify five flags.
11. Pixel Reveal — use progressive clues to identify an object.
12. Emoji Master — decode an emoji clue.
13. Treasure Expedition — explore a shared 5×5 map.
14. Rocket Launch — complete a cooperative countdown.
15. Build Our City — deliver shared resources to finish a city.
16. Portal Expedition — solve three riddles to open a shared portal.

The game catalog uses built-in answers or controlled inputs. It can be expanded through the game definition contract in ultra/src/games.js.

## Runtime requirements

- Node.js **22.13+** (or a compatible Node 24 release)
- FFmpeg only when publishing is enabled
- node-canvas native build dependencies for server-side PNG rendering:
  - libcairo2-dev
  - libpango1.0-dev
  - libjpeg-dev
  - libgif-dev
  - librsvg2-dev
- A supported Linux system is recommended for the first build.

On Debian / Ubuntu:

~~~sh
sudo apt update
sudo apt install ffmpeg libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev
npm install
~~~

Create a local environment file:

~~~sh
cp ultra/.env.example .env
~~~

Set a long, private ADMIN_TOKEN. Then start the engine:

~~~sh
npm start
~~~

Open the Studio at http://localhost:3000/studio/. The OBS browser source can use http://HOST:3000/overlay/; the engine itself does not need an operator browser window to keep its game state running.

The default database is ./data/infinity-ultra.sqlite. Keep the data directory on persistent storage and back it up before upgrades.

## Environment variables

| Variable | Purpose |
|---|---|
| ADMIN_TOKEN | Private token for Studio write operations |
| HOST, PORT | HTTP bind address and port |
| DATABASE_PATH | SQLite database path |
| YOUTUBE_VIDEO_ID | Active YouTube live video ID for chat input |
| ADMIN_CHANNEL_IDS | Comma-separated YouTube channel IDs allowed to use .start and .stop |
| LOBBY_SECONDS | Lobby countdown, 5–120 seconds |
| GAME_MAX_SECONDS | Global game duration cap |
| ENABLE_CHAT | Set to false to disable the YouTube adapter |
| ENABLE_PUBLISHER | Must be true to start FFmpeg publishing |
| PUBLISH_URL | Private relay RTMP(S) URL; YOUTUBE_RTMP is accepted as a fallback |
| FFMPEG_PATH, FFMPEG_BITRATE | FFmpeg binary and video bitrate |

Never commit .env, a YouTube stream key, or an authenticated relay URL. The example environment is safe to publish.

## Chat commands

The configured channel operator may open a lobby:

~~~text
.start quiz-arena
.start build-our-city
.stop
~~~

Viewers join an open lobby with:

~~~text
!join
~~~

Community account and store commands work from the verified YouTube channel identity:

~~~text
!profile
!missions
!achievements
!store
!buy violet-title
!inventory
!equip violet-title
!craft craft-aurora-frame
~~~

Store purchases and crafting are deduplicated by the source chat message ID. These commands show confirmation on the live overlay; this adapter does not post messages back into YouTube chat.

Game commands are displayed by the game or described in its Studio card. Common patterns include !answer, !guess, !solve, !recall, !move, !count and !build. Typing Sprint accepts the exact displayed phrase.

For security, .start and .stop are ignored unless ADMIN_CHANNEL_IDS matches the message author's channel ID (or the exact configured fallback identity).

## HTTP endpoints

| Endpoint | Purpose |
|---|---|
| /health | Process health check |
| /api/status | Engine, chat and publisher status |
| /api/games | Game catalog |
| /api/state | Current game, missions and community progression |
| /api/missions | Mission catalog and progress |
| /api/store/catalog | Unlocked store items and recipes |
| /api/profile/:id | Public profile, inventory, achievements and recent ledger |
| /studio/ | Admin dashboard |
| /overlay/ | Live browser overlay |
| /overlay.png | Latest server-rendered PNG frame |
| /ws | Read-only state and event stream |

Write endpoints under /api/admin/ require Authorization: Bearer ADMIN_TOKEN.

## Economy and Ultra Store

- One spendable currency: Infinity Coins (IC).
- XP and levels are progression values, not spendable currency.
- A successful, validated game action earns a small fixed reward, capped at three reward-eligible actions per viewer per game session.
- Mission rewards are granted once to each eligible contributor after completion.
- Wallet balances cannot go below zero; all coin changes are recorded in a transaction ledger.
- Store items are non-transferable. Equipping is cosmetic; utility tokens remain optional.
- Crafting consumes known materials and produces a known output. There are no random outcomes.

## Safety and operational notes

- The HTTP API is intended to sit behind HTTPS when exposed publicly.
- Use a strong ADMIN_TOKEN, restrict network access to admin endpoints, and configure only trusted channel IDs.
- Do not expose the server's environment or process command line in diagnostics.
- This build does not implement private viewer-to-viewer messaging.
- The YouTube masterchat adapter still needs a real unlisted-stream integration test.
- The native Canvas build and FFmpeg publisher still need to be tested on the actual target host.
- A YouTube ingest URL should remain private. For a relay design, set PUBLISH_URL to the relay ingest instead of committing a destination.
- A successful local test does not prove 24/7 hosting reliability. Validate reconnects, persistence after restarts, resource use and a long unlisted broadcast before any public launch.

## Development

~~~sh
npm test
npm run check
~~~

The legacy prototype can still be started with:

~~~sh
npm run legacy:start
~~~

## License

The repository's existing project license and upstream dependency licenses continue to apply. Check the relevant licenses before redistributing bundled fonts, artwork or third-party assets.
