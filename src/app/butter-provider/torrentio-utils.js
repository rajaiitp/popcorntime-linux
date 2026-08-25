'use strict';

function encodeSegment(value) {
    return encodeURIComponent(String(value));
}

function buildStreamPath(type, id, season, episode) {
    var path = 'stream/' + type + '/' + encodeSegment(id);

    if (type === 'series' && season !== undefined && season !== null && episode !== undefined && episode !== null) {
        path += ':' + encodeSegment(season) + ':' + encodeSegment(episode);
    }

    return path + '.json';
}

function formatBytes(bytes) {
    var value = Number(bytes);
    var units = ['B', 'KB', 'MB', 'GB', 'TB'];
    var unit = 0;

    if (!isFinite(value) || value <= 0) {
        return '';
    }

    while (value >= 1000 && unit < units.length - 1) {
        value /= 1000;
        unit++;
    }

    return (value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)) + ' ' + units[unit];
}

function parseQuality(text) {
    var match = String(text || '').match(/(?:^|[^0-9])((?:2160|1080|720|576|480|360)p|4k)(?:[^0-9]|$)/i);

    if (!match) {
        return '';
    }

    return match[1].toLowerCase() === '4k' ? '2160p' : match[1].toLowerCase();
}

function parseSize(text) {
    var match = String(text || '').match(/([0-9]+(?:[.,][0-9]+)?)\s*(gb|mb|kb|tb)/i);

    return match ? match[0].replace(',', '.') : '';
}

function numericValue(value) {
    var number = Number(value);
    return isFinite(number) && number >= 0 ? number : 0;
}

function titleStat(title, marker) {
    var match = String(title || '').match(new RegExp(marker + '\\s*([0-9][0-9,.]*)', 'i'));
    return match ? Number(match[1].replace(/,/g, '')) : 0;
}

