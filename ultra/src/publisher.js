'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { HlsIngestUploader, buildHlsIngestBase } = require('./hls-uploader');

function buildRtmpArgs(config) {
  return [
    '-hide_banner', '-loglevel', 'warning',
    '-thread_queue_size', '512', '-f', 'image2pipe', '-framerate', '1', '-vcodec', 'png', '-i', 'pipe:0',
    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-map', '0:v:0', '-map', '1:a:0',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency',
    '-pix_fmt', 'yuv420p', '-g', '60', '-b:v', config.ffmpegBitrate, '-maxrate', config.ffmpegBitrate,
    '-bufsize', '3600k', '-c:a', 'aac', '-b:a', '96k', '-ar', '44100',
    '-f', 'flv', config.publishUrl
  ];
}

function buildHlsArgs(config, directory, startNumber, segmentPrefix) {
  const playlistPath = path.join(directory, 'infinity-gen.m3u8');
  const segmentPath = path.join(directory, segmentPrefix + '%08d.ts');
  return [
    '-hide_banner', '-loglevel', 'warning',
    '-thread_queue_size', '512', '-f', 'image2pipe', '-framerate', '1', '-vcodec', 'png', '-i', 'pipe:0',
    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-map', '0:v:0', '-map', '1:a:0',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency',
    '-flags', '+cgop', '-pix_fmt', 'yuv420p', '-r', '30', '-fps_mode', 'cfr',
    '-g', '60', '-keyint_min', '60', '-sc_threshold', '0', '-force_key_frames', 'expr:gte(t,n_forced*2)',
    '-b:v', config.ffmpegBitrate, '-maxrate', config.ffmpegBitrate, '-bufsize', '3600k',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '44100',
    '-f', 'hls', '-hls_segment_type', 'mpegts', '-hls_time', '2', '-hls_list_size', '5',
    '-hls_flags', 'independent_segments+omit_endlist', '-hls_allow_cache', '0',
    '-start_number', String(startNumber), '-hls_segment_filename', segmentPath, playlistPath
  ];
}

class FFmpegPublisher {
  constructor(config, events, persistence) {
    this.config = config;
    this.events = events;
    this.persistence = persistence || null;
    this.process = null;
    const destinationConfigured = config.publisherProtocol === 'hls'
      ? Boolean(config.youtubeHlsStreamKey)
      : Boolean(config.publishUrl);
    this.enabled = Boolean(config.enablePublisher && destinationConfigured);
    this.retryTimer = null;
    this.attempt = 0;
    this.stopping = false;
    this.stderrTail = '';
    this.hlsUploader = null;
    this.hlsDirectory = null;
  }

  start() {
    if (!this.enabled) {
      this.events.emit('publisher:state', {
        enabled: false, running: false, protocol: this.config.publisherProtocol || 'rtmp'
      });
      return false;
    }
    if (this.process) return true;
    this.stopping = false;
    return this.config.publisherProtocol === 'hls' ? this.startHls() : this.startRtmp();
  }

  startRtmp() {
    try {
      const child = spawn(this.config.ffmpegPath, buildRtmpArgs(this.config), { stdio: ['pipe', 'ignore', 'pipe'] });
      this.attachProcess(child, 'rtmp');
      return true;
    } catch (error) {
      this.events.emit('system:warning', { message: 'RTMP publisher startup failed.', detail: error.message });
      this.scheduleRetry();
      return false;
    }
  }

