// =========================================================================
// 1. الإعدادات الأساسية والبلوقنات المستقرة بدون تداخل (Conflict-Free Addons)
// =========================================================================

const UPSTREAM_URL = process.env.UPSTREAM_URL || "https://torrentio.strem.fun/qualityfilter=scr,cam|torbox=3183a8fd-2d85-41fb-a58d-39c5737efae3";
const CACHE_TTL = 25 * 60 * 1000;
const STALE_TTL = 90 * 60 * 1000;
const TIMEOUT_MS = 4500;

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
    memoryCache.delete(key);
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
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ArabicSovereignHub/14.0.0",
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

// تعريب عناصر الكتالوج: تنظيف الأسماء والتصنيفات ثم ترجمة كل قصة غير عربية
async function localizeCatalogList(items, type = "movie") {
  if (!Array.isArray(items) || items.length === 0) return { items: [], complete: true };

  const prepared = items.map(item => ({
    ...item,
    name: stripAllEmojis(item.name || ""),
    genres: localizeGenres(item.genres),
    genre: Array.isArray(item.genre) ? localizeGenres(item.genre) : item.genre
  }));

  // العناصر العلوية بلا قصة: نجلبها من TMDB العربي ثم Cinemeta
  await mapLimit(prepared.slice(0, 15), 5, async (item) => {
    if (pickPlot(item) || !item.id || !String(item.id).startsWith("tt")) return;
    const arMeta = await safeFetchJson(`${UPSTREAM_ADDONS.tmdbAddon}/meta/${type}/${item.id}.json`, {}, 2500);
    let plot = arMeta?.meta?.description || arMeta?.meta?.overview;
    if (!plot) {
      const enMeta = await safeFetchJson(`${UPSTREAM_ADDONS.cinemeta}/meta/${type}/${item.id}.json`, {}, 2500);
      plot = enMeta?.meta?.description;
    }
    if (plot) applyPlot(item, plot);
  });

  const needIdx = [];
  const needTexts = [];
  prepared.forEach((item, i) => {
    const p = pickPlot(item);
    if (p && !isTextArabic(p)) {
      needIdx.push(i);
      needTexts.push(p);
    } else if (p) {
      applyPlot(item, p);
    }
  });

  if (needTexts.length) {
    const translated = await translateMany(needTexts, { limit: 8, budgetMs: 6500 });
    needIdx.forEach((idx, k) => {
      const out = translated[k];
      applyPlot(prepared[idx], out || needTexts[k]);
    });
  }

  const complete = prepared.every(item => {
    const p = pickPlot(item);
    return !p || isTextArabic(p);
  });
  return { items: prepared, complete };
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

function cleanAndFormatStream(stream) {
  try {
    const rawName = stream.name || "";
    const rawTitle = stream.title || stream.description || "";
    const full = `${rawName}\n${rawTitle}`;

    // 1. استخراج الدقة فقط بشكل صافي لتكوين مربعات التصنيف في الأعلى
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

    // حساب النقاط في الخلفية فقط لترتيب أفضلية التشغيل السريع بدون إظهار أي كلام زائد
    let ripBonus = 100;
    if (/\b(Remux|BD-?Remux)\b/i.test(full)) ripBonus = 900;
    else if (/\b(BluRay|Blu-Ray|BDRip|BRRip|BDMV)\b/i.test(full)) ripBonus = 650;
    else if (/\b(WEB-DL|WEBDL)\b/i.test(full)) ripBonus = 500;
    else if (/\b(WEBRip|WEB-Rip|WEB)\b/i.test(full)) ripBonus = 400;

    let visualBonus = 0;
    if (/\b(DV|Dolby[\s.-]?Vision|DoVi)\b/i.test(full)) visualBonus += 450;
    if (/\bHDR10\+|HDR10Plus\b/i.test(full)) visualBonus += 380;
    else if (/\b(HDR10|HDR)\b/i.test(full)) visualBonus += 300;

    let audioBonus = 0;
    if (/\bAtmos\b/i.test(full)) audioBonus += 350;
    if (/\bTrueHD\b/i.test(full)) audioBonus += 300;

    const sizeMatch = rawTitle.match(/([0-9]+(?:\.[0-9]+)?\s*(?:TB|GB|MB|GiB|MiB))/i) ||
                      rawName.match(/([0-9]+(?:\.[0-9]+)?\s*(?:TB|GB|MB|GiB|MiB))/i);
    const sizeBytes = sizeMatch ? parseSizeBytes(sizeMatch[1]) : 0;

    const seedersMatch = rawTitle.match(/(?:👤|👥|\bS:?\s*|\bSeeders:?\s*)(\d+)/i);
    const seedersCount = seedersMatch ? parseInt(seedersMatch[1], 10) : 0;

    const isCached = full.includes("⚡") || 
                     /\[(TB|RD|AD|DL|PM|OC)\+\]/i.test(full) || 
                     /\b(torbox|cached|instant|debrid)\b/i.test(full) ||
                     (stream.url && !stream.infoHash);

    const sizeScore = Math.min((sizeBytes / (1024 * 1024 * 1024)) * 12, 450);
    const peerScore = Math.min(seedersCount * 0.6, 500);
    const finalScore = (isCached ? 50000 : 0) + resScore + ripBonus + visualBonus + audioBonus + sizeScore + peerScore;

    // وضع الدقة مرة واحدة فقط في name مع إبقاء title فارغاً لمنع تكرار "4K" مرتين تحت بعض في البطاقة
    const cleanStream = {
      name: resLabel,
      title: "",
      behaviorHints: {
        bingeGroup: `res-${resLabel}`
      },
      _score: finalScore,
      _res: resLabel,
      _hash: getCanonicalKey(stream)
    };

    if (stream.url) cleanStream.url = stream.url;
    if (stream.infoHash) {
      cleanStream.infoHash = stream.infoHash.toLowerCase();
      if (typeof stream.fileIdx === "number") cleanStream.fileIdx = stream.fileIdx;
      cleanStream.sources = extractTrackers(stream);
    }
    if (stream.subtitles) cleanStream.subtitles = stream.subtitles;

    return cleanStream;
  } catch {
    return {
      ...stream,
      name: "1080p",
      title: "",
      _score: 0,
      _res: "1080p",
      _hash: getCanonicalKey(stream)
    };
  }
}

// =========================================================================
// 4. واجهة التثبيت العربية الفخمة مع تفعيل خانات الدقة العلوية (4K / 1080p / 720p)
// =========================================================================

function renderConfigPage(host) {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>المركز السيادي - Movies & Series</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap" rel="stylesheet">
  <style>
    :root {
      --gold: #d4af37;
      --gold-light: #f3e5ab;
      --obsidian: #060609;
      --panel: rgba(15, 16, 22, 0.92);
    }
    body {
      font-family: 'Cairo', sans-serif;
      background-color: var(--obsidian);
      background-image: 
        radial-gradient(circle at 20% 20%, rgba(212, 175, 55, 0.08) 0%, transparent 45%),
        radial-gradient(circle at 80% 80%, rgba(212, 175, 55, 0.05) 0%, transparent 45%);
      color: #e5e7eb;
    }
    .sovereign-card {
      background: var(--panel);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(212, 175, 55, 0.25);
      box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.9);
    }
    .gold-gradient-text {
      background: linear-gradient(135deg, #fff6d6 0%, #d4af37 55%, #997a15 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .gold-btn {
      background: linear-gradient(135deg, #d4af37 0%, #aa820a 100%);
      color: #050507;
      transition: all 0.25s ease;
    }
    .gold-btn:hover {
      filter: brightness(1.1);
      transform: translateY(-2px);
      box-shadow: 0 10px 25px -5px rgba(212, 175, 55, 0.5);
    }
    .spec-box {
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.02);
    }
  </style>
</head>
<body class="min-h-screen flex items-center justify-center p-4 md:p-8">
  <div class="sovereign-card max-w-2xl w-full rounded-2xl p-8 md:p-10 relative overflow-hidden">
    <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#d4af37] to-transparent"></div>

    <div class="text-center space-y-3 border-b border-white/10 pb-7">
      <div class="inline-block px-4 py-1 rounded border border-[#d4af37]/40 bg-[#d4af37]/10 text-[#f3e5ab] text-xs font-bold tracking-wide">
        الإصدار الخامس عشر - تعريب فوري + خانات فرز الدقات العلوية
      </div>
      <h1 class="text-3xl md:text-5xl font-black gold-gradient-text pt-2">
        Movies &amp; Series
      </h1>
      <p class="text-gray-400 text-sm md:text-base max-w-lg mx-auto leading-relaxed">
        تعريب كامل للقصص والتصنيفات في الواجهة الرئيسية قبل الدخول، مع إمكانية تفعيل خانات الدقة العلوية (4K و 1080p و 720p) بجانب زر "الكل".
      </p>
    </div>

    <div class="my-6 space-y-3">
      <div class="text-sm font-bold text-[#f3e5ab] mb-2">
        1. الإضافة الشاملة (الكتالوجات المعربة + الترجمة + جميع الدقات):
      </div>
      <a href="stremio://${host}/manifest.json" class="gold-btn w-full py-3.5 px-6 rounded-xl font-black text-center block text-sm">
        تثبيت الإضافة الشاملة (Movies &amp; Series)
      </a>

      <div class="text-sm font-bold text-[#f3e5ab] pt-4 mb-2">
        2. تفعيل الخانات العلوية حسب الدقة (لتظهر بجانب زر "الكل" فوق السيرفرات):
      </div>
      <p class="text-xs text-gray-400 mb-3">
        ملاحظة مهمة: المشغل يضع اسم الإضافة في الخانات العلوية، لذا ثبّت الخانات التالية لتظهر لك أزرار (4K) و (1080p) و (720p) في الأعلى:
      </p>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <a href="stremio://${host}/4k/manifest.json" class="spec-box hover:border-[#d4af37] py-3 px-3 rounded-xl text-center block transition-all">
          <div class="text-base font-black text-[#f3e5ab]">4K</div>
          <div class="text-[11px] text-gray-400 mt-0.5">تثبيت خانة 4K</div>
        </a>
        <a href="stremio://${host}/1080p/manifest.json" class="spec-box hover:border-[#d4af37] py-3 px-3 rounded-xl text-center block transition-all">
          <div class="text-base font-black text-white">1080p</div>
          <div class="text-[11px] text-gray-400 mt-0.5">تثبيت خانة 1080p</div>
        </a>
        <a href="stremio://${host}/720p/manifest.json" class="spec-box hover:border-[#d4af37] py-3 px-3 rounded-xl text-center block transition-all">
          <div class="text-base font-black text-white">720p</div>
          <div class="text-[11px] text-gray-400 mt-0.5">تثبيت خانة 720p</div>
        </a>
        <a href="stremio://${host}/480p/manifest.json" class="spec-box hover:border-[#d4af37] py-3 px-3 rounded-xl text-center block transition-all">
          <div class="text-base font-black text-white">480p</div>
          <div class="text-[11px] text-gray-400 mt-0.5">تثبيت خانة 480p</div>
        </a>
      </div>
    </div>

    <div class="space-y-2.5 pt-2 border-t border-white/10">
      <button onclick="navigator.clipboard.writeText('https://${host}/manifest.json'); this.innerText='تم نسخ رابط الإضافة الشاملة';" class="w-full py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-xs font-bold text-gray-300 transition-all text-center">
        نسخ رابط الإضافة الشاملة (Manifest URL)
      </button>
    </div>
  </div>
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
      safeFetchJson(`${UPSTREAM_ADDONS.tmdbAddon}/meta/${type}/${id}.json`),
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
  if (toTranslate.length) {
    const results = await translateMany(toTranslate.map(t => t.text), { limit: 8, budgetMs: 7000 });
    toTranslate.forEach((t, k) => {
      const out = results[k];
      const ok = out && isTextArabic(out);
      if (t.kind === "plot") {
        if (ok) plot = out; else complete = false;
      } else if (t.kind === "ov") {
        if (ok) {
          meta.videos[t.idx].overview = out;
          meta.videos[t.idx].description = out;
        } else {
          complete = false;
        }
      }
    });
  }

  if (plot) applyPlot(meta, plot);
  return { meta, complete };
}

// =========================================================================
// 6. موجه الخادم الرئيسي (Master Handler)
// =========================================================================

export default async function handler(req, res) {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Cache-Control", "public, max-age=1800, stale-while-revalidate=3600");

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

    // خانة دقة محددة (/4k/... أو /1080p/...)
    let resolutionFilter = null;
    const resPrefixMatch = path.match(/^\/(8k|4k|2k|1080p|720p|480p)(\/.*)?$/i);
    if (resPrefixMatch) {
      const rawRes = resPrefixMatch[1].toUpperCase();
      resolutionFilter = rawRes === "1080P" ? "1080p" : rawRes === "720P" ? "720p" : rawRes === "480P" ? "480p" : rawRes;
      path = resPrefixMatch[2] || "/";
    }

    // -----------------------------------------------------------------
    // Manifest
    // -----------------------------------------------------------------
    if (path === "/manifest.json" || path === "/api/index" || path === "/api" || path === "/manifest") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      const { countryName } = getUserRegionInfo(req);

      if (resolutionFilter) {
        return res.status(200).json({
          id: `org.sovereign.arabic.res.${resolutionFilter.toLowerCase()}`,
          version: "15.0.0",
          name: resolutionFilter,
          description: `سيرفرات دقة ${resolutionFilter} فقط`,
          resources: ["stream"],
          types: ["movie", "series"],
          idPrefixes: ["tt", "kitsu"],
          catalogs: [],
          behaviorHints: { configurable: false, configurationRequired: false }
        });
      }

      return res.status(200).json({
        id: "org.sovereign.arabic.movies.series",
        version: "15.0.0",
        name: "Movies & Series",
        description: "المركز السيادي للأفلام والمسلسلات - تعريب فوري للقصة والحلقات والتصنيفات مع المسلسلات العربية وتصنيف الدقات",
        resources: ["stream", "subtitles", "catalog", "meta"],
        types: ["movie", "series"],
        idPrefixes: ["tt", "kitsu"],
        catalogs: [
          { type: "movie", id: "top10_region_movies", name: `Movies - أفضل 10 في ${countryName}` },
          { type: "series", id: "top10_region_series", name: `Series - أفضل 10 في ${countryName}` },
          { type: "movie", id: "trending_daily_movies", name: "Movies - ترند اليوم", extra: [{ name: "skip", isRequired: false }] },
          { type: "series", id: "trending_daily_series", name: "Series - ترند اليوم", extra: [{ name: "skip", isRequired: false }] },
          {
            type: "movie", id: "sovereign_movies_main", name: "Movies",
            extra: [
              { name: "search", isRequired: false },
              { name: "genre", isRequired: false, options: ["Action", "Sci-Fi", "Thriller", "Drama", "Crime", "Mystery", "Adventure", "Horror", "Comedy", "Animation", "Fantasy"] },
              { name: "skip", isRequired: false }
            ]
          },
          {
            type: "series", id: "sovereign_series_main", name: "Series",
            extra: [
              { name: "search", isRequired: false },
              { name: "genre", isRequired: false, options: ["Action", "Sci-Fi", "Thriller", "Drama", "Crime", "Mystery", "Adventure", "Horror", "Comedy", "Animation", "Fantasy"] },
              { name: "skip", isRequired: false }
            ]
          }
        ],
        behaviorHints: { configurable: false, configurationRequired: false }
      });
    }

    if (path === "/health") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      const providers = {};
      for (const [h, st] of healthMetrics) providers[h] = { fails: st.fails, healthy: !(st.fails >= 3 && Date.now() - st.lastFail < 60000) };
      return res.status(200).json({ status: "ok", version: "15.0.0", cacheEntries: memoryCache.size, providers });
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

      if (isTrending) {
        tmdbUrl = `${UPSTREAM_ADDONS.tmdbAddon}/catalog/${type}/tmdb.trending${extraSuffix}`;
      } else if (isTop10) {
        tmdbUrl = `${UPSTREAM_ADDONS.tmdbAddon}/catalog/${type}/tmdb.trending.json`;
        cinemetaUrl = `${UPSTREAM_ADDONS.cinemeta}/catalog/${type}/top.json`;
      } else if (extra.search) {
        // كان البحث يُرسل إلى tmdb.top فيرجع الأعلى تقييماً بدل نتائج البحث. الصحيح كتالوج البحث
        tmdbUrl = `${UPSTREAM_ADDONS.tmdbAddon}/catalog/${type}/tmdb.search${extraSuffix}`;
      }

      // التصنيفات في الـ manifest بالإنجليزية بينما TMDB العربي يتوقعها بالعربية، فنعتمد Cinemeta وحده عند الفلترة بالتصنيف
      const skipTmdb = Boolean(extra.genre) && !extra.search;

      const [tmdbData, cinemetaData] = await Promise.all([
        skipTmdb ? Promise.resolve(null) : safeFetchJson(tmdbUrl),
        safeFetchJson(cinemetaUrl)
      ]);

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
      else res.setHeader("Cache-Control", "public, max-age=120");
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
      else res.setHeader("Cache-Control", "public, max-age=120");
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
      res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=900");
      const streamSubPath = path.substring(path.indexOf("/stream/"));
      const cacheKey = `str_${resolutionFilter || "ALL"}_${streamSubPath}`;
      const cachedStreams = getFromCache(cacheKey);
      if (cachedStreams) return res.status(200).json({ streams: cachedStreams });

      const parts = streamSubPath.split("/").filter(Boolean);
      const type = parts[1] || "movie";
      const id = (parts[2] || "").replace(/\.json$/, "");

      const [torrentioData, tpbData, ytsData, eztvData, webstreamrData, publicDomainData] = await Promise.all([
        safeFetchJson(`${UPSTREAM_URL}${streamSubPath}`),
        safeFetchJson(`${UPSTREAM_ADDONS.tpbPlus}/stream/${type}/${id}.json`),
        type === "movie" ? safeFetchJson(`${UPSTREAM_ADDONS.yts}/stream/${type}/${id}.json`) : Promise.resolve(null),
        type === "series" ? safeFetchJson(`${UPSTREAM_ADDONS.eztv}/stream/${type}/${id}.json`) : Promise.resolve(null),
        safeFetchJson(`${UPSTREAM_ADDONS.webstreamr}/stream/${type}/${id}.json`),
        type === "movie" ? safeFetchJson(`${UPSTREAM_ADDONS.publicDomain}/stream/${type}/${id}.json`) : Promise.resolve(null)
      ]);

      const rawCandidates = [];
      const ingestStreams = (dataObj) => {
        if (dataObj && Array.isArray(dataObj.streams)) {
          for (const s of dataObj.streams) {
            if (!s || (!s.url && !s.infoHash)) continue;
            const combinedText = `${s.name || ""} ${s.title || ""} ${s.description || ""}`.toLowerCase();
            if (
              combinedText.includes("hdcam") ||
              combinedText.includes("camrip") ||
              combinedText.includes("telesync") ||
              combinedText.includes("tsrip")
            ) continue;
            rawCandidates.push(cleanAndFormatStream(s));
          }
        }
      };

      ingestStreams(torrentioData);
      ingestStreams(webstreamrData);
      ingestStreams(ytsData);
      ingestStreams(eztvData);
      ingestStreams(tpbData);
      ingestStreams(publicDomainData);

      const uniqueStreamsMap = new Map();
      for (const item of rawCandidates) {
        const key = item._hash;
        const existing = uniqueStreamsMap.get(key);
        if (!existing || (item._score || 0) > (existing._score || 0)) uniqueStreamsMap.set(key, item);
      }

      const deduplicated = Array.from(uniqueStreamsMap.values());
      deduplicated.sort((a, b) => (b._score || 0) - (a._score || 0));

      const filteredByRes = resolutionFilter
        ? deduplicated.filter(item => item._res.toUpperCase() === resolutionFilter.toUpperCase())
        : deduplicated;

      const finalStreams = filteredByRes.slice(0, 80).map(({ _score, _hash, _res, ...cleanItem }) => cleanItem);

      if (finalStreams.length > 0) {
        saveToCache(cacheKey, finalStreams);
      } else {
        const stale = getFromCache(cacheKey, true);
        if (stale) return res.status(200).json({ streams: stale });
      }

      return res.status(200).json({ streams: finalStreams });
    }

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(200).json({
      status: "نشط",
      name: "Movies & Series - المركز السيادي V15.0"
    });

  } catch {
    return res.status(200).json({ streams: [], metas: [], subtitles: [] });
  }
}
