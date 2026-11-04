// =========================================================================
// 1. الإعدادات الأساسية والبلوقنات المستقرة بدون تداخل (Conflict-Free Addons)
// =========================================================================

// كتالوجات Nuvio (TMDB) تُدمج داخل 1take2 فتثبّت إضافة واحدة بدل اثنتين
// ملاحظة: لتغيير لغة/منطقة Nuvio ضع رابطه المهيّأ في NUVIO_URL (بدون /manifest.json)
const NUVIO_URL = (process.env.NUVIO_URL || "https://catalog.nuvio.tv").replace(/\/manifest\.json$/i, "").replace(/\/+$/, "");
const NV_MOVIE_GENRES = ["Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary", "Drama", "Family", "Fantasy", "History", "Horror", "Music", "Mystery", "Romance", "Science Fiction", "TV Movie", "Thriller", "War", "Western"];
const NV_SERIES_GENRES = ["Action & Adventure", "Animation", "Comedy", "Crime", "Documentary", "Drama", "Family", "Kids", "Mystery", "News", "Reality", "Sci-Fi & Fantasy", "Soap", "Talk", "War & Politics", "Western"];
const NV_YEARS = Array.from({ length: 37 }, (_, i) => String(2026 - i));
const NV_LANGS = ["English", "Spanish", "French", "German", "Italian", "Portuguese", "Korean", "Japanese", "Chinese", "Hindi", "Arabic", "Turkish", "Russian", "Polish", "Dutch"];

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
    mk("series", "limited-series", "مسلسلات محدودة"),
    mk("movie", "documentaries", "أفلام وثائقية"),
    mk("series", "documentary-series", "مسلسلات وثائقية"),
    mk("movie", "family-movies", "أفلام عائلية"),
    mk("series", "family-series", "مسلسلات عائلية")
  ];
}

const ADDON_NAME = "1take2";
const VERSION = "17.0.0";
// يقبل رابط Torrentio مع manifest.json أو بدونه
const UPSTREAM_URL = (process.env.UPSTREAM_URL || "https://torrentio.strem.fun/qualityfilter=scr,cam|torbox=3183a8fd-2d85-41fb-a58d-39c5737efae3")
  .replace(/\/manifest\.json$/i, "").replace(/\/+$/, "");
// روابط التورنت المباشرة (بدون TorBox) لا تعمل على الجوال/التلفزيون غالباً: ENABLE_P2P=0 لإخفائها وتسريع الجلب
const ENABLE_P2P = process.env.ENABLE_P2P !== "0";
const CACHE_TTL = 25 * 60 * 1000;
const STALE_TTL = 90 * 60 * 1000;
const TIMEOUT_MS = 3500;

// قائمة البلوقنات المصفاة والموثوقة (تم إزالة البلوقنات المتعارضة أو التي تتطلب مفاتيح خارجية)
const UPSTREAM_ADDONS = {
  // مصادر الكتالوجات والبيانات (دعم اللغة العربية من TMDB + Cinemeta)
  cinemeta: "https://v3-cinemeta.strem.io",
  tmdbAddon: "https://94c8cb9f702d-tmdb-addon.baby-beamup.club/%7B%22language%22%3A%22ar-SA%22%7D",
  tmdbFallback: "https://tmdb.strem.fun",
  cyberflix: "https://cyberflix.kamyroll.tech",
  animeKitsu: "https://anime-kitsu.strem.fun",

  // مصادر البث المباشر والتورنت (مفصولة ومفلترة بدقة)
  tpbPlus: "https://thepiratebay-plus.strem.fun",
  yts: "https://yts.strem.fun",
  eztv: "https://eztv.strem.fun",
  webstreamr: "https://webstreamr.hayd.uk",
  publicDomain: "https://caching.stremio.net/publicdomainmovies.now.sh",

  // مصادر الترجمة العربية المعتمدة
  subdl: "https://subdl.strem.fun",
  opensubtitlesV3: "https://opensubtitles-v3.strem.io",
  yifysubs: "https://yifysubtitles.strem.fun"
};

// =========================================================================
// 2. إدارة الذاكرة المؤقتة ومنع التداخل في الطلبات (Request Isolation)
// =========================================================================

const memoryCache = new Map();
const inflightRequests = new Map();
const healthMetrics = new Map();

function getFromCache(key, allowStale = false) {
  try {
    const item = memoryCache.get(key);
    if (!item) return null;
    const age = Date.now() - item.time;
    if (age < CACHE_TTL) return item.data;
    if (allowStale && age < STALE_TTL) return item.data;
    // لا نحذف العنصر المنتهي قبل أن تنتهي مهلة النسخة الاحتياطية (كان هذا يعطّل fallback كلياً)
    if (age >= STALE_TTL) memoryCache.delete(key);
  } catch {
    // تجاهل آمن
  }
  return null;
}

function saveToCache(key, data) {
  try {
    if (memoryCache.size > 3000) {
      const oldestKeys = Array.from(memoryCache.keys()).slice(0, 800);
      oldestKeys.forEach(k => memoryCache.delete(k));
    }
    memoryCache.set(key, { data, time: Date.now() });
  } catch {
    // تجاهل آمن
  }
}

function recordProviderStatus(host, success) {
  try {
    const stat = healthMetrics.get(host) || { fails: 0, lastFail: 0 };
    if (success) {
      stat.fails = 0;
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
    if (stat.fails >= 3 && Date.now() - stat.lastFail < 60000) {
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
    // تأخير بسيط يضمن تسجيل الطلب في inflightRequests قبل أي تنظيف (إصلاح سباق قديم)
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
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) 1take2/17.0.0",
            "Accept": "application/json",
            "Accept-Language": "ar,en-US;q=0.9,en;q=0.8",
            ...headers
          }
        });
      } finally {
        clearTimeout(timer);
      }

      if (!res.ok) {
        // 404 يعني "لا توجد نتيجة" وليس عطلاً في المزود فلا نعاقبه
        if (res.status !== 404) recordProviderStatus(host, false);
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

// =========================================================================
// 3. التعريب: كشف اللغة، الترجمة بثلاثة محركات، وتعريب الكتالوجات والتفاصيل
// =========================================================================

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";

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
  "Film-Noir": "نوار",
  Short: "قصير",
  "Action & Adventure": "حركة ومغامرة",
  "Sci-Fi & Fantasy": "خيال علمي وفانتازيا",
  "War & Politics": "حرب وسياسة"
};

