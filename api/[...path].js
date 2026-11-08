// =========================================================================
// 1take2 v26.0.0 - Grand Imperial Ultimate Edition (النسخة الإمبراطورية الأسطورية)
// تعريب استوديوهات TMDB، ترجمات متزامنة، محرك فك ترميز CP-1256 فوري، دعم متعدد لسيرفرات
// الدبريد (Real-Debrid, TorBox, AllDebrid, Premiumize) ومجمّع روابط التورنت المتوازي
// + المنظومة السباعية الكاملة للتقييمات العالمية (IMDb, RT, Metacritic, Letterboxd, Trakt, TMDB)
// ودعم بوسترات تقييمات RPDB (Rating Poster Database)
// =========================================================================

/*
 * فهرس التطويرات والتقييمات الشاملة:
 * -------------------------------------------------------------
 * 1. منظومة التقييمات العالمية السباعية الشاملة:
 *    [79 Ⓜ️ Metacritic] [90% 🍿 RT Popcorn] [96% 🍅 RT Critics] [3.7 🟢 Letterboxd]
 *    [76 🔴 Trakt] [74 🟦 TheMovieDB] [7.5 ⭐ IMDb]
 *    - عرض شريط التقييمات السباعي أعلى قصة العمل المعربة في صفحة التفاصيل.
 *    - إضافة أزرار وشرائح التقييمات التفاعلية في meta.links مباشرة تحت العنوان.
 *    - دعم مفتاح RPDB (Rating Poster Database) لعرض شريط التقييمات على البوسترات مباشرة.
 * 2. تعريب شامل لكافة قصص وعناوين الحلقات والمواسم بلا نصوص فارغة أو إنجليزية.
 * 3. مصحح ترميز الترجمات الفوري: تحويل CP-1256 إلى UTF-8 نقي عبر مسار /sub-proxy.
 * 4. دعم متزامن لـ TorBox و Real-Debrid و AllDebrid و Premiumize وفاحص المفاتيح الحي.
 * 5. مجمّع التورنت المتوازي مع كشف الدبلجة العربية [🎙️ مدبلج] والترجمة المدمجة [💬 مترجم].
 * 6. 14 كتالوجاً عربياً وعالمياً متخصصاً (سينما، مسلسلات، تركي، كوري، رمضان، أطفال، IMDb 250).
 */

const ADDON_NAME = "1take2";
const VERSION = "27.0.0";

// مفاتيح TMDB الرسمية المعتمدة للتعريب السينمائي المباشر
const TMDB_API_KEY = process.env.TMDB_API_KEY || "4e44d9029b1270a757cddc766a1bcb63";
const TMDB_BASE = "https://api.themoviedb.org/3";

// كتالوجات Nuvio
const NUVIO_URL = (process.env.NUVIO_URL || "https://catalog.nuvio.tv").replace(/\/manifest\.json$/i, "").replace(/\/+$/, "");

// رابط TorBox الافتراضي لتوفير بث سحابي جاهز وفوري
const DEFAULT_TORBOX_URL = "https://torrentio.strem.fun/qualityfilter=scr,cam|torbox=3183a8fd-2d85-41fb-a58d-39c5737efae3";
const UPSTREAM_URL = (process.env.UPSTREAM_URL || DEFAULT_TORBOX_URL).replace(/\/manifest\.json$/i, "").replace(/\/+$/, "");

// مفاتيح OMDb الاحتياطية للتقييمات
const OMDB_KEYS = ["trilogy", "b704c340", "e3c79c85", "7aa10565"];

// تفعيل روابط التورنت المباشرة P2P
const ENABLE_P2P = process.env.ENABLE_P2P !== "0";

// مدد الذاكرة المؤقتة (TTLs)
const CACHE_TTL_STREAM = 25 * 60 * 1000;          // 25 دقيقة للروابط
const CACHE_TTL_META = 6 * 60 * 60 * 1000;        // 6 ساعات لصفحات التفاصيل
const CACHE_TTL_CAT = 90 * 60 * 1000;             // ساعة ونصف للكتالوجات
const CACHE_TTL_TRANS = 45 * 24 * 60 * 60 * 1000; // 45 يوماً للترجمات
const CACHE_TTL_RATINGS = 24 * 60 * 60 * 1000;    // 24 ساعة للتقييمات
const STALE_TTL = 36 * 60 * 60 * 1000;            // 36 ساعة كاش احتياطي للتعافي الفوري
const TIMEOUT_MS = 3800;

// كاش سحابي دائم اختياري (Upstash Redis أو Vercel KV)
const KV_URL = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "").replace(/\/+$/, "");
const KV_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
const KV_ON = Boolean(KV_URL && KV_TOKEN);

// المزودات المعتمدة عالية التوافر
const UPSTREAM_ADDONS = {
  cinemeta: "https://v3-cinemeta.strem.io",
  nuvio: NUVIO_URL,
  animeKitsu: "https://anime-kitsu.strem.fun",
  torrentio: UPSTREAM_URL,
  knightcrawler: "https://knightcrawler.elfhosted.com",
  mediafusion: "https://mediafusion.elfhosted.com",
  webstreamr: "https://webstreamr.hayd.uk",
  publicDomain: "https://caching.stremio.net/publicdomainmovies.now.sh",
  opensubtitlesV3: "https://opensubtitles-v3.strem.io"
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

// =========================================================================
// 1. تصنيفات Nuvio والكتالوجات الاستعراضية العربية الكبرى
// =========================================================================

const NV_MOVIE_GENRES = ["Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary", "Drama", "Family", "Fantasy", "History", "Horror", "Music", "Mystery", "Romance", "Science Fiction", "TV Movie", "Thriller", "War", "Western"];
const NV_SERIES_GENRES = ["Action & Adventure", "Animation", "Comedy", "Crime", "Documentary", "Drama", "Family", "Kids", "Mystery", "News", "Reality", "Sci-Fi & Fantasy", "Soap", "Talk", "War & Politics", "Western"];
const NV_YEARS = Array.from({ length: 38 }, (_, i) => String(2026 - i));
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

// الكتالوجات الاستعراضية العربية الحصرية الكبرى
function spotlightCatalogs(countryName = "منطقتك") {
  return [
    { type: "movie", id: "top10_region_movies", name: `🔥 أفضل 10 أفلام في ${countryName}` },
    { type: "series", id: "top10_region_series", name: `🔥 أفضل 10 مسلسلات في ${countryName}` },
    { type: "movie", id: "trending_daily_movies", name: "⚡ ترند اليوم - سينما", extra: [{ name: "skip", isRequired: false }] },
    { type: "series", id: "trending_daily_series", name: "⚡ ترند اليوم - تلفزيون", extra: [{ name: "skip", isRequired: false }] },
    { type: "movie", id: "arabic_movies_spotlight", name: "🎬 سينما عربية (أحدث الأفلام)", extra: [{ name: "skip", isRequired: false }] },
    { type: "series", id: "arabic_series_spotlight", name: "📺 مسلسلات عربية شهيرة", extra: [{ name: "skip", isRequired: false }] },
    { type: "series", id: "turkish_dramas_spotlight", name: "🏰 دراما تركية تاريخية ومعاصرة", extra: [{ name: "skip", isRequired: false }] },
    { type: "series", id: "kdrama_spotlight", name: "🌸 دراما كورية مترجمة (K-Drama)", extra: [{ name: "skip", isRequired: false }] },
    { type: "series", id: "anime_trending", name: "⚔️ أنمي - رائج ومميز عالمياً", extra: [{ name: "skip", isRequired: false }] },
    { type: "series", id: "ramadan_specials", name: "🌙 روائع دراما رمضان", extra: [{ name: "skip", isRequired: false }] },
    { type: "movie", id: "egyptian_classics", name: "🏛️ كلاسيكيات السينما المصرية", extra: [{ name: "skip", isRequired: false }] },
    { type: "movie", id: "kids_family_arabic", name: "🎈 سينما الأطفال والكرتون المدبلج", extra: [{ name: "skip", isRequired: false }] },
    { type: "movie", id: "top_imdb_arabic", name: "⭐ أعلى 250 فيلماً في التاريخ (IMDb)", extra: [{ name: "skip", isRequired: false }] },
    { type: "movie", id: "documentary_arabic", name: "🌍 وثائقيات عالمية مدبلجة ومترجمة", extra: [{ name: "skip", isRequired: false }] }
  ];
}

// =========================================================================
// 2. إدارة الذاكرة المؤقتة الذكية، عوازل الأعطال، وحماية المزودات
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
    if (memoryCache.size > 7000) {
      const oldestKeys = Array.from(memoryCache.keys()).slice(0, 1800);
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

function isHostHealthy(host) {
  const stat = healthMetrics.get(host);
  if (!stat) return true;
  if (stat.fails >= 6 && Date.now() - stat.lastFail < 30000) return false;
  return true;
}

// غلاف حماية المهلة الزمنية الصارمة
async function withDeadline(promise, ms = TIMEOUT_MS) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("Timeout")), ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchT(url, opts = {}, ms = TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

// طلب آمن يدمج حماية الانهيارات ومؤشرات الصحة
async function safeFetchJson(url, opts = {}, ms = TIMEOUT_MS) {
  try {
    const host = new URL(url).hostname;
    if (!isHostHealthy(host)) return null;

    const res = await fetchT(url, opts, ms);
    if (!res.ok) {
      recordProviderStatus(host, false);
      return null;
    }
    recordProviderStatus(host, true);
    return await res.json();
  } catch {
    try { recordProviderStatus(new URL(url).hostname, false); } catch {}
    return null;
  }
}

// =========================================================================
// 3. التعريب الشامل: كشف اللغة، معجم سينمائي غني، ومحركات ترجمة سريعة
// =========================================================================

function isTextArabic(text) {
  if (!text || typeof text !== "string") return false;
  const cleaned = text.replace(/[\s\d\p{P}\p{S}]/gu, "");
  if (!cleaned) return false;
  const arabicLetters = (cleaned.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g) || []).length;
  return (arabicLetters / cleaned.length) >= 0.42;
}

function hasArabic(text) {
  return /[\u0600-\u06FF]/.test(String(text || ""));
}

function stripAllEmojis(str) {
  return String(str || "").replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/gu, "").trim();
}

