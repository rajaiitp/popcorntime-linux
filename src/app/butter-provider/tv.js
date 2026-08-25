'use strict';

const Generic = require('./generic');
const sanitize = require('butter-sanitize');
const i18n = require('i18n');
const Trakt = require('trakt.tv');
const ShowCatalogFallbackUtils = require('../lib/show_catalog_fallback');
var fallbackClient;

function getPageWindow() {
  try {
    if (typeof nw !== 'undefined' && nw.Window && nw.Window.get) {
      return nw.Window.get().window;
    }
  } catch (error) {}
  return typeof window !== 'undefined' ? window : null;
}

function getTraktProvider() {
  var pageWindow = getPageWindow();
  var app = pageWindow && pageWindow.App;
  if (!app && typeof App !== 'undefined') {
    app = App;
  }
  if (!app || !app.Providers) {
    return null;
  }

  if (app.Trakt) {
    return app.Trakt;
  }
  if (app.Providers._cache && app.Providers._cache.Trakttv) {
    return app.Providers._cache.Trakttv;
  }

  try {
    return app.Providers.get('Trakttv');
  } catch (error) {
    return null;
  }
}

function getTraktClient() {
  var provider = getTraktProvider();
  if (provider && provider.client) {
    return provider.client;
  }
  var pageWindow = getPageWindow();
  var settings = pageWindow && pageWindow.Settings;
  if (!settings && typeof Settings !== 'undefined') {
    settings = Settings;
  }
  if (!fallbackClient && settings && settings.trakttv && settings.trakttv.client_id) {
    fallbackClient = new Trakt({
      client_id: settings.trakttv.client_id,
      client_secret: settings.trakttv.client_secret
    });
  }
  return fallbackClient;
}

function fetchTraktShowCatalog(client, filters) {
  filters = filters || {};
  var page = Number(filters.page) || 1;
  var params = {page: page, limit: 50, extended: 'full'};
  var request;

  if (filters.keywords && filters.keywords.trim()) {
    request = client.search.text({query: filters.keywords.trim(), type: 'show', page: page, limit: 50});
  } else if (filters.sorter === 'popularity') {
    request = client.shows.popular(params);
  } else {
    request = client.shows.trending(params);
  }

  return request.then(function(data) {
    return ShowCatalogFallbackUtils.normalizeTraktResponse(data, page);
  });
}

class TVApi extends Generic {
  constructor(args) {
    super(args);

    this.language = args.language;
    this.contentLanguage = args.contentLanguage || this.language;
    this.contentLangOnly = args.contentLangOnly || false;
  }

  hasApiUrls() {
    return Array.isArray(this.apiURL) && this.apiURL.some(url => !!url);
  }

  fallback(method, args) {
    if (!this.config || this.config.type !== 'tvshow') {
      return Promise.reject(new Error('Trakt show fallback is not used for ' + (this.config && this.config.type)));
    }

    var provider = getTraktProvider();
    if (provider && typeof provider[method] === 'function') {
      return provider[method].apply(provider, args || []);
    }

    var client = getTraktClient();
    if (!client) {
      return Promise.reject(new Error('Trakt show fallback is unavailable: ' + method));
    }

    if (method === 'getShowMetadata') {
      var id = args && args[0];
      var oldData = args && args[1];
      return ShowCatalogFallbackUtils.fromTrakt(client, id, oldData && oldData.contextLocale, oldData);
    }
    if (method === 'fetchShowCatalog') {
      return fetchTraktShowCatalog(client, args && args[0]);
    }
    return Promise.reject(new Error('Unsupported Trakt show fallback: ' + method));
  }

  extractIds(items) {
    return items.results.map(item => item.tvdb_id);
  }

