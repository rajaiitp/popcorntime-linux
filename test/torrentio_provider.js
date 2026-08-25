'use strict';

const assert = require('assert');
const TorrentioApi = require('../src/app/butter-provider/torrentio');

async function run() {
    const api = new TorrentioApi({apiURL: 'https://torrentio.example'});
    assert.strictEqual(api.apiURL[0], 'https://torrentio.example/');

    const calls = [];
    api._getStreams = function(uri) {
        calls.push(uri);
        return Promise.resolve({
            streams: [{
                infoHash: '0123456789abcdef0123456789abcdef01234567',
                title: 'Example 1080p'
            }]
        });
    };

    const movie = await api.movieTorrents('tt1234567');
    assert.strictEqual(calls[0], 'stream/movie/tt1234567.json');
    assert.strictEqual(movie.length, 1);
    assert.ok(movie[0].url.indexOf('magnet:?xt=urn:btih:') === 0);

    const episode = await api.episodeTorrents('tt1234567', 1, 2);
    assert.strictEqual(calls[1], 'stream/series/tt1234567:1:2.json');
    assert.strictEqual(episode.length, 1);

    const noId = await api.movieTorrents('');
    assert.deepStrictEqual(noId, []);
    assert.strictEqual(calls.length, 2);

    let fallbackCalls = 0;
    const fallbackApi = new TorrentioApi({apiURL: 'https://torrentio.example/'});
    fallbackApi.movieTorrents = function() {
        fallbackCalls++;
        return Promise.resolve(fallbackCalls === 1 ? [] : [{
            url: 'magnet:?xt=urn:btih:usable'
        }]);
    };

    const first = await fallbackApi.resolveSources(
        'movie:tt1234567',
        Promise.resolve({}),
        () => fallbackApi.movieTorrents('tt1234567')
    );
    assert.strictEqual(first.usedFallback, false);
    assert.deepStrictEqual(first.sources, []);

    const second = await fallbackApi.resolveSources(
        'movie:tt1234567',
        Promise.resolve({}),
        () => fallbackApi.movieTorrents('tt1234567')
    );
    assert.strictEqual(second.usedFallback, true);
    assert.strictEqual(second.sources[0].url, 'magnet:?xt=urn:btih:usable');
    assert.strictEqual(fallbackCalls, 2);

    let concurrentCalls = 0;
    const concurrentApi = new TorrentioApi({apiURL: 'https://torrentio.example/'});
    const concurrentFallback = function() {
        concurrentCalls++;
        return new Promise((resolve) => setTimeout(() => resolve([{
            url: 'magnet:?xt=urn:btih:concurrent'
        }]), 0));
    };
    const concurrentResults = await Promise.all([
        concurrentApi.resolveSources('movie:tt7654321', Promise.resolve({}), concurrentFallback),
        concurrentApi.resolveSources('movie:tt7654321', Promise.resolve({}), concurrentFallback)
    ]);
    assert.strictEqual(concurrentCalls, 1);
    assert.strictEqual(concurrentResults[0].sources[0].url, 'magnet:?xt=urn:btih:concurrent');
    assert.strictEqual(concurrentResults[1].sources[0].url, 'magnet:?xt=urn:btih:concurrent');

    console.log('Torrentio provider tests passed');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
