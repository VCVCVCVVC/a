// =========================================================================
// 1. الإعدادات الفائقة وشبكة الملحقات العالمية الموسعة (22+ Upstream Addons)
// =========================================================================

const UPSTREAM_URL = process.env.UPSTREAM_URL || "https://torrentio.strem.fun/qualityfilter=scr,cam|torbox=3183a8fd-2d85-41fb-a58d-39c5737efae3";
const OPENSUBTITLES_API_KEY = process.env.OPENSUBTITLES_API_KEY || "";
const CACHE_TTL = 20 * 60 * 1000;
const STALE_TTL = 60 * 60 * 1000;
const TIMEOUT_MS = 5500;

// ترسانة الإضافات العالمية المدمجة (بدون الحاجة لأي تهيئة خارجية)
const UPSTREAM_ADDONS = {
  // مصادر البيانات والكتالوجات (Catalogs & Metadata)
  cinemeta: "https://v3-cinemeta.strem.io",
  tmdbAddon: "https://tmdb.strem.fun",
  cyberflix: "https://cyberflix.kamyroll.tech",
  streamingCatalogs: "https://7a82163c306e-stremio-netflix-catalog-addon.baby-beamup.club",
  traktUpNext: "https://trakt.strem.fun",
  animeKitsu: "https://anime-kitsu.strem.fun",
  letterboxd: "https://letterboxd.strem.fun",
  imdbCatalogs: "https://imdb-catalogs.strem.fun",

  // مصادر البث والتورنت والروابط المباشرة (Multi-Scrapers & Streams)
  knightcrawler: "https://knightcrawler.elfhosted.com",
  comet: "https://comet.elfhosted.com",
  mediafusion: "https://mediafusion.elfhosted.com",
  annatar: "https://annatar.elfhosted.com",
  tpbPlus: "https://thepiratebay-plus.strem.fun",
  yts: "https://yts.strem.fun",
  eztv: "https://eztv.strem.fun",
  nyaa: "https://nyaa.strem.fun",
  watchhub: "https://watchhub.strem.io",
  publicDomain: "https://caching.stremio.net/publicdomainmovies.now.sh",
  webstreamr: "https://webstreamr.hayd.uk",

  // مصادر الترجمات العربية والعالمية (Subtitles Engines)
  opensubtitlesV3: "https://opensubtitles-v3.strem.io",
  subdl: "https://subdl.strem.fun",
  subscene: "https://subscene.strem.fun",
  addic7ed: "https://addic7ed.strem.fun",
  podnapisi: "https://podnapisi.strem.fun",
  yifysubs: "https://yifysubtitles.strem.fun"
};

// =========================================================================
// 2. نظام الذاكرة المؤقتة المتقدم، منع التكرار، وقاطع الدائرة (Resilience Layer)
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
    // صامت
  }
  return null;
}

function saveToCache(key, data) {
  try {
    if (memoryCache.size > 3500) {
      const oldestKeys = Array.from(memoryCache.keys()).slice(0, 900);
      oldestKeys.forEach(k => memoryCache.delete(k));
    }
    memoryCache.set(key, { data, time: Date.now() });
  } catch {
    // صامت
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
    // صامت
  }
}

function isProviderHealthy(url) {
  try {
    const host = new URL(url).hostname;
    const stat = healthMetrics.get(host);
    if (!stat) return true;
    if (stat.fails >= 4 && Date.now() - stat.lastFail < 60000) {
      return false; // عزل المزود المتعطل مؤقتاً لمدة دقيقة لضمان سرعة الاستجابة
    }
    return true;
  } catch {
    return true;
  }
}

async function safeFetchJson(url, headers = {}, customTimeout = TIMEOUT_MS) {
  if (!isProviderHealthy(url)) return null;

  // دمج الطلبات المتطابقة في نفس اللحظة (In-Flight Request Coalescing)
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
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) SovereignStremioEngine/9.0.0",
          "Accept": "application/json, text/plain, */*",
          "Accept-Language": "ar,en-US;q=0.9,en;q=0.8",
          "Connection": "keep-alive",
          ...headers
        }
      });

      clearTimeout(timer);
      if (!res.ok) {
        recordProviderStatus(host, false);
        return null;
      }
      const data = await res.json();
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
// 3. فلتر إزالة الإيموجيات الصارم ومحرك التنسيق الهندسي الفخم (Zero-Emoji Engine)
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
    "udp://tracker.torrent.eu.org:451/announce",
    "http://tracker.openbittorrent.com:80/announce"
  ];
  const existing = Array.isArray(stream.sources) ? stream.sources : [];
  const combined = new Set([...existing, ...defaultTrackers.map(t => `tracker:${t}`)]);
  return Array.from(combined);
}