function localizeGenres(genres) {
  if (!Array.isArray(genres)) return [];
  return genres.map(g => GENRE_AR_MAP[g] || g);
}

// نسبة الحروف العربية من مجموع الحروف: نص إنجليزي فيه كلمتان عربيتان لن يُعتبر عربياً بعد الآن
function hasArabic(text) {
  return typeof text === "string" && /[\u0600-\u06FF]/.test(text);
}

function isTextArabic(text) {
  if (!text || typeof text !== "string") return false;
  const letters = text.match(/\p{L}/gu);
  const arabic = text.match(/[\u0600-\u06FF]/g);
  if (!letters || !arabic) return false;
  return arabic.length >= 4 && arabic.length / letters.length >= 0.5;
}

function normalizeAr(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + "_" + s.length;
}

async function fetchT(url, opts = {}, ms = 3500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// تشغيل مهام متوازية بحد أقصى للتزامن (يمنع حظر المترجم ويبقي الاستجابة سريعة)
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

function chunkText(text, max) {
  const sentences = text.match(/[^.!?؟]+[.!?؟]*\s*/g) || [text];
  const chunks = [];
  let cur = "";
  for (const s of sentences) {
    if ((cur + s).length > max && cur) {
      chunks.push(cur.trim());
      cur = "";
    }
    cur += s;
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks.map(c => c.slice(0, max));
}

// المحرك 1: Google GTX بطريقة POST (يدعم النصوص الطويلة ويكشف اللغة تلقائياً)
async function engineGtx(text, ms) {
  const res = await fetchT(
    "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ar&dt=t",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "User-Agent": UA },
      body: "q=" + encodeURIComponent(text.slice(0, 4500))
    },
    ms
  );
  if (!res.ok) return null;
  const data = await res.json();
  if (Array.isArray(data) && Array.isArray(data[0])) {
    return data[0].map(p => (p && p[0]) ? p[0] : "").join("").trim();
  }
  return null;
}

// المحرك 2: Google Clients5
async function engineClients5(text, ms) {
  const url = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=ar&q=${encodeURIComponent(text.slice(0, 1800))}`;
  const res = await fetchT(url, { headers: { "User-Agent": UA } }, ms);
  if (!res.ok) return null;
  const data = await res.json();
  const candidate = Array.isArray(data) ? (Array.isArray(data[0]) ? data[0][0] : data[0]) : null;
  return typeof candidate === "string" ? candidate.trim() : null;
}

// المحرك 3: MyMemory (يقسم النص إلى جمل لأن حده 500 حرف)
async function engineMyMemory(text, ms) {
  const chunks = chunkText(text, 450).slice(0, 4);
  const parts = [];
  for (const c of chunks) {
    const res = await fetchT(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(c)}&langpair=en|ar`, {}, ms);
    if (!res.ok) return null;
    const data = await res.json();
    const t = data?.responseData?.translatedText;
    if (typeof t !== "string") return null;
    parts.push(t);
  }
  return parts.join(" ").trim();
}

async function translateToArabic(text, deadline = Infinity) {
  if (!text || typeof text !== "string") return text;
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean || isTextArabic(clean)) return clean;

  const cacheKey = `tr_ar_v15_${hashStr(clean)}`;
  const cached = getFromCache(cacheKey, true);
  if (cached && isTextArabic(cached)) return cached;

  for (const engine of [engineGtx, engineClients5, engineMyMemory]) {
    const remaining = deadline - Date.now();
    if (remaining < 600) break;
    try {
      const out = await engine(clean, Math.min(3500, remaining));
      if (out && isTextArabic(out)) {
        saveToCache(cacheKey, out);
        return out;
      }
    } catch {
      // ننتقل للمحرك التالي
    }
  }
  return clean;
}

// ترجمة قائمة نصوص بالتوازي المحدود مع ميزانية زمنية؛ ما لم يُترجم يبقى كما هو
async function translateMany(texts, { limit = 6, budgetMs = 6500 } = {}) {
  const deadline = Date.now() + budgetMs;
  return mapLimit(texts, limit, t => translateToArabic(t, deadline));
}

function pickPlot(item) {
  return item?.description || item?.overview || item?.synopsis || "";
}

function applyPlot(item, plot) {
  item.description = plot;
  item.overview = plot;
  item.synopsis = plot;
}

// الترجمة المخزّنة مسبقاً (فورية بلا شبكة)
function cachedArabic(text) {
  if (!text || typeof text !== "string") return null;
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  if (isTextArabic(clean)) return clean;
  const c = getFromCache(`tr_ar_v15_${hashStr(clean)}`, true);
  return c && isTextArabic(c) ? c : null;
}

// تعريب عناصر الكتالوج بسرعة: تنظيف الأسماء والتصنيفات + تطبيق الترجمات المخزّنة فقط.
// ما لم يُترجم بعد يُترجم في الخلفية ويظهر مترجماً في صفحة التفاصيل (لا ننتظره هنا).
async function localizeCatalogList(items, type = "movie") {
  if (!Array.isArray(items) || items.length === 0) return { items: [], complete: true };

  const prepared = items.map(item => ({
    ...item,
    name: stripAllEmojis(item.name || ""),
    genres: localizeGenres(item.genres),
    genre: Array.isArray(item.genre) ? localizeGenres(item.genre) : item.genre
  }));

  const background = [];
  prepared.forEach((item, i) => {
    const plot = pickPlot(item);
    if (!plot) return;
    const ar = cachedArabic(plot);
    if (ar) applyPlot(item, ar);
    else if (i < 12) background.push(plot);
  });
  if (background.length) translateMany(background, { limit: 4, budgetMs: 6000 }).catch(() => {});

  return { items: prepared, complete: true };
}

