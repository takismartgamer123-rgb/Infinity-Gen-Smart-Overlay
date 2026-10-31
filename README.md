# Infinity Gen Smart Overlay

**Interactive YouTube Live Chat games rendered as a 1920×1080 stream overlay.**

Infinity Gen connects a YouTube live chat reader to a small game engine. Chat commands update game state, the Canvas renderer produces PNG frames, and FFmpeg composites those frames over a background and sends the result to an RTMP destination.

> This is an experimental revival branch. Test on an unlisted/private stream before using it for a public broadcast.

## Runtime

- Node.js **22.x or 24.x**
- FFmpeg
- Native build dependencies for `node-canvas`:
  - `libcairo2-dev`
  - `libpango1.0-dev`
  - `libjpeg-dev`
  - `libgif-dev`
  - `librsvg2-dev`
- Cairo font at `fonts/Cairo-Bold.ttf` (the renderer falls back if it is missing)

On Debian/Ubuntu-based systems:

```bash
sudo apt update
sudo apt install ffmpeg libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev
npm install
```

## Configuration

Set these environment variables before starting:

| Variable | Required | Description |
|---|---:|---|
| `YOUTUBE_VIDEO_ID` | Yes | ID of the active YouTube live stream whose chat should be read |
| `YOUTUBE_RTMP` | For RTMP output | Full YouTube RTMP ingest URL including the private stream key |
| `PORT` | No | HTTP port; defaults to `3000` |

**Keep the RTMP stream key private.** Do not commit it to Git or paste it into public issues.

Example:

```bash
export YOUTUBE_VIDEO_ID="YOUR_LIVE_VIDEO_ID"
export YOUTUBE_RTMP="rtmp://a.rtmp.youtube.com/live2/YOUR_PRIVATE_STREAM_KEY"
npm start
```

## Chat commands

Open a game from the idle screen:

```text
.start xo
.start مافيا
.start rps
.start تخمين
.start كلمة
.start عجلة
.start سؤال
.start كتابة
.start كلمات
.start مليون
.start كنز
.start سجن
.start سرعة
.start قاتل
.start بورصة
.start مملكة
```

During the 30-second lobby countdown, viewers listed as players can join with:

```text
ادخل
```

The lobby host can stop the current session with:

```text
.stop
```

Game-specific commands are shown by the relevant game renderer where available. Some games are still being balanced and need live-chat testing.

## HTTP endpoints

- `/` — basic server response
- `/health` — health check
- `/status` — JSON runtime status
- `/overlay.png` — latest locally rendered overlay frame

## Development checks

Run the built-in regression suite:

```bash
npm test
```

The tests cover game input validation, winner detection, ownership restrictions, selected round transitions, and renderer state safety.

## Current limitations

- The YouTube Live Chat connection must still be verified against a real unlisted test stream; the current integration uses `masterchat`.
- Mafia currently has no private role-delivery mechanism. Do not treat it as ready for a public game until role delivery is redesigned or authenticated private messaging is added.
- FFmpeg/RTMP output must be tested with the target hosting environment and stream settings.
- The 5-minute session guard is a fallback so an unfinished round cannot occupy the game slot forever.
