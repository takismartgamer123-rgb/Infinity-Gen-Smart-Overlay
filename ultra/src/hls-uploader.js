'use strict';

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

function buildHlsIngestBase(streamKey) {
  const key = String(streamKey || '').trim();
  if (!/^[A-Za-z0-9-]{8,128}$/.test(key)) {
    throw new Error('YOUTUBE_HLS_STREAM_KEY must contain only the YouTube stream-key characters.');
  }
  return 'https://a.upload.youtube.com/http_upload_hls?cid=' + key + '&copy=0&file=';
}

function safeIngestFilename(filename, extension) {
  const value = String(filename || '');
  if (!/^[A-Za-z0-9._-]+$/.test(value) || value.includes('..') || !value.endsWith(extension)) {
    throw new Error('Invalid HLS ingest filename.');
  }
  return value;
}

function parseMediaPlaylist(source) {
  const text = String(source || '');
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines[0] !== '#EXTM3U') throw new Error('FFmpeg produced an invalid HLS media playlist.');
  if (lines.some((line) => line.startsWith('#EXT-X-KEY') || line.startsWith('#EXT-X-SESSION-KEY'))) {
    throw new Error('Encrypted HLS playlists are not supported by YouTube ingest.');
  }
  const sequenceLine = lines.find((line) => line.startsWith('#EXT-X-MEDIA-SEQUENCE:'));
  if (!sequenceLine) throw new Error('HLS playlist is missing EXT-X-MEDIA-SEQUENCE.');
  const mediaSequence = Number(sequenceLine.slice(sequenceLine.indexOf(':') + 1));
  if (!Number.isSafeInteger(mediaSequence) || mediaSequence < 0) throw new Error('HLS media sequence is invalid.');
  const segments = lines.filter((line) => !line.startsWith('#')).map((line) => safeIngestFilename(line, '.ts'));
  if (segments.length > 5) throw new Error('HLS playlist contains more than five segments.');
  return { mediaSequence, segments };
}

function putFile(baseUrl, filename, body, contentType, agent) {
  safeIngestFilename(filename, filename.endsWith('.m3u8') ? '.m3u8' : '.ts');
  const target = new URL(String(baseUrl) + filename);
  if (target.protocol !== 'https:' || target.hostname !== 'a.upload.youtube.com') {
    throw new Error('HLS ingest requests must use the official YouTube primary HTTPS endpoint.');
  }
  return new Promise((resolve, reject) => {
    const request = https.request(target, {
      method: 'PUT',
      agent,
      headers: {
        'Content-Type': contentType,
        'Content-Length': body.length,
        'User-Agent': 'Infinity Gen / HLS Publisher'
      }
    }, (response) => {
      let responseText = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { responseText = (responseText + chunk).slice(-1000); });
      response.on('end', () => {
        if (response.statusCode === 200 || response.statusCode === 202) {
          resolve({ statusCode: response.statusCode });
        } else {
          reject(new Error('YouTube HLS upload returned HTTP ' + response.statusCode + (responseText ? ': ' + responseText : '')));
        }
      });
    });
    request.setTimeout(30000, () => request.destroy(new Error('YouTube HLS upload timed out.')));
    request.on('error', reject);
    request.end(body);
  });
}

class HlsIngestUploader {
  constructor(options) {
    const settings = options || {};
    this.baseUrl = String(settings.baseUrl || '');
    this.directory = path.resolve(settings.directory || '.');
    this.playlistName = safeIngestFilename(settings.playlistName || 'infinity-gen.m3u8', '.m3u8');
    this.startNumber = Number(settings.startNumber || 0);
    if (!Number.isSafeInteger(this.startNumber) || this.startNumber < 0) throw new Error('HLS start number is invalid.');
    this.nextSequence = this.startNumber;
    this.events = settings.events || null;
    this.upload = settings.upload || putFile;
    this.agent = new https.Agent({ keepAlive: true, maxSockets: 2 });
    this.timer = null;
    this.syncing = false;
    this.stopped = false;
    this.lastError = '';
  }

  start() {
    if (this.timer || this.stopped) return;
    this.timer = setInterval(() => this.sync().catch((error) => this.report(error)), 350);
    this.timer.unref?.();
    this.sync().catch((error) => this.report(error));
  }

  report(error) {
    const message = error && error.message ? error.message : String(error);
    if (message === this.lastError) return;
    this.lastError = message;
    if (this.events) this.events.emit('system:warning', {
      message: 'YouTube HLS upload is waiting for a successful retry.',
      detail: message
    });
  }

  async sync() {
    if (this.stopped || this.syncing) return false;
    this.syncing = true;
    try {
      const playlistPath = path.join(this.directory, this.playlistName);
      let playlist;
      try { playlist = await fs.promises.readFile(playlistPath, 'utf8'); }
      catch (error) { if (error.code === 'ENOENT') return false; throw error; }
      const parsed = parseMediaPlaylist(playlist);
      if (!parsed.segments.length) return false;

      const firstPendingIndex = Math.max(0, this.nextSequence - parsed.mediaSequence);
      if (parsed.mediaSequence > this.nextSequence) {
        throw new Error('HLS segment gap detected: the local playlist advanced past the next required sequence.');
      }
      const pending = [];
      for (let index = firstPendingIndex; index < parsed.segments.length; index++) {
        const sequence = parsed.mediaSequence + index;
        if (sequence !== this.nextSequence + pending.length) {
          throw new Error('HLS segment sequence is not contiguous.');
        }
        pending.push({ sequence, filename: parsed.segments[index] });
      }
      if (!pending.length) return false;

      // Publish the playlist first so YouTube knows which segment files to expect.
      await this.upload(this.baseUrl, this.playlistName, Buffer.from(playlist, 'utf8'), 'application/vnd.apple.mpegurl', this.agent);
      for (const segment of pending) {
        const filePath = path.join(this.directory, segment.filename);
        const bytes = await fs.promises.readFile(filePath);
        await this.upload(this.baseUrl, segment.filename, bytes, 'video/MP2T', this.agent);
        this.nextSequence = segment.sequence + 1;
        await fs.promises.unlink(filePath).catch((error) => {
          if (error.code !== 'ENOENT') throw error;
        });
      }
      this.lastError = '';
      return true;
    } finally {
      this.syncing = false;
      if (this.stopped) this.agent.destroy();
    }
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (!this.syncing) this.agent.destroy();
  }

  status() {
    return { running: Boolean(this.timer) && !this.stopped, nextSequence: this.nextSequence };
  }
}

module.exports = { HlsIngestUploader, buildHlsIngestBase, parseMediaPlaylist, safeIngestFilename, putFile };
