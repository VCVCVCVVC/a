// =========================================================================
// 1take2 v21.0.0 - Private TV Edition (النسخة الخاصة والمحسّنة للتلفاز)
// - خاص بالكامل: مفتاح وصول إجباري في الرابط (ACCESS_KEY) + لا أسرار داخل الكود
// - سلس وخفيف على التلفاز: ملف تعريف TV، صور مصغّرة، ضغط gzip، ETag، فلترة الروابط الثقيلة
// - مزايا جديدة: بحث عربي، كتالوجات مصرية/خليجية/الأحدث/الأعلى تقييماً، تقسيم/ترقيم الصفحات،
//   خيارات (حد الجودة، حد الحجم، استبعاد Remux/AV1)، دعم عدة مزودي ديبريد، حماية من الإساءة
// =========================================================================
//
// متغيرات البيئة (Environment Variables):
//   ACCESS_KEY      (اختياري، موصى به) مفتاح سري 12-64 حرفاً [A-Za-z0-9_-] → الرابط: https://HOST/<ACCESS_KEY>/
//                    بدونه تعمل الإضافة مفتوحة على https://HOST/
//   TMDB_API_KEY    (موصى به) مفتاحك الخاص من themoviedb.org (التعريب الرسمي + الكتالوجات)
//   TORBOX_TOKEN    (اختياري) توكن TorBox الافتراضي لك أنت (لا يُعرض في أي صفحة)
//   UPSTREAM_URL    (اختياري) رابط Torrentio كامل بدلاً من الافتراضي
//   MYMEMORY_EMAIL  (اختياري) بريدك لرفع حد ترجمة MyMemory
//   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (اختياري) كاش دائم
//   ENABLE_P2P=0 لتعطيل روابط P2P  |  ENABLE_HEALTH=1 لتفعيل /health  |  ALLOWED_ORIGIN لتقييد CORS
// =========================================================================

import { timingSafeEqual, randomBytes } from "node:crypto";
import zlib from "node:zlib";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { resolve as resolvePath } from "node:path";

const ADDON_NAME = "1take2";
const VERSION = "21.0.0";

// ---- الخصوصية والحماية ----
const ACCESS_KEY = (process.env.ACCESS_KEY || "").trim();
const KEY_ON = Boolean(ACCESS_KEY); // بدون ACCESS_KEY تعمل الإضافة بشكل مفتوح
const KEY_VALID = !KEY_ON || /^[A-Za-z0-9_-]{12,64}$/.test(ACCESS_KEY);
const ENABLE_HEALTH = process.env.ENABLE_HEALTH === "1";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*"; // Stremio Web يحتاج CORS؛ قيّده إن لم تستخدمه

// ---- مفاتيح الخدمات (من البيئة فقط، لا تُكتب داخل الكود أبداً) ----
const TMDB_API_KEY = (process.env.TMDB_API_KEY || "").trim();
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p";

const NUVIO_URL = (process.env.NUVIO_URL || "https://catalog.nuvio.tv").replace(/\/manifest\.json$/i, "").replace(/\/+$/, "");

const TORRENTIO = "https://torrentio.strem.fun";
const TORBOX_TOKEN = (process.env.TORBOX_TOKEN || "").replace(/[^a-zA-Z0-9_-]/g, "");
const DEFAULT_UPSTREAM = `${TORRENTIO}/qualityfilter=scr,cam${TORBOX_TOKEN ? `|torbox=${TORBOX_TOKEN}` : ""}`;
const UPSTREAM_URL = (process.env.UPSTREAM_URL || DEFAULT_UPSTREAM).replace(/\/manifest\.json$/i, "").replace(/\/+$/, "");

const ENABLE_P2P = process.env.ENABLE_P2P !== "0";

// ---- الكاش (TTLs) ----
const CACHE_TTL_STREAM = 30 * 60 * 1000;
const CACHE_TTL_META = 4 * 60 * 60 * 1000;
const CACHE_TTL_CAT = 60 * 60 * 1000;
const CACHE_TTL_TRANS = 30 * 24 * 60 * 60 * 1000;
const STALE_TTL = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 3800;

const KV_URL = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "").replace(/\/+$/, "");
const KV_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
const KV_ON = Boolean(KV_URL && KV_TOKEN);

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
// 0. ملفات التعريف والخيارات (TV / موبايل / توفير بيانات)
// =========================================================================

const DEFAULT_OPTS = {
  tv: false, lite: false,
  maxRank: 0,          // 0 = بلا حد | 2=720p | 3=1080p | 4=4K
  maxGB: 0,            // 0 = بلا حد
  noRemux: false, noAv1: false, noEmoji: false,
  maxStreams: 60,
  catLimit: 45,        // عدد عناصر الكتالوج التي تُعرَّب
  catTranslate: 18,    // أقصى عدد قصص تُترجم أثناء تحميل الكتالوج
  catMax: 100,         // أقصى عدد عناصر في الكتالوج
  warm: 4,             // تسخين الميتا في الخلفية
  plotMax: 0, epPlotMax: 0,
  subsMax: 25
};

const TV_DEFAULTS = {
  tv: true, noEmoji: true, noAv1: true, maxGB: 35, maxStreams: 25,
  catLimit: 30, catTranslate: 0, catMax: 40, warm: 0,
  plotMax: 380, epPlotMax: 200, subsMax: 10
};

function buildOptions(flags = {}, tokens = []) {
  const o = { ...DEFAULT_OPTS };
  if (flags.tv || tokens.includes("tv")) Object.assign(o, TV_DEFAULTS);
  if (flags.lite) o.lite = true;
  for (const tk of tokens) {
    let m;
    if (tk === "lite") o.lite = true;
    else if (tk === "noremux") o.noRemux = true;
    else if (tk === "noav1") o.noAv1 = true;
    else if (tk === "noemoji") o.noEmoji = true;
    else if ((m = tk.match(/^m(4k|1080|720)$/))) o.maxRank = { "4k": 4, "1080": 3, "720": 2 }[m[1]];
    else if ((m = tk.match(/^gb(\d{1,3})$/))) o.maxGB = Number(m[1]);
    else if ((m = tk.match(/^n(\d{1,2})$/))) o.maxStreams = Math.max(3, Math.min(60, Number(m[1])));
  }
  return o;
}

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
    if (memoryCache.size > 2500) {
      const oldestKeys = Array.from(memoryCache.keys()).slice(0, 800);
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
  if (!url || !isProviderHealthy(url)) return null;

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
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) 1take2/21.0.0",
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

// محرك Google Android الرسمي (client=at) فائق السرعة وبدون حظر
async function engineGoogleAndroid(text, ms) {
  try {
    const res = await fetchT(
      "https://translate.google.com/translate_a/single?client=at&dt=t&dj=1&hl=ar&ie=UTF-8&oe=UTF-8",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "User-Agent": UA },
        body: "sl=auto&tl=ar&q=" + encodeURIComponent(text.slice(0, 3500))
      },
      ms
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data?.sentences)) {
      const tr = data.sentences.map(s => s.trans || "").join("").trim();
      if (tr && isTextArabic(tr)) return tr;
    }
  } catch {
    // تجاهل
  }
  return null;
}

const MYMEMORY_EMAIL = (process.env.MYMEMORY_EMAIL || "").trim();

