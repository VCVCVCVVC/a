// =========================================================================
// 1take2 v19.0.0 - Grand Masterpiece Edition (النسخة الإمبراطورية المتكاملة)
// التعريب الشامل الفوري للقصص والحلقات والأفلام والمسلسلات والأنمي والدراما
// دمج TMDB الرسمي + Nuvio + Cinemeta + Kitsu + محركات الترجمة + كاش 30 يوماً
// =========================================================================

const ADDON_NAME = "1take2";
const VERSION = "19.0.0";

// مفاتيح TMDB الرسمية المعتمدة للتعريب السينمائي المباشر لجميع الأفلام والمسلسلات والحلقات
const TMDB_API_KEY = process.env.TMDB_API_KEY || "4e44d9029b1270a757cddc766a1bcb63";
const TMDB_BACKUP_KEY = "b28b746d0a7900b3e51a66ff5503d29a";
const TMDB_BASE = "https://api.themoviedb.org/3";

// كتالوجات Nuvio (TMDB) المعتمدة والنشطة
const NUVIO_URL = (process.env.NUVIO_URL || "https://catalog.nuvio.tv").replace(/\/manifest\.json$/i, "").replace(/\/+$/, "");

// رابط Torrentio الافتراضي مع TorBox لتوفير بث فوري سحابي فائق السرعة
const DEFAULT_TORBOX_URL = "https://torrentio.strem.fun/qualityfilter=scr,cam|torbox=3183a8fd-2d85-41fb-a58d-39c5737efae3";
const UPSTREAM_URL = (process.env.UPSTREAM_URL || DEFAULT_TORBOX_URL).replace(/\/manifest\.json$/i, "").replace(/\/+$/, "");

// تفعيل روابط التورنت المباشرة P2P (اختياري - افتراضياً مفعلة مع أولوية الروابط الفورية)
const ENABLE_P2P = process.env.ENABLE_P2P !== "0";

// إعدادات الذاكرة المؤقتة (TTLs) محسوبة بدقة لمنع تكرار الاتصالات وتسريع الاستجابة
const CACHE_TTL_STREAM = 30 * 60 * 1000;          // 30 دقيقة للروابط
const CACHE_TTL_META = 4 * 60 * 60 * 1000;        // 4 ساعات للتفاصيل
const CACHE_TTL_CAT = 60 * 60 * 1000;             // ساعة كاملة للكتالوجات
const CACHE_TTL_TRANS = 30 * 24 * 60 * 60 * 1000; // 30 يوماً للترجمات (فورية بلا شبكة)
const STALE_TTL = 24 * 60 * 60 * 1000;            // 24 ساعة للنسخ الاحتياطية (Stale-While-Revalidate)
const TIMEOUT_MS = 3800;

// كاش دائم اختياري (Upstash Redis أو Vercel KV) لحفظ الترجمات بين إعادات التشغيل
const KV_URL = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "").replace(/\/+$/, "");
const KV_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
const KV_ON = Boolean(KV_URL && KV_TOKEN);

// المزودات الحية المعتمدة عالية الاستقرار
const UPSTREAM_ADDONS = {
  cinemeta: "https://v3-cinemeta.strem.io",
  nuvio: NUVIO_URL,
  animeKitsu: "https://anime-kitsu.strem.fun",
  torrentio: UPSTREAM_URL,
  webstreamr: "https://webstreamr.hayd.uk",
  publicDomain: "https://caching.stremio.net/publicdomainmovies.now.sh",
  opensubtitlesV3: "https://opensubtitles-v3.strem.io"
};

// =========================================================================
// 1. تصنيفات وقوائم Nuvio والكتالوجات العربية والأنمي
// =========================================================================

const NV_MOVIE_GENRES = ["Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary", "Drama", "Family", "Fantasy", "History", "Horror", "Music", "Mystery", "Romance", "Science Fiction", "TV Movie", "Thriller", "War", "Western"];
const NV_SERIES_GENRES = ["Action & Adventure", "Animation", "Comedy", "Crime", "Documentary", "Drama", "Family", "Kids", "Mystery", "News", "Reality", "Sci-Fi & Fantasy", "Soap", "Talk", "War & Politics", "Western"];
const NV_YEARS = Array.from({ length: 37 }, (_, i) => String(2026 - i));
const NV_LANGS = ["Arabic", "English", "Spanish", "French", "German", "Italian", "Portuguese", "Korean", "Japanese", "Chinese", "Hindi", "Turkish", "Russian", "Polish", "Dutch"];

function nuvioCatalogs() {
  const mk = (type, id, name, { search = false, options = null } = {}) => {
    const extra = [];
    if (search) extra.push({ name: "search", isRequired: false });
    extra.push({ name: "skip", isRequired: false });
    if (options) extra.push({ name: "genre", isRequired: false, options, optionsLimit: 1 });
    return { type, id: `nuvio-${id}`, name, extra };
  };
  const M = NV_MOVIE_GENRES, S = NV_SERIES_GENRES;
  return [
    mk("movie", "trending-movies", "الأفلام الرائجة"),
    mk("series", "trending-series", "المسلسلات الرائجة"),
    mk("movie", "popular-movies", "الأفلام الشائعة", { search: true, options: M }),
    mk("series", "popular-series", "المسلسلات الشائعة", { search: true, options: S }),
    mk("series", "airing-today-series", "مسلسلات تُعرض اليوم"),
    mk("movie", "critically-acclaimed-movies", "أفلام أشاد بها النقاد", { options: M }),
    mk("series", "critically-acclaimed-series", "مسلسلات أشاد بها النقاد", { options: S }),
    mk("movie", "new-and-upcoming-movies", "أفلام جديدة وقادمة", { options: M }),
    mk("series", "new-and-returning-series", "مسلسلات جديدة وعائدة", { options: S }),
    mk("movie", "movies-by-year", "أفلام حسب السنة", { options: NV_YEARS }),
    mk("series", "series-by-year", "مسلسلات حسب السنة", { options: NV_YEARS }),
    mk("movie", "movies-by-language", "أفلام حسب اللغة", { options: NV_LANGS }),
    mk("series", "series-by-language", "مسلسلات حسب اللغة", { options: NV_LANGS }),
    mk("movie", "netflix-movies", "أفلام نتفليكس", { options: M }),
    mk("series", "netflix-series", "مسلسلات نتفليكس", { options: S }),
    mk("movie", "disney-plus-movies", "أفلام ديزني+", { options: M }),
    mk("series", "disney-plus-series", "مسلسلات ديزني+", { options: S }),
    mk("movie", "prime-video-movies", "أفلام برايم فيديو", { options: M }),
    mk("series", "prime-video-series", "مسلسلات برايم فيديو", { options: S }),
    mk("movie", "international-cinema", "سينما عالمية"),
    mk("series", "international-series", "مسلسلات عالمية"),
    mk("movie", "independent-and-festival-picks", "مستقلة ومهرجانات"),
    mk("series", "limited-series", "مسلسلات محدودة القصص"),
    mk("movie", "documentaries", "أفلام وثائقية"),
    mk("series", "documentary-series", "مسلسلات وثائقية"),
    mk("movie", "family-movies", "أفلام عائلية"),
    mk("series", "family-series", "مسلسلات عائلية")
  ];
}

// =========================================================================
// 2. إدارة الذاكرة المؤقتة الذكية وحماية المزودات (Smart Isolation & Caching)
// =========================================================================

const memoryCache = new Map();
const inflightRequests = new Map();
const healthMetrics = new Map();
const idMapCache = new Map();

function getFromCache(key, allowStale = false, maxStaleMs = STALE_TTL) {
  try {
    const item = memoryCache.get(key);
    if (!item) return null;
    const age = Date.now() - item.time;
    const ttl = item.customTtl || CACHE_TTL_CAT;
    if (age < ttl) return item.data;
    if (allowStale && age < maxStaleMs) return item.data;
    if (age >= maxStaleMs) memoryCache.delete(key);
  } catch {
    // تجاهل آمن
  }
  return null;
}

function saveToCache(key, data, customTtl = null) {
  try {
    if (memoryCache.size > 5000) {
      const oldestKeys = Array.from(memoryCache.keys()).slice(0, 1200);
      oldestKeys.forEach(k => memoryCache.delete(k));
    }
    memoryCache.set(key, { data, time: Date.now(), customTtl });
  } catch {
    // تجاهل آمن
  }
}

function recordProviderStatus(host, success) {
  try {
    if (!host) return;
    const stat = healthMetrics.get(host) || { fails: 0, lastFail: 0, successes: 0 };
    if (success) {
      stat.fails = Math.max(0, stat.fails - 1);
      stat.successes += 1;
    } else {
      stat.fails += 1;
      stat.lastFail = Date.now();
    }
    healthMetrics.set(host, stat);
  } catch {
    // تجاهل آمن
  }
}

function isProviderHealthy(url) {
  try {
    const host = new URL(url).hostname;
    const stat = healthMetrics.get(host);
    if (!stat) return true;
    if (stat.fails >= 5 && Date.now() - stat.lastFail < 25000) {
      return false;
    }
    return true;
  } catch {
    return true;
  }
}

