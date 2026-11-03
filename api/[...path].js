// =========================================================================
// 1. الإعدادات وقائمة الملحقات المدمجة تلقائياً (Integrated Addon Registry)
// =========================================================================

// نعتمد على fetch المدمج في Node.js 18+ لتفادي أخطاء الاستيراد في Vercel
const UPSTREAM_URL = process.env.UPSTREAM_URL || "https://torrentio.strem.fun/qualityfilter=scr,cam|torbox=3183a8fd-2d85-41fb-a58d-39c5737efae3";
const OPENSUBTITLES_API_KEY = process.env.OPENSUBTITLES_API_KEY || "";
const CACHE_TTL = 15 * 60 * 1000;
const TIMEOUT_MS = 6000;

// شبكة الملحقات العالمية المدمجة افتراضياً (Stremio Ecosystem Federation)
const UPSTREAM_ADDONS = {
  cinemeta: "https://v3-cinemeta.strem.io",
  watchhub: "https://watchhub.strem.io",
  publicDomain: "https://caching.stremio.net/publicdomainmovies.now.sh",
  opensubtitlesV3: "https://opensubtitles-v3.strem.io",
  cyberflix: "https://cyberflix.kamyroll.tech",
  subdl: "https://subdl.strem.fun",
  animeKitsu: "https://anime-kitsu.strem.fun",
  tmdbAddon: "https://tmdb.strem.fun"
};

// =========================================================================
// 2. إدارة الذاكرة المؤقتة ومعالجة الطلبات الآمنة (In-Memory Cache & Safe Fetch)
// =========================================================================

const memoryCache = new Map();

function getFromCache(key) {
  try {
    const item = memoryCache.get(key);
    if (item && Date.now() - item.time < CACHE_TTL) {
      return item.data;
    }
    memoryCache.delete(key);
  } catch {
    // تجاهل أي استثناء للذاكرة
  }
  return null;
}

function saveToCache(key, data) {
  try {
    if (memoryCache.size > 2000) {
      const keys = Array.from(memoryCache.keys()).slice(0, 600);
      keys.forEach(k => memoryCache.delete(k));
    }
    memoryCache.set(key, { data, time: Date.now() });
  } catch {
    // تجاهل
  }
}

async function safeFetchJson(url, headers = {}) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) StremioUltraFederation/5.0.0",
        "Accept": "application/json",
        ...headers
      }
    });

    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// =========================================================================
// 3. تحليل وتنسيق التيارات والترتيب الذكي (Streams Parsing & AI Scoring)
// =========================================================================

function parseSizeBytes(sizeStr) {
  if (!sizeStr) return 0;
  const match = sizeStr.match(/([0-9]+(?:\.[0-9]+)?)\s*(GB|MB|GIB|MIB)/i);
  if (!match) return 0;
  const val = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  if (unit.startsWith("G")) return val * 1024 * 1024 * 1024;
  if (unit.startsWith("M")) return val * 1024 * 1024;
  return 0;
}