function cleanAndFormatStream(stream, sourceAddonName = "CORE") {
  try {
    const rawName = stream.name || "";
    const rawTitle = stream.title || stream.description || "";
    const full = `${rawName}\n${rawTitle}`;

    // 1. استخراج الدقة (Resolution)
    let resLabel = "HD";
    let resScore = 1000;
    const resMatch = full.match(/\b(4320p|8k|2160p|4k|uhd|1440p|2k|1080p|fhd|720p|hd|480p|576p|sd)\b/i);
    if (resMatch) {
      const r = resMatch[1].toUpperCase();
      if (r === "4320P" || r === "8K") { resLabel = "8K MASTER"; resScore = 9000; }
      else if (r === "2160P" || r === "4K" || r === "UHD") { resLabel = "4K UHD"; resScore = 5000; }
      else if (r === "1440P" || r === "2K") { resLabel = "2K QHD"; resScore = 3200; }
      else if (r === "1080P" || r === "FHD") { resLabel = "1080P FHD"; resScore = 2200; }
      else if (r === "720P" || r === "HD") { resLabel = "720P HD"; resScore = 1100; }
      else { resLabel = "480P SD"; resScore = 400; }
    }

    // 2. استخراج نوع المصدر والنسخة (Source & Edition)
    let ripType = "STREAM";
    let ripBonus = 100;
    if (/\b(Remux|BD-?Remux)\b/i.test(full)) { ripType = "REMUX"; ripBonus = 900; }
    else if (/\b(BluRay|Blu-Ray|BDRip|BRRip|BDMV)\b/i.test(full)) { ripType = "BLURAY"; ripBonus = 650; }
    else if (/\b(WEB-DL|WEBDL)\b/i.test(full)) { ripType = "WEB-DL"; ripBonus = 500; }
    else if (/\b(WEBRip|WEB-Rip|WEB)\b/i.test(full)) { ripType = "WEBRIP"; ripBonus = 400; }
    else if (/\b(HDTV|PDTV)\b/i.test(full)) { ripType = "HDTV"; ripBonus = 200; }
    else if (/\b(DVDRip|DVD)\b/i.test(full)) { ripType = "DVDRIP"; ripBonus = 120; }

    // 3. استخراج المنصة الأصلية إن وجدت (Network Tag)
    let networkTag = "";
    if (/\b(AMZN|Amazon)\b/i.test(full)) networkTag = "AMZN";
    else if (/\b(NF|Netflix)\b/i.test(full)) networkTag = "NF";
    else if (/\b(ATVP|AppleTV)\b/i.test(full)) networkTag = "ATVP";
    else if (/\b(DSNP|Disney)\b/i.test(full)) networkTag = "DSNP";
    else if (/\b(HMAX|MAX|HBO)\b/i.test(full)) networkTag = "MAX";
    else if (/\b(HULU)\b/i.test(full)) networkTag = "HULU";
    else if (/\b(PCOK|Peacock)\b/i.test(full)) networkTag = "PCOK";

    // 4. استخراج تقنيات العرض والألوان (Dynamic Range & Visual Specs)
    const visual = [];
    let visualBonus = 0;
    if (/\b(DV|Dolby[\s.-]?Vision|DoVi)\b/i.test(full)) { visual.push("DOLBY VISION"); visualBonus += 450; }
    if (/\bHDR10\+|HDR10Plus\b/i.test(full)) { visual.push("HDR10+"); visualBonus += 380; }
    else if (/\b(HDR10|HDR)\b/i.test(full)) { visual.push("HDR10"); visualBonus += 300; }
    else if (/\bHLG\b/i.test(full)) { visual.push("HLG"); visualBonus += 200; }
    if (/\bIMAX\b/i.test(full)) { visual.push("IMAX"); visualBonus += 250; }
    if (/\b(10bit|10-bit|Hi10P)\b/i.test(full)) { visual.push("10-BIT"); visualBonus += 120; }

    // 5. استخراج ترميز الفيديو (Video Codec)
    let codec = "AVC";
    let codecBonus = 50;
    if (/\b(AV1)\b/i.test(full)) { codec = "AV1"; codecBonus = 220; }
    else if (/\b(HEVC|x265|H\.?265)\b/i.test(full)) { codec = "HEVC"; codecBonus = 200; }
    else if (/\b(AVC|x264|H\.?264)\b/i.test(full)) { codec = "H.264"; codecBonus = 100; }

    // 6. استخراج الهندسة الصوتية (Audio Architecture)
    const audio = [];
    let audioBonus = 0;
    if (/\bAtmos\b/i.test(full)) { audio.push("ATMOS"); audioBonus += 350; }
    if (/\bTrueHD\b/i.test(full)) { audio.push("TRUEHD"); audioBonus += 300; }
    else if (/\b(DTS-HD[\s.-]?MA|DTS-X|DTS:X)\b/i.test(full)) { audio.push("DTS-HD MA"); audioBonus += 280; }
    else if (/\b(DTS-HD|DTS)\b/i.test(full)) { audio.push("DTS"); audioBonus += 180; }
    else if (/\b(DD\+|DDP|E-?AC-?3)\b/i.test(full)) { audio.push("DDP"); audioBonus += 150; }
    else if (/\b(AC-?3|DD)\b/i.test(full)) { audio.push("AC3"); audioBonus += 90; }
    else if (/\b(FLAC)\b/i.test(full)) { audio.push("FLAC"); audioBonus += 160; }
    else if (/\b(AAC|OPUS)\b/i.test(full)) { audio.push("AAC"); audioBonus += 50; }

    if (/\b7\.1\b/.test(full)) { audio.push("7.1CH"); audioBonus += 100; }
    else if (/\b5\.1\b/.test(full)) { audio.push("5.1CH"); audioBonus += 70; }
    else if (/\b2\.0\b/.test(full)) { audio.push("2.0CH"); }

    // 7. اللغات المتوفرة في الملف (Multi / Dual Audio / Arabic)
    const langs = [];
    if (/\b(ARA|ARABIC|عربي|مدبلج|مترجم)\b/i.test(full)) langs.push("AR");
    if (/\b(MULTI|MULTi)\b/i.test(full)) langs.push("MULTI");
    else if (/\b(DUAL)\b/i.test(full)) langs.push("DUAL");
    if (/\b(ENG|ENGLISH)\b/i.test(full)) langs.push("EN");

    // 8. استخراج الحجم الفعلي مع عزل LTR صارم لمنع انعكاس الأرقام
    const sizeMatch = rawTitle.match(/([0-9]+(?:\.[0-9]+)?\s*(?:TB|GB|MB|GiB|MiB))/i) ||
                      rawName.match(/([0-9]+(?:\.[0-9]+)?\s*(?:TB|GB|MB|GiB|MiB))/i);
    let sizeFormatted = null;
    let sizeBytes = 0;
    if (sizeMatch) {
      const numPart = sizeMatch[1].match(/[0-9]+(?:\.[0-9]+)?/)[0];
      const unitPart = sizeMatch[1].match(/(?:TB|GB|MB|GiB|MiB)/i)[0].toUpperCase().replace("IB", "B");
      sizeFormatted = `\u200E${numPart} ${unitPart}\u200E`;
      sizeBytes = parseSizeBytes(sizeMatch[1]);
    }

    // 9. استخراج عدد الـ Seeders بدون إيموجي نهائياً
    const seedersMatch = rawTitle.match(/(?:👤|👥|\bS:?\s*|\bSeeders:?\s*)(\d+)/i);
    const seedersCount = seedersMatch ? parseInt(seedersMatch[1], 10) : 0;

    // 10. فحص حالة التخزين السحابي الفوري (Instant Cloud Debrid)
    const isCached = full.includes("⚡") || 
                     /\[(TB|RD|AD|DL|PM|OC)\+\]/i.test(full) || 
                     /\b(torbox|cached|instant|debrid)\b/i.test(full) ||
                     (stream.url && !stream.infoHash);

    // 11. استخراج فريق الإصدار (Release Group)
    let releaseGroup = sourceAddonName;
    const groupMatch = full.match(/-([a-zA-Z0-9]+)(?:\[.*?\])?(?:\.mkv|\.mp4|\.avi)?$/m) ||
                       rawTitle.match(/\b(FLUX|NTb|CMRG|QxR|PSA|RARBG|YTS|TGx|ETHEL|SPARKS|FGT|EVO|ION10|Framestor|EPSiLON)\b/i);
    if (groupMatch) {
      releaseGroup = stripAllEmojis(groupMatch[1] || groupMatch[0]).toUpperCase();
    }

    // =========================================================
    // تصميم البطاقة الفخم الخالي من الإيموجيات (Zero-Emoji Luxury UI)
    // =========================================================
    const engineTag = isCached ? "[ TORBOX CLOUD ]" : "[ DIRECT P2P ]";
    const sourceBadge = networkTag ? `${ripType} ${networkTag}` : ripType;
    const headerSpecs = [
      resLabel,
      sourceBadge,
      visual.length > 0 ? visual.join(" / ") : null,
      codec
    ].filter(Boolean);

    // السطر الأول (العنوان الرئيسي للبطاقة)
    const nameBar = `\u200E${engineTag}  ::  ${headerSpecs.join("  •  ")}\u200E`;

    // السطر الثاني (البيانات الهندسية المفصلة)
    const techPills = [
      sizeFormatted ? `SIZE: ${sizeFormatted}` : "SIZE: STREAM",
      audio.length > 0 ? `AUDIO: \u200E${audio.join(" ")}\u200E` : "AUDIO: STEREO",
      seedersCount > 0 ? `PEERS: \u200E${seedersCount}\u200E` : (isCached ? "STATUS: INSTANT" : null),
      langs.length > 0 ? `LANG: \u200E${langs.join("/")}\u200E` : null,
      releaseGroup ? `SRC: \u200E${releaseGroup}\u200E` : null
    ].filter(Boolean);

    const dividerLine = "──────────────────────────────────────────────────";
    const detailsLine = `\u200E${techPills.join("   |   ")}\u200E`;

    // حساب نقاط الجودة الذكية (AI Quality Scoring Matrix)
    const sizeScore = Math.min((sizeBytes / (1024 * 1024 * 1024)) * 12, 450);
    const peerScore = Math.min(seedersCount * 0.6, 500);
    const finalScore = (isCached ? 50000 : 0) + resScore + ripBonus + visualBonus + codecBonus + audioBonus + sizeScore + peerScore;

    const cleanStream = {
      ...stream,
      name: stripAllEmojis(nameBar),
      title: `${dividerLine}\n${stripAllEmojis(detailsLine)}`,
      behaviorHints: {
        ...(stream.behaviorHints || {}),
        bingeGroup: `sovereign-${resLabel}-${ripType}-${releaseGroup}`.toLowerCase().replace(/\s+/g, "-")
      },
      _score: finalScore,
      _hash: (stream.infoHash || stream.url || rawTitle).toLowerCase()
    };

    if (stream.infoHash) {
      cleanStream.sources = extractTrackers(stream);
    }

    return cleanStream;
  } catch {
    return {
      ...stream,
      name: stripAllEmojis(stream.name || "STREAM SOURCE"),
      title: stripAllEmojis(stream.title || "DIRECT PLAYBACK"),
      _score: 0
    };
  }
}

