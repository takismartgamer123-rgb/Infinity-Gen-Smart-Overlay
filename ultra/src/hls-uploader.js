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
  const targetLine = lines.find((line) => line.startsWith('#EXT-X-TARGETDURATION:'));
  const targetDuration = targetLine ? Number(targetLine.slice(targetLine.indexOf(':') + 1)) : 2;
  if (!Number.isFinite(targetDuration) || targetDuration < 1 || targetDuration > 5) {
    throw new Error('HLS target duration must be between one and five seconds.');
  }
  const versionLine = lines.find((line) => line.startsWith('#EXT-X-VERSION:'));
  const version = versionLine ? Number(versionLine.slice(versionLine.indexOf(':') + 1)) : 3;
  if (!Number.isSafeInteger(version) || version < 1 || version > 9) throw new Error('HLS playlist version is invalid.');

  const segments = [];
  let duration = null;
  for (const line of lines) {
    if (line.startsWith('#EXTINF:')) {
      const raw = line.slice('#EXTINF:'.length).split(',')[0];
      const parsedDuration = Number(raw);
      if (!Number.isFinite(parsedDuration) || parsedDuration <= 0 || parsedDuration > 5) {
        throw new Error('HLS segment duration must be greater than zero and no longer than five seconds.');
      }
      duration = raw;
    } else if (!line.startsWith('#')) {
      if (duration === null) throw new Error('HLS segment is missing its EXTINF duration.');
      segments.push({ filename: safeIngestFilename(line, '.ts'), duration });
      duration = null;
    }
  }
  if (duration !== null) throw new Error('HLS playlist ends with an incomplete segment entry.');
  if (segments.length > 5) throw new Error('HLS playlist contains more than five segments.');
  return { mediaSequence, targetDuration, version, segments };
}

function buildProgressPlaylist(parsed, lastIncludedIndex) {
  const lines = [
    '#EXTM3U',
    '#EXT-X-VERSION:' + parsed.version,
    '#EXT-X-TARGETDURATION:' + parsed.targetDuration,
    '#EXT-X-MEDIA-SEQUENCE:' + parsed.mediaSequence
  ];
  for (let index = 0; index <= lastIncludedIndex; index++) {
    const segment = parsed.segments[index];
    lines.push('#EXTINF:' + segment.duration + ',', segment.filename);
  }
  return lines.join('\n') + '\n';
}

function buildSequencePlaylist(options) {
  const firstSequence = Math.max(options.startNumber, options.sequence - 2);
  const lines = [
    '#EXTM3U',
    '#EXT-X-VERSION:' + options.version,
    '#EXT-X-TARGETDURATION:' + options.targetDuration,
    '#EXT-X-MEDIA-SEQUENCE:' + firstSequence
  ];
  for (let sequence = firstSequence; sequence <= options.sequence; sequence++) {
    const filename = options.segmentPrefix + String(sequence).padStart(8, '0') + '.ts';
    safeIngestFilename(filename, '.ts');
    const duration = options.durationByFilename.get(filename) || options.segmentDuration;
    lines.push('#EXTINF:' + duration + ',', filename);
  }
  return lines.join('\n') + '\n';
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
        'User-Agent': 'Infinity Gen / Ultra HLS Publisher / 1.0'
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
    this.segmentPrefix = String(settings.segmentPrefix || '');
    if (!/^[A-Za-z0-9_-]{1,48}$/.test(this.segmentPrefix)) throw new Error('HLS segment prefix is invalid.');
    this.segmentDuration = String(settings.segmentDuration || '2.000000');
    this.events = settings.events || null;
    this.upload = settings.upload || putFile;
    this.agent = new https.Agent({ keepAlive: true, maxSockets: 2 });
    this.timer = null;
    this.syncing = false;
    this.activeSync = null;
    this.stopped = false;
    this.lastError = '';
    this.retryDelay = 350;
    this.retryAfter = 0;
  }

  segmentFilename(sequence) {
    return safeIngestFilename(this.segmentPrefix + String(sequence).padStart(8, '0') + '.ts', '.ts');
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
    if (this.stopped || this.syncing || Date.now() < this.retryAfter) return false;
    this.syncing = true;
    const operation = this.syncInternal();
    this.activeSync = operation;
    try {
      const result = await operation;
      this.retryDelay = 350;
      this.retryAfter = 0;
      if (result) this.lastError = '';
      return result;
    } catch (error) {
      this.retryAfter = Date.now() + this.retryDelay;
      this.retryDelay = Math.min(10000, this.retryDelay * 2);
      throw error;
    } finally {
      this.syncing = false;
      this.activeSync = null;
      if (this.stopped) this.agent.destroy();
    }
  }

  async syncInternal() {
    const playlistPath = path.join(this.directory, this.playlistName);
    let playlist;
    try { playlist = await fs.promises.readFile(playlistPath, 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') return false; throw error; }
    const parsed = parseMediaPlaylist(playlist);
    if (!parsed.segments.length) return false;

    const durationByFilename = new Map(parsed.segments.map((item) => [item.filename, item.duration]));
    let uploaded = 0;
    while (true) {
      const filename = this.segmentFilename(this.nextSequence);
      const filePath = path.join(this.directory, filename);
      let bytes;
      try { bytes = await fs.promises.readFile(filePath); }
      catch (error) {
        if (error.code !== 'ENOENT') throw error;
        if (parsed.mediaSequence > this.nextSequence) {
          throw new Error('HLS segment gap detected: a required local segment is missing after the playlist advanced.');
        }
        break;
      }

      // Include the two most recent acknowledged segments, then the next outstanding segment.
      const progressPlaylist = buildSequencePlaylist({
        startNumber: this.startNumber,
        sequence: this.nextSequence,
        version: parsed.version,
        targetDuration: parsed.targetDuration,
        segmentPrefix: this.segmentPrefix,
        segmentDuration: this.segmentDuration,
        durationByFilename
      });
      await this.upload(
        this.baseUrl, this.playlistName, Buffer.from(progressPlaylist, 'utf8'),
        'application/vnd.apple.mpegurl', this.agent
      );
      await this.upload(this.baseUrl, filename, bytes, 'video/MP2T', this.agent);
      this.nextSequence++;
      uploaded++;
      await fs.promises.unlink(filePath).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
    return uploaded > 0;
  }

  async drain() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    while (this.activeSync) await this.activeSync.catch(() => {});
    if (!this.stopped) {
      try { await this.sync(); }
      finally { this.stop(); }
    }
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (!this.syncing) this.agent.destroy();
  }

  status() {
    return {
      running: Boolean(this.timer) && !this.stopped,
      nextSequence: this.nextSequence,
      retryDelay: this.retryDelay
    };
  }
}

module.exports = {
  HlsIngestUploader, buildHlsIngestBase, parseMediaPlaylist,
  buildProgressPlaylist, buildSequencePlaylist, safeIngestFilename, putFile
};