  startHls() {
    try {
      if (!this.persistence || typeof this.persistence.allocateHlsSequence !== 'function') {
        throw new Error('Persistent storage is required to keep HLS media sequence numbers monotonic.');
      }
      const streamId = this.config.youtubeVideoId || crypto.createHash('sha256')
        .update(this.config.youtubeHlsStreamKey).digest('hex').slice(0, 32);
      const startNumber = this.persistence.allocateHlsSequence(streamId, 1);
      const ingestBase = buildHlsIngestBase(this.config.youtubeHlsStreamKey);
      const prefix = 'ig_' + crypto.randomBytes(8).toString('hex') + '_';
      this.hlsDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'infinity-gen-hls-'));
      this.hlsUploader = new HlsIngestUploader({
        baseUrl: ingestBase,
        directory: this.hlsDirectory,
        playlistName: 'infinity-gen.m3u8',
        startNumber,
        segmentPrefix: prefix,
        segmentDuration: '2.000000',
        reserveNextSequence: () => this.persistence.allocateHlsSequence(streamId, 1),
        events: this.events
      });
      this.hlsUploader.start();
      const child = spawn(
        this.config.ffmpegPath,
        buildHlsArgs(this.config, this.hlsDirectory, startNumber, prefix),
        { stdio: ['pipe', 'ignore', 'pipe'] }
      );
      this.attachProcess(child, 'hls');
      return true;
    } catch (error) {
      this.cleanupHls();
      this.events.emit('system:warning', { message: 'HLS publisher startup failed.', detail: error.message });
      this.scheduleRetry();
      return false;
    }
  }

  attachProcess(child, protocol) {
    this.process = child;
    child.stdin.on('error', (error) => this.events.emit('system:warning', {
      message: 'FFmpeg input pipe error.', detail: error.message
    }));
    child.stderr.on('data', (chunk) => {
      this.stderrTail = (this.stderrTail + chunk.toString()).slice(-4000);
    });
    child.once('spawn', () => {
      this.attempt = 0;
      this.events.emit('publisher:state', { enabled: true, running: true, protocol });
    });
    child.once('error', (error) => this.events.emit('system:warning', {
      message: 'FFmpeg could not start.', detail: error.message
    }));
    child.once('close', async (code, signal) => {
      if (this.process === child) this.process = null;
      if (this.hlsUploader) {
        try { await this.hlsUploader.drain(); }
        catch (error) {
          this.events.emit('system:warning', { message: 'Final HLS segment upload failed.', detail: error.message });
          this.hlsUploader.stop();
        }
      }
      this.cleanupHls();
      this.events.emit('publisher:state', {
        enabled: true, running: false, protocol, code, signal, detail: this.stderrTail.slice(-1200)
      });
      if (!this.stopping) this.scheduleRetry();
    });
  }

  cleanupHls() {
    if (this.hlsUploader) this.hlsUploader.stop();
    this.hlsUploader = null;
    const directory = this.hlsDirectory;
    this.hlsDirectory = null;
    if (directory) fs.promises.rm(directory, { recursive: true, force: true }).catch(() => {});
  }

  write(frame) {
    const child = this.process;
    if (!child || !child.stdin || child.stdin.destroyed || child.stdin.writableLength > 8 * 1024 * 1024) return false;
    try { return child.stdin.write(frame); } catch (_) { return false; }
  }

  scheduleRetry() {
    if (this.retryTimer || this.stopping || !this.enabled) return;
    this.attempt++;
    const delay = Math.min(60000, 2000 * Math.pow(2, Math.min(5, this.attempt - 1)));
    this.retryTimer = setTimeout(() => { this.retryTimer = null; this.start(); }, delay);
    this.retryTimer.unref?.();
  }

  stop() {
    this.stopping = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    if (this.process) {
      const child = this.process;
      this.process = null;
      try { child.stdin.end(); } catch (_) {}
      setTimeout(() => { if (!child.killed) child.kill('SIGTERM'); }, 3000).unref?.();
    } else {
      this.cleanupHls();
    }
    this.events.emit('publisher:state', {
      enabled: this.enabled, running: false, stopping: true,
      protocol: this.config.publisherProtocol || 'rtmp'
    });
  }

  status() {
    return {
      enabled: this.enabled,
      running: Boolean(this.process),
      retrying: Boolean(this.retryTimer),
      attempt: this.attempt,
      protocol: this.config.publisherProtocol || 'rtmp',
      hls: this.hlsUploader ? this.hlsUploader.status() : null
    };
  }
}

module.exports = { FFmpegPublisher, buildRtmpArgs, buildHlsArgs };