  fetch(filters) {
    const params = {
      sort: 'seeds',
      limit: '50'
    };

    params.locale = this.language;
    params.contentLocale = this.contentLanguage;
    if (!this.contentLangOnly) {
      params.showAll = 1;
    }

    if (filters.keywords) {
      params.keywords = filters.keywords.trim();
    }
    if (filters.genre) {
      params.genre = filters.genre;
    }
    if (filters.order) {
      params.order = filters.order;
    }
    if (filters.sorter && filters.sorter !== 'popularity') {
      params.sort = filters.sorter;
    }

    const uri = `shows/${filters.page}?` + new URLSearchParams(params);
    const request = this.hasApiUrls() ? this._get(0, uri).then(data => {
      data.forEach(entry => (entry.type = 'show'));

      return {
        results: sanitize(data),
        hasMore: true
      };
    }) : Promise.reject(new Error('TV API URL is not configured'));

    return request.catch(() => this.fallback('fetchShowCatalog', [filters]));
  }

  detail(imdb_id, old_data, debug) {
    old_data = old_data || {};
    return this.contentOnLang(imdb_id, old_data.contextLocale, old_data.title1);
  }

  feature(name) { return name==='torrents'; }

  torrents(imdb_id, lang) {
    const params = {
      locale: this.language,
      contentLocale: lang,
    };
    const uri = `show/${imdb_id}/torrents?` + new URLSearchParams(params);
    return this.hasApiUrls() ? this._get(0, uri) : Promise.resolve([]);
  }

  episodeTorrents(imdb_id, lang, season, episode) {
    const params = {
      locale: this.language,
      contentLocale: lang,
    };
    const uri = `show/${imdb_id}/${season}/${episode}/torrents?` + new URLSearchParams(params);
    return this.hasApiUrls() ? this._get(0, uri) : Promise.resolve([]);
  }

  contentOnLang(imdb_id, lang, title1) {
    const params = {};
    if (this.language) {
      params.locale = this.language;
    }
    if (this.language !== lang) {
      params.contentLocale = lang;
    }
    const uri = `show/${imdb_id}?` + new URLSearchParams(params);
    const request = this.hasApiUrls() ? this._get(0, uri).then(data => {
      if (title1) {
        data.title = title1;
      }
      return data;
    }) : Promise.reject(new Error('TV API URL is not configured'));

    return request.catch(() => this.fallback('getShowMetadata', [imdb_id, {
      contextLocale: lang,
      title1: title1
    }]));
  }

  filters() {
    const params = {
      contentLocale: this.contentLanguage,
    };
    if (!this.contentLangOnly) {
      params.showAll = 1;
    }
    return this._get(0, 'shows/stat?' + new URLSearchParams(params))
        .then((result) => this.formatFiltersFromServer(
            ['trending', 'popularity', 'updated', 'year', 'name', 'rating'],
            result
        )).catch(() => {
          const data = {
            genres: [
              'All',
              'Action',
              'Adventure',
              'Animation',
              'Children',
              'Comedy',
              'Crime',
              'Documentary',
              'Drama',
              'Family',
              'Fantasy',
              'Game Show',
              'Home and Garden',
              'Horror',
              'Mini Series',
              'Mystery',
              'News',
              'Reality',
              'Romance',
              'Science Fiction',
              'Soap',
              'Special Interest',
              'Sport',
              'Suspense',
              'Talk Show',
              'Thriller',
              'Western'
            ],
            sorters: ['trending', 'popularity', 'updated', 'year', 'name', 'rating'],
          };
          let filters = {
            genres: {},
            sorters: {},
          };
          for (const genre of data.genres) {
            filters.genres[genre] = i18n.__(genre.capitalizeEach());
          }
          for (const sorter of data.sorters) {
            filters.sorters[sorter] = i18n.__(sorter.capitalizeEach());
          }

          return Promise.resolve(filters);
        });
  }
}

TVApi.prototype.config = {
  name: 'TVApi',
  uniqueId: 'tvdb_id',
  tabName: 'TV Shows',
  type: 'tvshow',
  metadata: 'trakttv:show-metadata'
};

module.exports = TVApi;
