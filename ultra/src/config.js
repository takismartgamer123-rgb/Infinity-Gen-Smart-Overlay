'use strict';
const path = require('node:path');
const crypto = require('node:crypto');
function list(value) { return String(value || '').split(',').map(function (part) { return part.trim(); }).filter(Boolean); }
function loadConfig(env) {
  env = env || process.env;
  const generatedToken = !env.ADMIN_TOKEN;
  const publisherProtocol = String(env.PUBLISH_PROTOCOL || 'rtmp').toLowerCase();
  if (!['rtmp', 'hls'].includes(publisherProtocol)) throw new Error('PUBLISH_PROTOCOL must be rtmp or hls.');
  const config = {
    port: Math.max(1, Math.min(65535, Number(env.PORT || 3000))),
    host: env.HOST || '0.0.0.0',
    databasePath: path.resolve(env.DATABASE_PATH || './data/infinity-ultra.sqlite'),
    adminToken: env.ADMIN_TOKEN || crypto.randomBytes(32).toString('hex'),
    generatedToken: generatedToken,
    adminChannelIds: list(env.ADMIN_CHANNEL_IDS),
    youtubeVideoId: env.YOUTUBE_VIDEO_ID || '',
    publishUrl: env.PUBLISH_URL || env.YOUTUBE_RTMP || '',
    publisherProtocol: publisherProtocol,
    youtubeHlsStreamKey: env.YOUTUBE_HLS_STREAM_KEY || '',
    ffmpegPath: env.FFMPEG_PATH || 'ffmpeg',
    ffmpegBitrate: env.FFMPEG_BITRATE || '1800k',
    lobbySeconds: Math.max(5, Math.min(120, Number(env.LOBBY_SECONDS || 20))),
    gameMaxSeconds: Math.max(60, Math.min(1800, Number(env.GAME_MAX_SECONDS || 300))),
    enableChat: env.ENABLE_CHAT !== 'false',
    enablePublisher: env.ENABLE_PUBLISHER === 'true'
  };
  if (!Number.isInteger(config.port)) throw new Error('PORT must be an integer.');
  return Object.freeze(config);
}
module.exports = { loadConfig, list };
