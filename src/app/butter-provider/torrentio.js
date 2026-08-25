'use strict';

const Generic = require('./generic');
const TorrentioUtils = require('./torrentio-utils');

const DEFAULT_API_URL = 'https://torrentio.strem.fun/';
const REQUEST_TIMEOUT = 10000;

class TorrentioApi extends Generic {
    constructor(args) {
        args = args || {};
        super(args);

        var configuredUrl = args.apiURL || (typeof Settings !== 'undefined' && Settings.torrentioServer);
        this.setApiUrls(configuredUrl || DEFAULT_API_URL);
        // Generic providers concatenate apiURL and the request path. Keep
        // custom Torrentio endpoints valid when users omit the trailing slash.
        this.apiURL = this.apiURL.map((url) => /\/$/.test(url) ? url : url + '/');
        this.sourceCache = Object.create(null);
    }

    fetch() {
        return Promise.resolve({
            results: [],
            hasMore: false
        });
    }

    detail(imdbId, oldData) {
        return Promise.resolve(oldData);
    }

    feature(name) {
        return name === 'torrents';
    }

    _getStreams(uri) {
        return new Promise((resolve, reject) => {
            var timer = setTimeout(() => reject(new Error('Torrentio request timed out')), REQUEST_TIMEOUT);

            this._get(0, uri).then((data) => {
                clearTimeout(timer);
                resolve(data);
            }).catch((error) => {
                clearTimeout(timer);
                reject(error);
            });
        });
    }

    streams(type, id, season, episode) {
        if (!id) {
            return Promise.resolve([]);
        }

        var uri = TorrentioUtils.buildStreamPath(type, id, season, episode);
        var source = this.apiURL[0] + uri;

        return this._getStreams(uri).then((data) => TorrentioUtils.normalizeStreams(data, source));
    }

    movieTorrents(imdbId) {
        return this.streams('movie', imdbId);
    }

    episodeTorrents(imdbId, season, episode) {
        return this.streams('series', imdbId, season, episode);
    }

    torrents(imdbId) {
        return this.movieTorrents(imdbId);
    }

    _withTimeout(promise) {
        return new Promise((resolve, reject) => {
            var timer = setTimeout(() => reject(new Error('Primary source request timed out')), REQUEST_TIMEOUT);
            Promise.resolve(promise).then((value) => {
                clearTimeout(timer);
                resolve(value);
            }).catch((error) => {
                clearTimeout(timer);
                reject(error);
            });
        });
    }

    resolveSources(cacheKey, primaryPromise, fallbackFactory) {
        var fallback = () => {
            if (!this.sourceCache[cacheKey]) {
                this.sourceCache[cacheKey] = Promise.resolve()
                    .then(fallbackFactory)
                    .then((sources) => {
                        sources = TorrentioUtils.asTorrentList(sources);
                        // Do not permanently cache an empty response. Torrentio
                        // can return no streams during a transient outage and a
                        // later selection should be allowed to retry it.
                        if (!TorrentioUtils.hasUsableTorrents(sources)) {
                            delete this.sourceCache[cacheKey];
                        }
                        return sources;
                    })
                    .catch((error) => {
                        delete this.sourceCache[cacheKey];
                        throw error;
                    });
            }
            return this.sourceCache[cacheKey];
        };

        var useFallback = (primary, primaryError) => fallback().then((sources) => {
            if (TorrentioUtils.hasUsableTorrents(sources)) {
                return {sources: sources, usedFallback: true};
            }
            if (primaryError) {
                throw primaryError;
            }
            return {sources: primary, usedFallback: false};
        }).catch((error) => {
            if (primaryError) {
                throw primaryError;
            }
            return {sources: primary, usedFallback: false, fallbackError: error};
        });

        return this._withTimeout(primaryPromise)
            .then((sources) => {
                sources = TorrentioUtils.asTorrentList(sources);
                return TorrentioUtils.hasUsableTorrents(sources) ?
                    {sources: sources, usedFallback: false} : useFallback(sources, null);
            })
            .catch((error) => useFallback([], error));
    }

    mergeTorrents(primary, supplemental) {
        return TorrentioUtils.mergeTorrents(primary, supplemental);
    }

    mergeQualityMaps(primary, supplemental) {
        return TorrentioUtils.mergeQualityMaps(primary, supplemental);
    }
}

TorrentioApi.prototype.config = {
    name: 'Torrentio',
    uniqueId: 'imdb_id',
    tabName: 'Torrentio',
    type: 'torrentio'
};

module.exports = TorrentioApi;