function hashStr(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

// قاموس الأنواع السينمائية
const GENRE_AR_MAP = {
  Action: "أكشن",
  Adventure: "مغامرة",
  Animation: "رسوم متحركة",
  Comedy: "كوميديا",
  Crime: "جريمة",
  Documentary: "وثائقي",
  Drama: "دراما",
  Family: "عائلي",
  Fantasy: "فانتازيا",
  History: "تاريخي",
  Horror: "رعب",
  Music: "موسيقى",
  Mystery: "غموض",
  Romance: "رومانسي",
  "Science Fiction": "خيال علمي",
  "TV Movie": "فيلم تلفزيوني",
  Thriller: "إثارة وتشويق",
  War: "حرب",
  Western: "غرب أمريكي",
  "Action & Adventure": "أكشن ومغامرة",
  Kids: "أطفال",
  News: "أخبار",
  Reality: "واقعي",
  "Sci-Fi & Fantasy": "خيال وفانتازيا",
  Soap: "دراما عاطفية",
  Talk: "حوار",
  "War & Politics": "حرب وسياسة"
};

// معجم المصطلحات السينمائية المتقدم
const CINEMA_TERMS_MAP = {
  pilot: "الحلقة الافتتاحية",
  "season finale": "ختام الموسم",
  "mid-season finale": "ختام منتصف الموسم",
  "series finale": "ختام المسلسل",
  finale: "الحلقة الختامية",
  prequel: "عمل سابق للأحداث",
  sequel: "جزء مكمل",
  "spin-off": "عمل مشتق",
  reboot: "إعادة إنتاج",
  remake: "نسخة جديدة",
  special: "حلقة خاصة",
  prologue: "المقدمة التمهيدية",
  epilogue: "الخاتمة"
};

// قاموس عناوين الأنمي اليابانية الشهيرة
const ANIME_TITLES_MAP = {
  "shingeki no kyojin": "هجوم العمالقة",
  "attack on titan": "هجوم العمالقة",
  "kimetsu no yaiba": "قاتل الشياطين",
  "demon slayer": "قاتل الشياطين",
  "jujutsu kaisen": "جوجوتسو كايسن",
  "boku no hero academia": "أكاديميتي للأبطال",
  "my hero academia": "أكاديميتي للأبطال",
  "one piece": "ون بيس",
  "naruto shippuden": "ناروتو شيبودن",
  naruto: "ناروتو",
  bleach: "بليتش",
  "death note": "مذكرة الموت",
  "hunter x hunter": "القناص (هنتر x هنتر)",
  "fullmetal alchemist": "الخيميائي الفولاذي",
  "chainsaw man": "رجل المنشار",
  "solo leveling": "سولو ليفلينج (الارتقاء المنفرد)",
  "vinland saga": "ملحمة فينلاند",
  "tokyo ghoul": "طوكيو غول",
  "one punch man": "ون بنش مان",
  "dr. stone": "دكتور ستون",
  "black clover": "بلاك كلوفر",
  "fairy tail": "فيري تيل",
  "dragon ball z": "دراغون بول زد",
  "dragon ball super": "دراغون بول سوبر"
};

function localizeGenres(arr) {
  if (!Array.isArray(arr)) return arr;
  return arr.map(g => (typeof g === "string" ? GENRE_AR_MAP[g] || g : g));
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const cur = idx++;
      try { results[cur] = await fn(items[cur], cur); }
      catch { results[cur] = null; }
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// محركات الترجمة خماسية المستويات
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

const MYMEMORY_EMAILS = [
  "stremio.arab.addon@gmail.com",
  "stremio.arab.pro@gmail.com",
  "arabic.cinemeta.v2@gmail.com",
  "arab.media.hub@gmail.com",
  "arab.stremio.vip@gmail.com"
];

async function engineMyMemory(text, ms) {
  try {
    const clean = text.slice(0, 480);
    const email = MYMEMORY_EMAILS[Math.floor(Math.random() * MYMEMORY_EMAILS.length)];
    const res = await fetchT(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(clean)}&langpair=en|ar&de=${encodeURIComponent(email)}`, {}, ms);
    if (!res.ok) return null;
    const data = await res.json();
    const t = data?.responseData?.translatedText;
    if (typeof t === "string" && isTextArabic(t) && !t.includes("MYMEMORY WARNING")) return t.trim();
  } catch {
    // تجاهل
  }
  return null;
}

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

function cleanTranslatedText(str) {
  if (!str || typeof str !== "string") return str;
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&hellip;/g, "...")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/\s+/g, " ")
    .trim();
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

  const lowClean = clean.toLowerCase();
  if (CINEMA_TERMS_MAP[lowClean]) return CINEMA_TERMS_MAP[lowClean];
  if (ANIME_TITLES_MAP[lowClean]) return ANIME_TITLES_MAP[lowClean];

  const cacheKey = `tr_v26_${hashStr(clean)}`;
  const cached = getFromCache(cacheKey, true, CACHE_TTL_TRANS);
  if (cached && isTextArabic(cached)) return cached;

  if (KV_ON && deadline - Date.now() > 800) {
    const kv = await kvGetJson(`tr_v26_${hashStr(clean)}`);
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
        const cleanedOut = cleanTranslatedText(out);
        saveToCache(cacheKey, cleanedOut, CACHE_TTL_TRANS);
        kvSetJson(`tr_v26_${hashStr(clean)}`, cleanedOut, 60 * 60 * 24 * 45);
        return cleanedOut;
      }
    } catch {
      // تجربة المحرك التالي
    }
  }
  return clean;
}

async function translateMany(texts, { limit = 8, budgetMs = 5000 } = {}) {
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
  const c = getFromCache(`tr_v26_${hashStr(clean)}`, true, CACHE_TTL_TRANS);
  return c && isTextArabic(c) ? c : null;
}

async function fetchArabicWikipediaSummary(title) {
  if (!title) return null;
  try {
    const cleanTitle = title.replace(/\(.*?\)/g, "").trim();
    const url = `https://ar.wikipedia.org/w/api.php?action=query&format=json&prop=extracts&exintro=1&explaintext=1&titles=${encodeURIComponent(cleanTitle)}|${encodeURIComponent(cleanTitle + " (فيلم)")}|${encodeURIComponent(cleanTitle + " (مسلسل)")}`;
    const data = await safeFetchJson(url, {}, 2600);
    const pages = data?.query?.pages || {};
    for (const k of Object.keys(pages)) {
      if (k !== "-1" && pages[k]?.extract && isTextArabic(pages[k].extract)) {
        return pages[k].extract.slice(0, 1000).trim();
      }
    }
  } catch {
    // تجاهل آمن
  }
  return null;
}

// =========================================================================
// 4. تكامل MDBList API الرسمي للتقييمات العالمية
// =========================================================================

const MDBLIST_API_KEY_DEFAULT = process.env.MDBLIST_API_KEY || "";

async function fetchMdblistRatings(imdbId, mdblistKey = null) {
  const key = mdblistKey || MDBLIST_API_KEY_DEFAULT;
  if (!key || !imdbId || !imdbId.startsWith("tt")) return null;

  const cacheKey = `mdblist_v27_${imdbId}`;
  const hit = getFromCache(cacheKey, true, CACHE_TTL_RATINGS);
  if (hit) return hit;

  try {
    const data = await safeFetchJson(`https://mdblist.com/api/?apikey=${encodeURIComponent(key)}&i=${imdbId}`, {}, 3200);
    if (!data || !Array.isArray(data.ratings)) return null;

    const result = {
      score: data.score || null,
      imdb: null,
      metacritic: null,
      trakt: null,
      tomatoes: null,
      tomatoesaudience: null,
      tmdb: null,
      letterboxd: null
    };

    for (const r of data.ratings) {
      if (!r || !r.source) continue;
      const s = r.source.toLowerCase();
      if (s === "imdb" && r.value) result.imdb = `${r.value}`;
      else if (s === "metacritic" && r.value) result.metacritic = `${r.value}`;
      else if (s === "trakt" && (r.score !== undefined || r.value !== undefined)) result.trakt = `${r.score ?? r.value}%`;
      else if (s === "tomatoes" && (r.score !== undefined || r.value !== undefined)) result.tomatoes = `${r.score ?? r.value}%`;
      else if (s === "tomatoesaudience" && (r.score !== undefined || r.value !== undefined)) result.tomatoesaudience = `${r.score ?? r.value}%`;
      else if (s === "tmdb" && (r.score !== undefined || r.value !== undefined)) result.tmdb = `${r.score ?? r.value}%`;
      else if (s === "letterboxd" && r.value) result.letterboxd = `${r.value}`;
    }

    saveToCache(cacheKey, result, CACHE_TTL_RATINGS);
    return result;
  } catch {
    return null;
  }
}

// =========================================================================
// 5. المحرك الإمبراطوري لاستوديوهات TMDB ودعم المواسم اللانهائية
// =========================================================================

const TV_STATUS_AR_MAP = {
  "Returning Series": "🟢 مستمر (مواسم قادمة)",
  Ended: "⚪ مكتمل ومنتهي",
  Canceled: "🔴 ملغى رسمياً",
  "In Production": "🟡 قيد الإنتاج والتصوير",
  Planned: "🔵 مخطط للإنتاج"
};

async function fetchTmdbArabic(type, rawId) {
  if (!rawId) return null;
  const id = String(rawId).trim();
  const cacheKey = `tmdb_ar_v26_${type}_${id}`;
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
      tagline: mainData.tagline || null,
      poster: mainData.poster_path ? `https://image.tmdb.org/t/p/w500${mainData.poster_path}` : null,
      backdrop: mainData.backdrop_path ? `https://image.tmdb.org/t/p/original${mainData.backdrop_path}` : null,
      status: TV_STATUS_AR_MAP[mainData.status] || mainData.status || null,
      runtime: mainData.runtime ? `${Math.floor(mainData.runtime / 60)} س و ${mainData.runtime % 60} د` : null,
      voteAverage: mainData.vote_average ? String(Math.round(mainData.vote_average * 10) / 10) : null,
      episodesMap: new Map()
    };

    if (tmdbType === "tv" && tmdbId) {
      const appendSeasons = Array.from({ length: 8 }, (_, i) => `season/${i + 1}`).join(",");
      const tvFull = await safeFetchJson(
        `${TMDB_BASE}/tv/${tmdbId}?language=ar-SA&append_to_response=${appendSeasons}&api_key=${TMDB_API_KEY}`,
        {},
        3500
      );
      if (tvFull) {
        if (!result.overview && tvFull.overview) result.overview = tvFull.overview;
        if (!result.tagline && tvFull.tagline) result.tagline = tvFull.tagline;

        const maxSeasons = Math.min(tvFull.number_of_seasons || 8, 25);
        for (let s = 1; s <= 8; s++) {
          const seasonData = tvFull[`season/${s}`];
          if (seasonData?.episodes) {
            for (const ep of seasonData.episodes) {
              result.episodesMap.set(`${s}:${ep.episode_number}`, {
                name: ep.name,
                overview: ep.overview,
                thumbnail: ep.still_path ? `https://image.tmdb.org/t/p/w500${ep.still_path}` : null
              });
            }
          }
        }

        if (maxSeasons > 8) {
          const extraSeasons = Array.from({ length: maxSeasons - 8 }, (_, i) => i + 9);
          const extraJobs = extraSeasons.slice(0, 6).map(sNum =>
            safeFetchJson(`${TMDB_BASE}/tv/${tmdbId}/season/${sNum}?language=ar-SA&api_key=${TMDB_API_KEY}`, {}, 2800)
          );
          const extraResults = await Promise.all(extraJobs);
          extraResults.forEach((sData, idx) => {
            const sNum = extraSeasons[idx];
            if (sData?.episodes) {
              for (const ep of sData.episodes) {
                result.episodesMap.set(`${sNum}:${ep.episode_number}`, {
                  name: ep.name,
                  overview: ep.overview,
                  thumbnail: ep.still_path ? `https://image.tmdb.org/t/p/w500${ep.still_path}` : null
                });
              }
            }
          });
        }
      }
    }

    saveToCache(cacheKey, result, CACHE_TTL_TRANS);
    return result;
  } catch {
    return null;
  }
}

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
    } else if (i < 20) {
      toTranslate.push({ idx: i, text: plot });
    }
  });

  if (toTranslate.length > 0) {
    const translated = await translateMany(toTranslate.map(t => t.text), { limit: 8, budgetMs: 3200 });
    translated.forEach((arText, k) => {
      if (arText && isTextArabic(arText)) {
        applyPlot(prepared[toTranslate[k].idx], arText);
      }
    });
  }

  return { items: prepared, complete: true };
}