// محرك MyMemory فائق الدقة والسرعة مع تدوير الحسابات
async function engineMyMemory(text, ms) {
  try {
    const clean = text.slice(0, 480);
    const de = MYMEMORY_EMAIL ? `&de=${encodeURIComponent(MYMEMORY_EMAIL)}` : "";
    const res = await fetchT(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(clean)}&langpair=en|ar${de}`, {}, ms);
    if (!res.ok) return null;
    const data = await res.json();
    const t = data?.responseData?.translatedText;
    if (typeof t === "string" && isTextArabic(t)) return t.trim();
  } catch {
    // تجاهل
  }
  return null;
}

// محرك Google GTX
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

  const cacheKey = `tr_v21_${hashStr(clean)}`;
  const cached = getFromCache(cacheKey, true, CACHE_TTL_TRANS);
  if (cached && isTextArabic(cached)) return cached;

  if (KV_ON && deadline - Date.now() > 800) {
    const kv = await kvGetJson(`tr_v21_${hashStr(clean)}`);
    if (typeof kv === "string" && isTextArabic(kv)) {
      saveToCache(cacheKey, kv, CACHE_TTL_TRANS);
      return kv;
    }
  }

  for (const engine of [engineGoogleAndroid, engineMyMemory, engineGtx, engineClients5]) {
    const remaining = deadline - Date.now();
    if (remaining < 250) break;
    try {
      const out = await engine(clean, Math.min(3000, remaining));
      if (out && isTextArabic(out)) {
        saveToCache(cacheKey, out, CACHE_TTL_TRANS);
        kvSetJson(`tr_v21_${hashStr(clean)}`, out, 60 * 60 * 24 * 30);
        return out;
      }
    } catch {
      // تجربة المحرك التالي
    }
  }
  return clean;
}

async function translateMany(texts, { limit = 8, budgetMs = 6000 } = {}) {
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
  const c = getFromCache(`tr_v21_${hashStr(clean)}`, true, CACHE_TTL_TRANS);
  return c && isTextArabic(c) ? c : null;
}

// =========================================================================
// 4. التعريب عبر TMDB + أدوات تخفيف الحمل على التلفاز
// =========================================================================

function tmdbUrl(path, qs = "") {
  if (!TMDB_API_KEY) return null;
  return `${TMDB_BASE}${path}?${qs ? qs + "&" : ""}api_key=${TMDB_API_KEY}`;
}

function trimText(s, max) {
  if (!max || typeof s !== "string" || s.length <= max) return s;
  const cut = s.slice(0, max);
  const i = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("،"), cut.lastIndexOf(" "));
  return (i > max * 0.6 ? cut.slice(0, i) : cut).replace(/[\s.،,]+$/, "") + "…";
}

// تصغير صور TMDB (أكبر توفير للتلفاز: الخلفيات "original" قد تتجاوز عدة ميغابايت)
function shrinkImg(url, kind, o) {
  if (typeof url !== "string") return url;
  const m = url.match(/^(https:\/\/image\.tmdb\.org\/t\/p\/)(?:original|w\d+)(\/.+)$/);
  if (!m) return url;
  const size =
    kind === "bg" ? (o.tv ? "w780" : "w1280") :
    kind === "logo" ? "w300" :
    kind === "thumb" ? (o.tv ? "w185" : "w300") :
    (o.tv ? "w342" : "w500");
  return `${m[1]}${size}${m[2]}`;
}

function shapeCatalogMeta(m, o) {
  if (!m) return m;
  const out = { ...m };
  if (out.poster) out.poster = shrinkImg(out.poster, "poster", o);
  if (out.background) out.background = shrinkImg(out.background, "bg", o);
  if (out.logo) out.logo = shrinkImg(out.logo, "logo", o);
  if (o.plotMax) {
    const p = pickPlot(out);
    if (p) applyPlot(out, trimText(p, o.plotMax));
  }
  if (o.tv) { delete out.trailers; delete out.trailerStreams; delete out.links; }
  return out;
}

// نسخة مخففة من الميتا حسب الملف (لا تغيّر الكاش المشترك)
function shapeMeta(meta, o) {
  if (!meta) return meta;
  const m = { ...meta };
  if (m.poster) m.poster = shrinkImg(m.poster, "poster", o);
  if (m.background) m.background = shrinkImg(m.background, "bg", o);
  if (m.logo) m.logo = shrinkImg(m.logo, "logo", o);
  if (o.plotMax) {
    const p = pickPlot(m);
    if (p) applyPlot(m, trimText(p, o.plotMax));
  }
  if (Array.isArray(m.videos)) {
    m.videos = m.videos.map(v => {
      const x = { ...v };
      if (x.thumbnail) x.thumbnail = shrinkImg(x.thumbnail, "thumb", o);
      if (o.epPlotMax) {
        const t = trimText(x.overview || x.description, o.epPlotMax);
        if (t) { x.overview = t; x.description = t; }
      }
      return x;
    });
  }
  return m;
}

async function fetchTmdbArabic(type, rawId, seasons = []) {
  if (!rawId || !TMDB_API_KEY) return null;
  const id = String(rawId).trim();
  const seasonKey = seasons.length ? `${seasons[0]}-${seasons[seasons.length - 1]}-${seasons.length}` : "0";
  const cacheKey = `tmdb_ar_v21_${type}_${id}_${seasonKey}`;
  const hit = getFromCache(cacheKey, true, CACHE_TTL_TRANS);
  if (hit) return hit;

  try {
    let tmdbType = (type === "series" || type === "tv" || type === "anime") ? "tv" : "movie";
    let tmdbId = null;
    let mainData = null;

    if (id.startsWith("tmdb:")) {
      tmdbId = id.split(":")[1];
      if (!/^\d+$/.test(tmdbId || "")) return null;
      mainData = await safeFetchJson(tmdbUrl(`/${tmdbType}/${tmdbId}`, "language=ar-SA"), {}, 3200);
    } else if (/^tt\d+$/.test(id)) {
      const findRes = await safeFetchJson(tmdbUrl(`/find/${id}`, "external_source=imdb_id&language=ar-SA"), {}, 3200);
      if (findRes?.movie_results?.length) {
        mainData = findRes.movie_results[0]; tmdbType = "movie"; tmdbId = mainData.id;
      } else if (findRes?.tv_results?.length) {
        mainData = findRes.tv_results[0]; tmdbType = "tv"; tmdbId = mainData.id;
      }
    }
    if (!mainData) return null;

    const result = {
      tmdbId,
      title: mainData.title || mainData.name || null,
      overview: mainData.overview || null,
      episodesMap: new Map()
    };

    // نجلب فقط المواسم الموجودة فعلاً في الميتا (بدون حد 8 مواسم) على دفعات ≤ 18 (حد TMDB = 20)
    if (tmdbType === "tv" && tmdbId && seasons.length) {
      const chunks = [];
      for (let i = 0; i < seasons.length; i += 18) chunks.push(seasons.slice(i, i + 18));
      const parts = await Promise.all(chunks.map(ch =>
        safeFetchJson(tmdbUrl(`/tv/${tmdbId}`, `language=ar-SA&append_to_response=${ch.map(s => `season/${s}`).join(",")}`), {}, 4000)
      ));
      for (const tvFull of parts) {
        if (!tvFull) continue;
        if (!result.overview && tvFull.overview) result.overview = tvFull.overview;
        for (const key of Object.keys(tvFull)) {
          if (!key.startsWith("season/")) continue;
          const s = Number(key.slice(7));
          for (const ep of (tvFull[key]?.episodes || [])) {
            result.episodesMap.set(`${s}:${ep.episode_number}`, { name: ep.name, overview: ep.overview });
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

// تعريب عناصر الكتالوج (الترجمة محدودة في وضع التلفاز لتسريع التحميل)
async function localizeCatalogList(items, type = "movie", o = DEFAULT_OPTS) {
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
    if (ar) applyPlot(item, ar);
    else if (i < o.catTranslate) toTranslate.push({ idx: i, text: plot });
  });

  if (toTranslate.length > 0) {
    const translated = await translateMany(toTranslate.map(t => t.text), { limit: 8, budgetMs: 3000 });
    translated.forEach((arText, k) => {
      if (arText && isTextArabic(arText)) applyPlot(prepared[toTranslate[k].idx], arText);
    });
  }

  return { items: prepared.map(m => shapeCatalogMeta(m, o)), complete: true };
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
    const ext = await safeFetchJson(tmdbUrl(`/${extType}/${pureNum}/external_ids`), {}, 2800);
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
      _hash: getCanonicalKey(stream),
      _rank: resLabel === "8K" ? 5 : resLabel === "4K" ? 4 : resLabel === "2K" ? 3.5 : resLabel === "1080p" ? 3 : resLabel === "720p" ? 2 : 1,
      _bytes: sizeBytes,
      _remux: source === "Remux",
      _av1: videoCodec === "AV1",
      _audioLabel: audio.label,
      _tagParts: [source, hdr, videoCodec, audioCodec, sizeMatch ? sizeMatch[1].replace(/\s+/g, "") : ""].filter(Boolean)
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
// 7. صفحة التثبيت الخاصة + تخصيص المانفيست
// - CSP صارم بـ nonce، لا موارد خارجية، لا أزرار inline، لا أسرار في المصدر
// - مناسبة للريموت: أزرار كبيرة وتركيز واضح
// =========================================================================

function jsStr(v) {
  return JSON.stringify(String(v)).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}
function jsJson(v) {
  return JSON.stringify(v).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

function renderConfigPage(host, key, nonce, countryName = "منطقتك") {
  const tmdbOn = Boolean(TMDB_API_KEY);
  const reg = catalogRegistry(countryName)
    .filter(c => !c.tmdb || tmdbOn)
    .map(c => ({ k: catKey(c), ty: c.type, n: c.name, tv: c.tv ? 1 : 0, m: c.m ? 1 : 0 }));

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive">
<meta name="referrer" content="no-referrer">
<title>${ADDON_NAME}</title>
<style nonce="${nonce}">
:root{--gold:#e5b53a;--bg:#07070a;--card:#101016;--line:rgba(255,255,255,.1);--text:#ececf2;--sub:#a0a0b0;color-scheme:dark}
*{box-sizing:border-box;margin:0;padding:0}
html{font-size:17px}
@media(min-width:1100px){html{font-size:20px}}
body{min-height:100vh;display:flex;justify-content:center;padding:24px 14px;background:radial-gradient(circle at top,#15151f,var(--bg));color:var(--text);font-family:system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif;line-height:1.6;-webkit-user-select:none;user-select:none}
input,select{-webkit-user-select:text;user-select:text}
.card{width:100%;max-width:760px;height:fit-content;background:var(--card);border:1px solid var(--line);border-radius:22px;padding:28px 24px}
.badge{display:inline-block;padding:4px 12px;background:rgba(229,181,58,.15);color:var(--gold);border-radius:20px;font-size:.72rem;font-weight:700}
h1{font-size:1.9rem;margin:8px 0 2px}h1 span{color:var(--gold)}
.lead{color:var(--sub);font-size:.85rem;margin-bottom:6px}
h2{font-size:1rem;color:var(--gold);margin:26px 0 10px}
.hint{color:var(--sub);font-size:.75rem;margin:4px 0 8px}
.row{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.opt,.tile,.btn{display:block;width:100%;padding:14px 12px;border-radius:14px;border:2px solid var(--line);background:#16161f;color:#fff;text-align:center;text-decoration:none;font:inherit;font-weight:700;cursor:pointer}
.opt small,.tile small{display:block;font-weight:400;font-size:.7rem;color:var(--sub);margin-top:2px}
.opt[aria-pressed=true]{border-color:var(--gold);background:#221d0e;color:var(--gold)}
.opt[disabled]{opacity:.4;cursor:not-allowed}
.btn-gold{background:var(--gold);color:#09090c;border-color:var(--gold);margin-top:14px}
.btn-dark{margin-top:10px;background:#181824;color:#ccc}
.tile{color:var(--gold)}
label.l{display:block;font-size:.78rem;color:var(--sub);margin:12px 0 6px}
input[type=password],input[type=text],input[type=number],select,.ti{width:100%;padding:11px 12px;border-radius:12px;border:2px solid var(--line);background:#181822;color:#fff;font:inherit;outline:none}
.chk{display:flex;gap:10px;align-items:center;padding:8px 2px;font-size:.88rem}
.chk input{width:22px;height:22px;accent-color:var(--gold)}
.crow{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin:8px 0;align-items:center;padding:10px;border:1px solid var(--line);border-radius:14px;background:#0d0d13}
.cat{grid-template-columns:auto auto minmax(120px,1fr) auto auto;padding:6px 10px}
.cat input[type=checkbox]{width:22px;height:22px;accent-color:var(--gold)}
.tag{font-size:.68rem;color:var(--gold);white-space:nowrap}
.mini{padding:8px 13px;border-radius:10px;border:2px solid var(--line);background:#16161f;color:#fff;font:inherit;font-weight:700;cursor:pointer}
.addb{margin-top:6px;padding:10px 14px;border-radius:12px;border:2px dashed rgba(229,181,58,.5);background:transparent;color:var(--gold);font:inherit;font-weight:700;cursor:pointer}
.tools{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}
details{margin-top:10px}
summary{cursor:pointer;padding:12px 14px;border-radius:12px;border:2px solid var(--line);background:#16161f;font-weight:700}
.cats{max-height:520px;overflow-y:auto;margin-top:8px}
:focus-visible{outline:4px solid var(--gold);outline-offset:2px}
.note{margin-top:20px;padding:12px 14px;border-radius:12px;background:#17151e;border:1px solid rgba(229,181,58,.25);font-size:.8rem;color:#e2d9c4}
#warn{color:#ff8f8f;font-size:.78rem;margin-top:8px}
#out{direction:ltr;text-align:left;word-break:break-all;font-size:.66rem;color:var(--sub);margin-top:10px}
</style>
</head>
<body>
<main class="card">
  <span class="badge">v${VERSION} • نسخة خاصة</span>
  <h1>إضافة <span>${ADDON_NAME}</span></h1>
  <p class="lead">اختر جهازك وخياراتك ثم ثبّت الإضافة. الرابط الناتج يحمل إعداداتك (وربما مفاتيحك) — لا تشاركه.</p>

  <h2>1. الجهاز</h2>
  <div class="row">
    <button class="opt" data-profile="tv" aria-pressed="true" id="firstFocus">تلفاز<small>خفيف وسلس • صور أصغر</small></button>
    <button class="opt" data-profile="mobile" aria-pressed="false">موبايل / كمبيوتر<small>كل الكتالوجات والمزايا</small></button>
    <button class="opt" data-profile="saver" aria-pressed="false">توفير بيانات<small>حد 720p • قائمة أقصر</small></button>
  </div>

  <h2>2. حساب الديبريد (اختياري)</h2>
  <label class="l" for="prov">المزود</label>
  <select id="prov">
    <option value="">الخادم الافتراضي (ضبط الخادم)</option>
    <option value="torbox">TorBox</option>
    <option value="realdebrid">Real-Debrid</option>
    <option value="alldebrid">AllDebrid</option>
    <option value="premiumize">Premiumize</option>
    <option value="debridlink">Debrid-Link</option>
  </select>
  <label class="l" for="tok">المفتاح / التوكن</label>
  <input type="password" id="tok" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="يبقى داخل الرابط فقط ولا يُخزَّن في الخادم">

  <h2>3. الجودة والحجم</h2>
  <label class="l" for="maxq">أعلى جودة</label>
  <select id="maxq">
    <option value="">بدون حد</option>
    <option value="m4k">حتى 4K</option>
    <option value="m1080">حتى 1080p</option>
    <option value="m720">حتى 720p</option>
  </select>
  <label class="l" for="maxgb">أقصى حجم للملف</label>
  <select id="maxgb">
    <option value="">افتراضي الجهاز</option>
    <option value="gb8">8 جيجا</option>
    <option value="gb15">15 جيجا</option>
    <option value="gb25">25 جيجا</option>
    <option value="gb40">40 جيجا</option>
    <option value="gb0">بدون حد</option>
  </select>
  <label class="chk"><input type="checkbox" id="noremux"> استبعاد Remux الضخم</label>
  <label class="chk"><input type="checkbox" id="noav1" checked> استبعاد AV1 (أغلب التلفزيونات لا تفكّه)</label>
  <label class="chk"><input type="checkbox" id="noemoji" checked> إخفاء الإيموجي من أسماء الروابط</label>
  <label class="chk"><input type="checkbox" id="lite"> بدون روابط بث (استخدام إضافة بث أخرى)</label>

  <h2>4. هوية الإضافة ومصدر الكتالوجات</h2>
  <label class="l" for="aname">اسم الإضافة في Stremio (اختياري)</label>
  <input type="text" id="aname" maxlength="30" autocomplete="off" placeholder="${ADDON_NAME}">
  <label class="l">مصدر الكتالوجات</label>
  <div class="row">
    <button class="opt" data-mode="mix" aria-pressed="true">مختلط<small>Nuvio + Cinemeta + TMDB</small></button>
    <button class="opt" data-mode="tmdb" aria-pressed="false"${tmdbOn ? "" : " disabled"}>وضع TMDB<small>${tmdbOn ? "كتالوجات TMDB فقط + بحث بأي لغة" : "يتطلب TMDB_API_KEY في الخادم"}</small></button>
  </div>

  <h2>5. الكتالوجات (إظهار / ترتيب / إعادة تسمية)</h2>
  <details>
    <summary>تخصيص قائمة الكتالوجات</summary>
    <div class="tools">
      <button class="mini" type="button" id="catAll">تحديد الكل</button>
      <button class="mini" type="button" id="catNone">إلغاء الكل</button>
      <button class="mini" type="button" id="catReset">الافتراضي</button>
    </div>
    <div class="cats" id="cats"></div>
  </details>

  <h2>6. قوائم MDBList</h2>
  <p class="hint">أدخل مفتاح MDBList من mdblist.com/preferences ثم رابط أي قائمة (مثل mdblist.com/lists/مستخدم/قائمة).</p>
  <input type="password" id="mdbkey" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="مفتاح MDBList">
  <div id="mlrows"></div>
  <button class="addb" type="button" id="mlAdd">+ إضافة قائمة MDBList</button>

  <h2>7. قوائم TMDB</h2>
  <p class="hint">${tmdbOn ? "رقم قائمة TMDB أو رابطها (themoviedb.org/list/رقم)." : "تتطلب TMDB_API_KEY في الخادم."}</p>
  <div id="tlrows"></div>
  <button class="addb" type="button" id="tlAdd">+ إضافة قائمة TMDB</button>

  <h2>8. كتالوج TMDB مخصص (Discover)</h2>
  <p class="hint">${tmdbOn ? "ابنِ كتالوجك: النوع، الترتيب، التصنيف، اللغة، الدولة، السنوات، منصة المشاهدة، أدنى تقييم." : "يتطلب TMDB_API_KEY في الخادم."}</p>
  <div id="dcrows"></div>
  <button class="addb" type="button" id="dcAdd">+ إضافة كتالوج مخصص</button>

  <h2>9. التثبيت</h2>
  <a class="btn btn-gold" id="install" href="#">تثبيت ${ADDON_NAME} في Stremio</a>
  <button class="btn btn-dark" id="copy" type="button">نسخ رابط المانفيست</button>
  <div id="warn"></div>
  <div id="out"></div>

  <h2>10. تبويبات الجودة (اختياري)</h2>
  <div class="row" id="tabs"></div>

  <div class="note">للتلفاز: اضغط «نسخ» وافتح الرابط من هاتفك لتثبيته على Stremio عبر نفس الحساب، أو اكتب الرابط يدوياً في خانة إضافة مجتمعية. لا تشارك الرابط مع أحد.</div>
</main>
<script nonce="${nonce}">
(function(){
var H=${jsStr(host)}, K=${jsStr(key)}, REG=${jsJson(reg)}, TMDB_ON=${tmdbOn ? 1 : 0};
var GM=${jsJson(TM_GENRES.movie)}, GT=${jsJson(TM_GENRES.tv)}, PROV=${jsJson(TM_PROVIDERS)};
var secure=location.protocol==="https:";
var TABS=[["4k","4K"],["1080p","1080p"],["hdr","HDR"],["720p","720p"],["arabic","صوت عربي"],["cached","فوري سحابي"]];
var T3=[["both","أفلام ومسلسلات"],["movie","أفلام فقط"],["series","مسلسلات فقط"]];
var LANGS=[["","أي لغة"],["ar","العربية"],["en","الإنجليزية"],["tr","التركية"],["ko","الكورية"],["ja","اليابانية"],["hi","الهندية"],["fr","الفرنسية"],["es","الإسبانية"],["zh","الصينية"]];
var CTRY=[["","أي دولة"],["EG","مصر"],["SA","السعودية"],["AE","الإمارات"],["KW","الكويت"],["QA","قطر"],["LB","لبنان"],["SY","سوريا"],["TR","تركيا"],["KR","كوريا"],["JP","اليابان"],["IN","الهند"],["US","أمريكا"],["GB","بريطانيا"],["FR","فرنسا"]];
var SORTS=[["pop","الأشهر"],["rate","الأعلى تقييماً"],["new","الأحدث"],["rev","الأعلى إيراداً (أفلام)"]];
var RATE=[["","أي تقييم"],["6","6+"],["7","7+"],["8","8+"]];
var DT=[["movie","أفلام"],["series","مسلسلات"]];

var profile="tv", mode="mix", touched=false, order=[], checked={}, names={}, lastFocus=null;
var ML=[], TL=[], DC=[];

function $(i){return document.getElementById(i)}
function el(tag,cls,txt){var e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e}
function addOpt(s,v,l){var o=document.createElement("option");o.value=v;o.textContent=l;s.appendChild(o)}
function txt(model,k,ph,type){
  var i=el("input","ti");i.type=type||"text";i.placeholder=ph||"";i.value=model[k]||"";i.autocomplete="off";
  i.addEventListener("input",function(){model[k]=i.value;changed(true)});return i;
}
function sel(model,k,opts,rerender){
  var s=el("select","ti");for(var i=0;i<opts.length;i++)addOpt(s,opts[i][0],opts[i][1]);
  s.value=model[k]||opts[0][0];
  s.addEventListener("change",function(){model[k]=s.value;if(rerender)rerender();changed(false)});return s;
}
function rmBtn(arr,ix,rerender){
  var b=el("button","mini","حذف");b.type="button";
  b.addEventListener("click",function(){arr.splice(ix,1);rerender();changed(false)});return b;
}

/* ---------- التحقق (يطابق الخادم) ---------- */
function normMdb(v){
  v=String(v||"").trim();
  var m=v.match(/mdblist\\.com\\/lists\\/([^\\/\\s?#]+)\\/([^\\/\\s?#]+)/i);if(m)v=m[1]+"/"+m[2];
  return(/^\\d{1,9}$/.test(v)||/^[A-Za-z0-9_.-]{1,40}\\/[A-Za-z0-9_.-]{1,80}$/.test(v))?v:null;
}
function normTl(v){var m=String(v||"").match(/(\\d{1,10})/);return m?m[1]:null}
function mdbKey(){return $("mdbkey").value.replace(/[^A-Za-z0-9]/g,"").slice(0,64)}
function validML(){
  if(mdbKey().length<10)return[];
  var out=[];ML.slice(0,8).forEach(function(m){var id=normMdb(m.i);if(id)out.push({i:id,t:m.t||"both",n:(m.n||"").trim().slice(0,40)})});return out;
}
function validTL(){
  if(!TMDB_ON)return[];
  var out=[];TL.slice(0,8).forEach(function(m){var id=normTl(m.i);if(id)out.push({i:id,t:m.t||"both",n:(m.n||"").trim().slice(0,40)})});return out;
}
function validDC(){
  if(!TMDB_ON)return[];
  return DC.slice(0,8).map(function(m){
    var o={t:m.t==="series"?"series":"movie",n:(m.n||"").trim().slice(0,40),s:m.s||"pop"};
    if(m.g)o.g=m.g;if(m.l)o.l=m.l;if(m.c)o.c=m.c;
    var a=parseInt(m.y1,10),b=parseInt(m.y2,10);
    if(a>=1900&&a<=2100)o.y1=a;if(b>=1900&&b<=2100)o.y2=b;
    if(m.p)o.p=parseInt(m.p,10);if(m.q)o.q=parseInt(m.q,10);
    return o;
  });
}

/* ---------- صفوف MDBList / TMDB ---------- */
function renderML(){
  var b=$("mlrows");b.textContent="";
  ML.forEach(function(m,ix){
    var r=el("div","crow");
    r.appendChild(txt(m,"i","رابط القائمة أو مستخدم/اسم-القائمة"));
    r.appendChild(sel(m,"t",T3));
    r.appendChild(txt(m,"n","اسم الكتالوج (اختياري)"));
    r.appendChild(rmBtn(ML,ix,renderML));b.appendChild(r);
  });
}
function renderTL(){
  var b=$("tlrows");b.textContent="";
  TL.forEach(function(m,ix){
    var r=el("div","crow");
    r.appendChild(txt(m,"i","رقم أو رابط قائمة TMDB"));
    r.appendChild(sel(m,"t",T3));
    r.appendChild(txt(m,"n","اسم الكتالوج (اختياري)"));
    r.appendChild(rmBtn(TL,ix,renderTL));b.appendChild(r);
  });
}
function genreOpts(t){
  var src=t==="series"?GT:GM,o=[["","كل التصنيفات"]];
  for(var i=0;i<src.length;i++)o.push([String(src[i][1]),src[i][0]]);return o;
}
function renderDC(){
  var b=$("dcrows");b.textContent="";
  DC.forEach(function(m,ix){
    var r=el("div","crow");
    r.appendChild(txt(m,"n","اسم الكتالوج"));
    r.appendChild(sel(m,"t",DT,function(){m.g="";renderDC()}));
    r.appendChild(sel(m,"s",SORTS));
    r.appendChild(sel(m,"g",genreOpts(m.t)));
    r.appendChild(sel(m,"l",LANGS));
    r.appendChild(sel(m,"c",CTRY));
    r.appendChild(txt(m,"y1","من سنة","number"));
    r.appendChild(txt(m,"y2","إلى سنة","number"));
    var po=[["","أي منصة"]];for(var i=0;i<PROV.length;i++)po.push([String(PROV[i][1]),PROV[i][0]]);
    r.appendChild(sel(m,"p",po));
    r.appendChild(sel(m,"q",RATE));
    r.appendChild(rmBtn(DC,ix,renderDC));b.appendChild(r);
  });
}

/* ---------- جدول الكتالوجات ---------- */
function baselineOn(r){return(mode==="tmdb"&&TMDB_ON)?!!r.m:(profile==="tv"?!!r.tv:true)}
function tkey(t,id){return(t==="series"?"s:":"m:")+id}
function buildRows(){
  var rows=REG.map(function(r){return{k:r.k,ty:r.ty,n:r.n,reg:r}});
  var types=function(t){return t==="both"?["movie","series"]:[t]};
  validML().forEach(function(s,i){types(s.t).forEach(function(t){rows.push({k:tkey(t,"cx_ml_"+i),ty:t,n:s.n||("MDBList "+(i+1))})})});
  validTL().forEach(function(s,i){types(s.t).forEach(function(t){rows.push({k:tkey(t,"cx_tl_"+i),ty:t,n:s.n||("قائمة TMDB "+(i+1))})})});
  validDC().forEach(function(s,i){rows.push({k:tkey(s.t,"cx_dc_"+i),ty:s.t,n:s.n||("TMDB مخصص "+(i+1))})});
  return rows;
}
function syncOrder(rows){
  var keys={};rows.forEach(function(r){keys[r.k]=1});
  order=order.filter(function(k){return keys[k]});
  rows.forEach(function(r){if(order.indexOf(r.k)<0)order.push(r.k)});
}
function move(k,d){
  var i=order.indexOf(k),j=i+d;if(i<0||j<0||j>=order.length)return;
  var t=order[i];order[i]=order[j];order[j]=t;touched=true;lastFocus=k+"|"+d;renderCats();refresh();
}
function renderCats(){
  var rows=buildRows();syncOrder(rows);
  var by={};rows.forEach(function(r){by[r.k]=r});
  var box=$("cats");box.textContent="";
  order.forEach(function(k){
    var r=by[k];
    if(!touched&&r.reg)checked[k]=baselineOn(r.reg);else if(checked[k]===undefined)checked[k]=true;
    var d=el("div","crow cat");
    var c=document.createElement("input");c.type="checkbox";c.checked=!!checked[k];
    c.addEventListener("change",function(){checked[k]=c.checked;touched=true;refresh()});
    var n=el("input","ti");n.type="text";n.value=names[k]||r.n;n.maxLength=40;
    n.addEventListener("input",function(){names[k]=n.value;touched=true;refresh()});
    var up=el("button","mini","↑"),dn=el("button","mini","↓");
    up.type=dn.type="button";up.setAttribute("data-f",k+"|-1");dn.setAttribute("data-f",k+"|1");
    up.addEventListener("click",function(){move(k,-1)});dn.addEventListener("click",function(){move(k,1)});
    d.appendChild(c);d.appendChild(el("span","tag",r.ty==="movie"?"أفلام":"مسلسلات"));d.appendChild(n);d.appendChild(up);d.appendChild(dn);
    box.appendChild(d);
  });
  if(lastFocus){var f=box.querySelector('[data-f="'+lastFocus+'"]');lastFocus=null;if(f)try{f.focus()}catch(e){}}
}

/* ---------- بناء الرابط ---------- */
function b64u(s){return btoa(unescape(encodeURIComponent(s))).replace(/\\+/g,"-").replace(/\\//g,"_").replace(/=+$/,"")}
function cfgObj(){
  var c={},nm=$("aname").value.trim();
  if(nm)c.n=nm.slice(0,30);
  if(mode==="tmdb"&&TMDB_ON)c.m="tmdb";
  var ml=validML();if(ml.length){c.mk=mdbKey();c.ml=ml}
  var tl=validTL();if(tl.length)c.tl=tl;
  var dc=validDC();if(dc.length)c.dc=dc;
  if(touched){
    var rows=buildRows(),def={};rows.forEach(function(r){def[r.k]=r.n});
    c.v=order.filter(function(k){return checked[k]});
    var r2={},any=false;
    for(var k in names){if(def[k]!==undefined&&names[k]&&names[k].trim()&&names[k].trim()!==def[k]){r2[k]=names[k].trim().slice(0,40);any=true}}
    if(any)c.r=r2;
  }
  return c;
}
function path(withCustom){
  var p=K?"/"+K+"/":"/",prov=$("prov").value,t=$("tok").value.replace(/[^a-zA-Z0-9_-]/g,"");
  if(prov&&t)p+=prov+"="+t+"/";
  var c=[];
  if(profile==="tv")c.push("tv");
  if(profile==="saver")c.push("m720","n15");
  if($("maxq").value)c.push($("maxq").value);
  if($("maxgb").value)c.push($("maxgb").value);
  if($("noremux").checked)c.push("noremux");
  if($("noav1").checked)c.push("noav1");
  if($("noemoji").checked)c.push("noemoji");
  if($("lite").checked)c.push("lite");
  if(c.length)p+="cfg="+c.join(".")+"/";
  if(withCustom!==false){
    var o=cfgObj(),has=false;for(var x in o){has=true;break}
    if(has){var seg=b64u(JSON.stringify(o));p+="c="+seg+"/";$("warn").textContent=seg.length>6500?"الإعدادات طويلة جداً: قلّل عدد الكتالوجات أو القوائم لضمان عمل الرابط.":""}
    else $("warn").textContent="";
  }
  return p;
}
function link(tab){return H+path(tab?false:true)+(tab?tab+"/":"")+"manifest.json"}
function refresh(){
  var u=link();
  $("out").textContent="https://"+u;
  $("install").href=secure?"stremio://"+u:"#";
  var ts=document.querySelectorAll("[data-tab]");
  for(var i=0;i<ts.length;i++)ts[i].href=secure?"stremio://"+link(ts[i].getAttribute("data-tab")):"#";
}
function changed(keepCats){if(!keepCats)renderCats();else renderCats();refresh()}
function fail(){window.prompt("انسخ الرابط:","https://"+link())}
function copy(){
  var t="https://"+link();
  if(navigator.clipboard&&window.isSecureContext){
    navigator.clipboard.writeText(t).then(function(){$("copy").textContent="تم النسخ ✓"},fail);
  }else fail();
}

/* ---------- ربط الأحداث ---------- */
var tabsBox=$("tabs");
TABS.forEach(function(t){
  var a=el("a","tile",t[1]);a.setAttribute("data-tab",t[0]);a.href="#";tabsBox.appendChild(a);
});
var pb=document.querySelectorAll("[data-profile]");
for(var i=0;i<pb.length;i++)pb[i].addEventListener("click",function(){
  profile=this.getAttribute("data-profile");
  for(var j=0;j<pb.length;j++)pb[j].setAttribute("aria-pressed",pb[j]===this?"true":"false");
  $("noav1").checked=$("noemoji").checked=(profile==="tv");
  renderCats();refresh();
});
var mb=document.querySelectorAll("[data-mode]");
for(var i2=0;i2<mb.length;i2++)mb[i2].addEventListener("click",function(){
  if(this.disabled)return;
  mode=this.getAttribute("data-mode");
  for(var j=0;j<mb.length;j++)mb[j].setAttribute("aria-pressed",mb[j]===this?"true":"false");
  renderCats();refresh();
});
["prov","tok","maxq","maxgb","noremux","noav1","noemoji","lite","aname","mdbkey"].forEach(function(id){
  $(id).addEventListener("input",function(){if(id==="mdbkey")renderCats();refresh()});
  $(id).addEventListener("change",function(){if(id==="mdbkey")renderCats();refresh()});
});
$("mlAdd").addEventListener("click",function(){ML.push({i:"",t:"both",n:""});renderML()});
$("tlAdd").addEventListener("click",function(){if(!TMDB_ON){alert("يتطلب TMDB_API_KEY في الخادم");return}TL.push({i:"",t:"both",n:""});renderTL()});
$("dcAdd").addEventListener("click",function(){if(!TMDB_ON){alert("يتطلب TMDB_API_KEY في الخادم");return}DC.push({n:"",t:"movie",s:"pop",g:"",l:"",c:"",y1:"",y2:"",p:"",q:""});renderDC();changed(false)});
$("catAll").addEventListener("click",function(){touched=true;order.forEach(function(k){checked[k]=true});renderCats();refresh()});
$("catNone").addEventListener("click",function(){touched=true;order.forEach(function(k){checked[k]=false});renderCats();refresh()});
$("catReset").addEventListener("click",function(){touched=false;names={};order=[];checked={};renderCats();refresh()});
$("copy").addEventListener("click",copy);
$("install").addEventListener("click",function(e){if(!secure){e.preventDefault();copy()}});
tabsBox.addEventListener("click",function(e){if(!secure){e.preventDefault();window.prompt("انسخ الرابط:","https://"+link(e.target.getAttribute("data-tab")))}});

renderML();renderTL();renderDC();renderCats();refresh();
try{$("firstFocus").focus()}catch(e){}

// حماية خفيفة ضد الفحص العابر (رادع فقط؛ الأمان الحقيقي في مفتاح الوصول من جهة الخادم)
document.addEventListener("contextmenu",function(e){e.preventDefault()});
document.addEventListener("dragstart",function(e){e.preventDefault()});
document.addEventListener("keydown",function(e){
  var k=(e.key||"").toLowerCase();
  if(e.key==="F12"||(e.ctrlKey&&e.shiftKey&&(k==="i"||k==="j"||k==="c"))||(e.ctrlKey&&(k==="u"||k==="s"||k==="p"))||(e.metaKey&&e.altKey&&(k==="i"||k==="j"||k==="c"||k==="u")))e.preventDefault();
});
})();
</script>
</body>
</html>`;
}

// =========================================================================
// 8. بناء صفحة التفاصيل (Meta Engine) الشاملة المعربة
// التعريب الكامل لقصص الأفلام والمسلسلات والحلقات والمواسم بلا أي استثناء
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

  // 2. جلب التعريب الرسمي الفوري من TMDB API لكافة العناصر والحلقات والمواسم
  const seasonList = [...new Set((Array.isArray(base.videos) ? base.videos : [])
    .map(v => Number(v.season)).filter(n => Number.isInteger(n) && n > 0))]
    .sort((a, b) => a - b).slice(0, 40);
  const tmdbAr = await fetchTmdbArabic(type, lookupId, seasonList);

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

  // 3. التعريب الفوري الدقيق لكافة الحلقات والمواسم (اسم الحلقة المميز + قصة الحلقة)
  if (Array.isArray(meta.videos) && meta.videos.length > 0) {
    const titlesToTranslate = [];
    const overviewsToTranslate = [];

    meta.videos = meta.videos.map(v => {
      const out = { ...v };
      const s = v.season;
      const e = v.episode ?? v.number;
      const tmdbEp = tmdbAr?.episodesMap?.get(`${s}:${e}`);

      // أ. استخراج وتحديد اسم الحلقة
      const rawCineName = out.name || out.title || "";
      const isGenericTmdbName = !tmdbEp?.name || /^الحلقة\s*\d+$/i.test(tmdbEp.name.trim()) || /^Episode\s*\d+$/i.test(tmdbEp.name.trim());

      if (tmdbEp?.name && hasArabic(tmdbEp.name) && !isGenericTmdbName) {
        // اسم عربي مميز من استوديو TMDB (مثل "ضياع الذاكرة"، "الشفرة")
        out.name = tmdbEp.name;
        out.title = tmdbEp.name;
      } else {
        const fallbackName = (rawCineName && !rawCineName.toLowerCase().startsWith("episode") && !/^الحلقة\s*\d+$/i.test(rawCineName.trim()))
          ? rawCineName
          : `الحلقة ${e || 1}`;
        out.name = fallbackName;
        out.title = fallbackName;

        if (rawCineName && !rawCineName.toLowerCase().startsWith("episode") && !/^الحلقة\s*\d+$/i.test(rawCineName.trim())) {
          const cachedTitle = cachedArabic(rawCineName);
          if (cachedTitle) {
            out.name = cachedTitle;
            out.title = cachedTitle;
          } else {
            titlesToTranslate.push({ video: out, text: rawCineName, epNum: e });
          }
        }
      }

      // ب. تعريب قصة الحلقة بدقة 100%
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
            overviewsToTranslate.push({ video: out, text: rawOv });
          }
        }
      }
      return out;
    });

    // ج. ترجمة أسماء الحلقات الإنجليزية إلى أسماء عربية مميزة بالتوازي
    if (titlesToTranslate.length > 0) {
      try {
        const batchTitles = titlesToTranslate.slice(0, 32);
        const translatedTitles = await translateMany(batchTitles.map(t => t.text), { limit: 8, budgetMs: 3500 });
        translatedTitles.forEach((arTitle, idx) => {
          if (arTitle && isTextArabic(arTitle)) {
            batchTitles[idx].video.name = arTitle;
            batchTitles[idx].video.title = arTitle;
            saveToCache(`tr_v21_${hashStr(batchTitles[idx].text)}`, arTitle, CACHE_TTL_TRANS);
          }
        });
      } catch {
        // في حال التعذر يبقى الاسم التلقائي
      }
    }

    // د. ترجمة ملخصات وقصص الحلقات بالتوازي لجميع الحلقات المطلوبة
    if (overviewsToTranslate.length > 0) {
      const batch = overviewsToTranslate.slice(0, 32);
      const translated = await translateMany(batch.map(b => b.text), { limit: 8, budgetMs: 5000 });
      translated.forEach((arText, idx) => {
        if (arText && isTextArabic(arText)) {
          batch[idx].video.overview = arText;
          batch[idx].video.description = arText;
          saveToCache(`tr_v21_${hashStr(batch[idx].text)}`, arText, CACHE_TTL_TRANS);
        }
      });
    }
  }

  return { meta, complete: true };
}