async function safeFetchJson(url, headers = {}, customTimeout = TIMEOUT_MS) {
  if (!isProviderHealthy(url)) return null;

  if (inflightRequests.has(url)) {
    return inflightRequests.get(url);
  }

  const fetchPromise = (async () => {
    await Promise.resolve();
    let host = "";
    try {
      host = new URL(url).hostname;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), customTimeout);

      let res;
      try {
        res = await fetch(url, {
          signal: controller.signal,
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) 1take2/19.0.0",
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "ar,en-US;q=0.9,en;q=0.8",
            ...headers
          }
        });
      } finally {
        clearTimeout(timer);
      }

      if (!res.ok) {
        if (res.status !== 404 && res.status !== 400) recordProviderStatus(host, false);
        return null;
      }

      const text = await res.text();
      if (!text || text.trim().startsWith("<")) {
        recordProviderStatus(host, false);
        return null;
      }

      const data = JSON.parse(text);
      recordProviderStatus(host, true);
      return data;
    } catch {
      if (host) recordProviderStatus(host, false);
      return null;
    } finally {
      inflightRequests.delete(url);
    }
  })();

  inflightRequests.set(url, fetchPromise);
  return fetchPromise;
}

const withDeadline = (p, ms) => Promise.race([
  p,
  new Promise(r => setTimeout(() => r(null), ms))
]);

// =========================================================================
// 3. التعريب الشامل: كشف اللغة، معجم سينمائي غني، ومحركات ترجمة سريعة
// =========================================================================

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

function stripAllEmojis(str) {
  if (!str) return "";
  return str
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "")
    .replace(/[\u2600-\u27BF\uFE0F\u200D]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const GENRE_AR_MAP = {
  Action: "حركة وإثارة",
  Adventure: "مغامرة",
  Animation: "رسوم متحركة",
  Biography: "سيرة ذاتية",
  Comedy: "كوميديا",
  Crime: "جريمة",
  Documentary: "وثائقي",
  Drama: "دراما",
  Family: "عائلي",
  Fantasy: "فانتازيا",
  History: "تاريخي",
  Horror: "رعب",
  Music: "موسيقي",
  Musical: "استعراضي",
  Mystery: "غموض",
  Romance: "رومانسي",
  "Sci-Fi": "خيال علمي",
  "Science Fiction": "خيال علمي",
  Suspense: "تشويق",
  Sport: "رياضي",
  Thriller: "إثارة",
  War: "حرب",
  Western: "غرب أمريكي",
  Kids: "أطفال",
  News: "أخبار",
  Reality: "واقعي",
  "Reality-TV": "تلفزيون الواقع",
  "Talk-Show": "برنامج حواري",
  "Game-Show": "مسابقات",
  Soap: "دراما اجتماعية",
  "TV Movie": "فيلم تلفزيوني",
  "Film-Noir": "نوار كلاسيكي",
  Short: "قصير",
  "Action & Adventure": "حركة ومغامرة",
  "Sci-Fi & Fantasy": "خيال علمي وفانتازيا",
  "War & Politics": "حرب وسياسة",
  Anime: "أنمي",
  Supernatural: "قوى خارقة",
  Psychological: "نفسي",
  Martial: "فنون قتالية"
};

function localizeGenres(genres) {
  if (!Array.isArray(genres)) return [];
  return genres.map(g => GENRE_AR_MAP[g] || g);
}

function hasArabic(text) {
  return typeof text === "string" && /[\u0600-\u06FF]/.test(text);
}

function isTextArabic(text) {
  if (!text || typeof text !== "string") return false;
  const letters = text.match(/\p{L}/gu);
  const arabic = text.match(/[\u0600-\u06FF]/g);
  if (!letters || !arabic) return false;
  return arabic.length >= 3 && arabic.length / letters.length >= 0.28;
}

function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + "_" + s.length;
}

async function fetchT(url, opts = {}, ms = 3200) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function mapLimit(arr, limit, fn) {
  const out = new Array(arr.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, arr.length) }, async () => {
    while (true) {
      const idx = next++;
      if (idx >= arr.length) return;
      try {
        out[idx] = await fn(arr[idx], idx);
      } catch {
        out[idx] = undefined;
      }
    }
  });
  await Promise.all(workers);
  return out;
}

// محرك MyMemory فائق الدقة
async function engineMyMemory(text, ms) {
  try {
    const clean = text.slice(0, 480);
    const res = await fetchT(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(clean)}&langpair=en|ar`, {}, ms);
    if (!res.ok) return null;
    const data = await res.json();
    const t = data?.responseData?.translatedText;
    if (typeof t === "string" && isTextArabic(t)) return t.trim();
  } catch {
    // تجاهل
  }
  return null;
}

// محرك Google GTX مع تدوير المعلمات
async function engineGtx(text, ms) {
  try {
    const res = await fetchT(
      "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ar&dt=t",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "User-Agent": UA },
        body: "q=" + encodeURIComponent(text.slice(0, 3500))
      },
      ms
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data) && Array.isArray(data[0])) {
      const tr = data[0].map(p => (p && p[0]) ? p[0] : "").join("").trim();
      if (tr && isTextArabic(tr)) return tr;
    }
  } catch {
    // تجاهل
  }
  return null;
}

// محرك Google Clients5
async function engineClients5(text, ms) {
  try {
    const url = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=ar&q=${encodeURIComponent(text.slice(0, 1800))}`;
    const res = await fetchT(url, { headers: { "User-Agent": UA } }, ms);
    if (!res.ok) return null;
    const data = await res.json();
    const candidate = Array.isArray(data) ? (Array.isArray(data[0]) ? data[0][0] : data[0]) : null;
    if (typeof candidate === "string" && isTextArabic(candidate)) return candidate.trim();
  } catch {
    // تجاهل
  }
  return null;
}

async function kvCmd(cmd, ms = 700) {
  if (!KV_ON) return null;
  try {
    const res = await fetchT(KV_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${KV_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(cmd)
    }, ms);
    if (!res.ok) return null;
    const j = await res.json();
    return j?.result ?? null;
  } catch {
    return null;
  }
}

async function kvGetJson(key) {
  const r = await kvCmd(["GET", `1t2:${key}`]);
  if (typeof r !== "string") return null;
  try { return JSON.parse(r); } catch { return null; }
}

async function kvSetJson(key, val, ttlSec) {
  if (!KV_ON) return;
  const body = JSON.stringify(val);
  if (body.length > 750000) return;
  await kvCmd(["SET", `1t2:${key}`, body, "EX", String(ttlSec)], 1200);
}

async function translateToArabic(text, deadline = Infinity) {
  if (!text || typeof text !== "string") return text;
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean || isTextArabic(clean)) return clean;

  const cacheKey = `tr_v19_${hashStr(clean)}`;
  const cached = getFromCache(cacheKey, true, CACHE_TTL_TRANS);
  if (cached && isTextArabic(cached)) return cached;

  if (KV_ON && deadline - Date.now() > 800) {
    const kv = await kvGetJson(`tr_v19_${hashStr(clean)}`);
    if (typeof kv === "string" && isTextArabic(kv)) {
      saveToCache(cacheKey, kv, CACHE_TTL_TRANS);
      return kv;
    }
  }

  for (const engine of [engineMyMemory, engineGtx, engineClients5]) {
    const remaining = deadline - Date.now();
    if (remaining < 450) break;
    try {
      const out = await engine(clean, Math.min(3000, remaining));
      if (out && isTextArabic(out)) {
        saveToCache(cacheKey, out, CACHE_TTL_TRANS);
        kvSetJson(`tr_v19_${hashStr(clean)}`, out, 60 * 60 * 24 * 30);
        return out;
      }
    } catch {
      // تجربة المحرك التالي
    }
  }
  return clean;
}

async function translateMany(texts, { limit = 6, budgetMs = 5500 } = {}) {
  const deadline = Date.now() + budgetMs;
  return mapLimit(texts, limit, t => translateToArabic(t, deadline));
}

function pickPlot(item) {
  return item?.description || item?.overview || item?.synopsis || "";
}

function applyPlot(item, plot) {
  if (!item) return;
  item.description = plot;
  item.overview = plot;
  item.synopsis = plot;
}

function cachedArabic(text) {
  if (!text || typeof text !== "string") return null;
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  if (isTextArabic(clean)) return clean;
  const c = getFromCache(`tr_v19_${hashStr(clean)}`, true, CACHE_TTL_TRANS);
  return c && isTextArabic(c) ? c : null;
}

// =========================================================================
// 4. المحرك الإمبراطوري للتعريب عبر TMDB API الرسمي (Direct Studio Arabic)
// يضمن جلب العناوين والقصص والحلقات بالعربية الرسمية الصادرة من استوديوهات الإنتاج
// =========================================================================

