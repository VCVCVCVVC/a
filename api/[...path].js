// =========================================================================
// 1. الإعدادات وقائمة الملحقات المدمجة تلقائياً (Integrated Addon Registry)
// =========================================================================

// نعتمد على fetch المدمج في Node.js 18+ لتفادي أخطاء الاستيراد في Vercel
const UPSTREAM_URL = process.env.UPSTREAM_URL || "https://torrentio.strem.fun/qualityfilter=scr,cam|torbox=3183a8fd-2d85-41fb-a58d-39c5737efae3";
const OPENSUBTITLES_API_KEY = process.env.OPENSUBTITLES_API_KEY || "";
const CACHE_TTL = 15 * 60 * 1000;
const TIMEOUT_MS = 6000;

// روابط الملحقات الرسمية والإضافية للاستيراد التلقائي
const UPSTREAM_ADDONS = {
  cinemeta: "https://v3-cinemeta.strem.io",
  watchhub: "https://watchhub.strem.io",
  publicDomain: "https://caching.stremio.net/publicdomainmovies.now.sh",
  opensubtitlesV3: "https://opensubtitles-v3.strem.io",
  cyberflix: "https://cyberflix.kamyroll.tech"
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
    if (memoryCache.size > 1500) {
      const keys = Array.from(memoryCache.keys()).slice(0, 500);
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
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) StremioAggregator/4.5.0",
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
// 3. تحليل وتنسيق التيارات (Streams Formatting)
// =========================================================================

function cleanAndFormatStream(stream) {
  try {
    const originalName = stream.name || "";
    const originalTitle = stream.title || "";
    const full = `${originalName}\n${originalTitle}`;

    // الدقة
    let resLabel = "HD";
    const resMatch = full.match(/\b(4320p|8k|2160p|4k|1080p|720p|480p)\b/i);
    if (resMatch) {
      const r = resMatch[1].toUpperCase();
      resLabel = (r === "2160P" || r === "4K") ? "4K UHD" : (r === "4320P" || r === "8K" ? "8K ULTRA" : r);
    }

    // المصدر
    let ripType = "";
    if (/\bRemux\b/i.test(full)) ripType = "REMUX";
    else if (/\b(BDRip|BRRip|BluRay)\b/i.test(full)) ripType = "BLURAY";
    else if (/\b(WEB-DL|WEBRip|WEB)\b/i.test(full)) ripType = "WEB-DL";
    else if (/\bHDTV\b/i.test(full)) ripType = "HDTV";

    // الألوان
    const visual = [];
    if (/\b(DV|Dolby[\s.-]?Vision)\b/i.test(full)) visual.push("DV");
    if (/\bHDR10\+/i.test(full)) visual.push("HDR10+");
    else if (/\bHDR\b/i.test(full)) visual.push("HDR");

    // الترميز
    let codec = "";
    if (/\b(HEVC|x265|H\.?265)\b/i.test(full)) codec = "HEVC";
    else if (/\b(AVC|x264|H\.?264)\b/i.test(full)) codec = "x264";
    else if (/\bAV1\b/i.test(full)) codec = "AV1";

    // الصوت
    const audio = [];
    if (/\bAtmos\b/i.test(full)) audio.push("Atmos");
    if (/\bTrueHD\b/i.test(full)) audio.push("TrueHD");
    else if (/\b(DTS-HD|DTS)\b/i.test(full)) audio.push("DTS");
    else if (/\b(DD\+|E-AC-?3|DDP)\b/i.test(full)) audio.push("DD+");

    // التفاصيل
    const sizeMatch = originalTitle.match(/([0-9]+(?:\.[0-9]+)?\s*(?:GB|MB|GiB|MiB))/i);
    const sizeStr = sizeMatch ? sizeMatch[1].toUpperCase() : null;

    const seedersMatch = originalTitle.match(/(?:👤|👥|\bS:?\s*)(\d+)/i);
    const seeders = seedersMatch ? parseInt(seedersMatch[1], 10) : 0;

    const isCached = full.includes("⚡") || full.includes("[TB+]") || full.toLowerCase().includes("cached");

    const badgeHeader = [resLabel, ripType, visual.join("/"), codec].filter(Boolean).join("  •  ");
    const metaDetails = [
      sizeStr ? `📦 ${sizeStr}` : null,
      audio.length ? `🔊 ${audio.join(" ")}` : null,
      seeders > 0 ? `👥 ${seeders}` : null
    ].filter(Boolean).join("   │   ");

    return {
      ...stream,
      name: isCached ? `[TORBOX ⚡]  ${badgeHeader}` : `[P2P]  ${badgeHeader}`,
      title: `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${metaDetails || "جاهز للتشغيل الفوري"}`
    };
  } catch {
    return stream;
  }
}

// =========================================================================
// 4. موجه الخادم الرئيسي المقاوم للأخطاء (Crash-Proof Handler)
// =========================================================================

export default async function handler(req, res) {
  try {
    // ترويسات الأمان و CORS الكاملة
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=1800");

    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }

    // استخراج المسار بأمان تام حتى لو كان المسار فارغاً
    const rawUrl = req.url || "/";
    const path = rawUrl.split("?")[0].replace(/\/+$/, "") || "/";

    // ----------------------------------------------------
    // أ. ملف التعريف (Manifest)
    // ----------------------------------------------------
    if (path === "/manifest.json" || path === "/" || path === "/api/index" || path === "/api") {
      return res.status(200).json({
        id: "org.allinone.torrentio.master",
        version: "4.5.0",
        name: "Stremio Master Hub (TorBox)",
        description: "ملحق فائق الترتيب يجمع تلقائياً بين Cinemeta, WatchHub, OpenSubtitles, Public Domain مع فلترة Torrentio السحابية",
        resources: ["stream", "subtitles", "catalog", "meta"],
        types: ["movie", "series", "other"],
        catalogs: [
          {
            type: "movie",
            id: "top_cinemeta_movies",
            name: "Cinemeta: أفلام رائجة"
          },
          {
            type: "series",
            id: "top_cinemeta_series",
            name: "Cinemeta: مسلسلات مميزة"
          },
          {
            type: "movie",
            id: "public_domain_classics",
            name: "كلاسيكيات المجال العام (Public Domain)"
          }
        ]
      });
    }

    // ----------------------------------------------------
    // ب. مسار الكتالوج (Catalogs)
    // ----------------------------------------------------
    if (path.includes("/catalog/")) {
      const parts = path.substring(path.indexOf("/catalog/")).split("/").filter(Boolean);
      const type = parts[1] || "movie";
      const catalogId = (parts[2] || "").replace(".json", "");

      const cacheKey = `cat_${type}_${catalogId}`;
      const cachedCat = getFromCache(cacheKey);
      if (cachedCat) return res.status(200).json(cachedCat);

      if (catalogId === "public_domain_classics") {
        const pdData = await safeFetchJson(`${UPSTREAM_ADDONS.publicDomain}/catalog/movie/public_domain_movies.json`);
        if (pdData && pdData.metas) {
          saveToCache(cacheKey, pdData);
          return res.status(200).json(pdData);
        }
      }

      const cinemetaData = await safeFetchJson(`${UPSTREAM_ADDONS.cinemeta}/catalog/${type}/top.json`);
      if (cinemetaData && cinemetaData.metas) {
        saveToCache(cacheKey, cinemetaData);
        return res.status(200).json(cinemetaData);
      }

      return res.status(200).json({ metas: [] });
    }

    // ----------------------------------------------------
    // ج. مسار الميتا (Meta)
    // ----------------------------------------------------
    if (path.includes("/meta/")) {
      const parts = path.substring(path.indexOf("/meta/")).split("/").filter(Boolean);
      const type = parts[1] || "movie";
      const id = (parts[2] || "").replace(".json", "");

      const cacheKey = `meta_${type}_${id}`;
      const cachedMeta = getFromCache(cacheKey);
      if (cachedMeta) return res.status(200).json(cachedMeta);

      const metaData = await safeFetchJson(`${UPSTREAM_ADDONS.cinemeta}/meta/${type}/${id}.json`);
      if (metaData) {
        saveToCache(cacheKey, metaData);
        return res.status(200).json(metaData);
      }

      return res.status(200).json({ meta: null });
    }

    // ----------------------------------------------------
    // د. مسار الترجمات (Subtitles)
    // ----------------------------------------------------
    if (path.includes("/subtitles/")) {
      const parts = path.substring(path.indexOf("/subtitles/")).split("/").filter(Boolean);
      const type = parts[1] || "movie";
      const id = (parts[2] || "").replace(".json", "");
      const imdbId = id.split(":")[0];

      const cacheKey = `sub_${type}_${id}`;
      const cachedSubs = getFromCache(cacheKey);
      if (cachedSubs) return res.status(200).json({ subtitles: cachedSubs });

      const allSubtitles = [];

      // جلب من OpenSubtitles v3 الرسمي
      const v3Url = `${UPSTREAM_ADDONS.opensubtitlesV3}/subtitles/${type}/${id}.json`;
      const v3Data = await safeFetchJson(v3Url);
      if (v3Data && Array.isArray(v3Data.subtitles)) {
        allSubtitles.push(...v3Data.subtitles);
      }

      // جلب من OpenSubtitles API المباشر إن توفر المفتاح
      if (OPENSUBTITLES_API_KEY && imdbId) {
        const apiData = await safeFetchJson(
          `https://api.opensubtitles.com/api/v1/subtitles?imdb_id=${imdbId.replace("tt", "")}&languages=ar,en`,
          { "Api-Key": OPENSUBTITLES_API_KEY }
        );
        if (apiData && Array.isArray(apiData.data)) {
          const formatted = apiData.data.map(item => ({
            id: `os_${item.id}`,
            url: item.attributes.files[0]?.file_id 
              ? `https://api.opensubtitles.com/api/v1/download/${item.attributes.files[0].file_id}`
              : "",
            lang: item.attributes.language || "ar"
          })).filter(s => s.url);
          allSubtitles.push(...formatted);
        }
      }

      saveToCache(cacheKey, allSubtitles);
      return res.status(200).json({ subtitles: allSubtitles });
    }

    // ----------------------------------------------------
    // هـ. مسار البث (Stream)
    // ----------------------------------------------------
    if (path.includes("/stream/")) {
      const streamSubPath = path.substring(path.indexOf("/stream/"));
      const cacheKey = `str_${streamSubPath}`;
      const cachedStreams = getFromCache(cacheKey);
      if (cachedStreams) return res.status(200).json({ streams: cachedStreams });

      const parts = streamSubPath.split("/").filter(Boolean);
      const type = parts[1] || "movie";
      const id = (parts[2] || "").replace(".json", "");

      const [torrentioData, watchhubData, publicDomainData] = await Promise.all([
        safeFetchJson(`${UPSTREAM_URL}${streamSubPath}`),
        safeFetchJson(`${UPSTREAM_ADDONS.watchhub}/stream/${type}/${id}.json`),
        type === "movie" ? safeFetchJson(`${UPSTREAM_ADDONS.publicDomain}/stream/${type}/${id}.json`) : Promise.resolve(null)
      ]);

      const streamsList = [];

      if (torrentioData && Array.isArray(torrentioData.streams)) {
        const filtered = torrentioData.streams
          .filter(s => {
            const txt = `${s.name || ""} ${s.title || ""}`.toLowerCase();
            return !txt.includes("telesync") && !txt.includes("hdcam");
          })
          .map(cleanAndFormatStream);
        streamsList.push(...filtered);
      }

      if (watchhubData && Array.isArray(watchhubData.streams)) {
        streamsList.push(...watchhubData.streams.map(s => ({
          ...s,
          name: `[WatchHub] ${s.name || "رسمي"}`,
          title: `${s.title || "مشاهدة قانونية"}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
        })));
      }

      if (publicDomainData && Array.isArray(publicDomainData.streams)) {
        streamsList.push(...publicDomainData.streams.map(s => ({
          ...s,
          name: `[Public Domain] ${s.name || "مجاني"}`,
          title: `${s.title || "متاح للجميع"}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
        })));
      }

      saveToCache(cacheKey, streamsList);
      return res.status(200).json({ streams: streamsList });
    }

    // مسار افتراضي آمن
    return res.status(200).json({ status: "alive", message: "Stremio Master Server Running" });

  } catch (error) {
    // التقاط أي استثناء غير متوقع وإرجاع رد 200 فارغ لمنع انهيار Vercel (Error 500)
    return res.status(200).json({ streams: [], error: "Handled error safely" });
  }
}