function isTorrentFileUrl(value) {
    return /^https?:\/\/[^\s]+\.torrent(?:[?#].*)?$/i.test(value || '');
}

function appendTrackers(url, sources) {
    var trackers = {};
    if (!Array.isArray(sources)) {
        return url;
    }

    sources.forEach(function(source) {
        if (typeof source !== 'string' || source.indexOf('tracker:') !== 0) {
            return;
        }
        var tracker = source.slice(8);
        if (tracker && !trackers[tracker]) {
            trackers[tracker] = true;
            url += '&tr=' + encodeURIComponent(tracker);
        }
    });

    return url;
}

function normalizeStreams(data, source) {
    var streams = data && Array.isArray(data.streams) ? data.streams : [];
    var seen = {};

    return streams.map(function(stream) {
        if (!stream || typeof stream !== 'object') {
            return null;
        }

        var behaviorHints = stream.behaviorHints || {};
        var infoHash = typeof stream.infoHash === 'string' ? stream.infoHash.replace(/[^a-f0-9]/gi, '') : '';
        var streamUrl = typeof stream.url === 'string' ? stream.url : '';
        var filename = behaviorHints.filename || stream.filename || '';
        var title = stream.title || stream.description || stream.name || filename || 'Torrentio';
        var url;

        if (infoHash.length === 40) {
            url = 'magnet:?xt=urn:btih:' + infoHash;
            if (filename) {
                url += '&dn=' + encodeURIComponent(filename);
            }
            url = appendTrackers(url, stream.sources);
        } else if (/^magnet:\?/i.test(streamUrl) || isTorrentFileUrl(streamUrl)) {
            url = /^magnet:\?/i.test(streamUrl) ? appendTrackers(streamUrl, stream.sources) : streamUrl;
        } else {
            return null;
        }

        var key = infoHash || url;
        if (seen[key]) {
            return null;
        }
        seen[key] = true;

        var fileIndex = Number(stream.fileIdx);
        var hasFileIndex = Number.isInteger(fileIndex) && fileIndex >= 0;
        var quality = parseQuality(title) || parseQuality(stream.name) || parseQuality(filename);
        var size = behaviorHints.videoSize || stream.size || stream.filesize;
        var seed = stream.seeders !== undefined ? stream.seeders : (stream.seeds !== undefined ? stream.seeds : stream.seed);
        var peer = stream.peers !== undefined ? stream.peers : stream.peer;
        if (seed === undefined) {
            seed = titleStat(title, '👤');
        }
        if (peer === undefined) {
            peer = titleStat(title, '👥');
        }

        return {
            title: String(title).replace(/[\r\n]+/g, ' | ').trim(),
            quality: quality || 'Unknown',
            url: url,
            magnet: url,
            source: stream.externalUrl || source,
            provider: 'Torrentio',
            file: filename,
            fileIdx: hasFileIndex ? fileIndex : undefined,
            file_index: hasFileIndex ? fileIndex : undefined,
            infoHash: infoHash || undefined,
            size: size || undefined,
            filesize: formatBytes(size) || parseSize(title),
            seed: numericValue(seed),
            peer: numericValue(peer)
        };
    }).filter(Boolean);
}

function asTorrentList(value) {
    if (Array.isArray(value)) {
        return value.filter(Boolean);
    }

    if (!value || typeof value !== 'object') {
        return [];
    }

    return Object.keys(value).map(function(quality) {
        var torrent = value[quality];
        if (!torrent || typeof torrent !== 'object') {
            return null;
        }
        var item = Object.assign({}, torrent);
        if (!item.quality) {
            item.quality = quality;
        }
        return item;
    }).filter(Boolean);
}

function isUsableTorrent(torrent) {
    return !!(torrent && typeof torrent === 'object' && (torrent.url || torrent.magnet));
}

function hasUsableTorrents(value) {
    return asTorrentList(value).some(isUsableTorrent);
}

function qualityForTorrent(torrent, fallbackQuality) {
    var quality = parseQuality(torrent && (torrent.quality || torrent.name || torrent.title || torrent.file));
    return quality || fallbackQuality || 'Unknown';
}

function seedCount(torrent) {
    var value = torrent && (torrent.seed !== undefined ? torrent.seed : torrent.seeds);
    value = Number(value);
    return isFinite(value) && value >= 0 ? value : 0;
}

function toQualityMap(value) {
    var map = {};

    asTorrentList(value).forEach(function(torrent) {
        if (!isUsableTorrent(torrent)) {
            return;
        }

        var quality = qualityForTorrent(torrent);
        var candidate = Object.assign({}, torrent, {quality: quality});
        if (!map[quality] || seedCount(candidate) > seedCount(map[quality])) {
            map[quality] = candidate;
        }
    });

    return map;
}

function mergeQualityMaps(primary, supplemental) {
    var merged = Object.assign({}, primary || {});
    var additions = toQualityMap(supplemental);

    Object.keys(additions).forEach(function(quality) {
        if (!isUsableTorrent(merged[quality])) {
            merged[quality] = additions[quality];
        }
    });

    return merged;
}

function torrentKey(torrent) {
    var url = torrent && (torrent.url || torrent.magnet || torrent);
    var hashMatch = String(url || '').match(/urn:btih:([^&]+)/i);

    if (torrent && torrent.infoHash) {
        return String(torrent.infoHash).toLowerCase();
    }

    if (hashMatch) {
        return hashMatch[1].toLowerCase();
    }

    return String(url || '').replace(/[?&]tr=[^&]*/gi, '');
}

function mergeTorrents(primary, supplemental) {
    var merged = [];
    var seen = {};

    (primary || []).concat(supplemental || []).forEach(function(torrent) {
        var key = torrentKey(torrent);
        if (!key || seen[key]) {
            return;
        }
        seen[key] = true;
        merged.push(torrent);
    });

    return merged;
}

function selectFileIndex(files, requestedIndex) {
    var index = Number(requestedIndex);

    return Number.isInteger(index) && index >= 0 && files && files[index] ? index : -1;
}

module.exports = {
    buildStreamPath: buildStreamPath,
    normalizeStreams: normalizeStreams,
    mergeTorrents: mergeTorrents,
    selectFileIndex: selectFileIndex,
    asTorrentList: asTorrentList,
    hasUsableTorrents: hasUsableTorrents,
    toQualityMap: toQualityMap,
    mergeQualityMaps: mergeQualityMaps
};