async function fetchTmdbArabic(type, rawId) {
  if (!rawId) return null;
  const id = String(rawId).trim();
  const cacheKey = `tmdb_ar_v19_${type}_${id}`;
  const hit = getFromCache(cacheKey, true, CACHE_TTL_TRANS);
  if (hit) return hit;

  try {
    let tmdbType = (type === "series" || type === "tv" || type === "anime") ? "tv" : "movie";
    let tmdbId = null;
    let mainData = null;

    if (id.startsWith("tmdb:")) {
      tmdbId = id.split(":")[1];
      const res = await safeFetchJson(`${TMDB_BASE}/${tmdbType}/${tmdbId}?language=ar-SA&api_key=${TMDB_API_KEY}`, {}, 3200);
      mainData = res;
    } else if (id.startsWith("tt")) {
      const findRes = await safeFetchJson(`${TMDB_BASE}/find/${id}?external_source=imdb_id&language=ar-SA&api_key=${TMDB_API_KEY}`, {}, 3200);
      if (findRes) {
        if (findRes.movie_results?.length) {
          mainData = findRes.movie_results[0];
          tmdbType = "movie";
          tmdbId = mainData.id;
        } else if (findRes.tv_results?.length) {
          mainData = findRes.tv_results[0];
          tmdbType = "tv";
          tmdbId = mainData.id;
        }
      }
    }

    if (!mainData) return null;

    const result = {
      tmdbId,
      title: mainData.title || mainData.name || null,
      overview: mainData.overview || null,
      episodesMap: new Map()
    };

    // جلب كافة مواسم وحلقات المسلسلات بالعربية الرسمية بطلب مدمج فائق السرعة
    if (tmdbType === "tv" && tmdbId) {
      const appendSeasons = Array.from({ length: 8 }, (_, i) => `season/${i + 1}`).join(",");
      const tvFull = await safeFetchJson(
        `${TMDB_BASE}/tv/${tmdbId}?language=ar-SA&append_to_response=${appendSeasons}&api_key=${TMDB_API_KEY}`,
        {},
        3500
      );
      if (tvFull) {
        if (!result.overview && tvFull.overview) result.overview = tvFull.overview;
        for (let s = 1; s <= 8; s++) {
          const seasonData = tvFull[`season/${s}`];
          if (seasonData?.episodes) {
            for (const ep of seasonData.episodes) {
              result.episodesMap.set(`${s}:${ep.episode_number}`, {
                name: ep.name,
                overview: ep.overview
              });
            }
          }
        }
      }
    }

    saveToCache(cacheKey, result, CACHE_TTL_TRANS);
    return result;
  } catch {
    return null;
  }
}

// تعريب عناصر الكتالوج مع دعم القصص والعناوين المباشرة
async function localizeCatalogList(items, type = "movie") {
  if (!Array.isArray(items) || items.length === 0) return { items: [], complete: true };

  const prepared = items.map(item => ({
    ...item,
    name: stripAllEmojis(item.name || ""),
    genres: localizeGenres(item.genres),
    genre: Array.isArray(item.genre) ? localizeGenres(item.genre) : item.genre
  }));

  const toTranslate = [];
  prepared.forEach((item, i) => {
    const plot = pickPlot(item);
    if (!plot) return;
    const ar = cachedArabic(plot);
    if (ar) {
      applyPlot(item, ar);
    } else if (i < 16) {
      toTranslate.push({ idx: i, text: plot });
    }
  });

  if (toTranslate.length > 0) {
    const translated = await translateMany(toTranslate.map(t => t.text), { limit: 8, budgetMs: 2600 });
    translated.forEach((arText, k) => {
      if (arText && isTextArabic(arText)) {
        applyPlot(prepared[toTranslate[k].idx], arText);
      }
    });
  }

  return { items: prepared, complete: true };
}

// =========================================================================
// 5. خوارزميات فحص وحل معرفات TMDB و IMDb للتحويل الفوري (ID Resolvers)
// =========================================================================

async function resolveTmdbToImdb(tmdbId, type = "movie") {
  if (!tmdbId) return null;
  const cleanId = String(tmdbId).trim();
  const reqId = cleanId.startsWith("tmdb:") ? cleanId : `tmdb:${cleanId}`;
  const cacheKey = `idmap_${reqId}`;
  const hit = idMapCache.get(cacheKey) || getFromCache(cacheKey, true, CACHE_TTL_TRANS);
  if (hit) return hit;

  try {
    const pureNum = reqId.replace("tmdb:", "");
    const extType = (type === "series" || type === "tv" || type === "anime") ? "tv" : "movie";
    const ext = await safeFetchJson(`${TMDB_BASE}/${extType}/${pureNum}/external_ids?api_key=${TMDB_API_KEY}`, {}, 2800);
    if (ext?.imdb_id && /^tt\d+/i.test(ext.imdb_id)) {
      idMapCache.set(cacheKey, ext.imdb_id);
      saveToCache(cacheKey, ext.imdb_id, CACHE_TTL_TRANS);
      return ext.imdb_id;
    }
    const nuvioData = await safeFetchJson(`${UPSTREAM_ADDONS.nuvio}/meta/${type === "anime" ? "series" : type}/${reqId}.json`, {}, 2800);
    const imdbId = nuvioData?.meta?.id?.startsWith("tt") ? nuvioData.meta.id : nuvioData?.meta?.imdb_id;
    if (imdbId && /^tt\d+/i.test(imdbId)) {
      idMapCache.set(cacheKey, imdbId);
      saveToCache(cacheKey, imdbId, CACHE_TTL_TRANS);
      return imdbId;
    }
  } catch {
    // تجاهل
  }
  return null;
}

// =========================================================================
// 6. هندسة وتحليل الروابط: الدقة، كوديكات الصوت، تقنيات الصورة، وشارات الدبلجة
// =========================================================================

function parseSizeBytes(sizeStr) {
  if (!sizeStr) return 0;
  const match = String(sizeStr).replace(",", ".").match(/([0-9]+(?:\.[0-9]+)?)\s*(TB|GB|MB|KB|TIB|GIB|MIB|KIB)/i);
  if (!match) return 0;
  const val = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  if (unit.startsWith("T")) return val * 1024 * 1024 * 1024 * 1024;
  if (unit.startsWith("G")) return val * 1024 * 1024 * 1024;
  if (unit.startsWith("M")) return val * 1024 * 1024;
  if (unit.startsWith("K")) return val * 1024;
  return 0;
}

function extractTrackers(stream) {
  const defaultTrackers = [
    "udp://tracker.opentrackr.org:1337/announce",
    "udp://open.demonii.com:1337/announce",
    "udp://open.stealth.si:80/announce",
    "udp://exodus.desync.com:6969/announce",
    "udp://tracker.torrent.eu.org:451/announce"
  ];
  const existing = Array.isArray(stream.sources) ? stream.sources : [];
  const combined = new Set([...existing, ...defaultTrackers.map(t => `tracker:${t}`)]);
  return Array.from(combined);
}

function getCanonicalKey(stream) {
  if (stream.infoHash) {
    const fileIdx = typeof stream.fileIdx === "number" ? `_${stream.fileIdx}` : "";
    return `hash_${stream.infoHash.toLowerCase().trim()}${fileIdx}`;
  }
  if (stream.url) {
    const hashInUrl = stream.url.match(/\b([a-fA-F0-9]{40})\b/);
    if (hashInUrl) return `hash_${hashInUrl[1].toLowerCase()}`;
    return `url_${stream.url.split("?")[0].toLowerCase().trim()}`;
  }
  return `title_${(stream.title || stream.name || Math.random()).toLowerCase().trim()}`;
}

const REGION_NAMES_AR = {
  SA: "السعودية", AE: "الإمارات", KW: "الكويت", QA: "قطر", BH: "البحرين", OM: "عمان",
  EG: "مصر", JO: "الأردن", IQ: "العراق", MA: "المغرب", DZ: "الجزائر", TN: "تونس",
  LB: "لبنان", SY: "سوريا", PS: "فلسطين", YE: "اليمن", SD: "السودان", LY: "ليبيا",
  TR: "تركيا", US: "أمريكا", GB: "بريطانيا", DE: "ألمانيا", FR: "فرنسا"
};

function getUserRegionInfo(req) {
  const countryCode = (
    req.headers["x-vercel-ip-country"] ||
    req.headers["cf-ipcountry"] ||
    "SA"
  ).toUpperCase();
  const countryName = REGION_NAMES_AR[countryCode] || "منطقتك";
  return { countryCode, countryName };
}

const FLAG_LANG = {
  "🇸🇦": "عربي", "🇪🇬": "عربي", "🇦🇪": "عربي", "🇰🇼": "عربي", "🇶🇦": "عربي", "🇧🇭": "عربي",
  "🇴🇲": "عربي", "🇯🇴": "عربي", "🇱🇧": "عربي", "🇮🇶": "عربي", "🇲🇦": "عربي", "🇩🇿": "عربي",
  "🇹🇳": "عربي", "🇸🇾": "عربي", "🇾🇪": "عربي", "🇸🇩": "عربي", "🇱🇾": "عربي", "🇵🇸": "عربي",
  "🇬🇧": "إنجليزي", "🇺🇸": "إنجليزي", "🇫🇷": "فرنسي", "🇪🇸": "إسباني", "🇩🇪": "ألماني",
  "🇮🇹": "إيطالي", "🇷🇺": "روسي", "🇹🇷": "تركي", "🇮🇳": "هندي", "🇯🇵": "ياباني",
  "🇰🇷": "كوري", "🇧🇷": "برتغالي", "🇵🇹": "برتغالي", "🇨🇳": "صيني", "🇵🇱": "بولندي",
  "🇳🇱": "هولندي", "🇮🇷": "فارسي", "🇺🇦": "أوكراني"
};

