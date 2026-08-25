'use strict';

function imageUrl(value) {
    if (Array.isArray(value)) {
        value = value[0];
    }
    if (!value || typeof value !== 'string') {
        return false;
    }
    return /^https?:\/\//i.test(value) ? value : 'https://' + value.replace(/^\/+/, '');
}

function toTimestamp(value) {
    if (!value) {
        return 'Unknown';
    }
    var timestamp = Date.parse(value);
    return isNaN(timestamp) ? 'Unknown' : Math.floor(timestamp / 1000);
}

function normalizeImages(images) {
    images = images || {};
    var poster = imageUrl(images.poster);
    var banner = imageUrl(images.banner);
    var fanart = imageUrl(images.fanart) || banner;

    return {
        poster: poster,
        poster_medium: poster,
        banner: banner,
        fanart: fanart
    };
}

function normalizeEpisode(show, episode) {
    var ids = episode && episode.ids ? episode.ids : {};
    var showIds = show && show.ids ? show.ids : {};
    var tvdbId = ids.tvdb || null;

    return {
        type: 'episode',
        tvdb_id: tvdbId,
        episode_id: tvdbId,
        imdb_id: showIds.imdb || null,
        season: Number(episode.season) || 0,
        episode: Number(episode.number) || 0,
        title: episode.title || '',
        overview: episode.overview || '',
        first_aired: toTimestamp(episode.first_aired),
        torrents: {},
        locale: null
    };
}

function normalizeShow(summary, seasons, language) {
    summary = summary || {};
    var ids = summary.ids || {};
    var images = normalizeImages(summary.images);
    var episodes = [];

    (Array.isArray(seasons) ? seasons : []).forEach(function(season) {
        if (!season || Number(season.number) <= 0 || !Array.isArray(season.episodes)) {
            return;
        }
        season.episodes.forEach(function(episode) {
            episodes.push(normalizeEpisode(summary, episode));
        });
    });

    return {
        type: 'show',
        imdb_id: ids.imdb || '',
        tvdb_id: ids.tvdb || null,
        tmdb_id: ids.tmdb || null,
        title: summary.title || ids.slug || ids.imdb || '',
        title1: summary.title || '',
        year: summary.year || 0,
        runtime: Number(summary.runtime) || 0,
        status: summary.status || '',
        country: summary.country || '',
        genres: Array.isArray(summary.genres) ? summary.genres : [],
        rating: {
            percentage: Math.round((Number(summary.rating) || 0) * 10)
        },
        synopsis: summary.overview || '',
        overview: summary.overview || '',
        images: images,
        poster: images.poster,
        poster_medium: images.poster_medium,
        backdrop: images.fanart || images.banner,
        contextLocale: language || 'en',
        exist_translations: [language || 'en'],
        episodes: episodes,
        torrents: {}
    };
}

function unwrapShow(entry) {
    return entry && entry.show ? entry.show : entry;
}

function normalizeTraktResponse(response, page) {
    var entries = Array.isArray(response) ? response : (response && Array.isArray(response.data) ? response.data : []);
    var results = entries.map(unwrapShow).filter(function(show) {
        return !!(show && show.ids && show.ids.imdb);
    }).map(function(show) {
        return normalizeShow(show, [], null);
    });
    var pageNumber = Number(page) || 1;

    return {
        results: results,
        hasMore: results.length >= 50 || pageNumber === 1 && entries.length > 0
    };
}

function fromTrakt(client, id, language, oldData) {
    return Promise.all([
        client.shows.summary({id: id, extended: 'full'}),
        client.seasons.summary({id: id, extended: 'episodes'})
    ]).then(function(values) {
        var show = normalizeShow(values[0], values[1], language);
        if (oldData && oldData.title1 && !show.title1) {
            show.title1 = oldData.title1;
        }
        return show;
    });
}

module.exports = {
    normalizeImages: normalizeImages,
    normalizeEpisode: normalizeEpisode,
    normalizeShow: normalizeShow,
    normalizeTraktResponse: normalizeTraktResponse,
    fromTrakt: fromTrakt
};
