'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Persistence } = require('../src/persistence');
const { HlsIngestUploader, buildHlsIngestBase, parseMediaPlaylist } = require('../src/hls-uploader');
const { buildHlsArgs } = require('../src/publisher');

function mediaPlaylist(sequence, filenames) {
  return [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    '#EXT-X-TARGETDURATION:2',
    '#EXT-X-MEDIA-SEQUENCE:' + sequence,
    ...filenames.flatMap((filename) => ['#EXTINF:2.000000,', filename]),
    ''
  ].join('\n');
}

test('YouTube HLS ingest URL validates and keeps the stream key out of filenames', () => {
  assert.equal(
    buildHlsIngestBase('abcd-efgh-ijkl-mnop'),
    'https://a.upload.youtube.com/http_upload_hls?cid=abcd-efgh-ijkl-mnop&copy=0&file='
  );
  assert.throws(() => buildHlsIngestBase('key?secret=1'), /stream-key characters/);
  assert.throws(() => buildHlsIngestBase('short'), /stream-key characters/);
});

test('HLS media playlist parser checks sequence, segment names and encryption', () => {
  const parsed = parseMediaPlaylist(mediaPlaylist(12, ['ig_ab12_00000012.ts', 'ig_ab12_00000013.ts']));
  assert.equal(parsed.mediaSequence, 12);
  assert.deepEqual(parsed.segments, ['ig_ab12_00000012.ts', 'ig_ab12_00000013.ts']);
  assert.throws(() => parseMediaPlaylist('#EXTM3U\n#EXTINF:2,\na.ts'), /MEDIA-SEQUENCE/);
  assert.throws(() => parseMediaPlaylist(mediaPlaylist(0, ['../outside.ts'])), /Invalid HLS ingest filename/);
  assert.throws(() => parseMediaPlaylist('#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-KEY:METHOD=AES-128\nx.ts'), /Encrypted HLS/);
  assert.throws(() => parseMediaPlaylist(mediaPlaylist(0, ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts'])), /more than five/);
});

test('HLS uploader publishes playlist before each new segment and removes uploaded local segments', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'infinity-gen-hls-test-'));
  const calls = [];
  const uploader = new HlsIngestUploader({
    baseUrl: 'https://a.upload.youtube.com/http_upload_hls?cid=test-key&copy=0&file=',
    directory,
    playlistName: 'infinity-gen.m3u8',
    startNumber: 0,
    upload: async (_base, filename, body, contentType) => {
      calls.push({ filename, text: filename.endsWith('.m3u8') ? body.toString('utf8') : '', contentType });
      return { statusCode: 200 };
    }
  });
  try {
    const first = 'ig_ab12_00000000.ts';
    const second = 'ig_ab12_00000001.ts';
    fs.writeFileSync(path.join(directory, first), Buffer.from('segment-zero'));
    fs.writeFileSync(path.join(directory, second), Buffer.from('segment-one'));
    fs.writeFileSync(path.join(directory, 'infinity-gen.m3u8'), mediaPlaylist(0, [first, second]));

    assert.equal(await uploader.sync(), true);
    assert.deepEqual(calls.map((call) => call.filename), ['infinity-gen.m3u8', first, second]);
    assert.match(calls[0].text, /#EXT-X-MEDIA-SEQUENCE:0/);
    assert.equal(calls[1].contentType, 'video/MP2T');
    assert.equal(uploader.status().nextSequence, 2);
    assert.equal(fs.existsSync(path.join(directory, first)), false);
    assert.equal(fs.existsSync(path.join(directory, second)), false);

    const third = 'ig_ab12_00000002.ts';
    fs.writeFileSync(path.join(directory, third), Buffer.from('segment-two'));
    fs.writeFileSync(path.join(directory, 'infinity-gen.m3u8'), mediaPlaylist(0, [first, second, third]));
    assert.equal(await uploader.sync(), true);
    assert.deepEqual(calls.slice(3).map((call) => call.filename), ['infinity-gen.m3u8', third]);
    assert.equal(uploader.status().nextSequence, 3);
  } finally {
    uploader.stop();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('HLS uploader rejects a sliding playlist that skipped a required segment', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'infinity-gen-hls-gap-'));
  const uploader = new HlsIngestUploader({
    baseUrl: 'https://a.upload.youtube.com/http_upload_hls?cid=test-key&copy=0&file=',
    directory,
    startNumber: 5,
    upload: async () => ({ statusCode: 200 })
  });
  try {
    fs.writeFileSync(path.join(directory, 'infinity-gen.m3u8'), mediaPlaylist(6, ['ig_ab12_00000006.ts']));
    await assert.rejects(uploader.sync(), /segment gap detected/);
  } finally {
    uploader.stop();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('persistent HLS sequence reservations start at zero and advance across publisher restarts', () => {
  const db = new Persistence(':memory:');
  try {
    assert.equal(db.allocateHlsSequence('video-one', 1000000), 0);
    assert.equal(db.allocateHlsSequence('video-one', 1000000), 1000000);
    assert.equal(db.allocateHlsSequence('video-two', 1000000), 0);
  } finally {
    db.close();
  }
});

test('HLS FFmpeg command uses short MPEG-TS segments, a bounded playlist and a closed GOP', () => {
  const args = buildHlsArgs({ ffmpegBitrate: '1800k' }, '/tmp/ig-hls', 1000000, 'ig_unique_');
  const value = (flag) => args[args.indexOf(flag) + 1];
  assert.equal(value('-hls_time'), '2');
  assert.equal(value('-hls_list_size'), '5');
  assert.equal(value('-start_number'), '1000000');
  assert.equal(value('-hls_segment_filename'), '/tmp/ig-hls/ig_unique_%08d.ts');
  assert.ok(args.includes('independent_segments+omit_endlist'));
  assert.ok(args.includes('+cgop'));
  assert.equal(args.at(-1), '/tmp/ig-hls/infinity-gen.m3u8');
});