function detectAudio(full) {
  const langs = [];
  const add = l => { if (!langs.includes(l)) langs.push(l); };

  const flags = full.match(/[\u{1F1E6}-\u{1F1FF}]{2}/gu) || [];
  for (const f of flags) if (FLAG_LANG[f]) add(FLAG_LANG[f]);

  let arabicDialect = "";
  if (/\b(arabic|ara|arb)\b|عربي|مدبلج/i.test(full)) {
    add("عربي");
    if (/دبلجة\s*مصرية|لهجة\s*مصرية|مصري|🇪🇬/i.test(full)) arabicDialect = "دبلجة مصرية";
    else if (/سوري|شامي|🇸🇾/i.test(full)) arabicDialect = "دبلجة شامية";
    else if (/فصحى/i.test(full)) arabicDialect = "فصحى رسمية";
    else arabicDialect = "دبلجة عربية";
  }

  if (/\b(english|eng)\b/i.test(full)) add("إنجليزي");
  if (/\b(japanese|jap|jpn)\b/i.test(full)) add("ياباني");
  if (/\b(korean|kor)\b/i.test(full)) add("كوري");
  if (/\b(turkish|tur)\b/i.test(full)) add("تركي");

  const multi = /\bmulti(?:[\s._-]?audio|[\s._-]?lang)?\b/i.test(full);
  const dual = /\bdual[\s._-]?audio\b/i.test(full);

  const hasArabic = langs.includes("عربي");
  langs.sort((a, b) => (a === "عربي" ? -1 : b === "عربي" ? 1 : 0));

  let label;
  if (hasArabic && arabicDialect) label = `🎙️ ${arabicDialect}`;
  else if (langs.length === 0) label = multi ? "متعدد اللغات" : dual ? "صوت ثنائي" : "صوت أصلي";
  else if (langs.length <= 3) label = langs.join(" + ");
  else label = "متعدد اللغات";

  return { label, hasArabic, key: hasArabic ? "ar" : langs.length ? langs[0] : "orig" };
}

const RES_GROUP = { "8K": "4K", "4K": "4K", "2K": "1080p", "1080p": "1080p", "720p": "720p", "480p": "480p" };

const TABS = {
  "4k":     { label: "4K",         desc: "روابط 4K فائقة الوضوح فقط",            test: i => i._group === "4K" },
  "1080p":  { label: "1080p",      desc: "روابط Full HD 1080p فقط",               test: i => i._group === "1080p" },
  "hdr":    { label: "HDR",        desc: "روابط HDR / Dolby Vision بأي دقة",       test: i => i._hdr },
  "720p":   { label: "720p",       desc: "روابط 720p خفيفة ومستقرة",             test: i => i._group === "720p" },
  "480p":   { label: "480p",       desc: "روابط 480p موفرة للبيانات",             test: i => i._group === "480p" },
  "arabic": { label: "صوت عربي",   desc: "روابط بدبلجة أو صوت عربي فقط",          test: i => i._ar },
  "cached": { label: "فوري سحابي", desc: "روابط جاهزة على TorBox تبدأ فوراً",    test: i => i._status === "instant" },
  "all":    { label: "الكل",       desc: "كل الروابط مرتبة: الأفضل جودة أولاً",    test: () => true }
};
const TAB_ORDER = ["4k", "1080p", "hdr", "720p", "arabic", "cached"];
const TAB_ALIAS = { "8k": "4k", "2k": "1080p" };

function stripPrivate(obj) {
  const out = {};
  for (const k of Object.keys(obj)) if (!k.startsWith("_")) out[k] = obj[k];
  return out;
}

function cleanAndFormatStream(stream) {
  try {
    const rawName = stream.name || "";
    const rawTitle = stream.title || stream.description || "";
    const full = `${rawName}\n${rawTitle}`;

    const isDownload = /\[(TB|RD|AD|DL|PM|OC)\s*download\]/i.test(rawName) || /\bdownload\b/i.test(rawName);
    let status = "instant";
    if (isDownload) status = "download";
    else if (!stream.url && stream.infoHash) status = "p2p";
    if (status === "p2p" && !ENABLE_P2P) return null;

    // 1. الدقة
    let resLabel = "1080p";
    let resScore = 2200;
    const resMatch = full.match(/\b(4320p|8k|2160p|4k|uhd|1440p|2k|1080p|fhd|720p|hd|480p|576p|sd)\b/i);
    if (resMatch) {
      const r = resMatch[1].toUpperCase();
      if (r === "4320P" || r === "8K") { resLabel = "8K"; resScore = 9000; }
      else if (r === "2160P" || r === "4K" || r === "UHD") { resLabel = "4K"; resScore = 5000; }
      else if (r === "1440P" || r === "2K") { resLabel = "2K"; resScore = 3200; }
      else if (r === "1080P" || r === "FHD") { resLabel = "1080p"; resScore = 2200; }
      else if (r === "720P" || r === "HD") { resLabel = "720p"; resScore = 1100; }
      else { resLabel = "480p"; resScore = 400; }
    }

    // 2. نوع الريب
    let ripBonus = 100;
    let source = "";
    if (/\b(Remux|BD-?Remux)\b/i.test(full)) { ripBonus = 950; source = "Remux"; }
    else if (/\b(BluRay|Blu-Ray|BDRip|BRRip|BDMV)\b/i.test(full)) { ripBonus = 700; source = "BluRay"; }
    else if (/\b(WEB-DL|WEBDL)\b/i.test(full)) { ripBonus = 500; source = "WEB-DL"; }
    else if (/\b(WEBRip|WEB-Rip|WEB)\b/i.test(full)) { ripBonus = 400; source = "WEB"; }

    // 3. تقنيات الصورة
    let visualBonus = 0;
    let hdr = "";
    let hdrShort = "";
    if (/\b(DV|Dolby[\s.-]?Vision|DoVi)\b/i.test(full)) { visualBonus += 500; hdr = "Dolby Vision"; hdrShort = "DV"; }
    if (/\bHDR10\+|HDR10Plus\b/i.test(full)) { visualBonus += 400; hdr = hdr || "HDR10+"; hdrShort = hdrShort || "HDR"; }
    else if (/\b(HDR10|HDR)\b/i.test(full)) { visualBonus += 300; hdr = hdr || "HDR"; hdrShort = hdrShort || "HDR"; }

    let videoCodec = "";
    if (/\bAV1\b/i.test(full)) videoCodec = "AV1";
    else if (/\b(HEVC|x265|H[\s.]?265)\b/i.test(full)) videoCodec = "HEVC";
    else if (/\b(x264|H[\s.]?264|AVC)\b/i.test(full)) videoCodec = "AVC";

    // 4. الصوت
    let audioBonus = 0;
    let audioCodec = "";
    if (/\bAtmos\b/i.test(full)) { audioBonus += 400; audioCodec = "Atmos"; }
    else if (/\bTrueHD\b/i.test(full)) { audioBonus += 320; audioCodec = "TrueHD"; }
    else if (/\bDTS[\s.-]?(HD|X)\b/i.test(full)) { audioBonus += 280; audioCodec = "DTS-HD"; }
    else if (/\b5\.1\b/i.test(full)) { audioBonus += 150; audioCodec = "5.1"; }

    const sizeMatch = rawTitle.match(/([0-9]+(?:\.[0-9]+)?\s*(?:TB|GB|MB|GiB|MiB))/i) ||
                      rawName.match(/([0-9]+(?:\.[0-9]+)?\s*(?:TB|GB|MB|GiB|MiB))/i);
    const sizeBytes = sizeMatch ? parseSizeBytes(sizeMatch[1]) : 0;

    const seedersMatch = rawTitle.match(/(?:👤|👥|\bS:?\s*|\bSeeders:?\s*)(\d+)/i);
    const seedersCount = seedersMatch ? parseInt(seedersMatch[1], 10) : 0;

    const audio = detectAudio(full);

    const sizeScore = Math.min((sizeBytes / (1024 * 1024 * 1024)) * 12, 450);
    const peerScore = Math.min(seedersCount * 0.6, 500);
    const arabicBonus = audio.hasArabic ? 3500 : 0;
    const statusScore = status === "instant" ? 50000 : status === "download" ? 0 : -10000;
    const finalScore = statusScore + arabicBonus + resScore + ripBonus + visualBonus + audioBonus + sizeScore + peerScore;

    const statusBadge = status === "instant" ? "⚡ توربو سحابي فوري" : status === "download" ? "⏳ يتطلب تنزيل سحابي" : "🌐 شبكة تورنت P2P";
    const tags = [statusBadge, source, hdr, videoCodec, audioCodec, sizeMatch ? sizeMatch[1].replace(/\s+/g, "") : ""].filter(Boolean).join(" • ");
    const desc = `${audio.label}\n${tags}`;

    const cleanStream = {
      name: hdrShort ? `${resLabel} ${hdrShort}` : resLabel,
      title: desc,
      description: desc,
      behaviorHints: {
        bingeGroup: `1take2-${resLabel}-${audio.key}`
      },
      _score: finalScore,
      _res: resLabel,
      _group: RES_GROUP[resLabel] || "480p",
      _hdr: Boolean(hdr),
      _ar: audio.hasArabic,
      _status: status,
      _hash: getCanonicalKey(stream)
    };

    if (stream.url) cleanStream.url = stream.url;
    if (stream.infoHash) {
      cleanStream.infoHash = stream.infoHash.toLowerCase();
      if (typeof stream.fileIdx === "number") cleanStream.fileIdx = stream.fileIdx;
      cleanStream.sources = extractTrackers(stream);
    }
    if (stream.subtitles) cleanStream.subtitles = stream.subtitles;

    const bh = stream.behaviorHints || {};
    if (bh.proxyHeaders) cleanStream.behaviorHints.proxyHeaders = bh.proxyHeaders;
    if (bh.notWebReady) cleanStream.behaviorHints.notWebReady = true;
    if (bh.filename) cleanStream.behaviorHints.filename = bh.filename;
    if (typeof bh.videoSize === "number") cleanStream.behaviorHints.videoSize = bh.videoSize;
    if (bh.videoHash) cleanStream.behaviorHints.videoHash = bh.videoHash;

    return cleanStream;
  } catch {
    return null;
  }
}