function cleanAndFormatStream(stream) {
  try {
    const originalName = stream.name || "";
    const originalTitle = stream.title || "";
    const full = `${originalName}\n${originalTitle}`;

    // 1. الدقة وجودة الإشارة
    let resLabel = "HD";
    let resScore = 1000;
    const resMatch = full.match(/\b(4320p|8k|2160p|4k|1080p|720p|480p)\b/i);
    if (resMatch) {
      const r = resMatch[1].toUpperCase();
      if (r === "4320P" || r === "8K") { resLabel = "8K ULTRA"; resScore = 8000; }
      else if (r === "2160P" || r === "4K") { resLabel = "4K UHD"; resScore = 4000; }
      else if (r === "1080P") { resLabel = "1080P FHD"; resScore = 2000; }
      else if (r === "720P") { resLabel = "720P HD"; resScore = 1000; }
      else { resLabel = "480P SD"; resScore = 500; }
    }

    // 2. نوع النسخة والمصدر
    let ripType = "";
    let ripBonus = 0;
    if (/\bRemux\b/i.test(full)) { ripType = "REMUX"; ripBonus = 600; }
    else if (/\b(BDRip|BRRip|BluRay)\b/i.test(full)) { ripType = "BLURAY"; ripBonus = 400; }
    else if (/\b(WEB-DL|WEBRip|WEB)\b/i.test(full)) { ripType = "WEB-DL"; ripBonus = 300; }
    else if (/\bHDTV\b/i.test(full)) { ripType = "HDTV"; ripBonus = 100; }

    // 3. تقنيات الصورة والمدى الديناميكي العالي
    const visual = [];
    if (/\b(DV|Dolby[\s.-]?Vision)\b/i.test(full)) visual.push("DOLBY VISION");
    if (/\bHDR10\+/i.test(full)) visual.push("HDR10+");
    else if (/\bHDR\b/i.test(full)) visual.push("HDR");
    if (/\b(10bit|10-bit)\b/i.test(full)) visual.push("10Bit");
    if (/\bIMAX\b/i.test(full)) visual.push("IMAX");

    // 4. ترميز وضغط الفيديو
    let codec = "";
    if (/\b(HEVC|x265|H\.?265)\b/i.test(full)) codec = "HEVC";
    else if (/\b(AVC|x264|H\.?264)\b/i.test(full)) codec = "x264";
    else if (/\bAV1\b/i.test(full)) codec = "AV1";

    // 5. تقنيات الصوت المحيطي والقنوات
    const audio = [];
    if (/\bAtmos\b/i.test(full)) audio.push("ATMOS");
    if (/\bTrueHD\b/i.test(full)) audio.push("TRUEHD");
    else if (/\b(DTS-HD|DTS)\b/i.test(full)) audio.push("DTS-HD");
    else if (/\b(DD\+|E-AC-?3|DDP)\b/i.test(full)) audio.push("DD+ 5.1");
    else if (/\b(5\.1)\b/.test(full)) audio.push("5.1");
    else if (/\b(7\.1)\b/.test(full)) audio.push("7.1");

    // 6. استخراج الحجم الفعلي مع فرض المحاذاة اليسرى LTR لمنع تشوه الأرقام
    const sizeMatch = originalTitle.match(/([0-9]+(?:\.[0-9]+)?\s*(?:GB|MB|GiB|MiB))/i) || 
                      originalName.match(/([0-9]+(?:\.[0-9]+)?\s*(?:GB|MB|GiB|MiB))/i);
    let sizeStr = null;
    let sizeBytes = 0;
    if (sizeMatch) {
      const numPart = sizeMatch[1].match(/[0-9]+(?:\.[0-9]+)?/)[0];
      const unitPart = sizeMatch[1].match(/(?:GB|MB|GiB|MiB)/i)[0].toUpperCase();
      sizeStr = `\u200E${numPart} ${unitPart}\u200E`;
      sizeBytes = parseSizeBytes(sizeMatch[1]);
    }

    // 7. عدد الـ Seeders الحقيقي مع عزل LTR
    const seedersMatch = originalTitle.match(/(?:👤|👥|\bS:?\s*)(\d+)/i);
    const seedersCount = seedersMatch ? parseInt(seedersMatch[1], 10) : 0;
    const seedersBadge = seedersCount > 0 ? `\u200E👥 ${seedersCount}\u200E` : null;

    // 8. التخزين السحابي الفوري
    const isCached = full.includes("⚡") || full.includes("[TB+]") || full.toLowerCase().includes("torbox") || full.toLowerCase().includes("cached");

    // 9. فريق الإصدار ومصدر التورنت
    let releaseGroup = "";
    const groupMatch = full.match(/-([a-zA-Z0-9]+)(?:\[.*?\])?(?:\.mkv|\.mp4)?$/m) ||
                       originalTitle.match(/⚙️\s*([a-zA-Z0-9]+)|RARBG|YTS|PSA|TGx|FLUX|NTb|CMRG|QxR/i);
    if (groupMatch) {
      releaseGroup = (groupMatch[1] || groupMatch[0]).replace(/⚙️/g, "").trim();
    }

    // ==========================================
    // صياغة التصميم الاحترافي الفخم لبطاقة Stremio
    // ==========================================
    // السطر العلوي (Title Bar): شارة التخزين السحابي أولاً متبوعة بالجودة والتقنيات
    const headerElements = [
      resLabel,
      ripType,
      visual.length > 0 ? visual.join("/") : null,
      codec
    ].filter(Boolean);

    const providerTag = isCached ? "[ ⚡ TORBOX ]" : "[ P2P ]";
    const titleBar = `${headerElements.join("  •  ")}  ${providerTag}`;

    // السطر الثاني (Info Row): تنسيق مقفل باتجاه LTR لضمان عدم انعكاس الأرقام والرموز نهائياً
    const infoPills = [
      sizeStr ? `📦 ${sizeStr}` : null,
      audio.length > 0 ? `🔊 \u200E${audio.join(" ")}\u200E` : null,
      seedersBadge,
      releaseGroup ? `🏷️ \u200E${releaseGroup}\u200E` : null
    ].filter(Boolean);

    const separator = "────────────────────────────────────────";
    const subLine = infoPills.length > 0 
      ? infoPills.join("   │   ")
      : "\u200E⚡ فائق السرعة - جاهز للمشاهدة المباشرة\u200E";

    // احتساب سكور الترتيب الدقيق
    const finalScore = (isCached ? 25000 : 0) + resScore + ripBonus + (seedersCount * 0.3) + (sizeBytes / (1024 * 1024 * 1024) * 5);

    return {
      ...stream,
      name: titleBar,
      title: `${separator}\n${subLine}`,
      _score: finalScore,
      _hash: stream.infoHash || stream.url || originalTitle
    };
  } catch {
    return stream;
  }
}

