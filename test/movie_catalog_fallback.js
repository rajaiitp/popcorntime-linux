'use strict';

const assert = require('assert');
const Fallback = require('../src/app/lib/movie_catalog_fallback');

(async function() {
    var fallbackCalls = 0;
    var primary = {results: [], hasMore: false};
    var result = await Fallback.resolve(Promise.resolve(primary), function() {
        fallbackCalls++;
        return Promise.resolve({results: [{movie: {ids: {imdb: 'tt1234567'}}}], hasMore: false});
    });

    assert.strictEqual(fallbackCalls, 0);
    assert.strictEqual(result.data, primary);
    assert.strictEqual(result.usedFallback, false);

    fallbackCalls = 0;
    result = await Fallback.resolve(Promise.reject(new Error('FuseMe unavailable')), function() {
        fallbackCalls++;
        return Promise.resolve({results: [{movie: {ids: {imdb: 'tt1234567'}}}], hasMore: false});
    });
    assert.strictEqual(fallbackCalls, 1);
    assert.strictEqual(result.usedFallback, true);

    var mapped = Fallback.normalizeTraktResponse({
        data: [
            {movie: {
                title: 'Example Movie',
                year: 2024,
                genres: ['Drama'],
                rating: 8.2,
                runtime: 100,
                overview: 'Synopsis',
                certification: 'PG-13',
                ids: {imdb: 'tt1234567', tmdb: 42}
            }},
            {movie: {ids: {imdb: 'not-an-imdb-id'}}},
            {movie: {ids: {imdb: 42}}}
        ],
        pagination: {page: 1, 'page-count': 2}
    }, 1);

    assert.strictEqual(mapped.results.length, 1);
    assert.strictEqual(mapped.results[0].imdb_id, 'tt1234567');
    assert.strictEqual(mapped.results[0].tmdb_id, 42);
    assert.strictEqual(mapped.results[0].synopsis, 'Synopsis');
    assert.strictEqual(mapped.results[0].poster, false);
    assert.strictEqual(mapped.hasMore, true);

    assert.strictEqual(Fallback.normalizeGenre('Sci-Fi'), 'sci-fi');

    var primaryError = new Error('primary');
    await assert.rejects(
        Fallback.resolve(Promise.reject(primaryError), function() {
            return Promise.reject(new Error('fallback'));
        }),
        function(error) { return error === primaryError; }
    );

    console.log('Movie catalog fallback tests passed');
})().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});