const metaBuilds = new Map();
function getMetaPayload(type, id) {
  const key = `meta_v21_${type}_${id}`;
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
    const key = `meta_v21_${type}_${id}`;
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
  const cacheKey = `strlist_v20_${prefix}${type}_${id}`;
  const fresh = getFromCache(cacheKey, false, CACHE_TTL_STREAM);
  if (fresh) return Promise.resolve(fresh);
  const job = streamBuilds.get(cacheKey) || startBuild(type, id, cacheKey, customTorboxUrl);
  const stale = getFromCache(cacheKey, true, CACHE_TTL_STREAM * 2);
  return stale ? Promise.resolve(stale) : job;
}

// =========================================================================
// 9ب. تخصيص المانفيست: MDBList + قوائم TMDB + Discover مخصص + "وضع TMDB"
// الإعدادات تُنقل في مقطع واحد من الرابط:  c=<base64url(JSON)>
// وكلها تُفحص بصرامة (قوائم بيضاء وحدود أطوال) قبل أي استخدام
// =========================================================================

const SKIP_X = [{ name: "skip", isRequired: false }];

const TM_GENRES = {
  movie: [["حركة", 28], ["مغامرة", 12], ["رسوم متحركة", 16], ["كوميديا", 35], ["جريمة", 80], ["وثائقي", 99], ["دراما", 18], ["عائلي", 10751], ["فانتازيا", 14], ["تاريخي", 36], ["رعب", 27], ["موسيقي", 10402], ["غموض", 9648], ["رومانسي", 10749], ["خيال علمي", 878], ["إثارة", 53], ["حرب", 10752], ["غرب أمريكي", 37]],
  tv: [["حركة ومغامرة", 10759], ["رسوم متحركة", 16], ["كوميديا", 35], ["جريمة", 80], ["وثائقي", 99], ["دراما", 18], ["عائلي", 10751], ["أطفال", 10762], ["غموض", 9648], ["أخبار", 10763], ["واقعي", 10764], ["خيال علمي وفانتازيا", 10765], ["دراما اجتماعية", 10766], ["برنامج حواري", 10767], ["حرب وسياسة", 10768], ["غرب أمريكي", 37]]
};
const TM_PROVIDERS = [["نتفليكس", 8], ["برايم فيديو", 9], ["ديزني+", 337], ["Apple TV+", 350], ["Max", 1899], ["Paramount+", 531], ["Hulu", 15], ["Crunchyroll", 283], ["Peacock", 386]];

