'use strict';

const REQUEST_TIMEOUT = 10000;

function isCatalog(value) {
    return !!(value && Array.isArray(value.results) && typeof value.hasMore === 'boolean');
}

function withTimeout(promise, timeout) {
    return new Promise(function(resolve, reject) {
        var timer = setTimeout(function() {
            reject(new Error('Movie catalog request timed out'));
        }, timeout || REQUEST_TIMEOUT);

        Promise.resolve(promise).then(function(value) {
            clearTimeout(timer);
            resolve(value);
        }).catch(function(error) {
            clearTimeout(timer);
            reject(error);
        });
    });
}

function normalizeGenre(genre) {
    return String(genre || '')
        .trim()
        .toLowerCase()
        .replace(/&/g, 'and')
        .replace(/[\s_]+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
}

function normalizeMovie(entry) {
    var movie = entry && entry.movie ? entry.movie : entry;
    var ids = movie && movie.ids ? movie.ids : {};
    var imdbId = ids.imdb ? String(ids.imdb) : '';

    if (!movie || !/^tt\d+$/.test(imdbId)) {
        return null;
    }

    return {
        type: 'movie',
        imdb_id: imdbId,
        tmdb_id: ids.tmdb || null,
        title: movie.title || imdbId,
        year: movie.year || 0,
        genre: Array.isArray(movie.genres) ? movie.genres : [],
        rating: Number(movie.rating) || 0,
        runtime: Number(movie.runtime) || 0,
        images: null,
        image: false,
        cover: false,
        backdrop: false,
        poster: false,
        poster_medium: false,
        synopsis: movie.overview || '',
        trailer: false,
        certification: movie.certification || '',
        torrents: {},
        locale: null
    };
}

function normalizeTraktResponse(response, page) {
    var data = response && Array.isArray(response.data) ? response.data : response;
    var rawResults = Array.isArray(data) ? data : [];
    var pagination = response && response.pagination ? response.pagination : {};
    var pageNumber = Number(page) || Number(pagination.page) || 1;
    var pageCount = Number(pagination['page-count']);
    var results = rawResults.map(normalizeMovie).filter(Boolean);
    var hasMore;

    if (isFinite(pageCount) && pageCount > 0) {
        hasMore = pageNumber < pageCount;
    } else {
        hasMore = rawResults.length >= 50;
    }

    return {
        results: results,
        hasMore: hasMore
    };
}

function resolve(primaryPromise, fallbackFactory) {
    var fallback = function() {
        return withTimeout(Promise.resolve().then(fallbackFactory));
    };

    return withTimeout(primaryPromise).then(function(primary) {
        if (isCatalog(primary)) {
            return {data: primary, usedFallback: false};
        }
        return fallback().then(function(data) {
            return {data: data, usedFallback: true};
        });
    }, function(primaryError) {
        return fallback().then(function(data) {
            return {data: data, usedFallback: true};
        }).catch(function() {
            throw primaryError;
        });
    });
}

module.exports = {
    isCatalog: isCatalog,
    normalizeGenre: normalizeGenre,
    normalizeMovie: normalizeMovie,
    normalizeTraktResponse: normalizeTraktResponse,
    resolve: resolve
};