// صفحة ويب متطورة للتثبيت السريع بضغطة زر
function renderConfigPage(host) {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Stremio Master Hub Ultra Pro</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Cairo', sans-serif; background-color: #0b0f19; }
    .glass { background: rgba(17, 24, 39, 0.7); backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.08); }
    .glow { box-shadow: 0 0 40px -10px rgba(99, 102, 241, 0.5); }
  </style>
</head>
<body class="text-gray-200 min-h-screen flex items-center justify-center p-4">
  <div class="glass max-w-xl w-full rounded-3xl p-8 glow border border-indigo-500/30">
    <div class="text-center space-y-4">
      <div class="inline-flex p-4 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 shadow-xl">
        <svg class="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h1 class="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-300 to-pink-400">
        Stremio Master Hub Ultra
      </h1>
      <p class="text-gray-400 text-sm leading-relaxed">
        الملحق الفائق الجامع لكل إمكانيات Stremio: تصنيفات Netflix & Disney، ترجمات SubDL و OpenSubtitles العربية، تدفق TorBox السحابي مع تنظيف كامل للجودات.
      </p>
    </div>

    <div class="mt-8 space-y-3">
      <div class="flex items-center justify-between p-3.5 rounded-xl bg-gray-800/40 border border-gray-700/50">
        <span class="text-sm font-semibold flex items-center gap-2">⚡ تدفق سحابي فوري (TorBox / Torrentio)</span>
        <span class="text-xs px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 font-bold">مُفعل</span>
      </div>
      <div class="flex items-center justify-between p-3.5 rounded-xl bg-gray-800/40 border border-gray-700/50">
        <span class="text-sm font-semibold flex items-center gap-2">🎬 منصات البث (Netflix, Apple, Disney, HBO)</span>
        <span class="text-xs px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 font-bold">مُفعل</span>
      </div>
      <div class="flex items-center justify-between p-3.5 rounded-xl bg-gray-800/40 border border-gray-700/50">
        <span class="text-sm font-semibold flex items-center gap-2">💬 ترجمات عربية ذكية (SubDL + OpenSubtitles v3)</span>
        <span class="text-xs px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 font-bold">مُفعل</span>
      </div>
      <div class="flex items-center justify-between p-3.5 rounded-xl bg-gray-800/40 border border-gray-700/50">
        <span class="text-sm font-semibold flex items-center gap-2">🏛️ سينما كلاسيكية (Cinemeta + Public Domain)</span>
        <span class="text-xs px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 font-bold">مُفعل</span>
      </div>
    </div>

    <div class="mt-8 space-y-4">
      <a href="stremio://${host}/manifest.json" class="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 font-bold text-center block text-white shadow-lg shadow-indigo-500/30 transform hover:-translate-y-0.5 transition-all text-base">
        🚀 تثبيت الملحق في Stremio بضغطة واحدة
      </a>
      <button onclick="navigator.clipboard.writeText('https://${host}/manifest.json'); this.innerText='تم نسخ الرابط بنجاح! ✓';" class="w-full py-3 px-4 rounded-xl bg-gray-800/80 hover:bg-gray-800 border border-gray-700 text-sm font-semibold text-gray-300 transition-all text-center">
        📋 نسخ رابط الـ Manifest يدوياً
      </button>
    </div>
  </div>