const TM_CATALOGS = {
  tm_popular_movies: { type: "movie", path: "/movie/popular", disc: "/discover/movie", genres: "movie" },
  tm_popular_series: { type: "series", path: "/tv/popular", disc: "/discover/tv", genres: "tv" },
  tm_trending_movies: { type: "movie", path: "/trending/movie/week" },
  tm_trending_series: { type: "series", path: "/trending/tv/week" },
  tm_upcoming_movies: { type: "movie", path: "/movie/upcoming", region: true },
  tm_airing_series: { type: "series", path: "/tv/on_the_air" }
};

const KEY_RE = /^[ms]:[A-Za-z0-9_-]{1,60}$/;
const TYPE3 = new Set(["movie", "series", "both"]);
const SORTS = new Set(["pop", "rate", "new", "rev"]);
const clip = (s, n) => String(s ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, n);

function normMdbId(v) {
  let s = String(v || "").trim();
  const m = s.match(/mdblist\.com\/lists\/([^/\s?#]+)\/([^/\s?#]+)/i);
  if (m) s = `${m[1]}/${m[2]}`;
  return (/^\d{1,9}$/.test(s) || /^[A-Za-z0-9_.-]{1,40}\/[A-Za-z0-9_.-]{1,80}$/.test(s)) ? s : null;
}
function normTmdbListId(v) {
  const m = String(v || "").match(/(\d{1,10})/);
  return m ? m[1] : null;
}
const intIn = (v, a, b) => { const n = parseInt(v, 10); return Number.isInteger(n) && n >= a && n <= b ? n : 0; };

function parseCustom(seg) {
  try {
    const raw = Buffer.from(seg, "base64url").toString("utf8");
    if (!raw || raw.length > 6000) return null;
    const j = JSON.parse(raw);
    if (!j || typeof j !== "object" || Array.isArray(j)) return null;

    const c = { n: clip(j.n, 30), m: j.m === "tmdb" ? "tmdb" : "mix", v: null, r: {}, mk: "", ml: [], tl: [], dc: [] };

    if (Array.isArray(j.v)) c.v = j.v.slice(0, 150).map(String).filter(x => KEY_RE.test(x));
    if (j.r && typeof j.r === "object") {
      for (const [k, v] of Object.entries(j.r).slice(0, 150)) {
        const nm = clip(v, 40);
        if (KEY_RE.test(k) && nm) c.r[k] = nm;
      }
    }
    const mk = String(j.mk || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 64);
    if (mk.length >= 10) c.mk = mk;

    for (const s of (Array.isArray(j.ml) ? j.ml : []).slice(0, 8)) {
      const id = normMdbId(s?.i);
      if (id) c.ml.push({ i: id, t: TYPE3.has(s.t) ? s.t : "both", n: clip(s.n, 40) });
    }
    for (const s of (Array.isArray(j.tl) ? j.tl : []).slice(0, 8)) {
      const id = normTmdbListId(s?.i);
      if (id) c.tl.push({ i: id, t: TYPE3.has(s.t) ? s.t : "both", n: clip(s.n, 40) });
    }
    for (const s of (Array.isArray(j.dc) ? j.dc : []).slice(0, 8)) {
      if (!s || typeof s !== "object") continue;
      const g = String(s.g || "");
      c.dc.push({
        t: s.t === "series" ? "series" : "movie",
        n: clip(s.n, 40),
        s: SORTS.has(s.s) ? s.s : "pop",
        g: /^\d{1,6}(,\d{1,6}){0,3}$/.test(g) ? g : "",
        l: /^[a-z]{2,3}$/.test(String(s.l || "")) ? s.l : "",
        c: /^[A-Z]{2}$/.test(String(s.c || "")) ? s.c : "",
        y1: intIn(s.y1, 1900, 2100), y2: intIn(s.y2, 1900, 2100),
        p: intIn(s.p, 1, 99999),
        rg: /^[A-Z]{2}$/.test(String(s.rg || "")) ? s.rg : "",
        q: intIn(s.q, 1, 9)
      });
    }
    c.hk = hashStr(JSON.stringify([c.m, c.mk, c.ml, c.tl, c.dc]));
    return c;
  } catch {
    return null;
  }
}

// ---- سجل الكتالوجات المدمجة (للمانفيست ولصفحة التخصيص) ----
function catalogRegistry(countryName) {
  const R = [];
  const add = (type, id, name, f = {}) => R.push({
    type, id, name, extra: f.extra || SKIP_X,
    tv: Boolean(f.tv), tmdb: Boolean(f.tmdb), m: Boolean(f.m), src: f.src || "core"
  });
  const genreExtra = k => [{ name: "genre", isRequired: false, options: TM_GENRES[k].map(g => g[0]), optionsLimit: 1 }, ...SKIP_X];
  const searchGenre = (opts) => [
    { name: "search", isRequired: false },
    { name: "genre", isRequired: false, options: opts },
    ...SKIP_X
  ];

  add("movie", "top10_region_movies", `Movies - أفضل 10 في ${countryName}`, { extra: [], tv: true });
  add("series", "top10_region_series", `Series - أفضل 10 في ${countryName}`, { extra: [], tv: true });
  add("movie", "trending_daily_movies", "Movies - ترند اليوم", { tv: true });
  add("series", "trending_daily_series", "Series - ترند اليوم", { tv: true });
  add("movie", "arabic_movies_spotlight", "أفلام سينمائية عربية", { tv: true });
  add("series", "arabic_series_spotlight", "مسلسلات عربية شهيرة", { tv: true });
  add("series", "anime_trending", "أنمي - رائج ومميز", { tv: true });
  add("movie", "onetake2_movies_main", "Movies - كل الأفلام", { extra: searchGenre(NV_MOVIE_GENRES), tv: true, m: true });
  add("series", "onetake2_series_main", "Series - كل المسلسلات", { extra: searchGenre(NV_SERIES_GENRES), tv: true, m: true });

  add("series", "egyptian_series_spotlight", "مسلسلات مصرية", { tmdb: true, tv: true, m: true, src: "tmdb" });
  add("series", "gulf_series_spotlight", "مسلسلات خليجية", { tmdb: true, m: true, src: "tmdb" });
  add("series", "turkish_dramas_spotlight", "مسلسلات الدراما التركية", { tmdb: true, tv: true, m: true, src: "tmdb" });
  add("series", "kdrama_spotlight", "مسلسلات الدراما الكورية (K-Drama)", { tmdb: true, tv: true, m: true, src: "tmdb" });
  add("movie", "now_playing_movies", "أفلام في دور العرض الآن", { tmdb: true, tv: true, m: true, src: "tmdb" });
  add("movie", "top_rated_movies", "أفلام الأعلى تقييماً", { tmdb: true, m: true, src: "tmdb" });
  add("series", "top_rated_series", "مسلسلات الأعلى تقييماً", { tmdb: true, m: true, src: "tmdb" });

  add("movie", "tm_popular_movies", "TMDB - أفلام شائعة", { extra: genreExtra("movie"), tmdb: true, tv: true, m: true, src: "tmdb" });
  add("series", "tm_popular_series", "TMDB - مسلسلات شائعة", { extra: genreExtra("tv"), tmdb: true, tv: true, m: true, src: "tmdb" });
  add("movie", "tm_trending_movies", "TMDB - أفلام رائجة هذا الأسبوع", { tmdb: true, m: true, src: "tmdb" });
  add("series", "tm_trending_series", "TMDB - مسلسلات رائجة هذا الأسبوع", { tmdb: true, m: true, src: "tmdb" });
  add("movie", "tm_upcoming_movies", "TMDB - أفلام قادمة", { tmdb: true, m: true, src: "tmdb" });
  add("series", "tm_airing_series", "TMDB - مسلسلات تُعرض حالياً", { tmdb: true, m: true, src: "tmdb" });

  nuvioCatalogs().forEach(c => R.push({
    type: c.type, id: c.id, name: c.name, extra: c.extra,
    tv: TV_NUVIO.has(c.id.slice(6)), tmdb: false, m: false, src: "nuvio"
  }));
  return R;
}

function baselineCatalogs(reg, o, tmdbOn) {
  const tmode = tmdbOn && o.cc?.m === "tmdb";
  return reg.filter(c => (!c.tmdb || tmdbOn) && (tmode ? c.m : (!o.tv || c.tv)));
}

function customCatalogs(cc, tmdbOn) {
  const out = [];
  if (!cc) return out;
  const types = t => (t === "both" ? ["movie", "series"] : [t]);
  const mk = (type, id, name) => ({ type, id, name, extra: SKIP_X, tmdb: false, m: false, src: "custom", tv: true });
  cc.ml.forEach((s, i) => { if (cc.mk) for (const t of types(s.t)) out.push(mk(t, `cx_ml_${i}`, s.n || `MDBList ${i + 1}`)); });
  if (tmdbOn) {
    cc.tl.forEach((s, i) => { for (const t of types(s.t)) out.push(mk(t, `cx_tl_${i}`, s.n || `قائمة TMDB ${i + 1}`)); });
    cc.dc.forEach((s, i) => out.push(mk(s.t, `cx_dc_${i}`, s.n || `TMDB مخصص ${i + 1}`)));
  }
  return out;
}

const catKey = c => `${c.type[0]}:${c.id}`;

// =========================================================================
// المحركات: MDBList / قوائم TMDB / Discover / وضع TMDB
// =========================================================================

const todayStr = () => new Date().toISOString().slice(0, 10);
const genreIdByName = (kind, name) => (TM_GENRES[kind].find(g => g[0] === name) || [])[1];

function dcQuery(s, countryCode) {
  const tv = s.t === "series";
  const dk = tv ? "first_air_date" : "primary_release_date";
  const p = [];
  p.push(`sort_by=${s.s === "rate" ? "vote_average.desc" : s.s === "new" ? dk + ".desc" : (s.s === "rev" && !tv) ? "revenue.desc" : "popularity.desc"}`);
  if (s.s === "rate") p.push("vote_count.gte=300");
  if (s.s === "new") p.push("vote_count.gte=3");
  p.push("include_adult=false");
  if (s.g) p.push(`with_genres=${s.g}`);
  if (s.l) p.push(`with_original_language=${s.l}`);
  if (s.c) p.push(`with_origin_country=${s.c}`);
  if (s.y1) p.push(`${dk}.gte=${s.y1}-01-01`);
  if (s.y2) p.push(`${dk}.lte=${s.y2}-12-31`);
  else if (s.s === "new") p.push(`${dk}.lte=${todayStr()}`);
  if (s.p) {
    const rg = s.rg || (/^[A-Z]{2}$/.test(countryCode) ? countryCode : "SA");
    p.push(`with_watch_providers=${s.p}`, `watch_region=${rg}`, "with_watch_monetization_types=flatrate%7Cfree%7Cads");
  }
  if (s.q) p.push(`vote_average.gte=${s.q}`);
  return p.join("&");
}

async function tmdbListCatalog(spec, type, skip) {
  const page = Math.min(Math.floor(skip / 20) + 1, 20);
  const data = await safeFetchJson(tmdbUrl(`/list/${spec.i}`, `language=ar-SA&page=${page}`), {}, 4000);
  const want = type === "series" ? "tv" : "movie";
  return (data?.items || [])
    .filter(r => (r.media_type || (r.title ? "movie" : "tv")) === want)
    .map(r => tmdbToMeta(r, type, ""))
    .filter(Boolean);
}

function mdbCollect(data, type) {
  let items = [];
  if (Array.isArray(data)) items = data;
  else if (data && typeof data === "object") {
    items = [
      ...(Array.isArray(data.movies) ? data.movies : []).map(x => ({ mediatype: "movie", ...x })),
      ...(Array.isArray(data.shows) ? data.shows : []).map(x => ({ mediatype: "show", ...x }))
    ];
  }
  const want = type === "series" ? "show" : "movie";
  return items
    .filter(x => x && typeof x === "object" && String(x.mediatype || x.media_type || "").replace(/^(tv|series)$/, "show") === want)
    .sort((a, b) => (Number(a.rank) || 1e9) - (Number(b.rank) || 1e9));
}

// نجلب القائمة مرة واحدة (حتى 300 عنصر) ونقسّمها محلياً → طلب واحد لكل قائمة كل 6 ساعات
// (الحصة المجانية في MDBList محدودة يومياً)
async function mdbListMetas(key, spec, type, skip, o) {
  if (!key) return [];
  const ck = `mdb_v1_${hashStr(spec.i)}_${hashStr(key)}`;
  let data = getFromCache(ck, false);
  if (!data) {
    data = await safeFetchJson(`https://api.mdblist.com/lists/${spec.i}/items?apikey=${encodeURIComponent(key)}&limit=300`, {}, 7000);
    if (data) saveToCache(ck, data, 6 * 60 * 60 * 1000);
  }
  if (!data) return [];

  const page = mdbCollect(data, type).slice(skip, skip + 40);
  const posterSize = o.tv ? "small" : "medium";
  const metas = await mapLimit(page, 6, async x => {
    const imdb = /^tt\d+$/.test(String(x.imdb_id || "")) ? x.imdb_id : null;
    if (imdb) {
      return {
        id: imdb, type, name: stripAllEmojis(String(x.title || imdb)),
        poster: `https://images.metahub.space/poster/${posterSize}/${imdb}/img`,
        posterShape: "poster",
        releaseInfo: x.release_year ? String(x.release_year) : ""
      };
    }
    // عنصر بلا IMDb: نكمله من TMDB إن وُجد مفتاحه، وإلا نتجاهله
    if (TMDB_API_KEY && Number.isInteger(Number(x.id)) && Number(x.id) > 0) {
      const tvType = type === "series";
      const r = await safeFetchJson(tmdbUrl(`/${tvType ? "tv" : "movie"}/${Number(x.id)}`, "language=ar-SA"), {}, 3500);
      return r ? tmdbToMeta(r, type, "") : null;
    }
    return null;
  });
  return metas.filter(Boolean);
}

function finishMetas(metas, o) {
  return { metas: metas.slice(0, o.catMax).map(m => shapeCatalogMeta(m, o)) };
}

// يعيد null إذا لم يكن الكتالوج من النوع الخاص (فيكمل المسار العادي)
async function specialCatalog(type, id, extra, o, countryCode) {
  const cc = o.cc;
  const tmdbOn = Boolean(TMDB_API_KEY);
  const skip = Math.max(0, parseInt(extra.skip, 10) || 0);

  const mc = id.match(/^cx_(ml|tl|dc)_(\d{1,2})$/);
  if (mc) {
    const spec = cc?.[mc[1]]?.[Number(mc[2])];
    if (!spec) return { metas: [] };
    if (mc[1] === "ml") return finishMetas(await mdbListMetas(cc.mk, spec, type, skip, o), o);
    if (!tmdbOn) return { metas: [] };
    if (mc[1] === "tl") return finishMetas(await tmdbListCatalog(spec, type, skip), o);
    if (spec.t !== type) return { metas: [] };
    const path = `/discover/${type === "series" ? "tv" : "movie"}`;
    return finishMetas(await tmdbListMetas(path, dcQuery(spec, countryCode), type, "", extra), o);
  }

  if (!tmdbOn) return null;

  const tm = TM_CATALOGS[id];
  if (tm) {
    let path = tm.path, qs = tm.region && /^[A-Z]{2}$/.test(countryCode) ? `region=${countryCode}` : "";
    const gid = tm.genres && extra.genre ? genreIdByName(tm.genres, extra.genre) : null;
    if (gid) { path = tm.disc; qs = `sort_by=popularity.desc&include_adult=false&with_genres=${gid}`; }
    return finishMetas(await tmdbListMetas(path, qs, tm.type, "", extra), o);
  }

  // وضع TMDB: "كل الأفلام/المسلسلات" تعتمد على TMDB (بحث بأي لغة + تصنيفات عربية)
  if (cc?.m === "tmdb" && (id === "onetake2_movies_main" || id === "onetake2_series_main")) {
    const isSeries = id === "onetake2_series_main";
    const t = isSeries ? "series" : "movie";
    if (extra.search) {
      const page = Math.min(Math.floor(skip / 20) + 1, 20);
      const data = await safeFetchJson(
        tmdbUrl(`/search/${isSeries ? "tv" : "movie"}`, `language=ar-SA&include_adult=false&page=${page}&query=${encodeURIComponent(extra.search)}`),
        {}, 3500
      );
      return finishMetas((data?.results || []).map(r => tmdbToMeta(r, t, "")).filter(Boolean), o);
    }
    const gid = extra.genre ? genreIdByName(isSeries ? "tv" : "movie", extra.genre) : null;
    const path = isSeries ? "/tv/popular" : "/movie/popular";
    const metas = gid
      ? await tmdbListMetas(isSeries ? "/discover/tv" : "/discover/movie", `sort_by=popularity.desc&include_adult=false&with_genres=${gid}`, t, "", extra)
      : await tmdbListMetas(path, "", t, "", extra);
    return finishMetas(metas, o);
  }
  return null;
}


// =========================================================================
// 10. الحماية، الخيارات، والكتالوجات
// =========================================================================

const rateMap = new Map();
const failMap = new Map();

function hit(map, ip, limit, windowMs) {
  const now = Date.now();
  let e = map.get(ip);
  if (!e || now - e.t > windowMs) e = { n: 0, t: now };
  e.n++;
  map.set(ip, e);
  if (map.size > 4000) for (const [k, v] of map) if (now - v.t > windowMs) map.delete(k);
  return e.n > limit;
}

function peekBlocked(ip, limit = 12, windowMs = 10 * 60 * 1000) {
  const e = failMap.get(ip);
  return Boolean(e && Date.now() - e.t < windowMs && e.n > limit);
}

function safeEq(a, b) {
  const A = Buffer.from(String(a));
  const B = Buffer.from(String(b));
  const sameLen = A.length === B.length;
  return timingSafeEqual(sameLen ? A : B, B) && sameLen;
}

function safeDecode(s) { try { return decodeURIComponent(s); } catch { return s; } }

function clientIp(req) {
  const h = req.headers || {};
  return String(h["x-real-ip"] || String(h["x-forwarded-for"] || "").split(",")[0] || req.socket?.remoteAddress || "?").trim();
}

function cleanHost(h) {
  const v = String(h || "").toLowerCase();
  return /^[a-z0-9.-]{1,253}(:\d{1,5})?$/.test(v) ? v : "localhost";
}

function applySecurityHeaders(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (String(req.headers?.["x-forwarded-proto"] || "").startsWith("https")) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000");
  }
}

const SEG_DEBRID = /^(torbox|realdebrid|alldebrid|premiumize|debridlink)=([A-Za-z0-9_-]{8,128})$/i;
const SEG_CFG = /^cfg=([a-z0-9.]{1,80})$/i;
const SEG_TAB = /^(8k|4k|2k|1080p|720p|480p|hdr|arabic|cached|all)$/i;
const TYPES = new Set(["movie", "series", "anime"]);
const ID_RE = /^[A-Za-z0-9:_.-]{1,64}$/;
const CAT_RE = /^[A-Za-z0-9_-]{1,60}$/;

function parseExtra(raw) {
  const out = {};
  if (!raw) return out;
  for (const part of String(raw).split("&")) {
    const k = part.indexOf("=");
    if (k < 1) continue;
    const key = part.slice(0, k);
    if (key !== "genre" && key !== "search" && key !== "skip") continue;
    out[key] = safeDecode(part.slice(k + 1)).replace(/[\u0000-\u001f]/g, "").slice(0, 100);
  }
  return out;
}

function upstreamExtraSuffix(extra) {
  const parts = [];
  if (extra.genre) parts.push("genre=" + encodeURIComponent(extra.genre));
  if (extra.search) parts.push("search=" + encodeURIComponent(extra.search));
  const skip = parseInt(extra.skip, 10);
  if (skip > 0) parts.push("skip=" + skip);
  return parts.length ? `/${parts.join("&")}.json` : ".json";
}

// ---- ترشيح وعرض الروابط حسب الملف ----
function applyStreamOptions(list, o) {
  const out = list.filter(i => {
    if (o.maxRank && i._rank > o.maxRank) return false;
    if (o.noRemux && i._remux) return false;
    if (o.noAv1 && i._av1) return false;
    if (o.maxGB && i._bytes > o.maxGB * 1073741824) return false;
    return true;
  });
  return out.length ? out : list; // لا نترك الشاشة فارغة أبداً
}

const STATUS_LABEL = {
  instant: "فوري", download: "تنزيل سحابي", p2p: "P2P"
};

function renderStream(item, o) {
  const out = stripPrivate(item);
  if (o.noEmoji) {
    const audio = stripAllEmojis(item._audioLabel || "");
    const tags = [STATUS_LABEL[item._status], ...(item._tagParts || [])].filter(Boolean).join(" • ");
    const d = `${audio}\n${tags}`;
    out.title = d;
    out.description = d;
  }
  return out;
}

// ---- كتالوجات TMDB ----
const TMDB_CATALOGS = {
  turkish_dramas_spotlight: { type: "series", path: "/discover/tv", params: "with_original_language=tr&sort_by=popularity.desc", fallback: "دراما تركية مميزة" },
  kdrama_spotlight: { type: "series", path: "/discover/tv", params: "with_original_language=ko&sort_by=popularity.desc", fallback: "دراما كورية مشوقة ومميزة" },
  egyptian_series_spotlight: { type: "series", path: "/discover/tv", params: "with_origin_country=EG&sort_by=popularity.desc", fallback: "مسلسل مصري" },
  gulf_series_spotlight: { type: "series", path: "/discover/tv", params: "with_origin_country=SA%7CKW%7CAE%7CQA%7CBH%7COM&with_original_language=ar&sort_by=popularity.desc", fallback: "مسلسل خليجي" },
  now_playing_movies: { type: "movie", path: "/movie/now_playing", region: true, fallback: "" },
  top_rated_movies: { type: "movie", path: "/movie/top_rated", fallback: "" },
  top_rated_series: { type: "series", path: "/tv/top_rated", fallback: "" }
};

function tmdbToMeta(r, type, fallback) {
  const title = r.title || r.name || r.original_title || r.original_name;
  if (!r.id || !title) return null;
  return {
    id: `tmdb:${r.id}`,
    type,
    name: stripAllEmojis(title),
    poster: r.poster_path ? `${TMDB_IMG}/w500${r.poster_path}` : undefined,
    posterShape: "poster",
    background: r.backdrop_path ? `${TMDB_IMG}/w1280${r.backdrop_path}` : undefined,
    description: r.overview || fallback || "",
    releaseInfo: (r.first_air_date || r.release_date || "").slice(0, 4)
  };
}

async function tmdbListMetas(path, qs, type, fallback, extra) {
  const page = Math.floor((parseInt(extra.skip, 10) || 0) / 20) + 1;
  const data = await safeFetchJson(tmdbUrl(path, `language=ar-SA&page=${Math.min(page, 20)}${qs ? "&" + qs : ""}`), {}, 3500);
  return (data?.results || []).map(r => tmdbToMeta(r, type, fallback)).filter(Boolean);
}

async function catalogPayload(type, catalogId, extra, o, countryCode) {
  const skip = Math.max(0, parseInt(extra.skip, 10) || 0);
  const search = extra.search || "";
  const finish = metas => ({ metas: metas.slice(0, o.catMax).map(m => shapeCatalogMeta(m, o)) });

  const special = await specialCatalog(type, catalogId, extra, o, countryCode);
  if (special) return special;

  // 1. الأنمي
  if (catalogId === "anime_trending") {
    const suffix = skip ? `/skip=${skip}.json` : ".json";
    const kitsu = await safeFetchJson(`${UPSTREAM_ADDONS.animeKitsu}/catalog/anime/kitsu-anime-trending${suffix}`, {}, 3500);
    const { items } = await localizeCatalogList((kitsu?.metas || []).slice(0, o.catLimit), type, o);
    return { metas: items.slice(0, o.catMax) };
  }

  // 2. كتالوجات TMDB (تركي/كوري/مصري/خليجي/الأحدث/الأعلى تقييماً) مع ترقيم صفحات
  const def = TMDB_CATALOGS[catalogId];
  if (def && TMDB_API_KEY) {
    const qs = [def.params, def.region ? `region=${encodeURIComponent(countryCode)}` : ""].filter(Boolean).join("&");
    const metas = await tmdbListMetas(def.path, qs, def.type, def.fallback, extra);
    return finish(metas);
  }

  // 3. الأفلام والمسلسلات العربية (Nuvio) مع ترقيم صفحات
  if (catalogId === "arabic_movies_spotlight" || catalogId === "arabic_series_spotlight") {
    const isMovie = catalogId === "arabic_movies_spotlight";
    const base = isMovie ? "movie/movies-by-language" : "series/series-by-language";
    const sfx = `genre=Arabic${skip ? `&skip=${skip}` : ""}`;
    const data = await safeFetchJson(`${UPSTREAM_ADDONS.nuvio}/catalog/${base}/${sfx}.json`, {}, 3800);
    const { items } = await localizeCatalogList((data?.metas || []).slice(0, o.catLimit), isMovie ? "movie" : "series", o);
    return { metas: items.slice(0, o.catMax) };
  }

  // 4. بحث عربي مباشر عبر TMDB (النتائج بالعربية حتى لو كتبت الاسم بالعربية)
  if (search && hasArabic(search) && TMDB_API_KEY) {
    const isSeries = type === "series" || type === "anime";
    const page = Math.floor(skip / 20) + 1;
    const data = await safeFetchJson(
      tmdbUrl(`/search/${isSeries ? "tv" : "movie"}`, `language=ar-SA&include_adult=false&page=${Math.min(page, 20)}&query=${encodeURIComponent(search)}`),
      {}, 3500
    );
    const metas = (data?.results || []).map(r => tmdbToMeta(r, isSeries ? "series" : "movie", "")).filter(Boolean);
    if (metas.length) return finish(metas);
  }

  // 5. بقية الكتالوجات (Nuvio + Cinemeta)
  const suffix = upstreamExtraSuffix(extra);
  const kind = type === "series" ? "series" : "movies";
  let nuvioUrl = `${UPSTREAM_ADDONS.nuvio}/catalog/${type}/popular-${kind}${suffix}`;
  let cinemetaUrl = `${UPSTREAM_ADDONS.cinemeta}/catalog/${type}/top${suffix}`;

  const isNuvio = catalogId.startsWith("nuvio-");
  const isTrending = catalogId === "trending_daily_movies" || catalogId === "trending_daily_series";
  const isTop10 = catalogId === "top10_region_movies" || catalogId === "top10_region_series";

  if (isNuvio) {
    nuvioUrl = `${UPSTREAM_ADDONS.nuvio}/catalog/${type}/${catalogId.slice(6)}${suffix}`;
    cinemetaUrl = null;
  } else if (isTrending) {
    nuvioUrl = `${UPSTREAM_ADDONS.nuvio}/catalog/${type}/trending-${kind}${suffix}`;
  } else if (isTop10) {
    nuvioUrl = `${UPSTREAM_ADDONS.nuvio}/catalog/${type}/trending-${kind}.json`;
    cinemetaUrl = `${UPSTREAM_ADDONS.cinemeta}/catalog/${type}/top.json`;
  }

  const [nuvioData, cineData] = await Promise.all([
    safeFetchJson(nuvioUrl, {}, 3800),
    cinemetaUrl ? safeFetchJson(cinemetaUrl, {}, 3500) : Promise.resolve(null)
  ]);

  const sourceList = (Array.isArray(nuvioData?.metas) && nuvioData.metas.length > 0)
    ? nuvioData.metas
    : (Array.isArray(cineData?.metas) ? cineData.metas : []);

  let clean = [];
  const seen = new Set();
  for (const m of sourceList) {
    if (!m || !m.id || seen.has(m.id)) continue;
    seen.add(m.id);
    clean.push({ ...m, name: stripAllEmojis(m.name || ""), genres: localizeGenres(m.genres) });
  }

  if (isTop10) {
    clean = clean.slice(0, 10).map((item, idx) => ({ ...item, name: `TOP ${idx + 1} - ${item.name}` }));
  }

  const head = clean.slice(0, o.catLimit);
  const { items } = await localizeCatalogList(head, type, o);
  const rest = clean.slice(o.catLimit).map(m => shapeCatalogMeta(m, o));
  const metas = [...items, ...rest].slice(0, o.catMax);

  if (o.warm) warmMeta(type, metas.map(m => m.id));
  return { metas };
}

// =========================================================================
// 11. ملف التعريف (Manifest)
// =========================================================================

const TV_NUVIO = new Set([
  "popular-movies", "popular-series", "new-and-upcoming-movies", "new-and-returning-series",
  "netflix-movies", "netflix-series", "disney-plus-movies", "disney-plus-series"
]);

function buildManifest(o, tab, countryName) {
  if (tab) {
    const def = TABS[tab];
    return {
      id: `app.onetake2.tab.${tab}`,
      version: VERSION,
      name: def.label,
      description: `${ADDON_NAME}: ${def.desc}`,
      resources: ["stream"],
      types: ["movie", "series", "anime"],
      idPrefixes: ["tt", "kitsu:", "tmdb:", "tmdb"],
      catalogs: [],
      behaviorHints: { configurable: false, configurationRequired: false }
    };
  }

  const cc = o.cc;
  const tmdbOn = Boolean(TMDB_API_KEY);
  const tmode = tmdbOn && cc?.m === "tmdb";
  const reg = catalogRegistry(countryName).filter(c => !c.tmdb || tmdbOn);

  if (tmode) {
    for (const c of reg) {
      if (c.id === "onetake2_movies_main") c.extra = [{ name: "search", isRequired: false }, { name: "genre", isRequired: false, options: TM_GENRES.movie.map(g => g[0]), optionsLimit: 1 }, ...SKIP_X];
      if (c.id === "onetake2_series_main") c.extra = [{ name: "search", isRequired: false }, { name: "genre", isRequired: false, options: TM_GENRES.tv.map(g => g[0]), optionsLimit: 1 }, ...SKIP_X];
    }
  }

  const customs = customCatalogs(cc, tmdbOn);
  const byKey = new Map([...reg, ...customs].map(c => [catKey(c), c]));
  let list;
  if (cc && Array.isArray(cc.v)) {
    list = cc.v.map(k => byKey.get(k)).filter(Boolean);
    const have = new Set(list.map(catKey));
    for (const c of customs) if (!have.has(catKey(c))) list.push(c);
  } else {
    list = [...baselineCatalogs(reg, o, tmdbOn), ...customs];
  }

  const seen = new Set();
  const catalogs = [];
  for (const c of list) {
    const k = catKey(c);
    if (seen.has(k)) continue;
    seen.add(k);
    const out = { type: c.type, id: c.id, name: cc?.r?.[k] || c.name };
    if (!(Array.isArray(c.extra) && c.extra.length === 0)) out.extra = c.extra;
    catalogs.push(out);
    if (catalogs.length >= 120) break;
  }

  const idSuffix = o.tv ? (o.lite ? "tv.lite" : "tv") : (o.lite ? "lite" : "main");
  return {
    id: `app.onetake2.${idSuffix}`,
    version: VERSION,
    name: cc?.n || (o.tv ? `${ADDON_NAME} TV` : ADDON_NAME),
    description: "1take2 - تعريب كامل للقصص والحلقات والتصنيفات، بحث عربي، دعم TMDB و IMDb و MDBList، وترجمات عربية",
    resources: o.lite ? ["catalog", "meta", "subtitles"] : ["catalog", "meta", "subtitles", "stream"],
    types: ["movie", "series", "anime"],
    idPrefixes: ["tt", "kitsu:", "tmdb:", "tmdb"],
    catalogs,
    behaviorHints: { configurable: true, configurationRequired: false }
  };
}

// =========================================================================
// 12. موجه الخادم الرئيسي (Master Route Handler) — خاص بمفتاح وصول
// =========================================================================

let warnedKey = false;

export default async function handler(req, res) {
  try {
    applySecurityHeaders(req, res);
    res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=900, stale-while-revalidate=3600");

    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "GET" && req.method !== "HEAD") return res.status(405).end();

    const ip = clientIp(req);
    if (hit(rateMap, ip, 1200, 60000)) {
      res.setHeader("Retry-After", "60");
      res.setHeader("Cache-Control", "no-store");
      return res.status(429).end();
    }

    const rawUrl = req.url || "/";
    const q = rawUrl.indexOf("?");
    const pathPart = q >= 0 ? rawUrl.slice(0, q) : rawUrl;
    const queryPart = q >= 0 ? rawUrl.slice(q + 1) : "";
    const rawSegs = pathPart.split("/").filter(Boolean);

    // robots.txt: منع الفهرسة (الوحيد المتاح بدون مفتاح)
    if (rawSegs.length === 1 && rawSegs[0] === "robots.txt") {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      return res.status(200).send("User-agent: *\nDisallow: /\n");
    }

    // ---- بوابة الخصوصية ----
    res.setHeader("Vary", "Accept-Encoding");
    if (!KEY_VALID) {
      if (!warnedKey) { warnedKey = true; console.error("[1take2] ACCESS_KEY غير مضبوط أو غير صالح (12-64 حرفاً A-Z a-z 0-9 _ -). الخدمة مغلقة."); }
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      return res.status(503).send("Service unavailable");
    }
    if (rawSegs[0] === "api") rawSegs.shift();
    const denied = () => {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      return res.status(404).send("Not found");
    };
    if (peekBlocked(ip)) { res.setHeader("Retry-After", "600"); res.setHeader("Cache-Control", "no-store"); return res.status(429).end(); }
    if (KEY_ON && (!rawSegs[0] || !safeEq(safeDecode(rawSegs[0]), ACCESS_KEY))) {
      hit(failMap, ip, 12, 10 * 60 * 1000);
      return denied();
    }

    const rawRest = KEY_ON ? rawSegs.slice(1) : rawSegs;
    const rest = rawRest.map(safeDecode);

    // ---- المعدّلات: ديبريد / خيارات / تبويب (بأي ترتيب) ----
    let debrid = null, cfgTokens = [], tab = null, custom = null;
    const flags = {};
    let i = 0;
    for (; i < rest.length; i++) {
      const s = rest[i];
      let m;
      if ((m = s.match(SEG_DEBRID))) debrid = { provider: m[1].toLowerCase(), token: m[2] };
      else if ((m = s.match(SEG_CFG))) cfgTokens = m[1].toLowerCase().split(".").filter(Boolean);
      else if ((m = s.match(/^c=([A-Za-z0-9_-]{2,7000})$/))) custom = parseCustom(m[1]);
      else if (/^(lite|nostream)$/i.test(s)) flags.lite = true;
      else if (/^tv$/i.test(s)) flags.tv = true;
      else if (SEG_TAB.test(s)) { const r = s.toLowerCase(); tab = TAB_ALIAS[r] || r; }
      else break;
    }
    const o = buildOptions(flags, cfgTokens);
    o.cc = custom;
    const tail = rest.slice(i);
    const rawTail = rawRest.slice(i);
    const route = (tail[0] || "").replace(/\.json$/i, "").toLowerCase();
    const debridUrl = debrid ? `${TORRENTIO}/qualityfilter=scr,cam|${debrid.provider}=${debrid.token}` : null;
    const host = cleanHost(String(req.headers["x-forwarded-host"] || req.headers.host || "localhost").split(",")[0].trim());

    // ---- Manifest ----
    if (route === "manifest") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      const { countryName } = getUserRegionInfo(req);
      return res.status(200).json(buildManifest(o, tab, countryName));
    }

    // ---- صفحة التثبيت ----
    if (route === "" || route === "configure") {
      const nonce = randomBytes(16).toString("base64");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Security-Policy",
        `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`);
      return res.status(200).send(renderConfigPage(host, ACCESS_KEY, nonce, getUserRegionInfo(req).countryName));
    }

    // ---- الفحص الصحي (معطّل افتراضياً) ----
    if (route === "health") {
      if (!ENABLE_HEALTH) return denied();
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      const providers = {};
      for (const [h, st] of healthMetrics) providers[h] = { fails: st.fails, healthy: !(st.fails >= 5 && Date.now() - st.lastFail < 25000) };
      return res.status(200).json({ status: "ok", version: VERSION, tmdb: Boolean(TMDB_API_KEY), persistentCache: KV_ON, p2p: ENABLE_P2P, cacheEntries: memoryCache.size, providers });
    }

    const type = tail[1] || "movie";
    const id = (tail[2] || "").replace(/\.json$/i, "");

    // ---- الكتالوجات ----
    if (route === "catalog") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      if (!TYPES.has(type) || !CAT_RE.test(id)) return res.status(200).json({ metas: [] });

      const extraRaw = (rawTail[3] || "").replace(/\.json$/i, "");
      const extra = parseExtra(extraRaw || queryPart);
      const { countryCode } = getUserRegionInfo(req);
      const daySeed = Math.floor(Date.now() / (12 * 60 * 60 * 1000));
      const cacheKey = `cat_v21_${o.tv ? "tv" : "d"}_${o.cc ? o.cc.hk : "x"}_${o.catMax}_${type}_${id}_${countryCode}_${daySeed}_${upstreamExtraSuffix(extra)}`;

      const fresh = getFromCache(cacheKey, false);
      if (fresh) return res.status(200).json(fresh);

      const payload = await catalogPayload(type, id, extra, o, countryCode);
      if (payload.metas.length === 0) {
        const stale = getFromCache(cacheKey, true, CACHE_TTL_CAT * 3);
        if (stale) return res.status(200).json(stale);
        res.setHeader("Cache-Control", "public, max-age=30, s-maxage=60");
        return res.status(200).json(payload);
      }
      saveToCache(cacheKey, payload, CACHE_TTL_CAT);
      return res.status(200).json(payload);
    }

    // ---- صفحة التفاصيل ----
    if (route === "meta") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      if (!TYPES.has(type) || !ID_RE.test(id)) return res.status(200).json({ meta: null });
      const { payload, partial } = await getMetaPayload(type, id);
      if (partial) res.setHeader("Cache-Control", "public, max-age=30, s-maxage=120");
      return res.status(200).json(payload?.meta ? { meta: shapeMeta(payload.meta, o) } : payload);
    }

    // ---- الترجمات العربية ----
    if (route === "subtitles") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      if (!TYPES.has(type) || !ID_RE.test(id)) return res.status(200).json({ subtitles: [] });

      let subId = id;
      if (subId.startsWith("tmdb:")) {
        const p = subId.split(":");
        const imdb = await resolveTmdbToImdb(p[1], type);
        if (imdb) subId = p.length > 2 ? `${imdb}:${p[2]}:${p[3] || 1}` : imdb;
      }

      const extraSub = (rawTail[3] || "").replace(/\.json$/i, "");
      const safeExtra = /^[A-Za-z0-9=&._%-]{1,200}$/.test(extraSub) ? extraSub : "";
      const cacheKey = `subs_v21_${type}_${subId}_${safeExtra}_${o.subsMax}`;
      const cachedSubs = getFromCache(cacheKey, true, CACHE_TTL_META);
      if (cachedSubs) return res.status(200).json({ subtitles: cachedSubs });

      const targetSubUrl = `${UPSTREAM_ADDONS.opensubtitlesV3}/subtitles/${type}/${subId}${safeExtra ? "/" + safeExtra : ""}.json`;
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

      const finalSubs = subtitles.slice(0, o.subsMax);
      if (finalSubs.length) saveToCache(cacheKey, finalSubs, CACHE_TTL_META);
      return res.status(200).json({ subtitles: finalSubs });
    }

    // ---- البث المباشر ----
    if (route === "stream") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=120, s-maxage=300, stale-while-revalidate=900");
      if (!TYPES.has(type) || !ID_RE.test(id)) return res.status(200).json({ streams: [] });

      const list = await getStreamList(type, id, debridUrl);
      const def = tab ? TABS[tab] : null;
      const filtered = def ? list.filter(def.test) : list;
      const finalStreams = applyStreamOptions(filtered, o).slice(0, o.maxStreams).map(s => renderStream(s, o));
      if (finalStreams.length === 0) res.setHeader("Cache-Control", "public, max-age=15, s-maxage=30");
      return res.status(200).json({ streams: finalStreams });
    }

    return denied();
  } catch {
    if (!res.headersSent) {
      try { res.setHeader("Content-Type", "application/json; charset=utf-8"); } catch { /* تجاهل */ }
      return res.status(200).json({ streams: [], metas: [], subtitles: [] });
    }
  }
}

