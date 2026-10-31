# Infinity Gen Ultra

**Play Together. Build Together. Explore Infinity.**

Infinity Gen Ultra is the community-first remake of Infinity Gen Smart Overlay, developed in a separate branch and directory so the earlier prototype remains available.

- **16 cooperative games** with controlled inputs and no player-targeted elimination.
- **Community Missions** for live, daily, weekly and world progress.
- **Infinity Coins, XP, levels and achievements** with a durable transaction ledger.
- **Ultra Store** for cosmetics, collectibles, optional utilities and deterministic crafting.
- **Gamma Aurora Studio and Overlay** with a server-rendered 1920×1080 PNG scene.
- **Optional YouTube Live Chat and FFmpeg publisher** modules.

## Quick start

Requirements: Node.js 22.13+, FFmpeg only when publishing, and Cairo/Pango development libraries for Canvas.

~~~sh
sudo apt install ffmpeg libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev
npm install
cp ultra/.env.example .env
~~~

Set ADMIN_TOKEN in .env before exposing the server, then run npm start.

Studio: http://localhost:3000/studio/  
Overlay: http://localhost:3000/overlay/

Read the full setup, command reference, architecture and operational cautions in ultra/README.md.

## Branch safety

The remake is developed on remake-ultra. The earlier main and revival-v6-core branches are not modified by this branch's work. The previous all-in-one prototype files remain in the repository for comparison and fallback.

## Important

This branch is a substantial implementation foundation, not a claim of production readiness. Real YouTube chat, Canvas native builds, FFmpeg/RTMP publishing, restart recovery and long-duration hosting still require integration testing.

## Identity

**Made for community play. Powered by Gamma Aurora.**
