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
| Publisher | Optional FFmpeg image-pipe publisher to RTMP/RTMPS or YouTube HLS ingest via ordered HTTPS PUT uploads |
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
| YOUTUBE_CHANNEL_ID | Public YouTube channel ID for channel-level statistics |
| YOUTUBE_API_KEY | Server-side YouTube Data API v3 key; never expose it to browser code |
| YOUTUBE_STATS_INTERVAL_MS | Statistics polling interval, clamped to at least 60 seconds |
| ADMIN_CHANNEL_IDS | Comma-separated YouTube channel IDs allowed to use .start and .stop |
| LOBBY_SECONDS | Lobby countdown, 5–120 seconds |
| GAME_MAX_SECONDS | Global game duration cap |
| ENABLE_CHAT | Set to false to disable the YouTube adapter |
| ENABLE_PUBLISHER | Must be true to start FFmpeg publishing |
| PUBLISH_PROTOCOL | `rtmp` (default) or `hls` |
| PUBLISH_URL | Private relay RTMP(S) URL; used only in RTMP mode |
| YOUTUBE_HLS_STREAM_KEY | YouTube Studio HLS stream key; used only in HLS mode |
| FFMPEG_PATH, FFMPEG_BITRATE | FFmpeg binary and video bitrate |

Never commit .env, a YouTube stream key, or an authenticated relay URL. The example environment is safe to publish.

### YouTube HLS ingest mode

The default publisher remains RTMP. To publish directly to YouTube using HLS, set:

~~~env
ENABLE_PUBLISHER=true
PUBLISH_PROTOCOL=hls
YOUTUBE_VIDEO_ID=your_active_live_video_id
YOUTUBE_HLS_STREAM_KEY=your_hls_stream_key
DATABASE_PATH=./data/infinity-ultra.sqlite
~~~

The publisher generates local MPEG-TS segments with FFmpeg, then uploads each updated media playlist and its segments to YouTube's primary HLS ingest endpoint using HTTPS PUT. It uploads the playlist before the new segments, keeps the rolling playlist at five entries, uses two-second segments, H.264 video and AAC audio, and assigns unique segment filenames per FFmpeg run.

Keep `DATABASE_PATH` on persistent storage while reconnecting to the same YouTube live event. Infinity Gen reserves media-sequence number blocks in SQLite so a restarted encoder can continue with a larger sequence number instead of restarting at zero. Starting a different live event (a different `YOUTUBE_VIDEO_ID`) gets a new sequence starting at zero. If the database is reset while reusing the same live event, sequence continuity cannot be guaranteed.

The HLS stream key is a secret. Put it in the host's environment-secret settings; never place it in the repository, Studio HTML, a URL shared publicly, or browser-side JavaScript. HLS ingest normally has higher latency than RTMP because it is segment-based. Test on an unlisted broadcast before using it publicly. See the [official YouTube HLS ingestion requirements](https://developers.google.com/youtube/data/live/guides/hls-ingestion).

The local segment directory is temporary and is cleaned up when the publisher stops. The persistent SQLite database stores only the sequence reservation, not the stream key or media files.

## YouTube public statistics

Set `YOUTUBE_API_KEY`, `YOUTUBE_CHANNEL_ID` and `YOUTUBE_VIDEO_ID` on the server to enable the public statistics panel. The API key stays server-side; neither the Studio nor the overlay receives it. The manager caches the latest response and polls at `YOUTUBE_STATS_INTERVAL_MS` (minimum 60 seconds).

The channel request reads public subscriber count, total channel views and video count. The live-video request reads video views and likes, plus `concurrentViewers` when YouTube exposes it for the active live broadcast. YouTube may hide or round subscriber counts, and concurrent viewer data may be unavailable; the UI shows an em dash or “Hidden” rather than inventing a value.

At a 60-second interval, two one-unit read requests per minute use approximately 2,880 quota units per day. The standard default allocation is 10,000 units per day for most read endpoints; check the project's current quota in Google Cloud before changing the polling interval. Private YouTube Analytics reports are not included because they require OAuth authorization. See the [YouTube Data API quota documentation](https://developers.google.com/youtube/data/determine_quota_cost).

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