// =========================================================================
// 13. تشغيل مستقل (Node.js) — مع gzip و ETag وحدود مهلة
// =========================================================================

function decorate(req, res) {
  if (typeof res.status === "function") return;
  res.status = c => { res.statusCode = c; return res; };
  const send = (body, ctype) => {
    if (ctype && !res.getHeader("Content-Type")) res.setHeader("Content-Type", ctype);
    const buf = Buffer.from(body, "utf8");
    const noBody = req.method === "HEAD";
    if (res.statusCode === 200 && req.method === "GET" && !String(res.getHeader("Cache-Control")).includes("no-store")) {
      const etag = `W/"${hashStr(body)}"`;
      res.setHeader("ETag", etag);
      if (req.headers["if-none-match"] === etag) { res.statusCode = 304; return res.end(); }
    }
    if (buf.length > 1024 && /\bgzip\b/.test(String(req.headers["accept-encoding"] || ""))) {
      return zlib.gzip(buf, (err, z) => {
        if (err) { res.setHeader("Content-Length", buf.length); return res.end(noBody ? undefined : buf); }
        res.setHeader("Content-Encoding", "gzip");
        res.setHeader("Content-Length", z.length);
        res.end(noBody ? undefined : z);
      });
    }
    res.setHeader("Content-Length", buf.length);
    res.end(noBody ? undefined : buf);
  };
  res.json = o => send(JSON.stringify(o), "application/json; charset=utf-8");
  res.send = s => send(String(s), "text/html; charset=utf-8");
}

