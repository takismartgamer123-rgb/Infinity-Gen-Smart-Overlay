'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { YouTubeStatsManager, numeric } = require('../src/youtube-stats');

test('numeric safely normalizes optional YouTube statistic values', () => {
  assert.equal(numeric('12345'), 12345);
  assert.equal(numeric(undefined), null);
  assert.equal(numeric(''), null);
  assert.equal(numeric('not-a-number'), null);
});

test('YouTube stats manager fetches channel and live video data separately', async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url: new URL(String(url)), options });
    if (String(url).includes('/channels?')) {
      return {
        ok: true, status: 200,
        json: async () => ({
          items: [{ statistics: {
            subscriberCount: '1250',
            hiddenSubscriberCount: false,
            viewCount: '98765',
            videoCount: '42'
          } }]
        })
      };
    }
    return {
      ok: true, status: 200,
      json: async () => ({
        items: [{ statistics: { viewCount: '450', likeCount: '31' }, liveStreamingDetails: {
          concurrentViewers: '18',
          actualStartTime: '2026-11-07T15:00:00Z'
        } }]
      })
    };
  };
  const events = [];
  const manager = new YouTubeStatsManager({
    youtubeApiKey: 'test-api-key',
    youtubeChannelId: 'UC_test_channel',
    youtubeVideoId: 'test-video-id',
    youtubeStatsIntervalMs: 60000
  }, { emit: (name, payload) => events.push({ name, payload }) }, fetchImpl);

  const snapshot = await manager.refresh();
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url.pathname, '/youtube/v3/channels');
  assert.equal(requests[0].url.searchParams.get('part'), 'statistics');
  assert.equal(requests[1].url.pathname, '/youtube/v3/videos');
  assert.equal(requests[1].url.searchParams.get('part'), 'statistics,liveStreamingDetails');
  assert.equal(requests[0].url.searchParams.get('key'), 'test-api-key');
  assert.equal(requests[0].options.signal instanceof AbortSignal, true);
  assert.equal(snapshot.channel.subscriberCount, 1250);
  assert.equal(snapshot.channel.viewCount, 98765);
  assert.equal(snapshot.channel.videoCount, 42);
  assert.equal(snapshot.video.viewCount, 450);
  assert.equal(snapshot.video.likeCount, 31);
  assert.equal(snapshot.video.concurrentViewers, 18);
  assert.equal(events.length, 1);
  assert.equal(events[0].name, 'youtube:stats');
  assert.equal(JSON.stringify(snapshot).includes('test-api-key'), false);
});

test('YouTube stats manager handles hidden subscribers and missing live viewer counts', async () => {
  const manager = new YouTubeStatsManager({
    youtubeApiKey: 'test-api-key',
    youtubeChannelId: 'UC_test_channel',
    youtubeVideoId: 'test-video-id'
  }, null, async (url) => ({
    ok: true,
    status: 200,
    json: async () => String(url).includes('/channels?')
      ? { items: [{ statistics: { hiddenSubscriberCount: true, viewCount: '9', videoCount: '2' } }] }
      : { items: [{ statistics: { viewCount: '4' } }] }
  }));
  const snapshot = await manager.refresh();
  assert.equal(snapshot.channel.subscriberCount, null);
  assert.equal(snapshot.channel.subscriberCountHidden, true);
  assert.equal(snapshot.video.concurrentViewers, null);
  assert.equal(snapshot.video.likeCount, null);
});

test('YouTube stats manager remains disabled without a server-side API key', async () => {
  let called = false;
  const manager = new YouTubeStatsManager({
    youtubeApiKey: '',
    youtubeChannelId: 'UC_test_channel',
    youtubeVideoId: 'test-video-id'
  }, null, async () => { called = true; });
  const snapshot = await manager.refresh();
  assert.equal(manager.enabled, false);
  assert.equal(snapshot.enabled, false);
  assert.equal(called, false);
  assert.equal(manager.start(), false);
});