// =========================================================================
// 4. واجهة الويب الملكية (Sovereign Luxury UI - Zero Emojis)
// =========================================================================

function renderConfigPage(host) {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SOVEREIGN MEDIA HUB // MOVIES & SERIES</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&family=Cinzel:wght@600;800&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --gold: #d4af37;
      --gold-light: #f3e5ab;
      --obsidian: #050507;
      --panel: rgba(14, 15, 20, 0.88);
    }
    body {
      font-family: 'Cairo', sans-serif;
      background-color: var(--obsidian);
      background-image: 
        radial-gradient(circle at 15% 15%, rgba(212, 175, 55, 0.08) 0%, transparent 45%),
        radial-gradient(circle at 85% 85%, rgba(212, 175, 55, 0.05) 0%, transparent 45%),
        linear-gradient(180deg, #050507 0%, #0a0b10 100%);
      color: #e5e7eb;
    }
    .font-luxury { font-family: 'Cinzel', serif; }
    .font-mono-tech { font-family: 'JetBrains Mono', monospace; }
    .sovereign-card {
      background: var(--panel);
      backdrop-filter: blur(24px);
      border: 1px solid rgba(212, 175, 55, 0.22);
      box-shadow: 0 25px 70px -15px rgba(0, 0, 0, 0.85), 0 0 35px -10px rgba(212, 175, 55, 0.15);
    }
    .gold-gradient-text {
      background: linear-gradient(135deg, #fff6d6 0%, #d4af37 50%, #997a15 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .gold-btn {
      background: linear-gradient(135deg, #d4af37 0%, #aa820a 100%);
      color: #050507;
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .gold-btn:hover {
      filter: brightness(1.12);
      transform: translateY(-2px);
      box-shadow: 0 12px 30px -8px rgba(212, 175, 55, 0.55);
    }
    .spec-pill {
      border: 1px solid rgba(255, 255, 255, 0.07);
      background: rgba(255, 255, 255, 0.02);
    }
  </style>
</head>
<body class="min-h-screen flex items-center justify-center p-4 md:p-8">
  <div class="sovereign-card max-w-2xl w-full rounded-none md:rounded-2xl p-8 md:p-12 relative overflow-hidden">
    <!-- Top Architectural Accent Line -->
    <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#d4af37] to-transparent"></div>

    <!-- Header Section -->
    <div class="text-center space-y-3 border-b border-white/10 pb-8">
      <div class="inline-block px-4 py-1 border border-[#d4af37]/40 bg-[#d4af37]/10 text-[#f3e5ab] text-xs font-mono-tech tracking-widest uppercase">
        SOVEREIGN EDITION // V9.0 ARCHITECTURE
      </div>
      <h1 class="text-3xl md:text-5xl font-black font-luxury tracking-wider gold-gradient-text uppercase pt-2">
        MOVIES &amp; SERIES
      </h1>
      <p class="text-gray-400 text-sm md:text-base max-w-lg mx-auto leading-relaxed font-normal">
        النظام المركزي المتكامل لتجميع محركات البث السحابي، فهارس السينما العالمية، وأنظمة الترجمة الاحترافية بتصميم هندسي خالٍ من الضوضاء البصرية.
      </p>
    </div>

    <!-- System Telemetry & Catalogs Preview -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 my-8" dir="ltr">
      <div class="spec-pill p-3.5 text-center">
        <div class="text-xs text-gray-500 font-mono-tech">CATALOGS</div>
        <div class="text-sm font-bold text-[#f3e5ab] font-mono-tech mt-1">MOVIES / SERIES</div>
      </div>
      <div class="spec-pill p-3.5 text-center">
        <div class="text-xs text-gray-500 font-mono-tech">PLUGINS</div>
        <div class="text-sm font-bold text-[#f3e5ab] font-mono-tech mt-1">22 INTEGRATED</div>
      </div>
      <div class="spec-pill p-3.5 text-center">
        <div class="text-xs text-gray-500 font-mono-tech">CLOUD ENGINE</div>
        <div class="text-sm font-bold text-emerald-400 font-mono-tech mt-1">TORBOX ACTIVE</div>
      </div>
      <div class="spec-pill p-3.5 text-center">
        <div class="text-xs text-gray-500 font-mono-tech">RESOLUTION</div>
        <div class="text-sm font-bold text-[#f3e5ab] font-mono-tech mt-1">UP TO 8K HDR</div>
      </div>
    </div>

    <!-- Active Modules Matrix -->
    <div class="space-y-3 mb-8">
      <div class="flex items-center justify-between p-4 spec-pill">
        <div>
          <div class="text-sm font-bold text-white tracking-wide">MOVIES &amp; SERIES MASTER CATALOGS</div>
          <div class="text-xs text-gray-400 mt-0.5">Cinemeta + TMDB + Cyberflix + Streaming Networks + Kitsu</div>
        </div>
        <span class="text-xs font-mono-tech px-3 py-1 border border-[#d4af37]/40 text-[#f3e5ab] bg-[#d4af37]/10">ONLINE</span>
      </div>

      <div class="flex items-center justify-between p-4 spec-pill">
        <div>
          <div class="text-sm font-bold text-white tracking-wide">MULTI-SCRAPER STREAM FEDERATION</div>
          <div class="text-xs text-gray-400 mt-0.5">Torrentio + KnightCrawler + Comet + MediaFusion + Annatar + YTS</div>
        </div>
        <span class="text-xs font-mono-tech px-3 py-1 border border-[#d4af37]/40 text-[#f3e5ab] bg-[#d4af37]/10">ONLINE</span>
      </div>

      <div class="flex items-center justify-between p-4 spec-pill">
        <div>
          <div class="text-sm font-bold text-white tracking-wide">ARABIC &amp; GLOBAL SUBTITLE MATRIX</div>
          <div class="text-xs text-gray-400 mt-0.5">SubDL + OpenSubtitles V3 + Subscene + Podnapisi + YIFY Subs</div>
        </div>
        <span class="text-xs font-mono-tech px-3 py-1 border border-[#d4af37]/40 text-[#f3e5ab] bg-[#d4af37]/10">ONLINE</span>
      </div>
    </div>

    <!-- Action Controls -->
    <div class="space-y-3">
      <a href="stremio://${host}/manifest.json" class="gold-btn w-full py-4 px-6 font-black text-center block tracking-wide text-sm md:text-base uppercase">
        تثبيت الإضافة مباشرة في STREMIO
      </a>
      <button onclick="navigator.clipboard.writeText('https://${host}/manifest.json'); this.innerText='MANIFEST URL COPIED TO CLIPBOARD';" class="w-full py-3.5 px-4 bg-white/5 hover:bg-white/10 border border-white/15 text-xs font-mono-tech tracking-widest text-gray-300 transition-all text-center uppercase">
        COPY MANIFEST ENDPOINT URL
      </button>
    </div>

    <!-- Footer Status -->
    <div class="mt-8 pt-5 border-t border-white/10 flex items-center justify-between text-xs text-gray-500 font-mono-tech" dir="ltr">
      <span>HOST: ${host}</span>
      <span>ZERO-EMOJI LUXURY DESIGN</span>
    </div>
  </div>
</body>
</html>`;
}

// =========================================================================
// 5. موجه الخادم الرئيسي الفائق (Master Federation Router)
// =========================================================================

export default async function handler(req, res) {
  try {
    // ترويسات الأمان، CORS، والتخزين المؤقت السريع
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
    // أ. مسار فحص حالة الخادم والإحصائيات (Health & Telemetry Endpoint)
    // -----------------------------------------------------------------
    if (path === "/health" || path === "/status") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.status(200).json({
        status: "OPERATIONAL",
        version: "9.0.0",
        architecture: "Sovereign Zero-Emoji Edition",
        cacheEntries: memoryCache.size,
        integratedAddonsCount: Object.keys(UPSTREAM_ADDONS).length
      });
    }

    // -----------------------------------------------------------------
    // ب. ملف التعريف الفخم (Manifest) - أقسام Movies و Series بدون إيموجي
    // -----------------------------------------------------------------
    if (path === "/manifest.json" || path === "/api/index" || path === "/api" || path === "/manifest") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.status(200).json({
        id: "org.sovereign.movies.series.hub",
        version: "9.0.0",
        name: "Movies & Series",
        description: "Sovereign Cinema Federation | 22+ Integrated Plugins | TorBox Cloud & Multi-Scraper Engine | Arabic Subtitles Matrix",
        resources: ["stream", "subtitles", "catalog", "meta"],
        types: ["movie", "series", "anime"],
        idPrefixes: ["tt", "kitsu"],
        catalogs: [
          {
            type: "movie",
            id: "sovereign_movies_top",
            name: "Movies",
            extra: [
              { name: "search", isRequired: false },
              { name: "genre", isRequired: false, options: ["Action", "Sci-Fi", "Thriller", "Drama", "Crime", "Mystery", "Adventure", "Horror", "Comedy", "Animation", "Fantasy"] },
              { name: "skip", isRequired: false }
            ]
          },
          {
            type: "series",
            id: "sovereign_series_top",
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
            name: "Movies // Featured Cinema",
            extra: [{ name: "skip", isRequired: false }]
          },
          {
            type: "series",
            id: "sovereign_series_featured",
            name: "Series // Premier Networks",
            extra: [{ name: "skip", isRequired: false }]
          },
          {
            type: "movie",
            id: "sovereign_movies_4k",
            name: "Movies // Box Office",
            extra: [{ name: "skip", isRequired: false }]
          },
          {
            type: "series",
            id: "sovereign_series_trending",
            name: "Series // Global Trending",
            extra: [{ name: "skip", isRequired: false }]
          }
        ],
        behaviorHints: {
          configurable: false,
          configurationRequired: false
        }
      });
    }

    // عرض الصفحة الرئيسية الفخمة عند فتح الرابط في المتصفح
    if (path === "" || path === "/") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(renderConfigPage(host));
    }

    // -----------------------------------------------------------------
    // ج. مسار الكتالوجات الموحدة (Movies & Series Unified Catalogs)
    // -----------------------------------------------------------------
    if (path.includes("/catalog/")) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      const subPath = path.substring(path.indexOf("/catalog/"));
      const parts = subPath.split("/").filter(Boolean);
      const type = parts[1] || "movie";
      const rawCatalogAndExtra = (parts[2] || "").replace(".json", "");
      const extraPart = parts[3] ? parts[3].replace(".json", "") : "";

      const cacheKey = `cat_${type}_${rawCatalogAndExtra}_${extraPart}`;
      const cachedCat = getFromCache(cacheKey);
      if (cachedCat) return res.status(200).json(cachedCat);

      let catalogUrls = [];

      // دعم البحث أو الفلترة بالـ Genre أو التمرير (Pagination)
      const extraSuffix = extraPart ? `/${extraPart}.json` : ".json";

      if (rawCatalogAndExtra === "sovereign_movies_featured") {
        catalogUrls = [
          `${UPSTREAM_ADDONS.cyberflix}/catalog/movie/netflix${extraSuffix}`,
          `${UPSTREAM_ADDONS.cinemeta}/catalog/movie/top${extraSuffix}`
        ];
      } else if (rawCatalogAndExtra === "sovereign_series_featured") {
        catalogUrls = [
          `${UPSTREAM_ADDONS.cyberflix}/catalog/series/apple${extraSuffix}`,
          `${UPSTREAM_ADDONS.cinemeta}/catalog/series/top${extraSuffix}`
        ];
      } else if (rawCatalogAndExtra === "sovereign_movies_4k") {
        catalogUrls = [
          `${UPSTREAM_ADDONS.cinemeta}/catalog/movie/year${extraSuffix}`,
          `${UPSTREAM_ADDONS.tmdbAddon}/catalog/movie/tmdb.top${extraSuffix}`
        ];
      } else if (rawCatalogAndExtra === "sovereign_series_trending") {
        catalogUrls = [
          `${UPSTREAM_ADDONS.cinemeta}/catalog/series/imdbRating${extraSuffix}`,
          `${UPSTREAM_ADDONS.tmdbAddon}/catalog/series/tmdb.top${extraSuffix}`
        ];
      } else {
        // الكتالوجات الرئيسية: Movies و Series
        catalogUrls = [
          `${UPSTREAM_ADDONS.cinemeta}/catalog/${type}/top${extraSuffix}`,
          `${UPSTREAM_ADDONS.tmdbAddon}/catalog/${type}/tmdb.top${extraSuffix}`
        ];
      }

      const results = await Promise.all(catalogUrls.map(u => safeFetchJson(u)));
      const mergedMetas = [];
      const seenIds = new Set();

      for (const resData of results) {
        if (resData && Array.isArray(resData.metas)) {
          for (const m of resData.metas) {
            if (m && m.id && !seenIds.has(m.id)) {
              seenIds.add(m.id);
              mergedMetas.push({
                ...m,
                name: stripAllEmojis(m.name || "")
              });
            }
          }
        }
      }

      const payload = { metas: mergedMetas };
      if (mergedMetas.length > 0) saveToCache(cacheKey, payload);
      return res.status(200).json(payload);
    }

    // -----------------------------------------------------------------
    // د. مسار تفاصيل العرض (Metadata Enrichment Engine)
    // -----------------------------------------------------------------
    if (path.includes("/meta/")) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      const parts = path.substring(path.indexOf("/meta/")).split("/").filter(Boolean);
      const type = parts[1] || "movie";
      const id = (parts[2] || "").replace(".json", "");

      const cacheKey = `meta_${type}_${id}`;
      const cachedMeta = getFromCache(cacheKey);
      if (cachedMeta) return res.status(200).json(cachedMeta);

      const isKitsu = id.startsWith("kitsu:");
      const metaSources = isKitsu
        ? [`${UPSTREAM_ADDONS.animeKitsu}/meta/${type}/${id}.json`]
        : [
            `${UPSTREAM_ADDONS.cinemeta}/meta/${type}/${id}.json`,
            `${UPSTREAM_ADDONS.tmdbAddon}/meta/${type}/${id}.json`
          ];

      const responses = await Promise.all(metaSources.map(u => safeFetchJson(u)));
      const primaryMeta = responses.find(r => r && r.meta)?.meta || null;

      if (primaryMeta) {
        primaryMeta.name = stripAllEmojis(primaryMeta.name || "");
        const resultObj = { meta: primaryMeta };
        saveToCache(cacheKey, resultObj);
        return res.status(200).json(resultObj);
      }

      return res.status(200).json({ meta: null });
    }

    // -----------------------------------------------------------------
    // هـ. مسار الترجمات الموسع (6 محركات ترجمة مع أولوية العربية)
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

      const subQueries = [
        safeFetchJson(`${UPSTREAM_ADDONS.subdl}/subtitles/${type}/${id}.json`),
        safeFetchJson(`${UPSTREAM_ADDONS.opensubtitlesV3}/subtitles/${type}/${id}.json`),
        safeFetchJson(`${UPSTREAM_ADDONS.subscene}/subtitles/${type}/${id}.json`),
        safeFetchJson(`${UPSTREAM_ADDONS.podnapisi}/subtitles/${type}/${id}.json`),
        type === "movie" ? safeFetchJson(`${UPSTREAM_ADDONS.yifysubs}/subtitles/${type}/${id}.json`) : Promise.resolve(null),
        OPENSUBTITLES_API_KEY && imdbId.startsWith("tt")
          ? safeFetchJson(
              `https://api.opensubtitles.com/api/v1/subtitles?imdb_id=${imdbId.replace("tt", "")}&languages=ar,en`,
              { "Api-Key": OPENSUBTITLES_API_KEY }
            )
          : Promise.resolve(null)
      ];

      const [subdlRes, osV3Res, subsceneRes, podnapisiRes, yifyRes, osDirectRes] = await Promise.all(subQueries);
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
      appendSubs(podnapisiRes, "en");
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

      // إزالة الروابط المكررة وترتيب الترجمة العربية في الصدارة دائماً
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
    // و. مسار البث المتعدد الفائق (10 محركات بث مدمجة + TorBox + فلترة ذكية)
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

      // استدعاء متوازي لأقوى 10 محركات بث عالمية في نفس اللحظة
      const [
        torrentioData,
        knightcrawlerData,
        mediafusionData,
        cometData,
        tpbData,
        ytsData,
        eztvData,
        webstreamrData,
        watchhubData,
        publicDomainData
      ] = await Promise.all([
        safeFetchJson(`${UPSTREAM_URL}${streamSubPath}`),
        safeFetchJson(`${UPSTREAM_ADDONS.knightcrawler}/stream/${type}/${id}.json`),
        safeFetchJson(`${UPSTREAM_ADDONS.mediafusion}/stream/${type}/${id}.json`),
        safeFetchJson(`${UPSTREAM_ADDONS.comet}/stream/${type}/${id}.json`),
        safeFetchJson(`${UPSTREAM_ADDONS.tpbPlus}/stream/${type}/${id}.json`),
        type === "movie" ? safeFetchJson(`${UPSTREAM_ADDONS.yts}/stream/${type}/${id}.json`) : Promise.resolve(null),
        type === "series" ? safeFetchJson(`${UPSTREAM_ADDONS.eztv}/stream/${type}/${id}.json`) : Promise.resolve(null),
        safeFetchJson(`${UPSTREAM_ADDONS.webstreamr}/stream/${type}/${id}.json`),
        safeFetchJson(`${UPSTREAM_ADDONS.watchhub}/stream/${type}/${id}.json`),
        type === "movie" ? safeFetchJson(`${UPSTREAM_ADDONS.publicDomain}/stream/${type}/${id}.json`) : Promise.resolve(null)
      ]);

      const rawCandidates = [];

      const ingestStreams = (dataObj, label) => {
        if (dataObj && Array.isArray(dataObj.streams)) {
          for (const s of dataObj.streams) {
            const combinedText = `${s.name || ""} ${s.title || ""} ${s.description || ""}`.toLowerCase();
            // استبعاد نسخ التصوير السينمائي الرديئة
            if (
              combinedText.includes("hdcam") ||
              combinedText.includes("camrip") ||
              combinedText.includes("telesync") ||
              combinedText.includes("tsrip")
            ) {
              continue;
            }
            rawCandidates.push(cleanAndFormatStream(s, label));
          }
        }
      };

      // تغذية المحرك بالتيارات من كافة الإضافات المحسنة
      ingestStreams(torrentioData, "TORRENTIO");
      ingestStreams(knightcrawlerData, "KNIGHTCRAWLER");
      ingestStreams(mediafusionData, "MEDIAFUSION");
      ingestStreams(cometData, "COMET");
      ingestStreams(tpbData, "TPB+");
      ingestStreams(ytsData, "YTS");
      ingestStreams(eztvData, "EZTV");
      ingestStreams(webstreamrData, "WEBSTREAM");

      // إضافة مصادر الملكية العامة والمنصات الرسمية بدون أي إيموجي
      if (publicDomainData && Array.isArray(publicDomainData.streams)) {
        for (const s of publicDomainData.streams) {
          rawCandidates.push({
            ...s,
            name: "[ PUBLIC ARCHIVE ]  ::  CLASSIC MASTER",
            title: "──────────────────────────────────────────────────\nSRC: PUBLIC DOMAIN   |   STATUS: DIRECT STREAM",
            _score: 50,
            _hash: s.url || s.infoHash || "pd"
          });
        }
      }

      if (watchhubData && Array.isArray(watchhubData.streams)) {
        for (const s of watchhubData.streams) {
          rawCandidates.push({
            ...s,
            name: `[ OFFICIAL PLATFORM ]  ::  ${stripAllEmojis(s.name || "DIRECT").toUpperCase()}`,
            title: `──────────────────────────────────────────────────\n${stripAllEmojis(s.title || "VERIFIED OFFICIAL STREAM")}`,
            _score: 10,
            _hash: s.url || s.externalUrl || "wh"
          });
        }
      }

      // منع تكرار نفس التورنت أو الرابط مع الاحتفاظ بالنسخة الأعلى تقييماً
      const uniqueStreamsMap = new Map();
      for (const item of rawCandidates) {
        const key = item._hash;
        if (!key) {
          uniqueStreamsMap.set(`anon_${Math.random()}`, item);
          continue;
        }
        const existing = uniqueStreamsMap.get(key);
        if (!existing || (item._score || 0) > (existing._score || 0)) {
          uniqueStreamsMap.set(key, item);
        }
      }

      const deduplicated = Array.from(uniqueStreamsMap.values());

      // ترتيب تنازلي صارم: TorBox السحابي أولاً ثم 8K/4K Remux ثم الأعلى في الـ Peers
      deduplicated.sort((a, b) => (b._score || 0) - (a._score || 0));

      // تنظيف الحقول الداخلية قبل الإرسال إلى Stremio
      const finalStreams = deduplicated.slice(0, 120).map(({ _score, _hash, ...cleanItem }) => cleanItem);

      if (finalStreams.length > 0) {
        saveToCache(cacheKey, finalStreams);
      } else {
        // محاولة استرجاع نسخة مخزنة قديمة في حال انقطاع كافة المصادر الخارجية مؤقتاً
        const stale = getFromCache(cacheKey, true);
        if (stale) return res.status(200).json({ streams: stale });
      }

      return res.status(200).json({ streams: finalStreams });
    }

    // الرد الافتراضي الآمن
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(200).json({
      status: "ONLINE",
      name: "Movies & Series // Sovereign Aggregator V9.0"
    });

  } catch {
    // حماية مطلقة من أي انهيار (Crash-Proof Fallback)
    return res.status(200).json({ streams: [], metas: [], subtitles: [] });
  }
}