const isMain = (() => {
  if (process.env.STANDALONE === "1") return true;
  try { return Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === resolvePath(process.argv[1]); } catch { return false; }
})();

if (isMain) {
  const PORT = Number(process.env.PORT) || 3000;
  const HOST = process.env.HOST || "0.0.0.0";
  const server = http.createServer((req, res) => { decorate(req, res); handler(req, res); });
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  server.keepAliveTimeout = 65000;
  server.listen(PORT, HOST, () => {
    console.log(`\n${ADDON_NAME} v${VERSION} يعمل على المنفذ ${PORT}`);
    if (!KEY_ON) console.log(`صفحة التثبيت:  http://localhost:${PORT}/   (⚠ الوضع مفتوح: لا يوجد ACCESS_KEY)`);
    else if (KEY_VALID) console.log(`صفحة التثبيت:  http://localhost:${PORT}/<ACCESS_KEY>/`);
    else console.log(`⚠ ACCESS_KEY غير صالح (12-64 حرفاً A-Z a-z 0-9 _ -). اقتراح: ${randomBytes(18).toString("base64url")}`);
    if (!TMDB_API_KEY) console.log("ℹ TMDB_API_KEY غير مضبوط: التعريب الرسمي والكتالوجات التركية/الكورية/المصرية معطّلة.");
  });
}