// =========================================================================
// 6. محولات ومعالجات المعرفات الفورية (Universal ID Resolvers)
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
    // تجاهل آمن
  }
  return null;
}

// =========================================================================
// 7. هندسة وتحليل الروابط: الدقة، كوديكات الصوت، تقنيات الصورة، وشارات الدبلجة
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

function formatBytesArabic(bytes) {
  if (!bytes || bytes <= 0) return "";
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `💾 ${gb.toFixed(1)} جيجابايت`;
  const mb = bytes / (1024 * 1024);
  return `💾 ${mb.toFixed(0)} ميجابايت`;
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
  const headers = req?.headers || {};
  const countryCode = (
    headers["x-vercel-ip-country"] ||
    headers["cf-ipcountry"] ||
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
    else if (/خليجي|🇸🇦|🇦🇪/i.test(full)) arabicDialect = "دبلجة خليجية";
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

function detectSubtitlesInTorrent(full) {
  if (/\b(ar-sub|arabic[\s._-]?sub|subbed[\s._-]?ar|ar\.srt)\b|مترجم/i.test(full)) {
    return "💬 مترجم للعربية";
  }
  return "";
}

const RES_GROUP = { "8K": "4K", "4K": "4K", "2K": "1080p", "1080p": "1080p", "720p": "720p", "480p": "480p" };

const TABS = {
  "4k":     { label: "4K",         desc: "روابط 4K فائقة الوضوح فقط",            test: i => i._group === "4K" },
  "1080p":  { label: "1080p",      desc: "روابط Full HD 1080p فقط",               test: i => i._group === "1080p" },
  "hdr":    { label: "HDR",        desc: "روابط HDR / Dolby Vision بأي دقة",       test: i => i._hdr },
  "720p":   { label: "720p",       desc: "روابط 720p خفيفة ومستقرة",             test: i => i._group === "720p" },
  "480p":   { label: "480p",       desc: "روابط 480p موفرة للبيانات",             test: i => i._group === "480p" },
  "arabic": { label: "صوت عربي",   desc: "روابط بدبلجة أو صوت عربي فقط",          test: i => i._ar },
  "cached": { label: "فوري سحابي", desc: "روابط جاهزة على السحابة تبدأ فوراً",    test: i => i._status === "instant" },
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
    const isInstantDebrid = /\[(RD\+|TB\+|AD\+|PM\+|DL\+)\]/i.test(rawName) || /\b(cached|instant)\b/i.test(rawName);

    let status = isInstantDebrid ? "instant" : "instant";
    if (isDownload) status = "download";
    else if (!stream.url && stream.infoHash) status = "p2p";
    if (status === "p2p" && !ENABLE_P2P) return null;

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

    let ripBonus = 100;
    let source = "";
    if (/\b(Remux|BD-?Remux)\b/i.test(full)) { ripBonus = 1200; source = "👑 Remux"; }
    else if (/\b(BluRay|Blu-Ray|BDRip|BRRip|BDMV)\b/i.test(full)) { ripBonus = 700; source = "BluRay"; }
    else if (/\b(WEB-DL|WEBDL)\b/i.test(full)) { ripBonus = 500; source = "WEB-DL"; }
    else if (/\b(WEBRip|WEB-Rip|WEB)\b/i.test(full)) { ripBonus = 400; source = "WEB"; }

    let visualBonus = 0;
    let hdr = "";
    let hdrShort = "";
    if (/\b(DV|Dolby[\s.-]?Vision|DoVi)\b/i.test(full)) { visualBonus += 550; hdr = "✨ Dolby Vision"; hdrShort = "DV"; }
    if (/\bHDR10\+|HDR10Plus\b/i.test(full)) { visualBonus += 450; hdr = hdr || "🌈 HDR10+"; hdrShort = hdrShort || "HDR"; }
    else if (/\b(HDR10|HDR)\b/i.test(full)) { visualBonus += 350; hdr = hdr || "🌟 HDR10"; hdrShort = hdrShort || "HDR"; }

    let videoCodec = "";
    if (/\bAV1\b/i.test(full)) videoCodec = "AV1";
    else if (/\b(HEVC|x265|H[\s.]?265)\b/i.test(full)) videoCodec = "HEVC 10bit";
    else if (/\b(x264|H[\s.]?264|AVC)\b/i.test(full)) videoCodec = "AVC";

    let audioBonus = 0;
    let audioCodec = "";
    if (/\bAtmos\b/i.test(full)) { audioBonus += 450; audioCodec = "🔊 Atmos"; }
    else if (/\bTrueHD\b/i.test(full)) { audioBonus += 350; audioCodec = "🎧 TrueHD"; }
    else if (/\bDTS[\s.-]?(HD|X)\b/i.test(full)) { audioBonus += 300; audioCodec = "🔉 DTS-HD"; }
    else if (/\b5\.1\b/i.test(full)) { audioBonus += 150; audioCodec = "5.1 Surround"; }

    const sizeMatch = rawTitle.match(/([0-9]+(?:\.[0-9]+)?\s*(?:TB|GB|MB|GiB|MiB))/i) ||
                      rawName.match(/([0-9]+(?:\.[0-9]+)?\s*(?:TB|GB|MB|GiB|MiB))/i);
    const sizeBytes = sizeMatch ? parseSizeBytes(sizeMatch[1]) : 0;
    const arabicSize = formatBytesArabic(sizeBytes);

    const seedersMatch = rawTitle.match(/(?:👤|👥|\bS:?\s*|\bSeeders:?\s*)(\d+)/i);
    const seedersCount = seedersMatch ? parseInt(seedersMatch[1], 10) : 0;

    const audio = detectAudio(full);
    const subBadge = detectSubtitlesInTorrent(full);

    const sizeScore = Math.min((sizeBytes / (1024 * 1024 * 1024)) * 12, 450);
    const peerScore = Math.min(seedersCount * 0.6, 500);
    const arabicBonus = audio.hasArabic ? 4000 : 0;
    const subBonus = subBadge ? 1200 : 0;
    const statusScore = status === "instant" ? 50000 : status === "download" ? 0 : -10000;
    const finalScore = statusScore + arabicBonus + subBonus + resScore + ripBonus + visualBonus + audioBonus + sizeScore + peerScore;

    const statusBadge = status === "instant" ? "⚡ كاش سحابي فوري" : status === "download" ? "⏳ تنزيل سحابي" : `🌐 تورنت P2P (${seedersCount} بذور)`;
    const tags = [statusBadge, source, hdr, videoCodec, audioCodec, arabicSize || (sizeMatch ? sizeMatch[1].replace(/\s+/g, "") : "")].filter(Boolean).join(" • ");
    const headerLine = [audio.label, subBadge].filter(Boolean).join(" • ");
    const desc = `${headerLine}\n${tags}`;

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
// 8. صفحة التثبيت والتهيئة التفاعلية الفخمة (Glassmorphism Arabic Dashboard)
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
<title>${ADDON_NAME} v${VERSION} - النسخة الإمبراطورية الأسطورية</title>
<style>
  :root{--gold:#e5b53a;--gold-glow:rgba(229,181,58,.28);--bg:#07070a;--card:rgba(18,18,26,.88);--card-border:rgba(255,255,255,.09);--text:#e8e8ee;--sub:#9898a8}
  *{box-sizing:border-box;margin:0;padding:0}
  body{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px 16px;background:radial-gradient(ellipse at top, #181828 0%, #0c0c14 55%, var(--bg) 100%);color:var(--text);font-family:"Tajawal","Segoe UI",system-ui,-apple-system,sans-serif;line-height:1.6}
  .card{width:100%;max-width:700px;background:var(--card);backdrop-filter:blur(20px);border:1px solid var(--card-border);border-radius:28px;padding:36px 32px;box-shadow:0 25px 60px rgba(0,0,0,.75)}
  .badge{display:inline-block;padding:6px 16px;background:var(--gold-glow);color:var(--gold);border-radius:20px;font-size:13px;font-weight:700;margin-bottom:14px;border:1px solid rgba(229,181,58,.3)}
  h1{font-size:34px;color:#fff;margin-bottom:6px;font-weight:900;letter-spacing:-.5px}
  h1 span{color:var(--gold)}
  p.lead{color:var(--sub);font-size:15px;margin-bottom:24px}
  .section-title{font-size:16px;color:var(--gold);margin:24px 0 12px;display:flex;align-items:center;gap:8px;font-weight:700}
  .input-box{margin-bottom:16px}
  .input-box label{display:block;font-size:13.5px;color:var(--sub);margin-bottom:6px;font-weight:600}
  .input-group{display:flex;gap:8px}
  .input-group input, .input-group select{padding:13px 16px;background:#151522;border:1px solid var(--card-border);border-radius:12px;color:#fff;font-size:14px;outline:none;transition:border-color .2s;font-family:inherit}
  .input-group select{width:160px;cursor:pointer}
  .input-group input{flex:1}
  .input-group input:focus{border-color:var(--gold)}
  .btn{display:block;width:100%;padding:14px;border-radius:14px;text-align:center;font-weight:800;font-size:15px;text-decoration:none;cursor:pointer;border:0;transition:all .2s;font-family:inherit}
  .btn-gold{background:linear-gradient(135deg, #f7ce68 0%, #d89e1b 100%);color:#08080b}
  .btn-gold:hover{transform:translateY(-2px);box-shadow:0 10px 25px var(--gold-glow)}
  .btn-secondary{background:#1a1a28;color:#ddd;border:1px solid var(--card-border);margin-top:10px}
  .btn-secondary:hover{background:#232338;color:#fff}
  .btn-small{padding:10px 16px;width:auto;font-size:13px;border-radius:10px}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-top:12px}
  .tile{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px 10px;border:1px solid var(--card-border);border-radius:14px;text-decoration:none;color:#fff;background:#141420;text-align:center;transition:all .2s}
  .tile b{font-size:18px;margin-bottom:4px}.tile span{font-size:11.5px;color:var(--sub)}
  .tile.accent{border-color:rgba(229,181,58,.45)}.tile.accent b{color:var(--gold)}
  .tile:hover{transform:translateY(-2px);background:#1d1d2e;border-color:var(--gold)}
  .info-box{margin-top:22px;padding:16px 18px;border-radius:14px;background:#161424;border:1px solid rgba(229,181,58,.25);font-size:13.5px;color:#e8e0cc;line-height:1.7}
  .feature-list{list-style:none;margin-top:8px}
  .feature-list li{margin-bottom:5px;display:flex;align-items:center;gap:6px}
  .qr-wrapper{margin-top:20px;padding:16px;background:#12121e;border-radius:14px;border:1px solid var(--card-border);display:flex;align-items:center;gap:16px}
  .qr-code{width:88px;height:88px;background:#fff;padding:6px;border-radius:8px}
</style>
</head>
<body>
<div class="card">
  <div class="badge">الإصدار 27.0.0 المتكامل • تعريب TMDB ودعم MDBList</div>
  <h1>إضافة <span>${ADDON_NAME}</span></h1>
  <p class="lead">النسخة الذهبية: تعريب استوديوهات TMDB، تكامل MDBList API للتقييمات، ومصحح ترميز الترجمات الفوري.</p>

  <div class="input-box">
    <label for="debridKey">مزود السحب السحابي (اختياري - لتفعيل الكاش الفوري لحسابك الخاص):</label>
    <div class="input-group">
      <select id="debridService">
        <option value="torbox">TorBox</option>
        <option value="realdebrid">Real-Debrid</option>
        <option value="alldebrid">AllDebrid</option>
        <option value="premiumize">Premiumize</option>
      </select>
      <input type="text" id="debridKey" placeholder="الصق مفتاح API الخاص بك هنا أو اتركه فارغاً" oninput="updateLinks()">
      <button class="btn btn-secondary btn-small" type="button" onclick="testDebridKey()">فحص المفتاح</button>
    </div>
    <div id="testStatus" style="font-size:12px;margin-top:6px;display:none;"></div>
  </div>

  <div class="input-box">
    <label for="mdblistKey">مفتاح MDBList API للتقييمات الشاملة (اختياري):</label>
    <div class="input-group">
      <input type="text" id="mdblistKey" placeholder="الصق مفتاح MDBList الخاص بك هنا أو اتركه فارغاً" oninput="updateLinks()">
    </div>
    <div style="font-size:12px;color:var(--sub);margin-top:5px">
      💡 لجلب تقييمات (IMDb, Rotten Tomatoes, Metacritic, Letterboxd, Trakt)، يمكنك الحصول على مفتاح مجاني من <a href="https://mdblist.com/preferences/" target="_blank" style="color:var(--gold);text-decoration:none">mdblist.com/preferences</a>
    </div>
  </div>

  <div class="section-title">1. التثبيت الشامل الكامل (موصى به لجميع المنصات)</div>
  <a class="btn btn-gold" id="mainInstall" href="stremio://${host}/${prefix}manifest.json">🚀 تثبيت ${ADDON_NAME} في تطبيق Stremio</a>
  <a class="btn btn-secondary" id="webInstall" target="_blank" href="https://web.stremio.com/#/addons?addon=https%3A%2F%2F${host}%2F${prefix}manifest.json">🌐 فتح وتثبيت في Stremio Web</a>

  <div class="section-title">2. تبويبات وفلاتر الجودة المخصصة</div>
  <div class="grid">
    ${tile("4k", true)}${tile("1080p", true)}${tile("hdr", true)}
    ${tile("720p")}${tile("arabic", true)}${tile("cached")}
  </div>
  <button class="btn btn-secondary" style="margin-top:12px" onclick="installTabs(this)">⚡ تثبيت كل المربعات بالتتابع في Stremio</button>

  <div class="qr-wrapper">
    <img class="qr-code" alt="QR Code" src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=stremio%3A%2F%2F${host}%2F${prefix}manifest.json">
    <div>
      <b style="color:#fff;font-size:14px;display:block;margin-bottom:3px">تثبيت فوري على شاشات التلفاز الذكية و Android TV</b>
      <span style="font-size:12px;color:var(--sub)">امسح رمز الاستجابة السريعة (QR) بكاميرا هاتفك أو التلفاز لتثبيت الإضافة في ثانية واحدة.</span>
    </div>
  </div>

  <div class="info-box">
    <b>🌟 مزايا الإضافة:</b>
    <ul class="feature-list">
      <li>✅ <b>دعم MDBList API:</b> جلب مباشر للتقييمات المعتمدة (IMDb, Metacritic, Rotten Tomatoes Critics & Audience, Letterboxd, Trakt, TMDB).</li>
      <li>✅ <b>تعريب استوديوهات TMDB الشامل:</b> تعريب كامل لقصص وعناوين الحلقات والمواسم.</li>
      <li>✅ <b>تصحيح فوري لترميز ملفات الترجمة:</b> حل مشاكل الحروف الغريبة لملفات Windows-1256.</li>
      <li>✅ <b>سحب كاش فوري فائق السرعة</b> لمزودي الدبريد (TorBox, Real-Debrid, AllDebrid, Premiumize).</li>
    </ul>
  </div>

  <button class="btn btn-secondary" onclick="copyManifest()">📋 نسخ رابط المانفيست المباشر</button>
</div>

<script>
var baseHost = "${host}";
var tabs = ${JSON.stringify(TAB_ORDER)};

function getCleanToken() {
  return document.getElementById("debridKey").value.trim().replace(/[^a-zA-Z0-9_-]/g, "");
}

function getMdblistToken() {
  return (document.getElementById("mdblistKey")?.value || "").trim().replace(/[^a-zA-Z0-9_-]/g, "");
}

function getServicePrefix() {
  var t = getCleanToken();
  var mdb = getMdblistToken();
  var p = "";
  if (t) {
    var s = document.getElementById("debridService").value;
    p += s + "=" + t + "/";
  }
  if (mdb) {
    p += "mdblist=" + mdb + "/";
  }
  return p;
}

function updateLinks() {
  var p = getServicePrefix();
  document.getElementById("mainInstall").href = "stremio://" + baseHost + "/" + p + "manifest.json";
  document.getElementById("webInstall").href = "https://web.stremio.com/#/addons?addon=https%3A%2F%2F" + baseHost + "%2F" + encodeURIComponent(p + "manifest.json");
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

async function testDebridKey() {
  var t = getCleanToken();
  var s = document.getElementById("debridService").value;
  var statusEl = document.getElementById("testStatus");
  if (!t) {
    statusEl.style.display = "block";
    statusEl.style.color = "#ff6b6b";
    statusEl.innerText = "يرجى كتابة أو لصق المفتاح أولاً.";
    return;
  }
  statusEl.style.display = "block";
  statusEl.style.color = "#e5b53a";
  statusEl.innerText = "جارٍ التحقق من المفتاح...";
  try {
    var res = await fetch("/test-debrid?service=" + s + "&token=" + encodeURIComponent(t));
    var data = await res.json();
    if (data.ok) {
      statusEl.style.color = "#52e389";
      statusEl.innerText = "✅ المفتاح صالح ونشط (" + (data.user || "اشتراك نشط") + ")";
    } else {
      statusEl.style.color = "#ff6b6b";
      statusEl.innerText = "❌ المفتاح غير صالح أو منتهي الصلاحية.";
    }
  } catch (e) {
    statusEl.style.color = "#ff6b6b";
    statusEl.innerText = "تعذر الاتصال بخادم الفحص.";
  }
}

function copyManifest() {
  var p = getServicePrefix();
  navigator.clipboard.writeText("https://" + baseHost + "/" + p + "manifest.json");
  alert("تم نسخ رابط الإضافة بنجاح! الصقه في خانة البحث في تطبيق Stremio.");
}

function installTabs(btn) {
  var p = getServicePrefix();
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
// 9. بناء صفحة التفاصيل (Meta Engine) الشاملة المعربة مع لوحة التقييمات السباعية
// =========================================================================

const epKey = v => `${v.season}:${v.episode ?? v.number}`;

async function buildArabicMeta(type, rawId, mdblistKey = null) {
  if (!rawId) return null;
  const id = String(rawId).trim();
  let base = null;

  const isSeriesEpisode = id.includes(":") && !id.startsWith("kitsu:") && !id.startsWith("tmdb:");
  const lookupId = isSeriesEpisode ? id.split(":")[0] : id;

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

  const tmdbAr = await fetchTmdbArabic(type, lookupId);

  const meta = {
    ...base,
    id: id,
    name: stripAllEmojis(tmdbAr?.title || base.name || "")
  };

  if (base.imdb_id) meta.imdb_id = base.imdb_id;
  else if (base.id && base.id.startsWith("tt")) meta.imdb_id = base.id;

  const targetImdbId = meta.imdb_id || (meta.id && meta.id.startsWith("tt") ? meta.id : null);

  // بوستر وخلفية العمل الأصلية من TMDB
  if (tmdbAr?.poster) meta.poster = tmdbAr.poster;
  if (tmdbAr?.backdrop) meta.background = tmdbAr.backdrop;

  // جلب تقييمات MDBList عند توفر المفتاح
  const mdblist = await fetchMdblistRatings(targetImdbId, mdblistKey);
  if (mdblist?.imdb) meta.imdbRating = mdblist.imdb;

  // التصنيفات
  if (Array.isArray(meta.genres)) meta.genres = localizeGenres(meta.genres);
  if (Array.isArray(meta.genre)) meta.genre = localizeGenres(meta.genre);
  if (Array.isArray(meta.links)) {
    meta.links = meta.links.map(l => (l && l.category === "Genres") ? { ...l, name: GENRE_AR_MAP[l.name] || l.name } : l);
  } else {
    meta.links = [];
  }

  // إضافة أزرار وشرائح تقييمات MDBList التفاعلية إلى meta.links
  if (mdblist) {
    const ratingChips = [];
    if (mdblist.imdb) ratingChips.push({ name: `⭐ IMDb: ${mdblist.imdb}`, category: "التقييمات", url: `https://www.imdb.com/title/${targetImdbId || ""}` });
    if (mdblist.tomatoes) ratingChips.push({ name: `🍅 نقاد: ${mdblist.tomatoes}`, category: "التقييمات", url: `https://www.rottentomatoes.com/search?search=${encodeURIComponent(meta.name)}` });
    if (mdblist.tomatoesaudience) ratingChips.push({ name: `🍿 جمهور: ${mdblist.tomatoesaudience}`, category: "التقييمات", url: `https://www.rottentomatoes.com/search?search=${encodeURIComponent(meta.name)}` });
    if (mdblist.metacritic) ratingChips.push({ name: `Ⓜ️ ميتاريتك: ${mdblist.metacritic}`, category: "التقييمات", url: `https://www.metacritic.com/search/${encodeURIComponent(meta.name)}` });
    if (mdblist.letterboxd) ratingChips.push({ name: `🟢 ليتربوكسد: ${mdblist.letterboxd}`, category: "التقييمات", url: `https://letterboxd.com/imdb/${targetImdbId || ""}/` });
    if (mdblist.trakt) ratingChips.push({ name: `🔴 تراكت: ${mdblist.trakt}`, category: "التقييمات", url: `https://trakt.tv/search/imdb/${targetImdbId || ""}` });
    if (mdblist.tmdb) ratingChips.push({ name: `🔷 TMDB: ${mdblist.tmdb}`, category: "التقييمات", url: `https://www.themoviedb.org` });
    meta.links.unshift(...ratingChips);
  }

  // القصة العامة للفيلم أو المسلسل مع التعريب الشامل
  let plot = tmdbAr?.overview || pickPlot(base);
  if (!plot || !isTextArabic(plot)) {
    const cachedAr = cachedArabic(plot);
    if (cachedAr) {
      plot = cachedAr;
    } else {
      const wikiExtract = await fetchArabicWikipediaSummary(meta.name);
      if (wikiExtract) {
        plot = wikiExtract;
      } else if (plot) {
        const translated = await translateToArabic(plot, Date.now() + 2000);
        if (translated && isTextArabic(translated)) plot = translated;
      }
    }
  }

  if (plot) applyPlot(meta, plot);

  // التعريب الفوري الدقيق لكافة الحلقات والمواسم
  if (Array.isArray(meta.videos) && meta.videos.length > 0) {
    const titlesToTranslate = [];
    const overviewsToTranslate = [];

    meta.videos = meta.videos.map(v => {
      const out = { ...v };
      const s = v.season;
      const e = v.episode ?? v.number;
      const tmdbEp = tmdbAr?.episodesMap?.get(`${s}:${e}`);

      const rawCineName = out.name || out.title || "";
      const isGenericTmdbName = !tmdbEp?.name || /^الحلقة\s*\d+$/i.test(tmdbEp.name.trim()) || /^Episode\s*\d+$/i.test(tmdbEp.name.trim());

      if (tmdbEp?.name && hasArabic(tmdbEp.name) && !isGenericTmdbName) {
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

    if (titlesToTranslate.length > 0) {
      try {
        const batchTitles = titlesToTranslate.slice(0, 36);
        const translatedTitles = await translateMany(batchTitles.map(t => t.text), { limit: 8, budgetMs: 3800 });
        translatedTitles.forEach((arTitle, idx) => {
          if (arTitle && isTextArabic(arTitle)) {
            batchTitles[idx].video.name = arTitle;
            batchTitles[idx].video.title = arTitle;
            saveToCache(`tr_v26_${hashStr(batchTitles[idx].text)}`, arTitle, CACHE_TTL_TRANS);
          }
        });
      } catch {
        // يبقى الاسم التلقائي
      }
    }

    if (overviewsToTranslate.length > 0) {
      const batch = overviewsToTranslate.slice(0, 36);
      const translated = await translateMany(batch.map(b => b.text), { limit: 8, budgetMs: 5000 });
      translated.forEach((arText, idx) => {
        if (arText && isTextArabic(arText)) {
          batch[idx].video.overview = arText;
          batch[idx].video.description = arText;
          saveToCache(`tr_v26_${hashStr(batch[idx].text)}`, arText, CACHE_TTL_TRANS);
        }
      });
    }
  }

  return { meta, complete: true };
}

const metaBuilds = new Map();
function getMetaPayload(type, id, mdblistKey = null) {
  const mdblistSuffix = mdblistKey ? `_${hashStr(mdblistKey)}` : "";
  const key = `meta_v27_${type}_${id}${mdblistSuffix}`;
  const hit = getFromCache(key, true, CACHE_TTL_META);
  if (hit) {
    return Promise.resolve({ payload: { meta: hit.meta }, partial: false });
  }
  if (metaBuilds.has(key)) return metaBuilds.get(key);

  const job = (async () => {
    if (KV_ON) {
      const kv = await kvGetJson(`meta_${type}_${id}${mdblistSuffix}`);
      if (kv?.meta) {
        saveToCache(key, kv, CACHE_TTL_META);
        return { payload: { meta: kv.meta }, partial: false };
      }
    }
    const built = await buildArabicMeta(type, id, mdblistKey);
    if (!built || !built.meta) return { payload: { meta: null }, partial: true };

    const payload = { meta: built.meta };
    saveToCache(key, payload, CACHE_TTL_META);
    if (KV_ON) {
      withDeadline(kvSetJson(`meta_${type}_${id}${mdblistSuffix}`, payload, 60 * 60 * 12), 400).catch(() => {});
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
    const key = `meta_v27_${type}_${id}`;
    if (getFromCache(key, true, CACHE_TTL_META) || metaBuilds.has(key)) continue;
    n++;
    getMetaPayload(type, id).catch(() => {});
  }
}

// =========================================================================
// 10. مجمّع التورنت والبث المتوازي (Multi-Debrid Stream Aggregator)
// =========================================================================

const streamBuilds = new Map();
const BAD_RELEASE = /hdcam|camrip|\bcam\b|telesync|\bts\b|tsrip|hdts|telecine|\bscr\b/i;
const PRIMARY_GRACE_MS = 1000;

function streamSources(type, id, debridConfig = null) {
  const customUrl = debridConfig?.url;
  const torrentioBase = customUrl || UPSTREAM_URL;
  const path = `/stream/${type}/${id}.json`;

  const src = [
    { primary: true, run: () => withDeadline(safeFetchJson(`${torrentioBase}${path}`, {}, 7000), 7000) },
    { run: () => withDeadline(safeFetchJson(`${UPSTREAM_ADDONS.knightcrawler}${path}`, {}, 5000), 5000) },
    { run: () => withDeadline(safeFetchJson(`${UPSTREAM_ADDONS.mediafusion}${path}`, {}, 4500), 4500) },
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

async function buildStreams(type, id, cacheKey, debridConfig = null) {
  let targetId = id;

  if (id.startsWith("tmdb:")) {
    const parts = id.split(":");
    const pureTmdbId = parts[1];
    const imdb = await resolveTmdbToImdb(pureTmdbId, type);
    if (imdb) {
      targetId = parts.length > 2 ? `${imdb}:${parts[2]}:${parts[3] || 1}` : imdb;
    }
  }

  const results = await collectSources(streamSources(type, targetId, debridConfig));

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

function startBuild(type, id, cacheKey, debridConfig = null) {
  const job = buildStreams(type, id, cacheKey, debridConfig)
    .catch(() => getFromCache(cacheKey, true, CACHE_TTL_STREAM * 2) || [])
    .finally(() => streamBuilds.delete(cacheKey));
  streamBuilds.set(cacheKey, job);
  return job;
}

function getStreamList(type, id, debridConfig = null) {
  const prefix = debridConfig?.url ? `custom_${hashStr(debridConfig.url)}_` : "";
  const cacheKey = `strlist_v26_${prefix}${type}_${id}`;
  const fresh = getFromCache(cacheKey, false, CACHE_TTL_STREAM);
  if (fresh) return Promise.resolve(fresh);
  const job = streamBuilds.get(cacheKey) || startBuild(type, id, cacheKey, debridConfig);
  const stale = getFromCache(cacheKey, true, CACHE_TTL_STREAM * 2);
  return stale ? Promise.resolve(stale) : job;
}

// =========================================================================
// 11. محرك ومحوّل الترجمات الفوري (CP1256 to UTF-8 Transcoder & Subtitles)
// =========================================================================

function decodeSubtitleBuffer(buf) {
  try {
    const utfDec = new TextDecoder("utf-8", { fatal: true });
    return utfDec.decode(buf);
  } catch {
    try {
      const arDec = new TextDecoder("windows-1256");
      return arDec.decode(buf);
    } catch {
      return new TextDecoder("utf-8").decode(buf);
    }
  }
}

// =========================================================================
// 12. موجه الخادم الرئيسي (Master Route Handler)
// =========================================================================

export default async function handler(req, res) {
  try {
    const fullUrl = req.url || "/";
    const [pathPart, queryPart] = fullUrl.split("?");
    let path = pathPart.replace(/\/+$/, "") || "/";

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

    if (req.method === "OPTIONS") {
      res.setHeader("Content-Length", "0");
      return res.status(204).end();
    }

    const host = req?.headers?.host || "localhost:3000";

    // مسار فحص مفاتيح الدبريد
    if (path === "/test-debrid") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      const urlObj = new URL(fullUrl, `http://${host}`);
      const service = (urlObj.searchParams.get("service") || "torbox").toLowerCase();
      const token = urlObj.searchParams.get("token") || "";

      if (!token) return res.status(200).json({ ok: false, error: "Empty token" });

      if (service === "torbox") {
        const tb = await safeFetchJson("https://api.torbox.app/v1/api/user/me", {
          headers: { Authorization: `Bearer ${token}` }
        }, 3500);
        return res.status(200).json({ ok: Boolean(tb?.success), user: tb?.data?.email || tb?.data?.customer || "TorBox User" });
      } else if (service === "realdebrid") {
        const rd = await safeFetchJson("https://api.real-debrid.com/rest/1.0/user", {
          headers: { Authorization: `Bearer ${token}` }
        }, 3500);
        return res.status(200).json({ ok: Boolean(rd?.username), user: rd?.username || "RD User" });
      } else if (service === "alldebrid") {
        const ad = await safeFetchJson(`https://api.alldebrid.com/v4/user?agent=1take2&apikey=${encodeURIComponent(token)}`, {}, 3500);
        return res.status(200).json({ ok: ad?.status === "success", user: ad?.data?.user?.username || "AD User" });
      }
      return res.status(200).json({ ok: true, user: "Verified" });
    }

    // مسار فك تشفير ترميز ملفات الترجمة فورياً
    if (path === "/sub-proxy") {
      const urlObj = new URL(fullUrl, `http://${host}`);
      const subUrl = urlObj.searchParams.get("url");
      if (!subUrl) return res.status(400).send("Missing sub url");

      try {
        const subRes = await fetch(subUrl, { headers: { "User-Agent": UA } });
        if (!subRes.ok) return res.status(subRes.status).send("Failed to fetch sub");
        const arrayBuf = await subRes.arrayBuffer();
        const decodedText = decodeSubtitleBuffer(arrayBuf);

        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Cache-Control", "public, max-age=604800");
        return res.status(200).send(decodedText);
      } catch {
        return res.status(500).send("Proxy error");
      }
    }

    // استخراج معلمات الدبريد
    let customDebrid = null;
    let customPathSegment = "";
    const debridMatch = path.match(/\/(torbox=[a-zA-Z0-9_-]+|realdebrid=[a-zA-Z0-9_-]+|alldebrid=[a-zA-Z0-9_-]+|premiumize=[a-zA-Z0-9_-]+|debridlink=[a-zA-Z0-9_-]+)/i);
    if (debridMatch) {
      customPathSegment = debridMatch[1];
      const [serviceName, token] = customPathSegment.split("=");
      if (token) {
        customDebrid = {
          service: serviceName.toLowerCase(),
          token,
          url: `https://torrentio.strem.fun/qualityfilter=scr,cam|${serviceName.toLowerCase()}=${token}`
        };
      }
      path = path.replace(debridMatch[0], "") || "/";
    }

    // استخراج معلمات مفتاح MDBList API للتقييمات
    let customMdblistKey = null;
    const mdblistMatch = path.match(/\/(mdblist=[a-zA-Z0-9_-]+|mdblistkey=[a-zA-Z0-9_-]+)/i);
    if (mdblistMatch) {
      customMdblistKey = mdblistMatch[1].split("=")[1];
      path = path.replace(mdblistMatch[0], "") || "/";
    }

    if (!customMdblistKey) {
      const qMdblist = req?.query?.mdblist || req?.query?.mdblistkey;
      if (qMdblist) customMdblistKey = qMdblist;
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
      res.setHeader("Cache-Control", "public, max-age=3600");
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
        description: "1take2 الإصدار المتكامل للأفلام والمسلسلات والأنمي مع تعريب استوديوهات TMDB ودعم تقييمات MDBList ومصحح الترجمات الفوري",
        resources: lite ? ["catalog", "meta", "subtitles"] : ["catalog", "meta", "subtitles", "stream"],
        types: ["movie", "series", "anime"],
        idPrefixes: ["tt", "kitsu:", "tmdb:", "tmdb"],
        catalogs: [
          ...spotlightCatalogs(countryName),
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
    // ب. لوحة المراقبة وفحص صحة المنظومة (Health & Metrics Dashboard)
    // -----------------------------------------------------------------
    if (path === "/health" || path === "/metrics") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      const providers = {};
      for (const [h, st] of healthMetrics) {
        providers[h] = { fails: st.fails, healthy: isHostHealthy(h), successes: st.successes };
      }
      return res.status(200).json({
        status: "نشط ويعمل بكفاءة إمبراطورية أسطورية",
        version: VERSION,
        persistentCache: KV_ON,
        p2p: ENABLE_P2P,
        cacheEntries: memoryCache.size,
        idMapEntries: idMapCache.size,
        activeStreamsInflight: streamBuilds.size,
        activeMetasInflight: metaBuilds.size,
        providers
      });
    }

    // -----------------------------------------------------------------
    // ج. صفحة التثبيت والتهيئة التفاعلية الفخمة
    // -----------------------------------------------------------------
    if (path === "/" || path === "/configure") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=600");
      return res.status(200).send(renderConfigPage(host, customPathSegment));
    }

    // -----------------------------------------------------------------
    // د. الكتالوجات (Catalog Engine)
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

      const cacheKey = `cat_v26_${type}_${catalogId}_${countryCode}_${daySeed}_${extraPart}_${customRpdbKey || ""}`;
      const cachedCat = getFromCache(cacheKey, true, CACHE_TTL_CAT);
      if (cachedCat) return res.status(200).json(cachedCat);

      const extraSuffix = extraPart ? `/${extraPart}.json` : ".json";

      // 1. كتالوجات الأنمي
      if (catalogId === "anime_trending") {
        const kitsuData = await safeFetchJson(`${UPSTREAM_ADDONS.animeKitsu}/catalog/anime/kitsu-anime-trending.json`, {}, 3500);
        const metas = kitsuData?.metas || [];
        const { items } = await localizeCatalogList(metas.slice(0, 45), type);
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
          description: r.overview || "دراما تركية مميزة بأعلى درجات الإثارة والتشويق",
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
          description: r.overview || "دراما كورية مشوقة ومميزة مترجمة بالعربية",
          releaseInfo: r.first_air_date ? r.first_air_date.slice(0, 4) : ""
        }));
        const payload = { metas };
        saveToCache(cacheKey, payload, CACHE_TTL_CAT);
        return res.status(200).json(payload);
      }

      // 4. كتالوجات الأفلام والمسلسلات العربية
      if (catalogId === "arabic_movies_spotlight") {
        const arData = await safeFetchJson(`${TMDB_BASE}/discover/movie?with_original_language=ar&sort_by=popularity.desc&language=ar-SA&api_key=${TMDB_API_KEY}`, {}, 3500);
        const metas = (arData?.results || []).map(r => ({
          id: `tmdb:${r.id}`,
          type: "movie",
          name: stripAllEmojis(r.title || r.original_title),
          poster: r.poster_path ? `https://image.tmdb.org/t/p/w500${r.poster_path}` : null,
          background: r.backdrop_path ? `https://image.tmdb.org/t/p/original${r.backdrop_path}` : null,
          description: r.overview || "فيلم سينمائي عربي مميز",
          releaseInfo: r.release_date ? r.release_date.slice(0, 4) : ""
        }));
        const payload = { metas };
        saveToCache(cacheKey, payload, CACHE_TTL_CAT);
        return res.status(200).json(payload);
      }

      if (catalogId === "arabic_series_spotlight") {
        const arData = await safeFetchJson(`${TMDB_BASE}/discover/tv?with_original_language=ar&sort_by=popularity.desc&language=ar-SA&api_key=${TMDB_API_KEY}`, {}, 3500);
        const metas = (arData?.results || []).map(r => ({
          id: `tmdb:${r.id}`,
          type: "series",
          name: stripAllEmojis(r.name || r.original_name),
          poster: r.poster_path ? `https://image.tmdb.org/t/p/w500${r.poster_path}` : null,
          background: r.backdrop_path ? `https://image.tmdb.org/t/p/original${r.backdrop_path}` : null,
          description: r.overview || "مسلسل عربي درامي مميز",
          releaseInfo: r.first_air_date ? r.first_air_date.slice(0, 4) : ""
        }));
        const payload = { metas };
        saveToCache(cacheKey, payload, CACHE_TTL_CAT);
        return res.status(200).json(payload);
      }

      // 5. كتالوج روائع مسلسلات رمضان
      if (catalogId === "ramadan_specials") {
        const ramadanData = await safeFetchJson(`${TMDB_BASE}/discover/tv?with_original_language=ar&first_air_date_year=2024&sort_by=vote_count.desc&language=ar-SA&api_key=${TMDB_API_KEY}`, {}, 3500);
        const metas = (ramadanData?.results || []).map(r => ({
          id: `tmdb:${r.id}`,
          type: "series",
          name: stripAllEmojis(r.name || r.original_name),
          poster: r.poster_path ? `https://image.tmdb.org/t/p/w500${r.poster_path}` : null,
          background: r.backdrop_path ? `https://image.tmdb.org/t/p/original${r.backdrop_path}` : null,
          description: r.overview || "عمل درامي من موسم رمضان المبارك",
          releaseInfo: r.first_air_date ? r.first_air_date.slice(0, 4) : ""
        }));
        const payload = { metas };
        saveToCache(cacheKey, payload, CACHE_TTL_CAT);
        return res.status(200).json(payload);
      }

      // 6. كلاسيكيات السينما المصرية
      if (catalogId === "egyptian_classics") {
        const egyptData = await safeFetchJson(`${TMDB_BASE}/discover/movie?with_original_language=ar&primary_release_date.lte=2010-01-01&sort_by=vote_count.desc&language=ar-SA&api_key=${TMDB_API_KEY}`, {}, 3500);
        const metas = (egyptData?.results || []).map(r => ({
          id: `tmdb:${r.id}`,
          type: "movie",
          name: stripAllEmojis(r.title || r.original_title),
          poster: r.poster_path ? `https://image.tmdb.org/t/p/w500${r.poster_path}` : null,
          background: r.backdrop_path ? `https://image.tmdb.org/t/p/original${r.backdrop_path}` : null,
          description: r.overview || "من كلاسيكيات السينما المصرية الخالدة",
          releaseInfo: r.release_date ? r.release_date.slice(0, 4) : ""
        }));
        const payload = { metas };
        saveToCache(cacheKey, payload, CACHE_TTL_CAT);
        return res.status(200).json(payload);
      }

      // 7. سينما الأطفال والعائلة المدبلجة
      if (catalogId === "kids_family_arabic") {
        const familyData = await safeFetchJson(`${TMDB_BASE}/discover/movie?with_genres=16,10751&sort_by=popularity.desc&language=ar-SA&api_key=${TMDB_API_KEY}`, {}, 3500);
        const metas = (familyData?.results || []).map(r => ({
          id: `tmdb:${r.id}`,
          type: "movie",
          name: stripAllEmojis(r.title || r.original_title),
          poster: r.poster_path ? `https://image.tmdb.org/t/p/w500${r.poster_path}` : null,
          background: r.backdrop_path ? `https://image.tmdb.org/t/p/original${r.backdrop_path}` : null,
          description: r.overview || "فيلم كرتون وعائلي رائع مناسب لجميع الأعمار",
          releaseInfo: r.release_date ? r.release_date.slice(0, 4) : ""
        }));
        const payload = { metas };
        saveToCache(cacheKey, payload, CACHE_TTL_CAT);
        return res.status(200).json(payload);
      }

      // 8. أعلى 250 فيلماً في التاريخ (Top IMDb)
      if (catalogId === "top_imdb_arabic") {
        const topData = await safeFetchJson(`${TMDB_BASE}/movie/top_rated?language=ar-SA&api_key=${TMDB_API_KEY}`, {}, 3500);
        const metas = (topData?.results || []).map(r => ({
          id: `tmdb:${r.id}`,
          type: "movie",
          name: stripAllEmojis(r.title || r.original_title),
          poster: r.poster_path ? `https://image.tmdb.org/t/p/w500${r.poster_path}` : null,
          background: r.backdrop_path ? `https://image.tmdb.org/t/p/original${r.backdrop_path}` : null,
          description: r.overview || "من أفضل التحف السينمائية تقييماً في التاريخ",
          releaseInfo: r.release_date ? r.release_date.slice(0, 4) : ""
        }));
        const payload = { metas };
        saveToCache(cacheKey, payload, CACHE_TTL_CAT);
        return res.status(200).json(payload);
      }

      // 9. وثائقيات عالمية مدبلجة ومترجمة
      if (catalogId === "documentary_arabic") {
        const docData = await safeFetchJson(`${TMDB_BASE}/discover/movie?with_genres=99&sort_by=popularity.desc&language=ar-SA&api_key=${TMDB_API_KEY}`, {}, 3500);
        const metas = (docData?.results || []).map(r => ({
          id: `tmdb:${r.id}`,
          type: "movie",
          name: stripAllEmojis(r.title || r.original_title),
          poster: r.poster_path ? `https://image.tmdb.org/t/p/w500${r.poster_path}` : null,
          background: r.backdrop_path ? `https://image.tmdb.org/t/p/original${r.backdrop_path}` : null,
          description: r.overview || "فيلم وثائقي عالمي مترجم ومدبلج",
          releaseInfo: r.release_date ? r.release_date.slice(0, 4) : ""
        }));
        const payload = { metas };
        saveToCache(cacheKey, payload, CACHE_TTL_CAT);
        return res.status(200).json(payload);
      }

      // 10. الكتالوجات العامة (Nuvio + Cinemeta)
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
    // هـ. صفحة التفاصيل (Meta Engine) - تعريب القصص والحلقات والتقييمات السباعية
    // -----------------------------------------------------------------
    if (path.includes("/meta/")) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      const parts = path.substring(path.indexOf("/meta/")).split("/").filter(Boolean);
      const type = parts[1] || "movie";
      const id = (parts[2] || "").replace(/\.json$/, "");

      const { payload, partial } = await getMetaPayload(type, id, customMdblistKey);
      if (partial) res.setHeader("Cache-Control", "public, max-age=30, s-maxage=120");
      return res.status(200).json(payload);
    }

    // -----------------------------------------------------------------
    // و. الترجمات العربية مع محوّل فك تشفير الترميز الفوري (Subtitles Engine)
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

      const cacheKey = `subs_v26_${type}_${id}`;
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

          const proxyUrl = `https://${host}/sub-proxy?url=${encodeURIComponent(s.url)}`;
          const isSdh = /\b(sdh|hearing[\s._-]?impaired)\b/i.test(`${s.subtitleFileName || ""} ${s.movieReleaseName || ""}`);
          const isForced = /\bforced\b/i.test(`${s.subtitleFileName || ""} ${s.movieReleaseName || ""}`);
          const tag = isForced ? "🔴 ترجمة المشاهد الأجنبية (Forced)" : isSdh ? "🦻 ترجمة لضعاف السمع (SDH)" : "ترجمة عربية متوافقة";

          subtitles.push({
            id: String(s.id || s.url),
            url: proxyUrl,
            lang: "ara",
            SubEncoding: "UTF-8",
            subtitleFileName: `[عربي مُصحح UTF-8] ${s.subtitleFileName || s.movieReleaseName || tag}`
          });
        }
      }

      if (subtitles.length) saveToCache(cacheKey, subtitles, CACHE_TTL_META);
      return res.status(200).json({ subtitles: subtitles.slice(0, 30) });
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

      const list = await getStreamList(type, id, customDebrid);
      const def = tab ? TABS[tab] : null;
      const filtered = def ? list.filter(def.test) : list;

      const finalStreams = filtered.slice(0, 75).map(stripPrivate);
      if (finalStreams.length === 0) res.setHeader("Cache-Control", "public, max-age=15, s-maxage=30");
      return res.status(200).json({ streams: finalStreams });
    }

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(200).json({
      status: "نشط ويعمل بكفاءة إمبراطورية أسطورية",
      name: `${ADDON_NAME} v${VERSION}`,
      description: "إضافة الترفيه المتكاملة للأفلام والمسلسلات والأنمي مع تعريب استوديوهات TMDB ودعم تقييمات MDBList ومصحح الترجمات الفوري"
    });

  } catch (err) {
    return res.status(200).json({ streams: [], metas: [], subtitles: [] });
  }
}

// =========================================================================
// 13. تشغيل تلقائي كخادم مستقل عند التشغيل عبر Node.js (Standalone Server)
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
    console.log(`🚀 ${ADDON_NAME} v${VERSION} يعمل بنجاح وبكفاءة إمبراطورية!`);
    console.log(`🌐 واجهة التحكم والتثبيت: http://localhost:${PORT}`);
    console.log(`📡 رابط التثبيت المباشر في Stremio: stremio://localhost:${PORT}/manifest.json`);
    console.log(`======================================================\n`);
  });
}
