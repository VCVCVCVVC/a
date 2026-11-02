// aio-mega.js - Standalone Mega Aggregator + OpenSubtitles (AR/EN) for Nuvio

// 1. قائمة المستودعات والمصادر المدمجة (Ray's 18 Plugins + Extra Community Providers)
var REMOTE_PROVIDERS = [
  // --- مصادر Ray الأساسية (18 مصدر) ---
  { name: "FaselHD (عربي)", url: "https://raw.githubusercontent.com/hihihihihiiray/plugins/refs/heads/main/providers/faselhd.js" },
  { name: "4KHDHub", url: "https://raw.githubusercontent.com/hihihihihiiray/plugins/refs/heads/main/providers/4khdhub.js" },
  { name: "UHDMovies", url: "https://raw.githubusercontent.com/hihihihihiiray/plugins/refs/heads/main/providers/uhdmovies.js" },
  { name: "ShowBox", url: "https://raw.githubusercontent.com/hihihihihiiray/plugins/refs/heads/main/providers/showbox.js" },
  { name: "VidLink", url: "https://raw.githubusercontent.com/hihihihihiiray/plugins/refs/heads/main/providers/vidlink.js" },
  { name: "VidFast", url: "https://raw.githubusercontent.com/hihihihihiiray/plugins/refs/heads/main/providers/vidfast.js" },
  { name: "VidEasy", url: "https://raw.githubusercontent.com/hihihihihiiray/plugins/refs/heads/main/providers/videasy.js" },
  { name: "MovieBlast", url: "https://raw.githubusercontent.com/hihihihihiiray/plugins/refs/heads/main/providers/movieblast.js" },
  { name: "HDHub4u", url: "https://raw.githubusercontent.com/hihihihihiiray/plugins/refs/heads/main/providers/hdhub4u.js" },
  { name: "DahmerMovies", url: "https://raw.githubusercontent.com/hihihihihiiray/plugins/refs/heads/main/providers/dahmermovies.js" },
  { name: "Airflix", url: "https://raw.githubusercontent.com/hihihihihiiray/plugins/refs/heads/main/providers/airflix.js" },
  { name: "BollyFlix", url: "https://raw.githubusercontent.com/hihihihihiiray/plugins/refs/heads/main/providers/bollyflix.js" },
  { name: "AnimePahe", url: "https://raw.githubusercontent.com/hihihihihiiray/plugins/refs/heads/main/providers/animepahe.js" },
  { name: "AniNeko", url: "https://raw.githubusercontent.com/hihihihihiiray/plugins/refs/heads/main/providers/anineko.js" },
  { name: "TokyoInsider", url: "https://raw.githubusercontent.com/hihihihihiiray/plugins/refs/heads/main/providers/tokyoinsider.js" },
  { name: "Embed69", url: "https://raw.githubusercontent.com/hihihihihiiray/plugins/refs/heads/main/providers/embed69.js" },
  { name: "Movix", url: "https://raw.githubusercontent.com/hihihihihiiray/plugins/refs/heads/main/providers/movix.js" },
  { name: "FilmModu", url: "https://raw.githubusercontent.com/hihihihihiiray/plugins/refs/heads/main/providers/filmmodu.js" },

  // --- بلوقنات إضافية من مستودعات Nuvio الأخرى ---
  { name: "VidSrc", url: "https://raw.githubusercontent.com/nvmindl/nuvio-providers/refs/heads/main/providers/vidsrc.js" },
  { name: "AutoEmbed", url: "https://raw.githubusercontent.com/nvmindl/nuvio-providers/refs/heads/main/providers/autoembed.js" },
  { name: "RiveStream", url: "https://raw.githubusercontent.com/nvmindl/nuvio-providers/refs/heads/main/providers/rive.js" },
  { name: "PrimeWire", url: "https://raw.githubusercontent.com/nvmindl/nuvio-providers/refs/heads/main/providers/primewire.js" },
  { name: "Hianime", url: "https://raw.githubusercontent.com/nvmindl/nuvio-providers/refs/heads/main/providers/hianime.js" }
];

