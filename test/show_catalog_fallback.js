'use strict';

const assert = require('assert');
const Fallback = require('../src/app/lib/show_catalog_fallback');

(async function() {
    const summary = {
        title: 'Example Show',
        year: 2024,
        overview: 'Synopsis',
        status: 'returning series',
        country: 'us',
        runtime: 45,
        rating: 8.4,
        genres: ['Drama'],
        ids: {imdb: 'tt1234567', tvdb: 7654321, tmdb: 42},
        images: {
            poster: ['media.trakt.tv/poster.jpg'],
            banner: ['https://media.example/banner.jpg']
        }
    };
    const seasons = [{
        number: 1,
        episodes: [{
            season: 1,
            number: 1,
            title: 'Pilot',
            overview: 'Episode synopsis',
            first_aired: '2024-01-02T00:00:00.000Z',
            ids: {imdb: 'tt7654321', tvdb: 111, tmdb: 222}
        }]
    }];

    const show = await Fallback.fromTrakt({
        shows: {summary: () => Promise.resolve(summary)},
        seasons: {summary: () => Promise.resolve(seasons)}
    }, 'tt1234567', 'en');

    assert.strictEqual(show.imdb_id, 'tt1234567');
    assert.strictEqual(show.tvdb_id, 7654321);
    assert.strictEqual(show.rating.percentage, 84);
    assert.strictEqual(show.poster, 'https://media.trakt.tv/poster.jpg');
    assert.strictEqual(show.episodes.length, 1);
    assert.strictEqual(show.episodes[0].episode_id, 111);
    assert.strictEqual(show.episodes[0].torrents && Object.keys(show.episodes[0].torrents).length, 0);
    assert.strictEqual(show.episodes[0].first_aired, 1704153600);

    const catalog = Fallback.normalizeTraktResponse([
        {watchers: 10, show: summary},
        {show: {title: 'Invalid', ids: {tmdb: 1}}}
    ], 1);
    assert.strictEqual(catalog.results.length, 1);
    assert.strictEqual(catalog.results[0].title, 'Example Show');
    assert.strictEqual(catalog.hasMore, true);

    console.log('Show catalog fallback tests passed');
})().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});