</body>
</html>`;
}

// =========================================================================
// 4. موجه الخادم الرئيسي المقاوم للأخطاء (Crash-Proof Master Handler)
// =========================================================================

export default async function handler(req, res) {
  try {
    // ترويسات الأمان و CORS الكاملة لجميع المشغلات (Stremio, Nuvio, Web)
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=1800");

    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }

    const host = req.headers["x-forwarded-host"] || req.headers["host"] || "localhost";
    const rawUrl = req.url || "/";
    const path = rawUrl.split("?")[0].replace(/\/+$/, "") || "/";

    // ----------------------------------------------------
    // أ. ملف التعريف الشامل (Federated Manifest) - متوافق كلياً مع Stremio و Nuvio
    // ----------------------------------------------------
    if (path === "/manifest.json" || path === "/api/index" || path === "/api" || path === "/manifest") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.status(200).json({
        id: "org.allinone.torrentio.master.ultra",
        version: "5.5.0",
        name: "Stremio Master Hub Ultra Pro",
        description: "مجمع شامل يدمج تلقائياً: تدفقات TorBox السحابية، كتالوجات منصات البث (Netflix & Disney)، ترجمات SubDL و OpenSubtitles العربية، ومكتبات Cinemeta & Public Domain",
        resources: ["stream", "subtitles", "catalog", "meta"],
        types: ["movie", "series", "anime", "other"],
        catalogs: [
          {
            type: "movie",
            id: "top_cinemeta_movies",
            name: "🔥 أفلام رائجة (Cinemeta)"
          },
          {
            type: "series",
            id: "top_cinemeta_series",
            name: "📺 مسلسلات مميزة (Cinemeta)"
          },
          {
            type: "movie",
            id: "cyberflix_netflix_movies",
            name: "🍿 أفلام نتفلكس (Netflix Hub)"
          },
          {
            type: "series",
            id: "cyberflix_apple_series",
            name: "🍏 مسلسلات Apple TV+"
          },
          {
            type: "movie",
            id: "cyberflix_disney_movies",
            name: "✨ أفلام Disney+ Originals"
          },
          {
            type: "movie",
            id: "public_domain_classics",
            name: "🏛️ كلاسيكيات السينما المجانية"
          }
        ],
        behaviorHints: {
          configurable: false,
          configurationRequired: false
        }
      });
    }

    // عرض واجهة التثبيت السريع عند فتح الرابط بالمتصفح
    if (path === "" || path === "/") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(renderConfigPage(host));
    }

    // ----------------------------------------------------
    // أ. ملف التعريف الشامل (Federated Manifest)
    // ----------------------------------------------------
    if (path === "/manifest.json" || path === "/api/index" || path === "/api") {
      return res.status(200).json({
        id: "org.allinone.torrentio.master.ultra",
        version: "5.5.0",
        name: "Stremio Master Hub Ultra Pro",
        description: "مجمع شامل يدمج تلقائياً: تدفقات TorBox السحابية، كتالوجات منصات البث (Netflix & Disney)، ترجمات SubDL و OpenSubtitles العربية، ومكتبات Cinemeta & Public Domain",
        resources: ["stream", "subtitles", "catalog", "meta"],
        types: ["movie", "series", "anime", "other"],
        catalogs: [
          {
            type: "movie",
            id: "top_cinemeta_movies",
            name: "🔥 أفلام رائجة (Cinemeta)"
          },
          {
            type: "series",
            id: "top_cinemeta_series",
            name: "📺 مسلسلات مميزة (Cinemeta)"
          },
          {
            type: "movie",
            id: "cyberflix_netflix_movies",
            name: "🍿 أفلام نتفلكس (Netflix Hub)"
          },
          {
            type: "series",
            id: "cyberflix_apple_series",
            name: "🍏 مسلسلات Apple TV+"
          },
          {
            type: "movie",
            id: "cyberflix_disney_movies",
            name: "✨ أفلام Disney+ Originals"
          },
          {
            type: "movie",
            id: "public_domain_classics",
            name: "🏛️ كلاسيكيات السينما المجانية"
          }
        ]
      });
    }

    // ----------------------------------------------------
    // ب. مسار الكتالوجات المدمجة تلقائياً (Catalogs Aggregation)
    // ----------------------------------------------------
    if (path.includes("/catalog/")) {
      const parts = path.substring(path.indexOf("/catalog/")).split("/").filter(Boolean);
      const type = parts[1] || "movie";
      const catalogId = (parts[2] || "").replace(".json", "");

      const cacheKey = `cat_${type}_${catalogId}`;
      const cachedCat = getFromCache(cacheKey);
      if (cachedCat) return res.status(200).json(cachedCat);

      // 1. كلاسيكيات سينما الملكية العامة (Public Domain)
      if (catalogId === "public_domain_classics") {
        const pdData = await safeFetchJson(`${UPSTREAM_ADDONS.publicDomain}/catalog/movie/public_domain_movies.json`);
        if (pdData && Array.isArray(pdData.metas)) {
          saveToCache(cacheKey, pdData);
          return res.status(200).json(pdData);
        }
      }

      // 2. كتالوجات منصات البث (CyberFlix Proxy: Netflix, Apple, Disney)
      if (catalogId.startsWith("cyberflix_")) {
        let cfPlatform = "netflix";
        if (catalogId.includes("apple")) cfPlatform = "apple";
        else if (catalogId.includes("disney")) cfPlatform = "disney";
        
        const cfData = await safeFetchJson(`${UPSTREAM_ADDONS.cyberflix}/catalog/${type}/${cfPlatform}.json`);
        if (cfData && Array.isArray(cfData.metas)) {
          saveToCache(cacheKey, cfData);
          return res.status(200).json(cfData);
        }
      }

      // 3. كتالوج Cinemeta الافتراضي المحدث
      const cinemetaData = await safeFetchJson(`${UPSTREAM_ADDONS.cinemeta}/catalog/${type}/top.json`);
      if (cinemetaData && Array.isArray(cinemetaData.metas)) {
        saveToCache(cacheKey, cinemetaData);
        return res.status(200).json(cinemetaData);
      }

      return res.status(200).json({ metas: [] });
    }

    // ----------------------------------------------------
    // ج. مسار الميتا وبيانات العرض (Meta Aggregation)
    // ----------------------------------------------------
    if (path.includes("/meta/")) {
      const parts = path.substring(path.indexOf("/meta/")).split("/").filter(Boolean);
      const type = parts[1] || "movie";
      const id = (parts[2] || "").replace(".json", "");

      const cacheKey = `meta_${type}_${id}`;
      const cachedMeta = getFromCache(cacheKey);
      if (cachedMeta) return res.status(200).json(cachedMeta);

      // محاولة الجلب من TMDB أولاً ثم Cinemeta لضمان أعلى جودة للملصقات والتقييمات
      const [metaCinemeta, metaTMDB] = await Promise.all([
        safeFetchJson(`${UPSTREAM_ADDONS.cinemeta}/meta/${type}/${id}.json`),
        safeFetchJson(`${UPSTREAM_ADDONS.tmdbAddon}/meta/${type}/${id}.json`)
      ]);

      const chosenMeta = metaTMDB?.meta || metaCinemeta?.meta;
      if (chosenMeta) {
        saveToCache(cacheKey, { meta: chosenMeta });
        return res.status(200).json({ meta: chosenMeta });
      }

      return res.status(200).json({ meta: null });
    }

    // ----------------------------------------------------
    // د. مسار الترجمات المجمعة الذكية (Subtitles: SubDL + OpenSubtitles v3)
    // ----------------------------------------------------
    if (path.includes("/subtitles/")) {
      const parts = path.substring(path.indexOf("/subtitles/")).split("/").filter(Boolean);
      const type = parts[1] || "movie";
      const id = (parts[2] || "").replace(".json", "");
      const imdbId = id.split(":")[0];

      const cacheKey = `sub_${type}_${id}`;
      const cachedSubs = getFromCache(cacheKey);
      if (cachedSubs) return res.status(200).json({ subtitles: cachedSubs });

      // استعلام متزامن فائق السرعة من كلٍ من OpenSubtitles v3 و SubDL المخصص للترجمات العربية
      const [osV3Data, subdlData, osDirectData] = await Promise.all([
        safeFetchJson(`${UPSTREAM_ADDONS.opensubtitlesV3}/subtitles/${type}/${id}.json`),
        safeFetchJson(`${UPSTREAM_ADDONS.subdl}/subtitles/${type}/${id}.json`),
        OPENSUBTITLES_API_KEY && imdbId ? safeFetchJson(
          `https://api.opensubtitles.com/api/v1/subtitles?imdb_id=${imdbId.replace("tt", "")}&languages=ar,en`,
          { "Api-Key": OPENSUBTITLES_API_KEY }
        ) : Promise.resolve(null)
      ]);

      const allSubtitles = [];

      // 1. ترجمات SubDL (الأفضل عربياً)
      if (subdlData && Array.isArray(subdlData.subtitles)) {
        allSubtitles.push(...subdlData.subtitles.map(s => ({ ...s, lang: s.lang || "ar" })));
      }

      // 2. ترجمات OpenSubtitles v3 الرسمية
      if (osV3Data && Array.isArray(osV3Data.subtitles)) {
        allSubtitles.push(...osV3Data.subtitles);
      }

      // 3. ترجمات OpenSubtitles المباشرة إن وُجد المفتاح
      if (osDirectData && Array.isArray(osDirectData.data)) {
        const directSubs = osDirectData.data.map(item => ({
          id: `os_${item.id}`,
          url: item.attributes.files[0]?.file_id 
            ? `https://api.opensubtitles.com/api/v1/download/${item.attributes.files[0].file_id}`
            : "",
          lang: item.attributes.language || "ar"
        })).filter(s => s.url);
        allSubtitles.push(...directSubs);
      }

      // إزالة الروابط المكررة
      const uniqueSubtitles = Array.from(
        new Map(allSubtitles.map(item => [item.url, item])).values()
      );

      saveToCache(cacheKey, uniqueSubtitles);
      return res.status(200).json({ subtitles: uniqueSubtitles });
    }

    // ----------------------------------------------------
    // هـ. مسار البث الذكي المجمّع (Streams Aggregation & Smart Sorting)
    // ----------------------------------------------------
    if (path.includes("/stream/")) {
      const streamSubPath = path.substring(path.indexOf("/stream/"));
      const cacheKey = `str_${streamSubPath}`;
      const cachedStreams = getFromCache(cacheKey);
      if (cachedStreams) return res.status(200).json({ streams: cachedStreams });

      const parts = streamSubPath.split("/").filter(Boolean);
      const type = parts[1] || "movie";
      const id = (parts[2] || "").replace(".json", "");

      // دمج متوازي مع كافة المصادر: Torrentio/TorBox + WatchHub + Public Domain + Kitsu للأنمي
      const [torrentioData, watchhubData, publicDomainData] = await Promise.all([
        safeFetchJson(`${UPSTREAM_URL}${streamSubPath}`),
        safeFetchJson(`${UPSTREAM_ADDONS.watchhub}/stream/${type}/${id}.json`),
        type === "movie" ? safeFetchJson(`${UPSTREAM_ADDONS.publicDomain}/stream/${type}/${id}.json`) : Promise.resolve(null)
      ]);

      const streamsList = [];

      // 1. معالجة وتلميع تيارات Torrentio السحابية وتصفية الجودات
      if (torrentioData && Array.isArray(torrentioData.streams)) {
        const filtered = torrentioData.streams
          .filter(s => {
            const txt = `${s.name || ""} ${s.title || ""}`.toLowerCase();
            return !txt.includes("telesync") && !txt.includes("hdcam") && !txt.includes("camrip");
          })
          .map(cleanAndFormatStream);
        streamsList.push(...filtered);
      }

      // 2. إدراج روابط المشاهدة الرسمية من WatchHub في الأسفل
      if (watchhubData && Array.isArray(watchhubData.streams)) {
        streamsList.push(...watchhubData.streams.map(s => ({
          ...s,
          name: `[WatchHub] ${s.name || "رسمي"}`,
          title: `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${s.title || "مشاهدة قانونية معتمدة"}`,
          _score: -100
        })));
      }

      // 3. إدراج أفلام الملكية العامة
      if (publicDomainData && Array.isArray(publicDomainData.streams)) {
        streamsList.push(...publicDomainData.streams.map(s => ({
          ...s,
          name: `[Public Domain] ${s.name || "أرشيف مجاني"}`,
          title: `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${s.title || "فيلم تاريخي متاح مجاناً"}`,
          _score: -50
        })));
      }

      // إزالة أي تورنت مكرر اعتماداً على الهاش
      const seenHashes = new Set();
      const deduplicated = [];
      for (const item of streamsList) {
        const hash = item._hash;
        if (!hash || !seenHashes.has(hash)) {
          if (hash) seenHashes.add(hash);
          deduplicated.push(item);
        }
      }

      // ترتيب التيارات: التخزين السحابي TorBox أولاً، يليه الجودة ثم السيدرز
      deduplicated.sort((a, b) => (b._score || 0) - (a._score || 0));

      // تنظيف الخصائص البرمجية المؤقتة قبل إرسالها لـ Stremio
      const sanitizedStreams = deduplicated.map(({ _score, _hash, ...clean }) => clean);

      saveToCache(cacheKey, sanitizedStreams);
      return res.status(200).json({ streams: sanitizedStreams });
    }

    // الرد الافتراضي الآمن
    return res.status(200).json({ status: "alive", name: "Stremio Master Hub Ultra Pro" });

  } catch (error) {
    // التقاط أي استثناء تلقائياً لمنع ظهور خطأ 500 على Vercel نهائياً
    return res.status(200).json({ streams: [], error: "Safe Fallback Handled" });
  }
}
