// =========================================================================
// 1. الإعدادات الأساسية والبلوقنات المستقرة بدون تداخل (Conflict-Free Addons)
// =========================================================================

const UPSTREAM_URL = process.env.UPSTREAM_URL || "https://torrentio.strem.fun/qualityfilter=scr,cam|torbox=3183a8fd-2d85-41fb-a58d-39c5737efae3";
const OPENSUBTITLES_API_KEY = process.env.OPENSUBTITLES_API_KEY || "";
const CACHE_TTL = 25 * 60 * 1000;
const STALE_TTL = 90 * 60 * 1000;
const TIMEOUT_MS = 4500;

// قائمة البلوقنات المصفاة والموثوقة (تم إزالة البلوقنات المتعارضة أو التي تتطلب مفاتيح خارجية)
const UPSTREAM_ADDONS = {
  // مصادر الكتالوجات والبيانات (موحدة لمنع تكرار أو تضارب البوسترات)
  cinemeta: "https://v3-cinemeta.strem.io",
  tmdbAddon: "https://tmdb.strem.fun",
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
  subscene: "https://subscene.strem.fun",
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
    let host = "";
    try {
      host = new URL(url).hostname;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), customTimeout);

      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ArabicSovereignHub/10.0.0",
          "Accept": "application/json",
          "Accept-Language": "ar,en-US;q=0.9,en;q=0.8",
          ...headers
        }
      });

      clearTimeout(timer);
      if (!res.ok) {
        recordProviderStatus(host, false);
        return null;
      }

      const text = await res.text();
      if (!text || text.trim().startsWith("<")) {
        // منع التداخل الناتج عن صفحات الخطأ HTML التي ترجعها بعض البلوقنات
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
// 3. فلتر التطهير من الإيموجيات والتنسيق العربي الفخم بدون تداخل اللغات
// =========================================================================

function stripAllEmojis(str) {
  if (!str) return "";
  return str
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "")
    .replace(/[\u2600-\u27BF\uFE0F\u200D]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
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

function cleanAndFormatStream(stream, sourceAddonName = "رئيسي") {
  try {
    const rawName = stream.name || "";
    const rawTitle = stream.title || stream.description || "";
    const full = `${rawName}\n${rawTitle}`;

    // 1. الدقة بوضوح
    let resLabel = "HD";
    let resScore = 1000;
    const resMatch = full.match(/\b(4320p|8k|2160p|4k|uhd|1440p|2k|1080p|fhd|720p|hd|480p|576p|sd)\b/i);
    if (resMatch) {
      const r = resMatch[1].toUpperCase();
      if (r === "4320P" || r === "8K") { resLabel = "8K"; resScore = 9000; }
      else if (r === "2160P" || r === "4K" || r === "UHD") { resLabel = "4K UHD"; resScore = 5000; }
      else if (r === "1440P" || r === "2K") { resLabel = "2K QHD"; resScore = 3200; }
      else if (r === "1080P" || r === "FHD") { resLabel = "1080P"; resScore = 2200; }
      else if (r === "720P" || r === "HD") { resLabel = "720P"; resScore = 1100; }
      else { resLabel = "480P"; resScore = 400; }
    }

    // 2. نوع النسخة بالعربي الفخم
    let ripType = "نسخة رقمية";
    let ripBonus = 100;
    if (/\b(Remux|BD-?Remux)\b/i.test(full)) { ripType = "ريماكس خام"; ripBonus = 900; }
    else if (/\b(BluRay|Blu-Ray|BDRip|BRRip|BDMV)\b/i.test(full)) { ripType = "بلوراي"; ripBonus = 650; }
    else if (/\b(WEB-DL|WEBDL)\b/i.test(full)) { ripType = "نسخة أصلية"; ripBonus = 500; }
    else if (/\b(WEBRip|WEB-Rip|WEB)\b/i.test(full)) { ripType = "نسخة ويب"; ripBonus = 400; }
    else if (/\b(HDTV|PDTV)\b/i.test(full)) { ripType = "بث تلفزيوني"; ripBonus = 200; }

    // 3. تقنيات العرض والألوان
    const visual = [];
    let visualBonus = 0;
    if (/\b(DV|Dolby[\s.-]?Vision|DoVi)\b/i.test(full)) { visual.push("Dolby Vision"); visualBonus += 450; }
    if (/\bHDR10\+|HDR10Plus\b/i.test(full)) { visual.push("HDR10+"); visualBonus += 380; }
    else if (/\b(HDR10|HDR)\b/i.test(full)) { visual.push("HDR"); visualBonus += 300; }
    if (/\bIMAX\b/i.test(full)) { visual.push("IMAX"); visualBonus += 250; }

    // 4. تقنيات الصوت
    const audio = [];
    let audioBonus = 0;
    if (/\bAtmos\b/i.test(full)) { audio.push("Atmos"); audioBonus += 350; }
    if (/\bTrueHD\b/i.test(full)) { audio.push("TrueHD"); audioBonus += 300; }
    else if (/\b(DTS-HD|DTS)\b/i.test(full)) { audio.push("DTS"); audioBonus += 200; }
    else if (/\b(DD\+|DDP|E-?AC-?3)\b/i.test(full)) { audio.push("DD+"); audioBonus += 150; }

    if (/\b7\.1\b/.test(full)) { audio.push("7.1"); audioBonus += 100; }
    else if (/\b5\.1\b/.test(full)) { audio.push("5.1"); audioBonus += 70; }

    // 5. الحجم بدون انعكاس الأرقام
    const sizeMatch = rawTitle.match(/([0-9]+(?:\.[0-9]+)?\s*(?:TB|GB|MB|GiB|MiB))/i) ||
                      rawName.match(/([0-9]+(?:\.[0-9]+)?\s*(?:TB|GB|MB|GiB|MiB))/i);
    let sizeFormatted = "مباشر";
    let sizeBytes = 0;
    if (sizeMatch) {
      const numPart = sizeMatch[1].match(/[0-9]+(?:\.[0-9]+)?/)[0];
      const unitPart = sizeMatch[1].match(/(?:TB|GB|MB|GiB|MiB)/i)[0].toUpperCase().replace("IB", "B");
      sizeFormatted = `\u200E${numPart} ${unitPart}\u200E`;
      sizeBytes = parseSizeBytes(sizeMatch[1]);
    }

    // 6. عدد المتصلين
    const seedersMatch = rawTitle.match(/(?:👤|👥|\bS:?\s*|\bSeeders:?\s*)(\d+)/i);
    const seedersCount = seedersMatch ? parseInt(seedersMatch[1], 10) : 0;

    // 7. التحقق من التخزين السحابي الفوري (TorBox)
    const isCached = full.includes("⚡") || 
                     /\[(TB|RD|AD|DL|PM|OC)\+\]/i.test(full) || 
                     /\b(torbox|cached|instant|debrid)\b/i.test(full) ||
                     (stream.url && !stream.infoHash);

    // =========================================================
    // بناء البطاقة العربية الفخمة الموحدة (بدون تداخل لغات أو إيموجي)
    // =========================================================
    const serverBadge = isCached ? "[ سحابي فوري ]" : "[ بث مباشر ]";
    const topParts = [
      resLabel,
      ripType,
      visual.length > 0 ? visual.join(" / ") : null
    ].filter(Boolean);

    // السطر الأول: واضح ومرتب من اليمين لليسار
    const nameBar = `${serverBadge}  •  ${topParts.join("  |  ")}`;

    // السطر الثاني: تفاصيل عربية صافية بدون تداخل
    const detailItems = [
      `الحجم: ${sizeFormatted}`,
      audio.length > 0 ? `الصوت: \u200E${audio.join(" ")}\u200E` : "الصوت: قياسي",
      isCached ? "الحالة: تشغيل فوري" : (seedersCount > 0 ? `المتصلين: \u200E${seedersCount}\u200E` : null),
      `المصدر: ${sourceAddonName}`
    ].filter(Boolean);

    const dividerLine = "────────────────────────────────────────";
    const detailsLine = detailItems.join("   │   ");

    const sizeScore = Math.min((sizeBytes / (1024 * 1024 * 1024)) * 12, 450);
    const peerScore = Math.min(seedersCount * 0.6, 500);
    const finalScore = (isCached ? 50000 : 0) + resScore + ripBonus + visualBonus + audioBonus + sizeScore + peerScore;

    const cleanStream = {
      name: stripAllEmojis(nameBar),
      title: `${dividerLine}\n${stripAllEmojis(detailsLine)}`,
      behaviorHints: {
        bingeGroup: `sovereign-${resLabel}-${isCached ? "cloud" : "p2p"}`.toLowerCase().replace(/\s+/g, "-")
      },
      _score: finalScore,
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
      name: stripAllEmojis(stream.name || "[ بث مباشر ]"),
      title: stripAllEmojis(stream.title || "جاهز للتشغيل"),
      _score: 0,
      _hash: getCanonicalKey(stream)
    };
  }
}

// =========================================================================
// 4. واجهة التثبيت العربية الفخمة الصافية (بدون إيموجي وبدون تداخل لغات)
// =========================================================================

function renderConfigPage(host) {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>المركز السيادي | Movies & Series</title>
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
        الإصدار العاشر // معمارية عربية صافية بدون تداخل
      </div>
      <h1 class="text-3xl md:text-5xl font-black gold-gradient-text pt-2">
        Movies &amp; Series
      </h1>
      <p class="text-gray-400 text-sm md:text-base max-w-lg mx-auto leading-relaxed">
        منظومة متكاملة تجمع أقوى سيرفرات البث السحابي الفوري والترجمة العربية التلقائية بتصميم فخم ومرتب بدون أي تعارض بين الإضافات.
      </p>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 my-7">
      <div class="spec-box p-3.5 rounded-lg text-center">
        <div class="text-xs text-gray-400">الأقسام الرئيسية</div>
        <div class="text-sm font-bold text-[#f3e5ab] mt-1">Movies / Series</div>
      </div>
      <div class="spec-box p-3.5 rounded-lg text-center">
        <div class="text-xs text-gray-400">منع التداخل</div>
        <div class="text-sm font-bold text-emerald-400 mt-1">مفعل 100%</div>
      </div>
      <div class="spec-box p-3.5 rounded-lg text-center">
        <div class="text-xs text-gray-400">التخزين السحابي</div>
        <div class="text-sm font-bold text-[#f3e5ab] mt-1">TorBox فوري</div>
      </div>
      <div class="spec-box p-3.5 rounded-lg text-center">
        <div class="text-xs text-gray-400">دقة العرض</div>
        <div class="text-sm font-bold text-[#f3e5ab] mt-1">حتى 8K و 4K</div>
      </div>
    </div>

    <div class="space-y-3 mb-8">
      <div class="flex items-center justify-between p-4 spec-box rounded-lg">
        <div>
          <div class="text-sm font-bold text-white">كتالوجات مستقلة بدون تكرار (Movies &amp; Series)</div>
          <div class="text-xs text-gray-400 mt-1">فصل تام بين قوائم الأفلام والمسلسلات لمنع تداخل البوسترات والمعلومات</div>
        </div>
        <span class="text-xs font-bold px-3 py-1 rounded border border-[#d4af37]/40 text-[#f3e5ab] bg-[#d4af37]/10">نشط</span>
      </div>

      <div class="flex items-center justify-between p-4 spec-box rounded-lg">
        <div>
          <div class="text-sm font-bold text-white">فلتر توحيد الروابط ومنع تكرار السيرفرات</div>
          <div class="text-xs text-gray-400 mt-1">دمج ذكي للسيرفرات المتشابهة وترتيب السحابي الفوري في الصدارة</div>
        </div>
        <span class="text-xs font-bold px-3 py-1 rounded border border-[#d4af37]/40 text-[#f3e5ab] bg-[#d4af37]/10">نشط</span>
      </div>

      <div class="flex items-center justify-between p-4 spec-box rounded-lg">
        <div>
          <div class="text-sm font-bold text-white">محرك الترجمة العربية الموحد</div>
          <div class="text-xs text-gray-400 mt-1">جلب تلقائي للترجمات العربية من SubDL و Subscene و OpenSubtitles</div>
        </div>
        <span class="text-xs font-bold px-3 py-1 rounded border border-[#d4af37]/40 text-[#f3e5ab] bg-[#d4af37]/10">نشط</span>
      </div>
    </div>

    <div class="space-y-3">
      <a href="stremio://${host}/manifest.json" class="gold-btn w-full py-4 px-6 rounded-xl font-black text-center block text-base">
        تثبيت الإضافة مباشرة في التطبيق
      </a>
      <button onclick="navigator.clipboard.writeText('https://${host}/manifest.json'); this.innerText='تم نسخ رابط الإضافة بنجاح';" class="w-full py-3.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-xs font-bold text-gray-300 transition-all text-center">
        نسخ رابط التثبيت اليدوي (Manifest URL)
      </button>
    </div>
  </div>
</body>
</html>`;
}

// =========================================================================
// 5. موجه الخادم الرئيسي المعزول ضد الأخطاء والتداخل (Master Handler)
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
    const path = decodeURIComponent(rawUrl.split("?")[0]).replace(/\/+$/, "") || "/";

    // -----------------------------------------------------------------
    // أ. فحص حالة الخادم
    // -----------------------------------------------------------------
    if (path === "/health" || path === "/status") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.status(200).json({
        status: "نشط",
        version: "10.0.0",
        cacheSize: memoryCache.size
      });
    }

    // -----------------------------------------------------------------
    // ب. ملف التعريف (Manifest) - كتالوجات Movies و Series صافية بدون تداخل
    // -----------------------------------------------------------------
    if (path === "/manifest.json" || path === "/api/index" || path === "/api" || path === "/manifest") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.status(200).json({
        id: "org.sovereign.arabic.movies.series",
        version: "10.0.0",
        name: "Movies & Series",
        description: "المركز السيادي للأفلام والمسلسلات | بث سحابي فوري وترجمة عربية تلقائية بدون تداخل",
        resources: ["stream", "subtitles", "catalog", "meta"],
        types: ["movie", "series"],
        idPrefixes: ["tt", "kitsu"],
        catalogs: [
          {
            type: "movie",
            id: "sovereign_movies_main",
            name: "Movies",
            extra: [
              { name: "search", isRequired: false },
              { name: "genre", isRequired: false, options: ["Action", "Sci-Fi", "Thriller", "Drama", "Crime", "Mystery", "Adventure", "Horror", "Comedy", "Animation", "Fantasy"] },
              { name: "skip", isRequired: false }
            ]
          },
          {
            type: "series",
            id: "sovereign_series_main",
            name: "Series",
            extra: [
              { name: "search", isRequired: false },
              { name: "genre", isRequired: false, options: ["Action", "Sci-Fi", "Thriller", "Drama", "Crime", "Mystery", "Adventure", "Horror", "Comedy", "Animation", "Fantasy"] },
              { name: "skip", isRequired: false }
            ]
          },
          {
            type: "movie",
            id: "sovereign_movies_featured",
            name: "Movies // المختارة",
            extra: [{ name: "skip", isRequired: false }]
          },
          {
            type: "series",
            id: "sovereign_series_featured",
            name: "Series // المختارة",
            extra: [{ name: "skip", isRequired: false }]
          }
        ],
        behaviorHints: {
          configurable: false,
          configurationRequired: false
        }
      });
    }

    if (path === "" || path === "/") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(renderConfigPage(host));
    }

    // -----------------------------------------------------------------
    // ج. مسار الكتالوجات (مصدر واحد لكل طلب لمنع تداخل الترتيب والصفحات)
    // -----------------------------------------------------------------
    if (path.includes("/catalog/")) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      const subPath = path.substring(path.indexOf("/catalog/"));
      const parts = subPath.split("/").filter(Boolean);
      const type = parts[1] || "movie";
      const catalogId = (parts[2] || "").replace(".json", "");
      const extraPart = parts[3] ? parts[3].replace(".json", "") : "";

      const cacheKey = `cat_${type}_${catalogId}_${extraPart}`;
      const cachedCat = getFromCache(cacheKey);
      if (cachedCat) return res.status(200).json(cachedCat);

      const extraSuffix = extraPart ? `/${extraPart}.json` : ".json";
      let primaryUrl = `${UPSTREAM_ADDONS.cinemeta}/catalog/${type}/top${extraSuffix}`;
      let fallbackUrl = `${UPSTREAM_ADDONS.tmdbAddon}/catalog/${type}/tmdb.top${extraSuffix}`;

      if (catalogId === "sovereign_movies_featured") {
        primaryUrl = `${UPSTREAM_ADDONS.cyberflix}/catalog/movie/netflix${extraSuffix}`;
      } else if (catalogId === "sovereign_series_featured") {
        primaryUrl = `${UPSTREAM_ADDONS.cyberflix}/catalog/series/apple${extraSuffix}`;
      }

      // جلب من المصدر الأساسي أولاً، وإذا فشل ننتقل للاحتياطي لمنع تداخل القوائم
      let data = await safeFetchJson(primaryUrl);
      if (!data || !Array.isArray(data.metas) || data.metas.length === 0) {
        data = await safeFetchJson(fallbackUrl);
      }

      const cleanMetas = [];
      const seenIds = new Set();

      if (data && Array.isArray(data.metas)) {
        for (const m of data.metas) {
          if (m && m.id && !seenIds.has(m.id)) {
            seenIds.add(m.id);
            cleanMetas.push({
              ...m,
              name: stripAllEmojis(m.name || "")
            });
          }
        }
      }

      const payload = { metas: cleanMetas };
      if (cleanMetas.length > 0) saveToCache(cacheKey, payload);
      return res.status(200).json(payload);
    }

    // -----------------------------------------------------------------
    // د. مسار تفاصيل العرض (Meta) بدون تعارض
    // -----------------------------------------------------------------
    if (path.includes("/meta/")) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      const parts = path.substring(path.indexOf("/meta/")).split("/").filter(Boolean);
      const type = parts[1] || "movie";
      const id = (parts[2] || "").replace(".json", "");

      const cacheKey = `meta_${type}_${id}`;
      const cachedMeta = getFromCache(cacheKey);
      if (cachedMeta) return res.status(200).json(cachedMeta);

      let metaRes = null;
      if (id.startsWith("kitsu:")) {
        metaRes = await safeFetchJson(`${UPSTREAM_ADDONS.animeKitsu}/meta/${type}/${id}.json`);
      } else {
        metaRes = await safeFetchJson(`${UPSTREAM_ADDONS.cinemeta}/meta/${type}/${id}.json`);
        if (!metaRes || !metaRes.meta) {
          metaRes = await safeFetchJson(`${UPSTREAM_ADDONS.tmdbAddon}/meta/${type}/${id}.json`);
        }
      }

      if (metaRes && metaRes.meta) {
        metaRes.meta.name = stripAllEmojis(metaRes.meta.name || "");
        const resultObj = { meta: metaRes.meta };
        saveToCache(cacheKey, resultObj);
        return res.status(200).json(resultObj);
      }

      return res.status(200).json({ meta: null });
    }

    // -----------------------------------------------------------------
    // هـ. مسار الترجمات العربية (معزول ومفلتر)
    // -----------------------------------------------------------------
    if (path.includes("/subtitles/")) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      const parts = path.substring(path.indexOf("/subtitles/")).split("/").filter(Boolean);
      const type = parts[1] || "movie";
      const id = (parts[2] || "").replace(".json", "");
      const imdbId = id.split(":")[0];

      const cacheKey = `sub_${type}_${id}`;
      const cachedSubs = getFromCache(cacheKey);
      if (cachedSubs) return res.status(200).json({ subtitles: cachedSubs });

      const [subdlRes, subsceneRes, osV3Res, yifyRes, osDirectRes] = await Promise.all([
        safeFetchJson(`${UPSTREAM_ADDONS.subdl}/subtitles/${type}/${id}.json`),
        safeFetchJson(`${UPSTREAM_ADDONS.subscene}/subtitles/${type}/${id}.json`),
        safeFetchJson(`${UPSTREAM_ADDONS.opensubtitlesV3}/subtitles/${type}/${id}.json`),
        type === "movie" ? safeFetchJson(`${UPSTREAM_ADDONS.yifysubs}/subtitles/${type}/${id}.json`) : Promise.resolve(null),
        OPENSUBTITLES_API_KEY && imdbId.startsWith("tt")
          ? safeFetchJson(
              `https://api.opensubtitles.com/api/v1/subtitles?imdb_id=${imdbId.replace("tt", "")}&languages=ar,en`,
              { "Api-Key": OPENSUBTITLES_API_KEY }
            )
          : Promise.resolve(null)
      ]);

      const collected = [];

      const appendSubs = (data, defaultLang = "ar") => {
        if (data && Array.isArray(data.subtitles)) {
          for (const s of data.subtitles) {
            if (s && s.url) {
              collected.push({
                id: s.id || `sub_${collected.length}`,
                url: s.url,
                lang: s.lang || defaultLang
              });
            }
          }
        }
      };

      appendSubs(subdlRes, "ar");
      appendSubs(subsceneRes, "ar");
      appendSubs(osV3Res, "en");
      appendSubs(yifyRes, "en");

      if (osDirectRes && Array.isArray(osDirectRes.data)) {
        for (const item of osDirectRes.data) {
          const fileId = item?.attributes?.files?.[0]?.file_id;
          if (fileId) {
            collected.push({
              id: `os_direct_${item.id}`,
              url: `https://api.opensubtitles.com/api/v1/download/${fileId}`,
              lang: item.attributes.language || "ar"
            });
          }
        }
      }

      const uniqueMap = new Map();
      for (const sub of collected) {
        if (!uniqueMap.has(sub.url)) {
          uniqueMap.set(sub.url, sub);
        }
      }

      const sortedSubs = Array.from(uniqueMap.values()).sort((a, b) => {
        const aAr = /^(ar|ara|arabic)$/i.test(a.lang) ? 1 : 0;
        const bAr = /^(ar|ara|arabic)$/i.test(b.lang) ? 1 : 0;
        return bAr - aAr;
      });

      if (sortedSubs.length > 0) saveToCache(cacheKey, sortedSubs);
      return res.status(200).json({ subtitles: sortedSubs });
    }

    // -----------------------------------------------------------------
    // و. مسار البث الموحد (منع تداخل البلوقنات وتكرار نفس التورنت)
    // -----------------------------------------------------------------
    if (path.includes("/stream/")) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      const streamSubPath = path.substring(path.indexOf("/stream/"));
      const cacheKey = `str_${streamSubPath}`;
      const cachedStreams = getFromCache(cacheKey);
      if (cachedStreams) return res.status(200).json({ streams: cachedStreams });

      const parts = streamSubPath.split("/").filter(Boolean);
      const type = parts[1] || "movie";
      const id = (parts[2] || "").replace(".json", "");

      // استدعاء البلوقنات المستقرة فقط والتي لا تتعارض مع بعضها
      const [
        torrentioData,
        tpbData,
        ytsData,
        eztvData,
        webstreamrData,
        publicDomainData
      ] = await Promise.all([
        safeFetchJson(`${UPSTREAM_URL}${streamSubPath}`),
        safeFetchJson(`${UPSTREAM_ADDONS.tpbPlus}/stream/${type}/${id}.json`),
        type === "movie" ? safeFetchJson(`${UPSTREAM_ADDONS.yts}/stream/${type}/${id}.json`) : Promise.resolve(null),
        type === "series" ? safeFetchJson(`${UPSTREAM_ADDONS.eztv}/stream/${type}/${id}.json`) : Promise.resolve(null),
        safeFetchJson(`${UPSTREAM_ADDONS.webstreamr}/stream/${type}/${id}.json`),
        type === "movie" ? safeFetchJson(`${UPSTREAM_ADDONS.publicDomain}/stream/${type}/${id}.json`) : Promise.resolve(null)
      ]);

      const rawCandidates = [];

      const ingestStreams = (dataObj, arabicLabel) => {
        if (dataObj && Array.isArray(dataObj.streams)) {
          for (const s of dataObj.streams) {
            if (!s || (!s.url && !s.infoHash)) continue;
            const combinedText = `${s.name || ""} ${s.title || ""} ${s.description || ""}`.toLowerCase();
            if (
              combinedText.includes("hdcam") ||
              combinedText.includes("camrip") ||
              combinedText.includes("telesync") ||
              combinedText.includes("tsrip")
            ) {
              continue;
            }
            rawCandidates.push(cleanAndFormatStream(s, arabicLabel));
          }
        }
      };

      ingestStreams(torrentioData, "سحابي رئيسي");
      ingestStreams(webstreamrData, "سيرفر ويب");
      ingestStreams(ytsData, "أفلام YTS");
      ingestStreams(eztvData, "مسلسلات EZTV");
      ingestStreams(tpbData, "تورنت عام");
      ingestStreams(publicDomainData, "أرشيف كلاسيكي");

      // فلترة صارمة لمنع تداخل أو تكرار نفس الرابط بين البلوقنات المختلفة
      const uniqueStreamsMap = new Map();
      for (const item of rawCandidates) {
        const key = item._hash;
        const existing = uniqueStreamsMap.get(key);
        if (!existing || (item._score || 0) > (existing._score || 0)) {
          uniqueStreamsMap.set(key, item);
        }
      }

      const deduplicated = Array.from(uniqueStreamsMap.values());
      deduplicated.sort((a, b) => (b._score || 0) - (a._score || 0));

      const finalStreams = deduplicated.slice(0, 80).map(({ _score, _hash, ...cleanItem }) => cleanItem);

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
      name: "Movies & Series // المركز السيادي V10.0"
    });

  } catch {
    return res.status(200).json({ streams: [], metas: [], subtitles: [] });
  }
}
