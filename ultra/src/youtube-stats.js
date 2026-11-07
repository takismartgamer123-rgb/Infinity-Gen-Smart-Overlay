'use strict';

function numeric(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

class YouTubeStatsManager {
  constructor(config, events, fetchImpl) {
    this.config = config;
    this.events = events;
    this.fetch = fetchImpl || globalThis.fetch;
    this.enabled = Boolean(config.youtubeApiKey && (config.youtubeChannelId || config.youtubeVideoId));
    this.timer = null;
    this.refreshing = false;
    this.snapshotValue = {
      enabled: this.enabled,
      updatedAt: null,
      channel: null,
      video: null,
      channelError: null,
      videoError: null
    };
  }

  snapshot() {
    return JSON.parse(JSON.stringify(this.snapshotValue));
  }

  async request(resource, params) {
    const url = new URL('https://www.googleapis.com/youtube/v3/' + resource);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    url.searchParams.set('key', this.config.youtubeApiKey);
    const response = await this.fetch(url, { signal: AbortSignal.timeout(12000) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.error) {
      const status = response.status || 0;
      throw new Error('YouTube Data API request failed (HTTP ' + status + ').');
    }
    return body;
  }

  async refresh() {
    if (!this.enabled) return this.snapshot();
    if (this.refreshing) return this.snapshot();
    this.refreshing = true;
    const tasks = [];

    if (this.config.youtubeChannelId) {
      tasks.push(this.request('channels', {
        part: 'statistics',
        id: this.config.youtubeChannelId
      }).then((body) => {
        const item = body.items && body.items[0];
        if (!item || !item.statistics) throw new Error('Channel statistics are unavailable.');
        const stats = item.statistics;
        this.snapshotValue.channel = {
          subscriberCount: numeric(stats.subscriberCount),
          subscriberCountHidden: Boolean(stats.hiddenSubscriberCount),
          viewCount: numeric(stats.viewCount),
          videoCount: numeric(stats.videoCount)
        };
        this.snapshotValue.channelError = null;
      }).catch(() => {
        this.snapshotValue.channelError = 'Channel statistics unavailable.';
      }));
    } else {
      this.snapshotValue.channel = null;
      this.snapshotValue.channelError = null;
    }

    if (this.config.youtubeVideoId) {
      tasks.push(this.request('videos', {
        part: 'statistics,liveStreamingDetails',
        id: this.config.youtubeVideoId
      }).then((body) => {
        const item = body.items && body.items[0];
        if (!item) throw new Error('Video statistics are unavailable.');
        const stats = item.statistics || {};
        const live = item.liveStreamingDetails || {};
        this.snapshotValue.video = {
          viewCount: numeric(stats.viewCount),
          likeCount: numeric(stats.likeCount),
          concurrentViewers: numeric(live.concurrentViewers),
          actualStartTime: live.actualStartTime || null,
          actualEndTime: live.actualEndTime || null
        };
        this.snapshotValue.videoError = null;
      }).catch(() => {
        this.snapshotValue.videoError = 'Live video statistics unavailable.';
      }));
    } else {
      this.snapshotValue.video = null;
      this.snapshotValue.videoError = null;
    }

    try {
      await Promise.all(tasks);
      this.snapshotValue.updatedAt = Date.now();
      const current = this.snapshot();
      if (this.events) this.events.emit('youtube:stats', current);
      return current;
    } finally {
      this.refreshing = false;
    }
  }

  start() {
    if (!this.enabled || this.timer) return false;
    this.refresh().catch(() => {});
    this.timer = setInterval(() => this.refresh().catch(() => {}), this.config.youtubeStatsIntervalMs || 60000);
    this.timer.unref?.();
    return true;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  status() {
    return {
      enabled: this.enabled,
      polling: Boolean(this.timer),
      updatedAt: this.snapshotValue.updatedAt
    };
  }
}

module.exports = { YouTubeStatsManager, numeric };