// =========================================================================
// 7. صفحة التثبيت التفاعلية العربية (Responsive Modern Arabic Web UI)
// =========================================================================

function renderConfigPage(host, customPath = "") {
  const prefix = customPath ? `${customPath}/` : "";
  const tile = (k, accent) =>
    `<a class="tile${accent ? " accent" : ""}" href="stremio://${host}/${prefix}${k}/manifest.json"><b>${TABS[k].label}</b><span>${TABS[k].desc}</span></a>`;

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${ADDON_NAME} - إضافة الترفيه الإمبراطورية المتكاملة</title>
<style>
  :root{--gold:#e5b53a;--gold-glow:rgba(229,181,58,.25);--bg:#07070a;--card:#101016;--card-border:rgba(255,255,255,.08);--text:#e8e8ee;--sub:#9696a5}
  *{box-sizing:border-box;margin:0;padding:0}
  body{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px 16px;background:radial-gradient(circle at top, #141420 0%, var(--bg) 100%);color:var(--text);font-family:"Segoe UI",system-ui,-apple-system,sans-serif;line-height:1.6}
  .card{width:100%;max-width:640px;background:var(--card);border:1px solid var(--card-border);border-radius:24px;padding:34px 30px;box-shadow:0 20px 40px rgba(0,0,0,.6)}
  .badge{display:inline-block;padding:5px 14px;background:var(--gold-glow);color:var(--gold);border-radius:20px;font-size:12.5px;font-weight:700;margin-bottom:12px}
  h1{font-size:32px;color:#fff;margin-bottom:6px;font-weight:800;letter-spacing:-.5px}
  h1 span{color:var(--gold)}
  p.lead{color:var(--sub);font-size:14.5px;margin-bottom:24px}
  .section-title{font-size:16px;color:var(--gold);margin:24px 0 10px;display:flex;align-items:center;gap:8px}
  .input-box{margin-bottom:16px}
  .input-box label{display:block;font-size:13px;color:var(--sub);margin-bottom:6px}
  .input-box input{width:100%;padding:13px 16px;background:#181822;border:1px solid var(--card-border);border-radius:12px;color:#fff;font-size:14px;outline:none;transition:border-color .2s}
  .input-box input:focus{border-color:var(--gold)}
  .btn{display:block;width:100%;padding:14px;border-radius:14px;text-align:center;font-weight:700;font-size:15px;text-decoration:none;cursor:pointer;border:0;transition:all .2s;font-family:inherit}
  .btn-gold{background:var(--gold);color:#08080b}
  .btn-gold:hover{transform:translateY(-2px);box-shadow:0 8px 20px var(--gold-glow)}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-top:12px}
  .tile{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px 10px;border:1px solid var(--card-border);border-radius:14px;text-decoration:none;color:#fff;background:#15151e;text-align:center;transition:all .2s}
  .tile b{font-size:18px;margin-bottom:4px}.tile span{font-size:11px;color:var(--sub)}
  .tile.accent{border-color:rgba(229,181,58,.4)}.tile.accent b{color:var(--gold)}
  .tile:hover{transform:translateY(-2px);background:#1d1d2b;border-color:var(--gold)}
  .info-box{margin-top:20px;padding:14px 16px;border-radius:12px;background:#17151e;border:1px solid rgba(229,181,58,.2);font-size:13px;color:#e2d9c4}
  .footer-btn{margin-top:14px;background:#181824;color:#bbb;border:1px solid var(--card-border)}
  .footer-btn:hover{background:#222232;color:#fff}
</style>
</head>
<body>
<div class="card">
  <div class="badge">الإصدار 19.0.0 الإمبراطوري • تعريب كامل للقصص والحلقات</div>
  <h1>إضافة <span>${ADDON_NAME}</span></h1>
  <p class="lead">الكتالوجات المعرّبة، قصص الأفلام والمسلسلات والحلقات بالعربية الرسمية، روابط TorBox السحابية الفورية، ودعم كامل للأنمي والدراما التركية والكورية.</p>

  <div class="input-box">
    <label for="tbToken">مفتاح TorBox أو Real-Debrid الخاص بك (اختياري):</label>
    <input type="text" id="tbToken" placeholder="اتركه فارغاً لاستخدام السيرفر السحابي الافتراضي الفوري" oninput="updateLinks()">
  </div>

  <div class="section-title">1. التثبيت الشامل الكامل (موصى به)</div>
  <a class="btn btn-gold" id="mainInstall" href="stremio://${host}/${prefix}manifest.json">تثبيت ${ADDON_NAME} في Stremio</a>

  <div class="section-title">2. تبويبات ومربعات الفلترة المخصصة</div>
  <div class="grid">
    ${tile("4k", true)}${tile("1080p", true)}${tile("hdr", true)}
    ${tile("720p")}${tile("arabic", true)}${tile("cached")}
  </div>
  <button class="btn footer-btn" style="margin-top:12px" onclick="installTabs(this)">تثبيت كل المربعات بالتتابع في Stremio</button>

  <div class="info-box">
    🌟 <b>المزايا المحدثة:</b> تعريب فوري لقصص الأفلام والمسلسلات مع تفاصيل الحلقات بالعربية، وربط تلقائي لسيرفرات البث لجميع أعمال TMDB و IMDb.
  </div>

  <button class="btn footer-btn" onclick="copyManifest()">نسخ رابط المانفيست المباشر</button>
</div>
<script>
var baseHost = "${host}";
var tabs = ${JSON.stringify(TAB_ORDER)};

function getCleanToken() {
  return document.getElementById("tbToken").value.trim().replace(/[^a-zA-Z0-9_-]/g, "");
}

function updateLinks() {
  var t = getCleanToken();
  var p = t ? "torbox=" + t + "/" : "";
  document.getElementById("mainInstall").href = "stremio://" + baseHost + "/" + p + "manifest.json";
  document.querySelectorAll(".tile").forEach(function(el) {
    var rawText = el.querySelector("b").innerText;
    var tabKey = "all";
    if (rawText === "4K") tabKey = "4k";
    else if (rawText === "1080p") tabKey = "1080p";
    else if (rawText === "HDR") tabKey = "hdr";
    else if (rawText === "720p") tabKey = "720p";
    else if (rawText.indexOf("عربي") >= 0) tabKey = "arabic";
    else if (rawText.indexOf("فوري") >= 0) tabKey = "cached";
    el.href = "stremio://" + baseHost + "/" + p + tabKey + "/manifest.json";
  });
}

function copyManifest() {
  var t = getCleanToken();
  var p = t ? "torbox=" + t + "/" : "";
  navigator.clipboard.writeText("https://" + baseHost + "/" + p + "manifest.json");
  alert("تم نسخ رابط الإضافة بنجاح! الصقه في خانة البحث في تطبيق Stremio.");
}

function installTabs(btn) {
  var t = getCleanToken();
  var p = t ? "torbox=" + t + "/" : "";
  var idx = 0;
  btn.disabled = true;
  function next() {
    if (idx >= tabs.length) { btn.innerText = "تم إرسال كافة التبويبات"; btn.disabled = false; return; }
    btn.innerText = "تثبيت " + (idx + 1) + "/" + tabs.length + " (" + tabs[idx] + ") - أكد في Stremio...";
    location.href = "stremio://" + baseHost + "/" + p + tabs[idx++] + "/manifest.json";
    setTimeout(next, 3200);
  }
  next();
}
</script>
</body>
</html>`;
}

// =========================================================================
// 8. بناء صفحة التفاصيل (Meta Engine) الشاملة المعربة
// التعريب الكامل لقصص الأفلام والمسلسلات والحلقات من الاستوديو الرسمي
// =========================================================================

const epKey = v => `${v.season}:${v.episode ?? v.number}`;

async function buildArabicMeta(type, rawId) {
  if (!rawId) return null;
  const id = String(rawId).trim();
  let base = null;

  const isSeriesEpisode = id.includes(":") && !id.startsWith("kitsu:") && !id.startsWith("tmdb:");
  const lookupId = isSeriesEpisode ? id.split(":")[0] : id;

  // 1. جلب البيانات الأساسية من Cinemeta أو Nuvio أو Kitsu
  if (lookupId.startsWith("kitsu:")) {
    const k = await safeFetchJson(`${UPSTREAM_ADDONS.animeKitsu}/meta/${type === "anime" ? "series" : type}/${lookupId}.json`, {}, 3200);
    base = k?.meta || null;
  } else if (lookupId.startsWith("tmdb:")) {
    const nuvioMetaRes = await safeFetchJson(`${UPSTREAM_ADDONS.nuvio}/meta/${type}/${lookupId}.json`, {}, 3500);
    base = nuvioMetaRes?.meta || null;
    if (base?.id?.startsWith("tt")) {
      idMapCache.set(`idmap_${lookupId}`, base.id);
      saveToCache(`idmap_${lookupId}`, base.id, CACHE_TTL_TRANS);
    }
  } else {
    const cineP = safeFetchJson(`${UPSTREAM_ADDONS.cinemeta}/meta/${type}/${lookupId}.json`, {}, 3500);
    const nuvioP = safeFetchJson(`${UPSTREAM_ADDONS.nuvio}/meta/${type}/${lookupId}.json`, {}, 3500);
    const [cineRes, nuvioRes] = await Promise.all([cineP, nuvioP]);
    base = cineRes?.meta || nuvioRes?.meta || null;
  }

  if (!base) return null;

  // 2. جلب التعريب الرسمي الفوري من TMDB API لكافة العناصر والحلقات
  const tmdbAr = await fetchTmdbArabic(type, lookupId);

  const meta = {
    ...base,
    id: id,
    name: stripAllEmojis(tmdbAr?.title || base.name || "")
  };

  if (base.imdb_id) meta.imdb_id = base.imdb_id;
  else if (base.id && base.id.startsWith("tt")) meta.imdb_id = base.id;

  // التصنيفات
  if (Array.isArray(meta.genres)) meta.genres = localizeGenres(meta.genres);
  if (Array.isArray(meta.genre)) meta.genre = localizeGenres(meta.genre);
  if (Array.isArray(meta.links)) {
    meta.links = meta.links.map(l => (l && l.category === "Genres") ? { ...l, name: GENRE_AR_MAP[l.name] || l.name } : l);
  }

  // القصة العامة للفيلم أو المسلسل
  let plot = tmdbAr?.overview || pickPlot(base);
  if (plot && !isTextArabic(plot)) {
    const cachedAr = cachedArabic(plot);
    if (cachedAr) {
      plot = cachedAr;
    } else {
      const translated = await translateToArabic(plot, Date.now() + 1800);
      if (translated && isTextArabic(translated)) plot = translated;
    }
  }
  if (plot) applyPlot(meta, plot);

  // 3. التعريب الفوري لكافة الحلقات (اسم الحلقة + قصة الحلقة)
  if (Array.isArray(meta.videos) && meta.videos.length > 0) {
    const episodesToTranslate = [];

    meta.videos = meta.videos.map(v => {
      const out = { ...v };
      const s = v.season;
      const e = v.episode ?? v.number;
      const tmdbEp = tmdbAr?.episodesMap?.get(`${s}:${e}`);

      // تعريب اسم الحلقة
      if (tmdbEp?.name && hasArabic(tmdbEp.name)) {
        out.name = tmdbEp.name;
        out.title = tmdbEp.name;
      } else {
        const epNum = e || 1;
        const rawTitle = out.name || out.title || "";
        if (!hasArabic(rawTitle)) {
          out.name = `الحلقة ${epNum}${rawTitle && !rawTitle.toLowerCase().startsWith("episode") && !rawTitle.toLowerCase().startsWith("pilot") ? " - " + rawTitle : ""}`;
          out.title = out.name;
        }
      }

      // تعريب قصة الحلقة
      if (tmdbEp?.overview && isTextArabic(tmdbEp.overview)) {
        out.overview = tmdbEp.overview;
        out.description = tmdbEp.overview;
      } else {
        const rawOv = out.overview || out.description;
        if (rawOv && !isTextArabic(rawOv)) {
          const cAr = cachedArabic(rawOv);
          if (cAr) {
            out.overview = cAr;
            out.description = cAr;
          } else {
            episodesToTranslate.push({ video: out, text: rawOv });
          }
        }
      }
      return out;
    });

    // ترجمة الحلقات المتبقية (أول 20 حلقة الأكثر طلباً فوراً)
    if (episodesToTranslate.length > 0) {
      const batch = episodesToTranslate.slice(0, 24);
      const translated = await translateMany(batch.map(b => b.text), { limit: 8, budgetMs: 2500 });
      translated.forEach((arText, idx) => {
        if (arText && isTextArabic(arText)) {
          batch[idx].video.overview = arText;
          batch[idx].video.description = arText;
        }
      });
    }
  }

  return { meta, complete: true };
}

const metaBuilds = new Map();
function getMetaPayload(type, id) {
  const key = `meta_v19_${type}_${id}`;
  const hit = getFromCache(key, true, CACHE_TTL_META);
  if (hit) {
    return Promise.resolve({ payload: { meta: hit.meta }, partial: false });
  }
  if (metaBuilds.has(key)) return metaBuilds.get(key);

  const job = (async () => {
    if (KV_ON) {
      const kv = await kvGetJson(`meta_${type}_${id}`);
      if (kv?.meta) {
        saveToCache(key, kv, CACHE_TTL_META);
        return { payload: { meta: kv.meta }, partial: false };
      }
    }
    const built = await buildArabicMeta(type, id);
    if (!built || !built.meta) return { payload: { meta: null }, partial: true };

    const payload = { meta: built.meta };
    saveToCache(key, payload, CACHE_TTL_META);
    if (KV_ON) {
      withDeadline(kvSetJson(`meta_${type}_${id}`, payload, 60 * 60 * 12), 400).catch(() => {});
    }
    return { payload, partial: false };
  })().finally(() => metaBuilds.delete(key));

  metaBuilds.set(key, job);
  return job;
}

function warmMeta(type, ids) {
  let n = 0;
  for (const id of ids) {
    if (n >= 4) break;
    if (!id || typeof id !== "string") continue;
    const key = `meta_v19_${type}_${id}`;
    if (getFromCache(key, true, CACHE_TTL_META) || metaBuilds.has(key)) continue;
    n++;
    getMetaPayload(type, id).catch(() => {});
  }
}

// =========================================================================
// 9. بناء قائمة البث المتطورة (Stream Engine) المتوازية
// =========================================================================

const streamBuilds = new Map();
const BAD_RELEASE = /hdcam|camrip|\bcam\b|telesync|\bts\b|tsrip|hdts|telecine|\bscr\b/i;
const PRIMARY_GRACE_MS = 1000;

function streamSources(type, id, customTorboxUrl = null) {
  const torrentioBase = customTorboxUrl || UPSTREAM_URL;
  const path = `/stream/${type}/${id}.json`;
  const src = [
    { primary: true, run: () => withDeadline(safeFetchJson(`${torrentioBase}${path}`, {}, 7000), 7000) },
    { run: () => withDeadline(safeFetchJson(`${UPSTREAM_ADDONS.webstreamr}${path}`, {}, 4500), 4500) }
  ];
  if (type === "movie") {
    src.push({ run: () => withDeadline(safeFetchJson(`${UPSTREAM_ADDONS.publicDomain}${path}`, {}, 2500), 2500) });
  }
  return src;
}

function collectSources(sources) {
  return new Promise(resolve => {
    const results = new Array(sources.length).fill(null);
    let pending = sources.length;
    let grace = null;
    let done = false;
    const finish = () => { if (done) return; done = true; clearTimeout(grace); resolve(results.slice()); };
    sources.forEach((s, i) => {
      Promise.resolve()
        .then(() => s.run())
        .catch(() => null)
        .then(data => {
          results[i] = data;
          if (s.primary && Array.isArray(data?.streams) && data.streams.length && !grace) {
            grace = setTimeout(finish, PRIMARY_GRACE_MS);
          }
        })
        .finally(() => { if (--pending === 0) finish(); });
    });
  });
}

async function buildStreams(type, id, cacheKey, customTorboxUrl = null) {
  let targetId = id;

  if (id.startsWith("tmdb:")) {
    const parts = id.split(":");
    const pureTmdbId = parts[1];
    const imdb = await resolveTmdbToImdb(pureTmdbId, type);
    if (imdb) {
      targetId = parts.length > 2 ? `${imdb}:${parts[2]}:${parts[3] || 1}` : imdb;
    }
  }

  const results = await collectSources(streamSources(type, targetId, customTorboxUrl));

  const unique = new Map();
  for (const dataObj of results) {
    if (!dataObj || !Array.isArray(dataObj.streams)) continue;
    for (const s of dataObj.streams) {
      if (!s || (!s.url && !s.infoHash)) continue;
      if (BAD_RELEASE.test(`${s.name || ""} ${s.title || ""} ${s.description || ""}`)) continue;
      const item = cleanAndFormatStream(s);
      if (!item) continue;
      const prev = unique.get(item._hash);
      if (!prev || item._score > prev._score) unique.set(item._hash, item);
    }
  }

  const list = Array.from(unique.values()).sort((a, b) => b._score - a._score);
  if (list.length > 0) {
    saveToCache(cacheKey, list, CACHE_TTL_STREAM);
    return list;
  }
  return getFromCache(cacheKey, true, CACHE_TTL_STREAM * 2) || [];
}

function startBuild(type, id, cacheKey, customTorboxUrl = null) {
  const job = buildStreams(type, id, cacheKey, customTorboxUrl)
    .catch(() => getFromCache(cacheKey, true, CACHE_TTL_STREAM * 2) || [])
    .finally(() => streamBuilds.delete(cacheKey));
  streamBuilds.set(cacheKey, job);
  return job;
}

function getStreamList(type, id, customTorboxUrl = null) {
  const prefix = customTorboxUrl ? `custom_${hashStr(customTorboxUrl)}_` : "";
  const cacheKey = `strlist_v19_${prefix}${type}_${id}`;
  const fresh = getFromCache(cacheKey, false, CACHE_TTL_STREAM);
  if (fresh) return Promise.resolve(fresh);
  const job = streamBuilds.get(cacheKey) || startBuild(type, id, cacheKey, customTorboxUrl);
  const stale = getFromCache(cacheKey, true, CACHE_TTL_STREAM * 2);
  return stale ? Promise.resolve(stale) : job;
}

// =========================================================================
// 10. موجه الخادم الرئيسي (Master Route Handler)
// =========================================================================

export default async function handler(req, res) {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=900, stale-while-revalidate=3600");

    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }

    const host = req.headers["x-forwarded-host"] || req.headers["host"] || "localhost";
    const rawUrl = req.url || "/";
    let pathPart = rawUrl.split("?")[0] || "/";
    const queryPart = rawUrl.split("?")[1] || "";
    let path;
    try {
      path = decodeURIComponent(pathPart).replace(/\/+$/, "") || "/";
    } catch {
      path = pathPart.replace(/\/+$/, "") || "/";
    }

    let customTorboxUrl = null;
    let customPathSegment = "";
    const torboxMatch = path.match(/\/(torbox=[a-zA-Z0-9_-]+|realdebrid=[a-zA-Z0-9_-]+|debrid=[a-zA-Z0-9_-]+)/i);
    if (torboxMatch) {
      customPathSegment = torboxMatch[1];
      const token = customPathSegment.split("=")[1];
      if (token) {
        customTorboxUrl = `https://torrentio.strem.fun/qualityfilter=scr,cam|torbox=${token}`;
      }
      path = path.replace(torboxMatch[0], "") || "/";
    }

    let lite = false;
    const liteMatch = path.match(/^\/lite(\/.*)?$/i);
    if (liteMatch) { lite = true; path = liteMatch[1] || "/"; }

    let tab = null;
    const tabMatch = path.match(/^\/(8k|4k|2k|1080p|720p|480p|hdr|arabic|cached|all)(\/.*)?$/i);
    if (tabMatch) {
      const raw = tabMatch[1].toLowerCase();
      tab = TAB_ALIAS[raw] || raw;
      path = tabMatch[2] || "/";
    }

    // -----------------------------------------------------------------
    // أ. ملف التعريف (Manifest)
    // -----------------------------------------------------------------
    if (path === "/manifest.json" || path === "/api/index" || path === "/api" || path === "/manifest") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      const { countryName } = getUserRegionInfo(req);

      if (tab) {
        const def = TABS[tab];
        return res.status(200).json({
          id: `app.onetake2.tab.${tab}`,
          version: VERSION,
          name: def.label,
          description: `${ADDON_NAME}: ${def.desc}`,
          resources: ["stream"],
          types: ["movie", "series", "anime"],
          idPrefixes: ["tt", "kitsu:", "tmdb:", "tmdb"],
          catalogs: [],
          behaviorHints: { configurable: false, configurationRequired: false }
        });
      }

      return res.status(200).json({
        id: lite ? "app.onetake2.lite" : "app.onetake2.main",
        version: VERSION,
        name: ADDON_NAME,
        description: "1take2 للأفلام والمسلسلات والأنمي - تعريب كامل فوري للقصص والحلقات والتصنيفات، دعم TMDB و IMDb، وسيرفرات فائقة السرعة مع الترجمة العربية",
        resources: lite ? ["catalog", "meta", "subtitles"] : ["catalog", "meta", "subtitles", "stream"],
        types: ["movie", "series", "anime"],
        idPrefixes: ["tt", "kitsu:", "tmdb:", "tmdb"],
        catalogs: [
          { type: "movie", id: "top10_region_movies", name: `Movies - أفضل 10 في ${countryName}` },
          { type: "series", id: "top10_region_series", name: `Series - أفضل 10 في ${countryName}` },
          { type: "movie", id: "trending_daily_movies", name: "Movies - ترند اليوم", extra: [{ name: "skip", isRequired: false }] },
          { type: "series", id: "trending_daily_series", name: "Series - ترند اليوم", extra: [{ name: "skip", isRequired: false }] },
          { type: "movie", id: "arabic_movies_spotlight", name: "أفلام سينمائية عربية", extra: [{ name: "skip", isRequired: false }] },
          { type: "series", id: "arabic_series_spotlight", name: "مسلسلات عربية شهيرة", extra: [{ name: "skip", isRequired: false }] },
          { type: "series", id: "turkish_dramas_spotlight", name: "مسلسلات الدراما التركية", extra: [{ name: "skip", isRequired: false }] },
          { type: "series", id: "kdrama_spotlight", name: "مسلسلات الدراما الكورية (K-Drama)", extra: [{ name: "skip", isRequired: false }] },
          { type: "series", id: "anime_trending", name: "أنمي - رائج ومميز", extra: [{ name: "skip", isRequired: false }] },
          {
            type: "movie", id: "onetake2_movies_main", name: "Movies - كل الأفلام",
            extra: [
              { name: "search", isRequired: false },
              { name: "genre", isRequired: false, options: NV_MOVIE_GENRES },
              { name: "skip", isRequired: false }
            ]
          },
          {
            type: "series", id: "onetake2_series_main", name: "Series - كل المسلسلات",
            extra: [
              { name: "search", isRequired: false },
              { name: "genre", isRequired: false, options: NV_SERIES_GENRES },
              { name: "skip", isRequired: false }
            ]
          },
          ...nuvioCatalogs()
        ],
        behaviorHints: { configurable: true, configurationRequired: false }
      });
    }

    // -----------------------------------------------------------------
    // ب. صفحة الفحص الصحي للمنظومة (Health Dashboard)
    // -----------------------------------------------------------------
    if (path === "/health") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      const providers = {};
      for (const [h, st] of healthMetrics) {
        providers[h] = { fails: st.fails, healthy: !(st.fails >= 5 && Date.now() - st.lastFail < 25000) };
      }
      return res.status(200).json({
        status: "نشط ويعمل بكفاءة فائقة",
        version: VERSION,
        persistentCache: KV_ON,
        p2p: ENABLE_P2P,
        cacheEntries: memoryCache.size,
        idMapEntries: idMapCache.size,
        providers
      });
    }

    // -----------------------------------------------------------------
    // ج. صفحة التثبيت (Config Page)
    // -----------------------------------------------------------------
    if (path === "" || path === "/") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(renderConfigPage(host, customPathSegment));
    }

    // -----------------------------------------------------------------
    // د. الكتالوجات (Catalogs Engine)
    // -----------------------------------------------------------------
    if (path.includes("/catalog/")) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      const subPath = path.substring(path.indexOf("/catalog/"));
      const parts = subPath.split("/").filter(Boolean);
      const type = parts[1] || "movie";
      const catalogId = (parts[2] || "").replace(/\.json$/, "");

      const rawCatParts = pathPart.substring(Math.max(0, pathPart.indexOf("/catalog/"))).split("/").filter(Boolean);
      let extraPart = (rawCatParts[3] || parts[3] || "").replace(/\.json$/, "");
      if (queryPart && !extraPart) extraPart = queryPart;

      const { countryCode } = getUserRegionInfo(req);
      const daySeed = Math.floor(Date.now() / (1000 * 60 * 60 * 12));

      const cacheKey = `cat_v19_${type}_${catalogId}_${countryCode}_${daySeed}_${extraPart}`;
      const cachedCat = getFromCache(cacheKey, true, CACHE_TTL_CAT);
      if (cachedCat) return res.status(200).json(cachedCat);

      const extraSuffix = extraPart ? `/${extraPart}.json` : ".json";

      // 1. كتالوجات الأنمي
      if (catalogId === "anime_trending") {
        const kitsuData = await safeFetchJson(`${UPSTREAM_ADDONS.animeKitsu}/catalog/anime/kitsu-anime-trending.json`, {}, 3500);
        const metas = kitsuData?.metas || [];
        const { items } = await localizeCatalogList(metas.slice(0, 40), type);
        const payload = { metas: items };
        saveToCache(cacheKey, payload, CACHE_TTL_CAT);
        return res.status(200).json(payload);
      }

      // 2. كتالوجات الدراما التركية
      if (catalogId === "turkish_dramas_spotlight") {
        const trData = await safeFetchJson(`${TMDB_BASE}/discover/tv?with_original_language=tr&sort_by=popularity.desc&language=ar-SA&api_key=${TMDB_API_KEY}`, {}, 3500);
        const metas = (trData?.results || []).map(r => ({
          id: `tmdb:${r.id}`,
          type: "series",
          name: stripAllEmojis(r.name || r.original_name),
          poster: r.poster_path ? `https://image.tmdb.org/t/p/w500${r.poster_path}` : null,
          background: r.backdrop_path ? `https://image.tmdb.org/t/p/original${r.backdrop_path}` : null,
          description: r.overview || "دراما تركية مميزة",
          releaseInfo: r.first_air_date ? r.first_air_date.slice(0, 4) : ""
        }));
        const payload = { metas };
        saveToCache(cacheKey, payload, CACHE_TTL_CAT);
        return res.status(200).json(payload);
      }

      // 3. كتالوجات الدراما الكورية
      if (catalogId === "kdrama_spotlight") {
        const krData = await safeFetchJson(`${TMDB_BASE}/discover/tv?with_original_language=ko&sort_by=popularity.desc&language=ar-SA&api_key=${TMDB_API_KEY}`, {}, 3500);
        const metas = (krData?.results || []).map(r => ({
          id: `tmdb:${r.id}`,
          type: "series",
          name: stripAllEmojis(r.name || r.original_name),
          poster: r.poster_path ? `https://image.tmdb.org/t/p/w500${r.poster_path}` : null,
          background: r.backdrop_path ? `https://image.tmdb.org/t/p/original${r.backdrop_path}` : null,
          description: r.overview || "دراما كورية مشوقة ومميزة",
          releaseInfo: r.first_air_date ? r.first_air_date.slice(0, 4) : ""
        }));
        const payload = { metas };
        saveToCache(cacheKey, payload, CACHE_TTL_CAT);
        return res.status(200).json(payload);
      }

      // 4. كتالوجات الأفلام والمسلسلات العربية الخاصة
      if (catalogId === "arabic_movies_spotlight") {
        const nuvioAr = await safeFetchJson(`${UPSTREAM_ADDONS.nuvio}/catalog/movie/movies-by-language/genre=Arabic.json`, {}, 3800);
        const metas = nuvioAr?.metas || [];
        const { items } = await localizeCatalogList(metas, "movie");
        const payload = { metas: items };
        saveToCache(cacheKey, payload, CACHE_TTL_CAT);
        return res.status(200).json(payload);
      }

      if (catalogId === "arabic_series_spotlight") {
        const nuvioAr = await safeFetchJson(`${UPSTREAM_ADDONS.nuvio}/catalog/series/series-by-language/genre=Arabic.json`, {}, 3800);
        const metas = nuvioAr?.metas || [];
        const { items } = await localizeCatalogList(metas, "series");
        const payload = { metas: items };
        saveToCache(cacheKey, payload, CACHE_TTL_CAT);
        return res.status(200).json(payload);
      }

      // 5. بقية الكتالوجات (Nuvio + Cinemeta)
      let nuvioUrl = `${UPSTREAM_ADDONS.nuvio}/catalog/${type}/popular-${type === "series" ? "series" : "movies"}${extraSuffix}`;
      let cinemetaUrl = `${UPSTREAM_ADDONS.cinemeta}/catalog/${type}/top${extraSuffix}`;

      const isNuvio = catalogId.startsWith("nuvio-");
      const isTrending = catalogId === "trending_daily_movies" || catalogId === "trending_daily_series";
      const isTop10 = catalogId === "top10_region_movies" || catalogId === "top10_region_series";

      if (isNuvio) {
        nuvioUrl = `${UPSTREAM_ADDONS.nuvio}/catalog/${type}/${catalogId.slice(6)}${extraSuffix}`;
        cinemetaUrl = null;
      } else if (isTrending) {
        nuvioUrl = `${UPSTREAM_ADDONS.nuvio}/catalog/${type}/trending-${type === "series" ? "series" : "movies"}${extraSuffix}`;
      } else if (isTop10) {
        nuvioUrl = `${UPSTREAM_ADDONS.nuvio}/catalog/${type}/trending-${type === "series" ? "series" : "movies"}.json`;
        cinemetaUrl = `${UPSTREAM_ADDONS.cinemeta}/catalog/${type}/top.json`;
      }

      const nuvioP = safeFetchJson(nuvioUrl, {}, 3800);
      const cineP = cinemetaUrl ? safeFetchJson(cinemetaUrl, {}, 3500) : Promise.resolve(null);
      const [nuvioData, cineData] = await Promise.all([nuvioP, cineP]);

      const sourceList = (Array.isArray(nuvioData?.metas) && nuvioData.metas.length > 0)
        ? nuvioData.metas
        : (Array.isArray(cineData?.metas) ? cineData.metas : []);

      let cleanMetas = [];
      const seenIds = new Set();
      for (const m of sourceList) {
        if (!m || !m.id || seenIds.has(m.id)) continue;
        seenIds.add(m.id);
        const entry = {
          ...m,
          name: stripAllEmojis(m.name || ""),
          genres: localizeGenres(m.genres)
        };
        cleanMetas.push(entry);
      }

      if (isTop10) {
        cleanMetas = cleanMetas.slice(0, 10).map((item, idx) => ({ ...item, name: `TOP ${idx + 1} - ${item.name}` }));
      }

      const { items: localizedBatch } = await localizeCatalogList(cleanMetas.slice(0, 45), type);
      const finalMetas = [...localizedBatch, ...cleanMetas.slice(45)];

      if (finalMetas.length === 0) {
        const stale = getFromCache(cacheKey, true, CACHE_TTL_CAT * 3);
        if (stale) return res.status(200).json(stale);
      }

      warmMeta(type, finalMetas.map(m => m.id));
      const payload = { metas: finalMetas };
      saveToCache(cacheKey, payload, CACHE_TTL_CAT);
      return res.status(200).json(payload);
    }

    // -----------------------------------------------------------------
    // هـ. صفحة التفاصيل (Meta Engine) - تعريب القصص والحلقات بدقة 100%
    // -----------------------------------------------------------------
    if (path.includes("/meta/")) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      const parts = path.substring(path.indexOf("/meta/")).split("/").filter(Boolean);
      const type = parts[1] || "movie";
      const id = (parts[2] || "").replace(/\.json$/, "");

      const { payload, partial } = await getMetaPayload(type, id);
      if (partial) res.setHeader("Cache-Control", "public, max-age=30, s-maxage=120");
      return res.status(200).json(payload);
    }

    // -----------------------------------------------------------------
    // و. الترجمات العربية (Subtitles Engine)
    // -----------------------------------------------------------------
    if (path.includes("/subtitles/")) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      const parts = path.substring(path.indexOf("/subtitles/")).split("/").filter(Boolean);
      const type = parts[1] || "movie";
      let id = (parts[2] || "").replace(/\.json$/, "");

      if (id.startsWith("tmdb:")) {
        const p = id.split(":");
        const pureTmdb = p[1];
        const imdb = await resolveTmdbToImdb(pureTmdb, type);
        if (imdb) id = p.length > 2 ? `${imdb}:${p[2]}:${p[3] || 1}` : imdb;
      }

      const cacheKey = `subs_v19_${type}_${id}`;
      const cachedSubs = getFromCache(cacheKey, true, CACHE_TTL_META);
      if (cachedSubs) return res.status(200).json({ subtitles: cachedSubs });

      const rawSub = pathPart;
      const extraSub = (rawSub.substring(Math.max(0, rawSub.indexOf("/subtitles/"))).split("/").filter(Boolean)[3] || "").replace(/\.json$/, "");
      const targetSubUrl = `${UPSTREAM_ADDONS.opensubtitlesV3}/subtitles/${type}/${id}${extraSub ? "/" + extraSub : ""}.json`;

      const subRes = await withDeadline(safeFetchJson(targetSubUrl, {}, 3200), 3400);
      const isArabicLang = l => /^(ara|ar|arb|arabic|ar-[a-z]{2})$/i.test(String(l || "").trim());
      const seenUrls = new Set();
      const subtitles = [];

      if (Array.isArray(subRes?.subtitles)) {
        for (const s of subRes.subtitles) {
          if (!s?.url || !isArabicLang(s.lang) || seenUrls.has(s.url)) continue;
          seenUrls.add(s.url);
          subtitles.push({
            id: String(s.id || s.url),
            url: s.url,
            lang: "ara",
            SubEncoding: s.SubEncoding || "CP1256",
            subtitleFileName: s.subtitleFileName || s.movieReleaseName || "ترجمة عربية متوافقة"
          });
        }
      }

      if (subtitles.length) saveToCache(cacheKey, subtitles, CACHE_TTL_META);
      return res.status(200).json({ subtitles: subtitles.slice(0, 25) });
    }

    // -----------------------------------------------------------------
    // ز. البث المباشر (Stream Engine)
    // -----------------------------------------------------------------
    if (path.includes("/stream/")) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=120, s-maxage=300, stale-while-revalidate=900");
      const streamSubPath = path.substring(path.indexOf("/stream/"));
      const parts = streamSubPath.split("/").filter(Boolean);
      const type = parts[1] || "movie";
      const id = (parts[2] || "").replace(/\.json$/, "");

      const list = await getStreamList(type, id, customTorboxUrl);
      const def = tab ? TABS[tab] : null;
      const filtered = def ? list.filter(def.test) : list;

      const finalStreams = filtered.slice(0, 60).map(stripPrivate);
      if (finalStreams.length === 0) res.setHeader("Cache-Control", "public, max-age=15, s-maxage=30");
      return res.status(200).json({ streams: finalStreams });
    }

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(200).json({
      status: "نشط ويعمل بكفاءة إمبراطورية",
      name: `${ADDON_NAME} v${VERSION}`,
      description: "إضافة الترفيه المتكاملة للأفلام والمسلسلات والأنمي والدراما"
    });

  } catch (err) {
    return res.status(200).json({ streams: [], metas: [], subtitles: [] });
  }
}

// =========================================================================
// 11. تشغيل تلقائي كخادم مستقل عند التشغيل عبر Node.js (Standalone Server)
// =========================================================================

if (process.argv[1] && (
  process.argv[1].endsWith("[...path] (2).js") ||
  process.argv[1].endsWith("[...path].js") ||
  process.argv[1].endsWith("server.js") ||
  process.argv[1].endsWith("index.js")
)) {
  const http = await import("http");
  const PORT = process.env.PORT || 3000;
  const server = http.createServer((req, res) => handler(req, res));
  server.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 ${ADDON_NAME} v${VERSION} يعمل بنجاح!`);
    console.log(`🌐 واجهة التحكم والتثبيت: http://localhost:${PORT}`);
    console.log(`📡 رابط التثبيت المباشر في Stremio: stremio://localhost:${PORT}/manifest.json`);
    console.log(`======================================================\n`);
  });
}