// دالة مساعدة لوضع وقت أقصى (Timeout) حتى لا يعلق أي مصدر بطيء باقي المصادر
function withTimeout(promise, ms, fallbackValue) {
  return new Promise(function (resolve) {
    var timer = setTimeout(function () {
      resolve(fallbackValue);
    }, ms);
    promise
      .then(function (res) {
        clearTimeout(timer);
        resolve(res);
      })
      .catch(function () {
        clearTimeout(timer);
        resolve(fallbackValue);
      });
  });
}

// 2. جلب الترجمات العربية والإنجليزية من OpenSubtitles v3 + Wyzie Subtitles
function fetchAllSubtitles(tmdbId, mediaType, season, episode) {
  var type = mediaType === "tv" ? "series" : "movie";
  var tmdbUrl = "https://api.themoviedb.org/3/" + mediaType + "/" + tmdbId + "/external_ids?api_key=8d6d91941230817f7807d643736e8a49";

  // أ) سحب من OpenSubtitles الرسمي عبر IMDb ID
  var openSubPromise = fetch(tmdbUrl)
    .then(function (res) { return res.json(); })
    .then(function (ids) {
      var imdbId = ids && ids.imdb_id ? ids.imdb_id : null;
      if (!imdbId) return [];

      var subUrl = "https://opensubtitles-v3.strem.io/subtitles/" + type + "/" + imdbId + ".json";
      if (mediaType === "tv" && season && episode) {
        subUrl = "https://opensubtitles-v3.strem.io/subtitles/series/" + imdbId + ":" + season + ":" + episode + ".json";
      }

      return fetch(subUrl)
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (!data || !Array.isArray(data.subtitles)) return [];
          return data.subtitles
            .filter(function (s) { return s.lang === "ara" || s.lang === "eng" || s.lang === "ar" || s.lang === "en"; })
            .map(function (s, idx) {
              var isAr = s.lang === "ara" || s.lang === "ar";
              return {
                id: s.id || ("os-" + idx),
                url: s.url,
                language: isAr ? "ar" : "en",
                name: isAr ? "🇸🇦 العربية (OpenSubtitles #" + (idx + 1) + ")" : "🇬🇧 English (OpenSubtitles #" + (idx + 1) + ")"
              };
            });
        });
    })
    .catch(function () { return []; });

  // ب) سحب إضافي مباشر من Wyzie Subtitles (يدعم TMDB مباشرة وسريع جداً بالعربي)
  var wyzieUrl = "https://sub.wyzie.ru/search?id=" + tmdbId + "&language=ar,en";
  if (mediaType === "tv" && season && episode) {
    wyzieUrl += "&season=" + season + "&episode=" + episode;
  }

  var wyziePromise = fetch(wyzieUrl)
    .then(function (r) { return r.json(); })
    .then(function (list) {
      if (!Array.isArray(list)) return [];
      return list.map(function (item, idx) {
        var isAr = item.language === "ar" || item.language === "ara";
        return {
          id: item.id || ("wyzie-" + idx),
          url: item.url,
          language: isAr ? "ar" : "en",
          name: isAr ? "🇸🇦 العربية (" + (item.display || "WyzieSub") + ")" : "🇬🇧 English (" + (item.display || "WyzieSub") + ")"
        };
      });
    })
    .catch(function () { return []; });

  return Promise.all([
    withTimeout(openSubPromise, 4500, []),
    withTimeout(wyziePromise, 4500, [])
  ]).then(function (results) {
    var combined = results[0].concat(results[1]);
    // ترتيب الترجمات بحيث تظهر العربية دائماً في الأعلى
    combined.sort(function (a, b) {
      if (a.language === "ar" && b.language !== "ar") return -1;
      if (a.language !== "ar" && b.language === "ar") return 1;
      return 0;
    });
    return combined;
  });
}

