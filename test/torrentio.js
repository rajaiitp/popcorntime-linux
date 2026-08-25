'use strict';

const assert = require('assert');
const TorrentioUtils = require('../src/app/butter-provider/torrentio-utils');

assert.strictEqual(
    TorrentioUtils.buildStreamPath('movie', 'tt1234567'),
    'stream/movie/tt1234567.json'
);
assert.strictEqual(
    TorrentioUtils.buildStreamPath('series', 'tt1234567', 1, 2),
    'stream/series/tt1234567:1:2.json'
);
assert.strictEqual(
    TorrentioUtils.buildStreamPath('series', 'tt1234567', 0, 0),
    'stream/series/tt1234567:0:0.json'
);

const normalized = TorrentioUtils.normalizeStreams({
    streams: [
        {
            infoHash: '0123456789abcdef0123456789abcdef01234567',
            fileIdx: 0,
            title: '1080p | 2 GB 👤 12',
            behaviorHints: {
                filename: 'Example.S01E02.1080p.mkv',
                videoSize: 2000000000
            },
            seeders: 12,
            peers: 3
        },
        {
            url: 'magnet:?xt=urn:btih:abcdef0123456789abcdef0123456789abcdef01',
            name: '720p'
        },
        {
            externalUrl: 'https://example.test/video'
        },
        {
            infoHash: 'not-a-hash'
        }
    ]
}, 'https://torrentio.strem.fun/stream/movie/tt1234567.json');

assert.strictEqual(normalized.length, 2);
assert.strictEqual(normalized[0].fileIdx, 0);
assert.strictEqual(normalized[0].file_index, 0);
assert.strictEqual(normalized[0].file, 'Example.S01E02.1080p.mkv');
assert.strictEqual(normalized[0].quality, '1080p');
assert.strictEqual(normalized[0].seed, 12);
assert.strictEqual(normalized[0].provider, 'Torrentio');
assert.ok(normalized[0].url.indexOf('magnet:?xt=urn:btih:') === 0);
assert.strictEqual(normalized[1].quality, '720p');

const qualityMap = TorrentioUtils.toQualityMap([
    {url: 'magnet:?xt=urn:btih:low', title: '1080p', seed: 3},
    {url: 'magnet:?xt=urn:btih:high', title: '1080p', seed: 8},
    {url: 'magnet:?xt=urn:btih:unknown', title: 'WEB', seed: 1}
]);
assert.strictEqual(qualityMap['1080p'].url, 'magnet:?xt=urn:btih:high');
assert.strictEqual(qualityMap.Unknown.url, 'magnet:?xt=urn:btih:unknown');
const qualityMerged = TorrentioUtils.mergeQualityMaps({
    '720p': {url: 'magnet:?xt=urn:btih:existing'}
}, [{url: 'magnet:?xt=urn:btih:fallback', title: '720p'}, {url: 'magnet:?xt=urn:btih:missing', title: '480p'}]);
assert.strictEqual(qualityMerged['720p'].url, 'magnet:?xt=urn:btih:existing');
assert.strictEqual(qualityMerged['480p'].url, 'magnet:?xt=urn:btih:missing');
assert.strictEqual(TorrentioUtils.hasUsableTorrents({480: false, 720: {url: 'magnet:?xt=urn:btih:usable'}}), true);

const primary = [{
    url: 'magnet:?xt=urn:btih:primary'
}];
const supplemental = [{
    url: 'magnet:?xt=urn:btih:primary&tr=udp%3A%2F%2Ftracker.test'
}, {
    url: 'magnet:?xt=urn:btih:torrentio'
}];
const merged = TorrentioUtils.mergeTorrents(primary, supplemental);
assert.strictEqual(merged.length, 2);
assert.strictEqual(merged[0], primary[0]);
assert.strictEqual(merged[1], supplemental[1]);

const files = [{path: 'first.mkv'}, {path: 'second.mkv'}];
assert.strictEqual(TorrentioUtils.selectFileIndex(files, 0), 0);
assert.strictEqual(TorrentioUtils.selectFileIndex(files, 1), 1);
assert.strictEqual(TorrentioUtils.selectFileIndex(files, -1), -1);
assert.strictEqual(TorrentioUtils.selectFileIndex(files, 2), -1);
assert.strictEqual(TorrentioUtils.selectFileIndex(files, undefined), -1);

console.log('Torrentio tests passed');