function parseSizeBytes(sizeStr) {
  if (!sizeStr) return 0;
  const match = sizeStr.match(/([0-9]+(?:\.[0-9]+)?)\s*(TB|GB|MB|KB|TIB|GIB|MIB|KIB)/i);
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

// استخراج البصمة الموحدة للروابط لمنع تداخل وتكرار نفس السيرفر من أكثر من بلوقن
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

// خريطة أسماء الدول بالعربية لعرض أفضل 10 في منطقة المستخدم تلقائياً
const REGION_NAMES_AR = {
  SA: "السعودية",
  AE: "الإمارات",
  KW: "الكويت",
  QA: "قطر",
  BH: "البحرين",
  OM: "عمان",
  EG: "مصر",
  JO: "الأردن",
  IQ: "العراق",
  MA: "المغرب",
  DZ: "الجزائر",
  TN: "تونس",
  LB: "لبنان",
  SY: "سوريا",
  PS: "فلسطين",
  YE: "اليمن",
  SD: "السودان",
  LY: "ليبيا",
  TR: "تركيا",
  US: "أمريكا",
  GB: "بريطانيا",
  DE: "ألمانيا",
  FR: "فرنسا"
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

// =========================================================================
// 4. تنسيق الروابط: الدقة + لغة الصوت + وسوم مختصرة تفرّق بين الصفوف
// =========================================================================

const FLAG_LANG = {
  "🇸🇦": "عربي", "🇪🇬": "عربي", "🇦🇪": "عربي", "🇰🇼": "عربي", "🇶🇦": "عربي", "🇧🇭": "عربي",
  "🇴🇲": "عربي", "🇯🇴": "عربي", "🇱🇧": "عربي", "🇮🇶": "عربي", "🇲🇦": "عربي", "🇩🇿": "عربي",
  "🇹🇳": "عربي", "🇸🇾": "عربي", "🇾🇪": "عربي", "🇸🇩": "عربي", "🇱🇾": "عربي", "🇵🇸": "عربي",
  "🇬🇧": "إنجليزي", "🇺🇸": "إنجليزي", "🇫🇷": "فرنسي", "🇪🇸": "إسباني", "🇩🇪": "ألماني",
  "🇮🇹": "إيطالي", "🇷🇺": "روسي", "🇹🇷": "تركي", "🇮🇳": "هندي", "🇯🇵": "ياباني",
  "🇰🇷": "كوري", "🇧🇷": "برتغالي", "🇵🇹": "برتغالي", "🇨🇳": "صيني", "🇵🇱": "بولندي",
  "🇳🇱": "هولندي", "🇮🇷": "فارسي", "🇺🇦": "أوكراني"
};

// يرجع { label, hasArabic, key } لوصف لغة الصوت المكتشفة من اسم الملف وأعلام Torrentio
function detectAudio(full) {
  const langs = [];
  const add = l => { if (!langs.includes(l)) langs.push(l); };

  const flags = full.match(/[\u{1F1E6}-\u{1F1FF}]{2}/gu) || [];
  for (const f of flags) if (FLAG_LANG[f]) add(FLAG_LANG[f]);

  if (/\b(arabic|ara|arb)\b|عربي|مدبلج/i.test(full)) add("عربي");
  if (/\b(english|eng)\b/i.test(full)) add("إنجليزي");

  const multi = /\bmulti(?:[\s._-]?audio|[\s._-]?lang)?\b/i.test(full);
  const dual = /\bdual[\s._-]?audio\b/i.test(full);

  const hasArabic = langs.includes("عربي");
  langs.sort((a, b) => (a === "عربي" ? -1 : b === "عربي" ? 1 : 0));

  let label;
  if (langs.length === 0) label = multi ? "متعدد اللغات" : dual ? "صوت ثنائي" : "صوت أصلي";
  else if (langs.length <= 3) label = langs.join(" + ");
  else label = "متعدد اللغات";

  return { label, hasArabic, key: hasArabic ? "ar" : langs.length ? langs[0] : "orig" };
}

const RES_GROUP = { "8K": "4K", "4K": "4K", "2K": "1080p", "1080p": "1080p", "720p": "720p", "480p": "480p" };

// التبويبات الصغيرة: اسم الإضافة = اسم التبويب في شاشة السيرفرات
const TABS = {
  "4k":     { label: "4K",    desc: "روابط 4K فقط",                    test: i => i._group === "4K" },
  "1080p":  { label: "1080p", desc: "روابط Full HD 1080p فقط",         test: i => i._group === "1080p" },
  "hdr":    { label: "HDR",   desc: "روابط HDR / Dolby Vision بأي دقة", test: i => i._hdr },
  "720p":   { label: "720p",  desc: "روابط 720p فقط",                  test: i => i._group === "720p" },
  "480p":   { label: "480p",  desc: "روابط خفيفة 480p",                test: i => i._group === "480p" },
  "arabic": { label: "عربي",  desc: "روابط بصوت عربي فقط",             test: i => i._ar },
  "cached": { label: "فوري",  desc: "روابط جاهزة على TorBox تبدأ فوراً", test: i => i._status === "instant" },
  "all":    { label: "الكل",  desc: "كل الروابط مرتبة: الأفضل أولاً",   test: () => true }
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

    // حالة الرابط: فوري (جاهز) | يحتاج تحميل على TorBox | تورنت مباشر
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

    // 2. المصدر
    let ripBonus = 100;
    let source = "";
    if (/\b(Remux|BD-?Remux)\b/i.test(full)) { ripBonus = 900; source = "Remux"; }
    else if (/\b(BluRay|Blu-Ray|BDRip|BRRip|BDMV)\b/i.test(full)) { ripBonus = 650; source = "BluRay"; }
    else if (/\b(WEB-DL|WEBDL)\b/i.test(full)) { ripBonus = 500; source = "WEB-DL"; }
    else if (/\b(WEBRip|WEB-Rip|WEB)\b/i.test(full)) { ripBonus = 400; source = "WEB"; }

    // 3. HDR والكودك والصوت
    let visualBonus = 0;
    let hdr = "";
    let hdrShort = "";
    if (/\b(DV|Dolby[\s.-]?Vision|DoVi)\b/i.test(full)) { visualBonus += 450; hdr = "Dolby Vision"; hdrShort = "DV"; }
    if (/\bHDR10\+|HDR10Plus\b/i.test(full)) { visualBonus += 380; hdr = hdr || "HDR10+"; hdrShort = hdrShort || "HDR"; }
    else if (/\b(HDR10|HDR)\b/i.test(full)) { visualBonus += 300; hdr = hdr || "HDR"; hdrShort = hdrShort || "HDR"; }

    let videoCodec = "";
    if (/\bAV1\b/i.test(full)) videoCodec = "AV1";
    else if (/\b(HEVC|x265|H[\s.]?265)\b/i.test(full)) videoCodec = "HEVC";

    let audioBonus = 0;
    let audioCodec = "";
    if (/\bAtmos\b/i.test(full)) { audioBonus += 350; audioCodec = "Atmos"; }
    else if (/\bTrueHD\b/i.test(full)) { audioBonus += 300; audioCodec = "TrueHD"; }
    else if (/\bDTS[\s.-]?(HD|X)\b/i.test(full)) { audioBonus += 250; audioCodec = "DTS-HD"; }

    const sizeMatch = rawTitle.match(/([0-9]+(?:\.[0-9]+)?\s*(?:TB|GB|MB|GiB|MiB))/i) ||
                      rawName.match(/([0-9]+(?:\.[0-9]+)?\s*(?:TB|GB|MB|GiB|MiB))/i);
    const sizeBytes = sizeMatch ? parseSizeBytes(sizeMatch[1]) : 0;

    const seedersMatch = rawTitle.match(/(?:👤|👥|\bS:?\s*|\bSeeders:?\s*)(\d+)/i);
    const seedersCount = seedersMatch ? parseInt(seedersMatch[1], 10) : 0;

    const audio = detectAudio(full);

    const sizeScore = Math.min((sizeBytes / (1024 * 1024 * 1024)) * 12, 450);
    const peerScore = Math.min(seedersCount * 0.6, 500);
    const arabicBonus = audio.hasArabic ? 3000 : 0;
    // الفوري أولاً، ثم ما يحتاج تحميلاً، وأخيراً التورنت المباشر
    const statusScore = status === "instant" ? 50000 : status === "download" ? 0 : -10000;
    const finalScore = statusScore + arabicBonus + resScore + ripBonus + visualBonus + audioBonus + sizeScore + peerScore;

    const statusLabel = status === "instant" ? "فوري" : status === "download" ? "يحتاج تحميل" : "تورنت مباشر";
    const tags = [statusLabel, source, hdr, videoCodec, audioCodec, sizeMatch ? sizeMatch[1].replace(/\s+/g, "") : ""].filter(Boolean).join(" • ");
    const desc = `${audio.label}\n${tags}`;

    const cleanStream = {
      name: hdrShort ? `${resLabel} ${hdrShort}` : resLabel,
      title: desc,
      description: desc,
      behaviorHints: {
        // نفس الدقة ونفس لغة الصوت تُختار تلقائياً في الحلقة التالية
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

    // نحتفظ بحقول مهمة لمطابقة الترجمة وتشغيل الروابط (كانت تُحذف سابقاً)
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
// 4.1 صفحة التثبيت: خفيفة (بدون Tailwind ولا خطوط خارجية)
// =========================================================================

function renderConfigPage(host) {
  const links = TAB_ORDER.map(k => `stremio://${host}/${k}/manifest.json`);
  const tile = (k, accent) =>
    `<a class="tile${accent ? " accent" : ""}" href="stremio://${host}/${k}/manifest.json"><b>${TABS[k].label}</b><span>${TABS[k].desc}</span></a>`;
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${ADDON_NAME}</title>
<style>
  :root{--gold:#e5b53a;--bg:#08080b;--card:#111118;--line:rgba(255,255,255,.09)}
  *{box-sizing:border-box;margin:0}
  body{min-height:100vh;display:grid;place-items:center;padding:20px;background:var(--bg);color:#e8e8ee;
       font-family:"Segoe UI",Tahoma,Arial,sans-serif;line-height:1.7}
  .card{width:100%;max-width:560px;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:28px}
  h1{font-size:28px;color:var(--gold);margin-bottom:4px;letter-spacing:.5px}
  p{color:#9a9aa8;font-size:14px}
  h2{font-size:15px;color:#f3e5ab;margin:22px 0 4px}
  .main{display:block;margin-top:12px;padding:14px;border-radius:12px;text-align:center;font-weight:700;
        background:var(--gold);color:#09090c;text-decoration:none;border:0;width:100%;font:inherit;font-weight:700;cursor:pointer}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px;margin-top:12px}
  .tile{display:flex;flex-direction:column;align-items:center;padding:14px 8px;border:1px solid var(--line);
        border-radius:12px;text-decoration:none;color:#fff;background:#16161e;text-align:center}
  .tile b{font-size:19px}.tile span{font-size:11px;color:#9a9aa8}
  .tile.accent{border-color:var(--gold)}.tile.accent b{color:var(--gold)}
  .tile:hover,.main:hover{filter:brightness(1.15)}
  .warn{margin-top:14px;padding:10px 12px;border-radius:10px;background:#2a1d0a;color:#f3d28a;font-size:13px}
  .copy{margin-top:18px;width:100%;padding:11px;border-radius:10px;border:1px solid var(--line);background:transparent;color:#bbb;cursor:pointer;font:inherit;font-size:13px}
</style>
</head>
<body>
<div class="card">
  <h1>${ADDON_NAME}</h1>
  <p>كتالوجات وتفاصيل وترجمات معرّبة، وبث سريع مرتب حسب الدقة ولغة الصوت.</p>

  <h2>1. التثبيت الكامل (كتالوجات + تفاصيل + ترجمة + بث) - يعمل مباشرة</h2>
  <a class="main" href="stremio://${host}/manifest.json">تثبيت ${ADDON_NAME}</a>

  <h2>2. مربعات الفلترة (اختياري - تظهر كتبويبات صغيرة بجانب 1take2)</h2>
  <div class="grid">
    ${tile("4k", true)}${tile("1080p", true)}${tile("hdr", true)}${tile("720p", true)}
    ${tile("arabic")}${tile("cached")}
  </div>
  <button class="main" id="all" onclick="installAll(this)">تثبيت كل المربعات بالتتابع</button>
  <div class="warn">تريد المربعات فقط بدون تبويب «${ADDON_NAME}»؟ ثبّت
    <a href="stremio://${host}/lite/manifest.json" style="color:#fff">النسخة الخفيفة (بدون بث)</a>
    بدل التثبيت الكامل، ثم ثبّت مربعاً واحداً على الأقل، وإلا سيظهر «التشغيل غير متاح».</div>

  <button class="copy" onclick="navigator.clipboard.writeText('https://${host}/manifest.json');this.innerText='تم نسخ الرابط'">نسخ رابط الإضافة الأساسية</button>
</div>
<script>
var links = ${JSON.stringify(links)};
function installAll(btn){
  var i = 0; btn.disabled = true;
  (function next(){
    if (i >= links.length) { btn.innerText = 'تم'; btn.disabled = false; return; }
    btn.innerText = 'تثبيت ' + (i + 1) + '/' + links.length + ' - أكّد في Stremio';
    location.href = links[i++];
    setTimeout(next, 2800);
  })();
}
</script>
</body>
</html>`;
}

// =========================================================================
// 5. بناء صفحة التفاصيل (Meta) معرّبة بالكامل: القصة + الحلقات + التصنيفات
// =========================================================================

function parseExtra(extraPart) {
  const o = {};
  if (!extraPart) return o;
  for (const kv of extraPart.split("&")) {
    const i = kv.indexOf("=");
    if (i < 0) continue;
    const k = kv.slice(0, i);
    const v = kv.slice(i + 1);
    try { o[k] = decodeURIComponent(v); } catch { o[k] = v; }
  }
  return o;
}

const epKey = v => `${v.season}:${v.episode ?? v.number}`;

async function buildArabicMeta(type, id) {
  let base = null;
  let arMeta = null;

  if (id.startsWith("kitsu:")) {
    const k = await safeFetchJson(`${UPSTREAM_ADDONS.animeKitsu}/meta/${type}/${id}.json`);
    base = k?.meta || null;
  } else {
    const [arRes, cineRes] = await Promise.all([
      safeFetchJson(`${UPSTREAM_ADDONS.tmdbAddon}/meta/${type}/${id}.json`, {}, 2500),
      safeFetchJson(`${UPSTREAM_ADDONS.cinemeta}/meta/${type}/${id}.json`)
    ]);
    arMeta = arRes?.meta || null;
    base = cineRes?.meta || arMeta;
  }
  if (!base) return null;

  const meta = { ...base, name: stripAllEmojis(base.name || "") };

  // الاسم: العربي من TMDB إن وجد
  if (arMeta?.name && hasArabic(arMeta.name)) meta.name = stripAllEmojis(arMeta.name);

  // التصنيفات (الحقل والروابط)
  if (Array.isArray(meta.genres)) meta.genres = localizeGenres(meta.genres);
  if (Array.isArray(meta.genre)) meta.genre = localizeGenres(meta.genre);
  if (Array.isArray(meta.links)) {
    meta.links = meta.links.map(l => (l && l.category === "Genres") ? { ...l, name: GENRE_AR_MAP[l.name] || l.name } : l);
  }

  // القصة: عربي TMDB ثم القصة المنتقاة ثم ترجمة الأصل
  let plot = pickPlot(meta);
  const arPlot = pickPlot(arMeta);
  if (isTextArabic(arPlot)) plot = arPlot;

  // الحلقات: نأخذ الأسماء والقصص العربية من TMDB ونترجم الباقي
  const arVideos = new Map();
  for (const v of (arMeta?.videos || [])) arVideos.set(epKey(v), v);

  const toTranslate = []; // { kind: 'plot'|'ov'|'name', idx, text }
  if (plot && !isTextArabic(plot)) toTranslate.push({ kind: "plot", text: plot });

  if (Array.isArray(meta.videos) && meta.videos.length) {
    meta.videos = meta.videos.map(v => {
      const out = { ...v };
      const av = arVideos.get(epKey(v));

      const avName = av?.name || av?.title;
      if (avName && hasArabic(avName)) { out.name = avName; out.title = avName; }

      const avOv = av?.overview || av?.description;
      if (avOv && isTextArabic(avOv)) { out.overview = avOv; out.description = avOv; }
      return out;
    });

    // ترجمة قصص الحلقات المتبقية (حد أقصى 60 حلقة لكل طلب لتبقى الاستجابة سريعة)
    let budget = 60;
    meta.videos.forEach((v, idx) => {
      const ov = v.overview || v.description;
      if (ov && !isTextArabic(ov) && budget > 0) {
        toTranslate.push({ kind: "ov", idx, text: ov });
        budget--;
      }
    });
  }

  let complete = true;
  const missing = [];
  for (const t of toTranslate) {
    const ar = cachedArabic(t.text);
    if (!ar) { missing.push(t); continue; }
    if (t.kind === "plot") plot = ar;
    else { meta.videos[t.idx].overview = ar; meta.videos[t.idx].description = ar; }
  }

  // القصة العامة ننتظرها قليلاً (2.2 ثانية) لأنها أهم ما في الصفحة
  const plotJob = missing.find(t => t.kind === "plot");
  if (plotJob) {
    const out = await translateToArabic(plotJob.text, Date.now() + 2200);
    if (out && isTextArabic(out)) plot = out; else complete = false;
  }

  // قصص الحلقات: تُترجم في الخلفية وتُخزَّن، وتظهر في الفتح التالي بلا انتظار
  const epJobs = missing.filter(t => t.kind === "ov");
  if (epJobs.length) {
    complete = false;
    translateMany(epJobs.slice(0, 40).map(t => t.text), { limit: 4, budgetMs: 9000 }).catch(() => {});
  }

  if (plot) applyPlot(meta, plot);
  return { meta, complete };
}

// =========================================================================
// 5.1 بناء قائمة الروابط: متوازي مع مهلة، مشترك بين التبويبات، مع نسخة قديمة احتياطية
// =========================================================================

const streamBuilds = new Map();
const withDeadline = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r(null), ms))]);

const BAD_RELEASE = /hdcam|camrip|\bcam\b|telesync|\bts\b|tsrip|hdts|telecine|\bscr\b/i;
// بعد وصول رد Torrentio ننتظر المصادر الأخرى هذه المدة فقط بدل انتظار أبطأ مصدر
const PRIMARY_GRACE_MS = 900;

function streamSources(type, id) {
  const path = `/stream/${type}/${id}.json`;
  const src = [
    { primary: true, run: () => withDeadline(safeFetchJson(`${UPSTREAM_URL}${path}`, {}, 7000), 7000) },
    { run: () => withDeadline(safeFetchJson(`${UPSTREAM_ADDONS.webstreamr}${path}`, {}, 4200), 4200) }
  ];
  const extra = base => ({ run: () => withDeadline(safeFetchJson(`${base}${path}`, {}, 2500), 2500) });
  if (ENABLE_P2P) {
    src.push(extra(UPSTREAM_ADDONS.tpbPlus));
    if (type === "movie") src.push(extra(UPSTREAM_ADDONS.yts));
    if (type === "series") src.push(extra(UPSTREAM_ADDONS.eztv));
  }
  if (type === "movie") src.push(extra(UPSTREAM_ADDONS.publicDomain));
  return src;
}

// يشغّل كل المصادر معاً ويكتفي بـ Torrentio + مهلة قصيرة للبقية
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

async function buildStreams(type, id, cacheKey) {
  const results = await collectSources(streamSources(type, id));

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
    saveToCache(cacheKey, list);
    return list;
  }
  // فشلت كل المصادر: نعرض آخر نسخة ناجحة إن وجدت
  return getFromCache(cacheKey, true) || [];
}

function startBuild(type, id, cacheKey) {
  const job = buildStreams(type, id, cacheKey).catch(() => getFromCache(cacheKey, true) || []).finally(() => streamBuilds.delete(cacheKey));
  streamBuilds.set(cacheKey, job);
  return job;
}

// القائمة تُبنى مرة واحدة وتُشارك بين كل المربعات؛ والنسخة القديمة تُعرض فوراً بينما تتجدد
function getStreamList(type, id) {
  const cacheKey = `strlist_v17_${type}_${id}`;
  const fresh = getFromCache(cacheKey);
  if (fresh) return Promise.resolve(fresh);
  const job = streamBuilds.get(cacheKey) || startBuild(type, id, cacheKey);
  const stale = getFromCache(cacheKey, true);
  return stale ? Promise.resolve(stale) : job;
}

// =========================================================================
// 6. موجه الخادم الرئيسي (Master Handler)
// =========================================================================

export default async function handler(req, res) {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Cache-Control", "public, max-age=600, s-maxage=1800, stale-while-revalidate=86400");

    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }

    const host = req.headers["x-forwarded-host"] || req.headers["host"] || "localhost";
    const rawUrl = req.url || "/";
    let path;
    try {
      path = decodeURIComponent(rawUrl.split("?")[0]).replace(/\/+$/, "") || "/";
    } catch {
      path = rawUrl.split("?")[0].replace(/\/+$/, "") || "/";
    }

    // /lite: نفس الإضافة الأساسية لكن بدون بث (لمن يستخدم المربعات فقط)
    let lite = false;
    const liteMatch = path.match(/^\/lite(\/.*)?$/i);
    if (liteMatch) { lite = true; path = liteMatch[1] || "/"; }

    // مربع بث محدد: /4k /1080p /hdr /720p /480p /arabic /cached (و /all القديم)
    let tab = null;
    const tabMatch = path.match(/^\/(8k|4k|2k|1080p|720p|480p|hdr|arabic|cached|all)(\/.*)?$/i);
    if (tabMatch) {
      const raw = tabMatch[1].toLowerCase();
      tab = TAB_ALIAS[raw] || raw;
      path = tabMatch[2] || "/";
    }

    // -----------------------------------------------------------------
    // Manifest
    // -----------------------------------------------------------------
    if (path === "/manifest.json" || path === "/api/index" || path === "/api" || path === "/manifest") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      const { countryName } = getUserRegionInfo(req);

      // إضافات البث: اسم الإضافة نفسه هو المربع الذي يظهر في شاشة السيرفرات
      if (tab) {
        const def = TABS[tab];
        return res.status(200).json({
          id: `app.onetake2.tab.${tab}`,
          version: VERSION,
          name: def.label,
          description: `${ADDON_NAME}: ${def.desc}`,
          resources: ["stream"],
          types: ["movie", "series"],
          idPrefixes: ["tt", "kitsu"],
          catalogs: [],
          behaviorHints: { configurable: false, configurationRequired: false }
        });
      }

      return res.status(200).json({
        id: lite ? "app.onetake2.lite" : "app.onetake2.main",
        version: VERSION,
        name: ADDON_NAME,
        description: "1take2 للأفلام والمسلسلات - تعريب فوري للقصة والحلقات والتصنيفات مع المسلسلات العربية وتصنيف الدقات",
        resources: lite ? ["catalog", "meta", "subtitles"] : ["catalog", "meta", "subtitles", "stream"],
        types: ["movie", "series"],
        idPrefixes: ["tt", "kitsu"],
        catalogs: [
          { type: "movie", id: "top10_region_movies", name: `Movies - أفضل 10 في ${countryName}` },
          { type: "series", id: "top10_region_series", name: `Series - أفضل 10 في ${countryName}` },
          { type: "movie", id: "trending_daily_movies", name: "Movies - ترند اليوم", extra: [{ name: "skip", isRequired: false }] },
          { type: "series", id: "trending_daily_series", name: "Series - ترند اليوم", extra: [{ name: "skip", isRequired: false }] },
          {
            type: "movie", id: "onetake2_movies_main", name: "Movies",
            extra: [
              { name: "search", isRequired: false },
              { name: "genre", isRequired: false, options: ["Action", "Sci-Fi", "Thriller", "Drama", "Crime", "Mystery", "Adventure", "Horror", "Comedy", "Animation", "Fantasy"] },
              { name: "skip", isRequired: false }
            ]
          },
          {
            type: "series", id: "onetake2_series_main", name: "Series",
            extra: [
              { name: "search", isRequired: false },
              { name: "genre", isRequired: false, options: ["Action", "Sci-Fi", "Thriller", "Drama", "Crime", "Mystery", "Adventure", "Horror", "Comedy", "Animation", "Fantasy"] },
              { name: "skip", isRequired: false }
            ]
          },
          ...nuvioCatalogs()
        ],
        behaviorHints: { configurable: false, configurationRequired: false }
      });
    }

    if (path === "/health") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      const providers = {};
      for (const [h, st] of healthMetrics) providers[h] = { fails: st.fails, healthy: !(st.fails >= 3 && Date.now() - st.lastFail < 60000) };
      return res.status(200).json({ status: "ok", version: VERSION, cacheEntries: memoryCache.size, providers });
    }

    if (path === "" || path === "/") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(renderConfigPage(host));
    }

    // -----------------------------------------------------------------
    // الكتالوجات
    // -----------------------------------------------------------------
    if (path.includes("/catalog/")) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      const subPath = path.substring(path.indexOf("/catalog/"));
      const parts = subPath.split("/").filter(Boolean);
      const type = parts[1] || "movie";
      const catalogId = (parts[2] || "").replace(/\.json$/, "");
      const extraPart = parts[3] ? parts[3].replace(/\.json$/, "") : "";

      const { countryCode } = getUserRegionInfo(req);
      const daySeed = Math.floor(Date.now() / (1000 * 60 * 60 * 12));

      const cacheKey = `cat_ar_v15_${type}_${catalogId}_${countryCode}_${daySeed}_${extraPart}`;
      const cachedCat = getFromCache(cacheKey);
      if (cachedCat) return res.status(200).json(cachedCat);

      // ---- بقية الكتالوجات ----
      const extraSuffix = extraPart ? `/${extraPart}.json` : ".json";
      const extra = parseExtra(extraPart);
      const isTrending = catalogId === "trending_daily_movies" || catalogId === "trending_daily_series";
      const isTop10 = catalogId === "top10_region_movies" || catalogId === "top10_region_series";

      let tmdbUrl = `${UPSTREAM_ADDONS.tmdbAddon}/catalog/${type}/tmdb.top${extraSuffix}`;
      let cinemetaUrl = `${UPSTREAM_ADDONS.cinemeta}/catalog/${type}/top${extraSuffix}`;

      const isNuvio = catalogId.startsWith("nuvio-");
      if (isNuvio) {
        tmdbUrl = `${NUVIO_URL}/catalog/${type}/${catalogId.slice(6)}${extraSuffix}`;
        cinemetaUrl = null;
      } else if (isTrending) {
        tmdbUrl = `${UPSTREAM_ADDONS.tmdbAddon}/catalog/${type}/tmdb.trending${extraSuffix}`;
      } else if (isTop10) {
        tmdbUrl = `${UPSTREAM_ADDONS.tmdbAddon}/catalog/${type}/tmdb.trending.json`;
        cinemetaUrl = `${UPSTREAM_ADDONS.cinemeta}/catalog/${type}/top.json`;
      } else if (extra.search) {
        // كان البحث يُرسل إلى tmdb.top فيرجع الأعلى تقييماً بدل نتائج البحث. الصحيح كتالوج البحث
        tmdbUrl = `${UPSTREAM_ADDONS.tmdbAddon}/catalog/${type}/tmdb.search${extraSuffix}`;
      }

      // التصنيفات في الـ manifest بالإنجليزية بينما TMDB العربي يتوقعها بالعربية، فنعتمد Cinemeta وحده عند الفلترة بالتصنيف
      const skipTmdb = !isNuvio && Boolean(extra.genre) && !extra.search;

      const tmdbP = skipTmdb ? Promise.resolve(null) : safeFetchJson(tmdbUrl);
      const cineP = cinemetaUrl ? safeFetchJson(cinemetaUrl) : Promise.resolve(null);
      const tmdbData = await tmdbP;
      // وصلت قائمة TMDB: Cinemeta احتياطي للقصص فقط فلا ننتظره أكثر من لحظة
      const cinemetaData = (Array.isArray(tmdbData?.metas) && tmdbData.metas.length)
        ? await withDeadline(cineP, 300)
        : await cineP;

      const arabicPlotsById = new Map();
      if (Array.isArray(tmdbData?.metas)) {
        for (const tm of tmdbData.metas) {
          const plot = pickPlot(tm);
          if (tm?.id && isTextArabic(plot)) arabicPlotsById.set(tm.id, plot);
        }
      }

      const sourceList = (Array.isArray(tmdbData?.metas) && tmdbData.metas.length > 0)
        ? tmdbData.metas
        : (Array.isArray(cinemetaData?.metas) ? cinemetaData.metas : []);

      const englishPlotsById = new Map();
      if (Array.isArray(cinemetaData?.metas)) {
        for (const cm of cinemetaData.metas) {
          const plot = pickPlot(cm);
          if (cm?.id && plot) englishPlotsById.set(cm.id, plot);
        }
      }

      let cleanMetas = [];
      const seenIds = new Set();
      for (const m of sourceList) {
        // idPrefixes لا تدعم tmdb: لذلك نتجاهل أي عنصر بلا معرّف tt/kitsu
        if (m && m.id && /^(tt|kitsu)/.test(String(m.id)) && !seenIds.has(m.id)) {
          seenIds.add(m.id);
          const bestPlot = arabicPlotsById.get(m.id) || pickPlot(m) || englishPlotsById.get(m.id) || "";
          const entry = {
            ...m,
            name: stripAllEmojis(m.name || ""),
            genres: localizeGenres(m.genres)
          };
          applyPlot(entry, bestPlot);
          cleanMetas.push(entry);
        }
      }

      // الترتيب الحقيقي حسب الشعبية في TMDB (كان الترتيب سابقاً عشوائياً يتغير كل 12 ساعة)
      if (isTop10) {
        cleanMetas = cleanMetas.slice(0, 10).map((item, idx) => ({ ...item, name: `TOP ${idx + 1} - ${item.name}` }));
      }

      const { items: localizedBatch, complete } = await localizeCatalogList(cleanMetas.slice(0, 45), type);
      const finalMetas = [...localizedBatch, ...cleanMetas.slice(45)];

      // إذا تعطلت كل المصادر نعرض آخر نسخة محفوظة بدل شاشة فارغة
      if (finalMetas.length === 0) {
        const stale = getFromCache(cacheKey, true);
        if (stale) return res.status(200).json(stale);
      }

      const payload = { metas: finalMetas };
      // لا نخزّن قائمة فيها قصة إنجليزية حتى لا تبقى 25 دقيقة (كان هذا سبب الخلط)
      if (finalMetas.length > 0 && complete) saveToCache(cacheKey, payload);
      else res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60");
      return res.status(200).json(payload);
    }

    // -----------------------------------------------------------------
    // التفاصيل (Meta)
    // -----------------------------------------------------------------
    if (path.includes("/meta/")) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      const parts = path.substring(path.indexOf("/meta/")).split("/").filter(Boolean);
      const type = parts[1] || "movie";
      const id = (parts[2] || "").replace(/\.json$/, "");

      const cacheKey = `meta_ar_v15_${type}_${id}`;
      const cachedMeta = getFromCache(cacheKey);
      if (cachedMeta) return res.status(200).json(cachedMeta);

      const built = await buildArabicMeta(type, id);
      if (!built) return res.status(200).json({ meta: null });

      const resultObj = { meta: built.meta };
      if (built.complete) saveToCache(cacheKey, resultObj);
      else res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60");
      return res.status(200).json(resultObj);
    }

    // -----------------------------------------------------------------
    // الترجمات العربية (كانت معلنة في الـ manifest بلا أي معالج)
    // -----------------------------------------------------------------
    if (path.includes("/subtitles/")) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      const parts = path.substring(path.indexOf("/subtitles/")).split("/").filter(Boolean);
      const type = parts[1] || "movie";
      const id = (parts[2] || "").replace(/\.json$/, "");

      const cacheKey = `subs_ar_v15_${type}_${id}`;
      const cachedSubs = getFromCache(cacheKey);
      if (cachedSubs) return res.status(200).json({ subtitles: cachedSubs });

      const sources = [UPSTREAM_ADDONS.opensubtitlesV3, UPSTREAM_ADDONS.subdl, UPSTREAM_ADDONS.yifysubs];
      const responses = await Promise.all(
        sources.map(base => safeFetchJson(`${base}/subtitles/${type}/${id}.json`, {}, 4000))
      );

      const isArabicLang = l => /^(ara|ar|arb|arabic|ar-[a-z]{2})$/i.test(String(l || "").trim());
      const seenUrls = new Set();
      const subtitles = [];
      for (const r of responses) {
        if (!Array.isArray(r?.subtitles)) continue;
        for (const s of r.subtitles) {
          if (!s?.url || !isArabicLang(s.lang) || seenUrls.has(s.url)) continue;
          seenUrls.add(s.url);
          subtitles.push({ id: String(s.id || s.url), url: s.url, lang: "ara" });
        }
      }

      if (subtitles.length) saveToCache(cacheKey, subtitles);
      return res.status(200).json({ subtitles: subtitles.slice(0, 20) });
    }

    // -----------------------------------------------------------------
    // البث
    // -----------------------------------------------------------------
    if (path.includes("/stream/")) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=120, s-maxage=300, stale-while-revalidate=900");
      const streamSubPath = path.substring(path.indexOf("/stream/"));
      const parts = streamSubPath.split("/").filter(Boolean);
      const type = parts[1] || "movie";
      const id = (parts[2] || "").replace(/\.json$/, "");

      // القائمة الكاملة تُبنى مرة واحدة وتُشارك بين كل المربعات بدل تكرار الطلبات
      const list = await getStreamList(type, id);
      const def = tab ? TABS[tab] : null;
      const filtered = def ? list.filter(def.test) : list;

      const finalStreams = filtered.slice(0, 60).map(stripPrivate);
      // نتيجة فارغة: لا نثبّتها في كاش المتصفح/CDN طويلاً
      if (finalStreams.length === 0) res.setHeader("Cache-Control", "public, max-age=15, s-maxage=30");
      return res.status(200).json({ streams: finalStreams });
    }

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(200).json({
      status: "نشط",
      name: "Movies & Series - 1take2 v17"
    });

  } catch {
    return res.status(200).json({ streams: [], metas: [], subtitles: [] });
  }
}