// 3. مصادر إضافية مدمجة داخلياً (Direct AutoEmbed / VidSrc / MultiEmbed API)
function fetchBuiltInExtraStreams(tmdbId, mediaType, season, episode) {
  var autoEmbedUrl = mediaType === "tv"
    ? "https://autoembed.cc/embed/player.php?id=" + tmdbId + "&s=" + season + "&e=" + episode
    : "https://autoembed.cc/embed/player.php?id=" + tmdbId;

  // استخراج مباشر من واجهة VidSrc/AutoEmbed المفتوحة إن توفرت
  var directApiUrl = mediaType === "tv"
    ? "https://vidsrc.xyz/embed/tv?tmdb=" + tmdbId + "&season=" + season + "&episode=" + episode
    : "https://vidsrc.xyz/embed/movie?tmdb=" + tmdbId;

  // نكتفي بإرجاع مصفوفة فارغة إذا لم يكن الرابط خام (m3u8/mp4) لكي لا يرفضه مشغل Nuvio الداخلي
  return Promise.resolve([]);
}

// 4. تحديد رتبة الجودة لترتيب السيرفرات من الأعلى (4K) إلى الأقل
function getQualityScore(stream) {
  var text = ((stream.quality || "") + " " + (stream.title || "") + " " + (stream.name || "")).toLowerCase();
  if (text.indexOf("2160") !== -1 || text.indexOf("4k") !== -1 || text.indexOf("uhd") !== -1) return 4;
  if (text.indexOf("1080") !== -1 || text.indexOf("fhd") !== -1) return 3;
  if (text.indexOf("720") !== -1 || text.indexOf("hd") !== -1) return 2;
  if (text.indexOf("480") !== -1 || text.indexOf("360") !== -1) return 1;
  return 2; // افتراضي للروابط المتكيفة Auto m3u8
}

// 5. الدالة الرئيسية التي يستدعيها Nuvio
function getStreams(tmdbId, mediaType, season, episode) {
  var subsPromise = fetchAllSubtitles(tmdbId, mediaType, season, episode);

  var providerPromises = REMOTE_PROVIDERS.map(function (prov) {
    var task = fetch(prov.url)
      .then(function (res) {
        if (!res.ok) return [];
        return res.text();
      })
      .then(function (code) {
        if (!code || code.indexOf("getStreams") === -1) return [];
        var mod = { exports: {} };
        var runner = new Function("module", "exports", code);
        runner(mod, mod.exports);

        if (mod.exports && typeof mod.exports.getStreams === "function") {
          return Promise.resolve(mod.exports.getStreams(tmdbId, mediaType, season, episode))
            .then(function (streams) {
              if (!Array.isArray(streams)) return [];
              return streams.map(function (s) {
                // توحيد اسم المصدر ليظهر بوضوح داخل Nuvio
                s.name = s.name ? (prov.name + " - " + s.name) : prov.name;
                return s;
              });
            });
        }
        return [];
      })
      .catch(function () {
        return [];
      });

    // مهلة 8 ثوانٍ لكل مصدر حتى لا يتأخر البحث الكلي
    return withTimeout(task, 8000, []);
  });

  return Promise.all([subsPromise, Promise.all(providerPromises)]).then(function (allResults) {
    var subtitles = allResults[0] || [];
    var providerStreamsArrays = allResults[1] || [];
    var finalStreams = [];
    var seenUrls = {};

    providerStreamsArrays.forEach(function (streamsList) {
      if (Array.isArray(streamsList)) {
        streamsList.forEach(function (stream) {
          if (!stream || !stream.url) return;

          // منع تكرار نفس الرابط إذا ظهر في أكثر من مصدر
          if (seenUrls[stream.url]) return;
          seenUrls[stream.url] = true;

          // دمج الترجمة العربية والإنجليزية مع الترجمات الأصلية للسيرفر
          var existingSubs = Array.isArray(stream.subtitles) ? stream.subtitles : [];
          stream.subtitles = subtitles.concat(existingSubs);

          finalStreams.push(stream);
        });
      }
    });

    // ترتيب الروابط حسب الجودة (4K أولاً ثم 1080p)
    finalStreams.sort(function (a, b) {
      return getQualityScore(b) - getQualityScore(a);
    });

    return finalStreams;
  });
}

module.exports = { getStreams: getStreams };
