import fetch from "node-fetch";

// =========================================================================
// 1. الإعدادات وقائمة الملحقات المدمجة تلقائياً (Integrated Addon Registry)
// =========================================================================

const CONFIG = {
  // الرابط الخاص بك لتورنتيو المدمج مع TorBox
  TORRENTIO_UPSTREAM: process.env.UPSTREAM_URL || "https://torrentio.strem.fun/qualityfilter=scr,cam|torbox=3183a8fd-2d85-41fb-a58d-39c5737efae3",
  
  // مفتاح OpenSubtitles الرسمي (اختياري للاستعلام المباشر عبر API v1)
  OPENSUBTITLES_API_KEY: process.env.OPENSUBTITLES_API_KEY || "",

  // مدة بقاء الكاش بالمللي ثانية (15 دقيقة)
  CACHE_TTL: 15 * 60 * 1000,
  
  // مهلة انتظار الطلبات بالمللي ثانية لتجنب بطء Stremio
  TIMEOUT_MS: 5000
};

// روابط الملحقات الرسمية والإضافية للاستيراد التلقائي
const UPSTREAM_ADDONS = {
  // الملحقات التي طلبتها في الصور:
  cinemeta: "https://v3-cinemeta.strem.io",
  watchhub: "https://watchhub.strem.io",
  publicDomain: "https://caching.stremio.net/publicdomainmovies.now.sh",
  opensubtitlesV3: "https://opensubtitles-v3.strem.io",
  
  // إضافات موصى بها فائقة القوة للكتالوج والترجمات:
  cyberflix: "https://cyberflix.kamyroll.tech", // كتالوجات منصات البث (Netflix, Apple TV, Disney+)
  ytsSubtitles: "https://app.yts.mx"           // مساند ترجمة سريع للأفلام
};

// =========================================================================
// 2. إدارة الذاكرة المؤقتة ومعالجة الطلبات المتوازية (Caching & Network)
// =========================================================================

const memoryCache = new Map();

function getFromCache(key) {
  const item = memoryCache.get(key);
  if (item && Date.now() - item.time < CONFIG.CACHE_TTL) {
    return item.data;
  }
  memoryCache.delete(key);
  return null;
}

function saveToCache(key, data) {
  if (memoryCache.size > 2000) {
    // إخلاء نصف الذاكرة عند الامتلاء لتفادي تسريب الذاكرة
    const keys = Array.from(memoryCache.keys()).slice(0, 1000);
    keys.forEach(k => memoryCache.delete(k));
  }
  memoryCache.set(key, { data, time: Date.now() });
}

// دالة جلب آمنة ومزودة بـ Timeout
async function safeFetchJson(url, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) StremioMaster/4.5.0",
        "Accept": "application/json",
        ...headers
      }
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    clearTimeout(timer);
    return null;
  }
}

// =========================================================================
// 3. محلل بيانات الفيديو والصوت (Format & Quality Engine)
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

function getQualityScore(res) {
  switch (res) {
    case "8K ULTRA": return 9000;
    case "4K UHD": return 4000;
    case "1080P": return 1080;
    case "720P": return 720;
    default: return 480;
  }
}

function cleanAndFormatStream(stream) {
  const originalName = stream.name || "";
  const originalTitle = stream.title || "";
  const full = `${originalName}\n${originalTitle}`;

  // تحديد الدقة
  let resLabel = "HD";
  const resMatch = full.match(/\b(4320p|8k|2160p|4k|1080p|720p|480p)\b/i);
  if (resMatch) {
    const r = resMatch[1].toUpperCase();
    resLabel = (r === "2160P" || r === "4K") ? "4K UHD" : (r === "4320P" || r === "8K" ? "8K ULTRA" : r);
  }

  // نوع الإصدار
  let ripType = "";
  if (/\bRemux\b/i.test(full)) ripType = "REMUX";
  else if (/\b(BDRip|BRRip|BluRay)\b/i.test(full)) ripType = "BLURAY";
  else if (/\b(WEB-DL|WEBRip|WEB)\b/i.test(full)) ripType = "WEB-DL";
  else if (/\bHDTV\b/i.test(full)) ripType = "HDTV";

  // تقنيات الألوان والصورة
  const visual = [];
  if (/\b(DV|Dolby[\s.-]?Vision)\b/i.test(full)) visual.push("DV");
  if (/\bHDR10\+/i.test(full)) visual.push("HDR10+");
  else if (/\bHDR\b/i.test(full)) visual.push("HDR");
  if (/\b(10bit|10-bit)\b/i.test(full)) visual.push("10Bit");

  // ترميز الفيديو
  let codec = "";
  if (/\b(HEVC|x265|H\.?265)\b/i.test(full)) codec = "HEVC";
  else if (/\b(AVC|x264|H\.?264)\b/i.test(full)) codec = "x264";
  else if (/\bAV1\b/i.test(full)) codec = "AV1";

  // الصوتيات
  const audio = [];
  if (/\bAtmos\b/i.test(full)) audio.push("Atmos");
  if (/\bTrueHD\b/i.test(full)) audio.push("TrueHD");
  else if (/\b(DTS-HD|DTS)\b/i.test(full)) audio.push("DTS");
  else if (/\b(DD\+|E-AC-?3|DDP)\b/i.test(full)) audio.push("DD+");
  const channelMatch = full.match(/\b(7\.1|5\.1|2\.0)\b/);
  if (channelMatch) audio.push(channelMatch[1]);

  // الحجم والموزعون
  const sizeMatch = originalTitle.match(/([0-9]+(?:\.[0-9]+)?\s*(?:GB|MB|GiB|MiB))/i);
  const sizeStr = sizeMatch ? sizeMatch[1].toUpperCase() : null;
  const sizeBytes = parseSizeBytes(sizeStr);

  const seedersMatch = originalTitle.match(/(?:👤|👥|\bS:?\s*)(\d+)/i);
  const seeders = seedersMatch ? parseInt(seedersMatch[1], 10) : 0;

  // فحص الكاش السحابي
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
    title: `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${metaDetails || "جاهز للتشغيل"}`,
    _score: getQualityScore(resLabel) + (isCached ? 10000 : 0) + (seeders * 0.1),
    _sizeBytes: sizeBytes
  };
}

// =========================================================================
// 4. موجه الطلبات الرئيسي (Master Aggregator Handler)
// =========================================================================

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=1800");

  if (req.method === "OPTIONS") return res.status(200).end();

  const path = req.url.split("?")[0].replace(/\/+$/, "") || "/";

  // -----------------------------------------------------------------------
  // أ. مسار التعريف الكامل (Unified Manifest)
  // -----------------------------------------------------------------------
  if (path === "/manifest.json" || path === "/") {
    return res.status(200).json({
      id: "org.allinone.torrentio.master",
      version: "4.5.0",
      name: "Stremio Master Hub (TorBox + All Addons)",
      description: "ملحق فائق يجمع تلقائياً بين Cinemeta, WatchHub, OpenSubtitles, Public Domain مع فلترة Torrentio السحابية",
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

  // -----------------------------------------------------------------------
  // ب. استيراد الكتالوجات تلقائياً (Catalog Aggregation)
  // -----------------------------------------------------------------------
  if (path.startsWith("/catalog/")) {
    const parts = path.split("/").filter(Boolean); // catalog, [type], [id]
    const type = parts[1] || "movie";
    const catalogId = parts[2] ? parts[2].replace(".json", "") : "";

    const cacheKey = `cat_${type}_${catalogId}`;
    const cachedCat = getFromCache(cacheKey);
    if (cachedCat) return res.status(200).json(cachedCat);

    // إذا كان المطلوب كتالوج الأفلام الكلاسيكية من Public Domain Movies
    if (catalogId === "public_domain_classics") {
      const pdData = await safeFetchJson(`${UPSTREAM_ADDONS.publicDomain}/catalog/movie/public_domain_movies.json`);
      if (pdData && pdData.metas) {
        saveToCache(cacheKey, pdData);
        return res.status(200).json(pdData);
      }
    }

    // افتراضياً: استيراد الكتالوج مباشرة من Cinemeta
    const cinemetaData = await safeFetchJson(`${UPSTREAM_ADDONS.cinemeta}/catalog/${type}/top.json`);
    if (cinemetaData && cinemetaData.metas) {
      saveToCache(cacheKey, cinemetaData);
      return res.status(200).json(cinemetaData);
    }

    return res.status(200).json({ metas: [] });
  }

  // -----------------------------------------------------------------------
  // ج. استيراد واستعلام بيانات الميتا تلقائياً (Meta Proxy)
  // -----------------------------------------------------------------------
  if (path.startsWith("/meta/")) {
    const parts = path.split("/").filter(Boolean); // meta, [type], [id]
    const type = parts[1];
    const id = parts[2] ? parts[2].replace(".json", "") : "";

    const cacheKey = `meta_${type}_${id}`;
    const cachedMeta = getFromCache(cacheKey);
    if (cachedMeta) return res.status(200).json(cachedMeta);

    // جلب تفاصيل الفيلم من Cinemeta الرسمي
    const metaData = await safeFetchJson(`${UPSTREAM_ADDONS.cinemeta}/meta/${type}/${id}.json`);
    if (metaData) {
      saveToCache(cacheKey, metaData);
      return res.status(200).json(metaData);
    }

    return res.status(200).json({ meta: null });
  }

  // -----------------------------------------------------------------------
  // د. جلب الترجمات تلقائياً من OpenSubtitles v3 و OpenSubtitles API
  // -----------------------------------------------------------------------
  if (path.startsWith("/subtitles/")) {
    const parts = path.split("/").filter(Boolean); // subtitles, [type], [id]
    const type = parts[1];
    const id = parts[2] ? parts[2].replace(".json", "") : "";
    const imdbId = id.split(":")[0];

    const cacheKey = `sub_${type}_${id}`;
    const cachedSubs = getFromCache(cacheKey);
    if (cachedSubs) return res.status(200).json({ subtitles: cachedSubs });

    const allSubtitles = [];

    // 1. استيراد تلقائي من ملحق OpenSubtitles v3 الرسمي
    const v3Promise = safeFetchJson(`${UPSTREAM_ADDONS.opensubtitlesV3}${path}.json`);

    // 2. استيراد مساند من API OpenSubtitles الرسمي (إذا توفر المفتاح)
    const apiPromise = (CONFIG.OPENSUBTITLES_API_KEY && imdbId) 
      ? safeFetchJson(`https://api.opensubtitles.com/api/v1/subtitles?imdb_id=${imdbId.replace("tt", "")}&languages=ar,en`, {
          "Api-Key": CONFIG.OPENSUBTITLES_API_KEY
        })
      : Promise.resolve(null);

    const [v3Res, apiRes] = await Promise.all([v3Promise, apiPromise]);

    if (v3Res && Array.isArray(v3Res.subtitles)) {
      allSubtitles.push(...v3Res.subtitles);
    }

    if (apiRes && Array.isArray(apiRes.data)) {
      const formattedApiSubs = apiRes.data.map(item => ({
        id: `os_${item.id}`,
        url: item.attributes.files[0]?.file_id 
          ? `https://api.opensubtitles.com/api/v1/download/${item.attributes.files[0].file_id}` 
          : "",
        lang: item.attributes.language || "ar"
      })).filter(s => s.url);
      allSubtitles.push(...formattedApiSubs);
    }

    // إزالة التكرار
    const seen = new Set();
    const uniqueSubs = allSubtitles.filter(sub => {
      if (!sub.url || seen.has(sub.url)) return false;
      seen.add(sub.url);
      return true;
    });

    saveToCache(cacheKey, uniqueSubs);
    return res.status(200).json({ subtitles: uniqueSubs });
  }

  // -----------------------------------------------------------------------
  // هـ. جلب وتنسيق مسارات البث (Streams) من Torrentio + WatchHub + PublicDomain
  // -----------------------------------------------------------------------
  if (path.startsWith("/stream/")) {
    const cacheKey = `str_${path}`;
    const cachedStreams = getFromCache(cacheKey);
    if (cachedStreams) return res.status(200).json({ streams: cachedStreams });

    const targetTorrentioUrl = `${CONFIG.TORRENTIO_UPSTREAM}${path}`;
    const parts = path.split("/").filter(Boolean);
    const type = parts[1];
    const id = parts[2] ? parts[2].replace(".json", "") : "";

    // تشغيل طلبات متوازية لجلب جميع الخيارات دفعة واحدة:
    const fetchTorrents = safeFetchJson(targetTorrentioUrl);
    const fetchWatchHub = safeFetchJson(`${UPSTREAM_ADDONS.watchhub}/stream/${type}/${id}.json`);
    const fetchPublicDomain = (type === "movie") 
      ? safeFetchJson(`${UPSTREAM_ADDONS.publicDomain}/stream/${type}/${id}.json`)
      : Promise.resolve(null);

    const [torrentioData, watchhubData, publicDomainData] = await Promise.all([
      fetchTorrents,
      fetchWatchHub,
      fetchPublicDomain
    ]);

    const collectedStreams = [];

    // 1. تنظيف وفلترة روابط Torrentio
    if (torrentioData && Array.isArray(torrentioData.streams)) {
      const validStreams = torrentioData.streams
        .filter(s => {
          const t = `${s.name || ""} ${s.title || ""}`.toLowerCase();
          return !t.includes("telesync") && !t.includes("hdcam");
        })
        .map(cleanAndFormatStream);
      collectedStreams.push(...validStreams);
    }

    // 2. دمج روابط المشاهدة القانونية من WatchHub إن وجدت
    if (watchhubData && Array.isArray(watchhubData.streams)) {
      const whStreams = watchhubData.streams.map(s => ({
        ...s,
        name: `[WatchHub] ${s.name || "رسمي"}`,
        title: `${s.title || "مشاهدة قانونية مدفوعة"}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        _score: 50
      }));
      collectedStreams.push(...whStreams);
    }

    // 3. دمج روابط الأفلام الكلاسيكية من Public Domain إن وجدت
    if (publicDomainData && Array.isArray(publicDomainData.streams)) {
      const pdStreams = publicDomainData.streams.map(s => ({
        ...s,
        name: `[Public Domain] ${s.name || "مجاني"}`,
        title: `${s.title || "متاح مجاناً للجميع"}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        _score: 100
      }));
      collectedStreams.push(...pdStreams);
    }

    // ترتيب القائمة بذكاء: TorBox السحابي أولاً، ثم الجودة العالية، وأخيراً الروابط البديلة
    collectedStreams.sort((a, b) => (b._score || 0) - (a._score || 0));

    // استبعاد الخصائص الداخلية قبل الإرسال لتطبيق Stremio
    const finalStreams = collectedStreams.map(({ _score, _sizeBytes, ...clean }) => clean);

    saveToCache(cacheKey, finalStreams);
    return res.status(200).json({ streams: finalStreams });
  }

  return res.status(404).json({ error: "Route not found" });
}
```

```markdown:دليل ملحقات Stremio المقترحة:stremio_addons_guide.md
# دليل الملحقات الإضافية الموصى بها في Stremio

يوضح هذا الدليل دور الملحقات التي طلبتها، بالإضافة إلى ملحقات تكميلية مقترحة لتحسين تجربة المشاهدة والتنظيم:

---

### 1. الملحقات المدمجة تلقائياً في الكود أعلاه

* **Cinemeta (`https://v3-cinemeta.strem.io/manifest.json`):**
  * **الوظيفة:** الملحق الأساسي والأول لقاعدة البيانات الوصفية (Metadata). يجلب ملصقات الأفلام والمسلسلات، وأسماء الممثلين، وتواريخ الإصدار، وملخصات القصة من IMDb.
* **WatchHub (`https://watchhub.strem.io/manifest.json`):**
  * **الوظيفة:** يخبرك بأماكن توفر الفيلم أو المسلسل رسمياً على خدمات البث القانونية (Netflix, Amazon Prime, Apple TV, Disney+ وغيرها).
* **OpenSubtitles v3 (`https://opensubtitles-v3.strem.io/manifest.json`):**
  * **الوظيفة:** أحدث إصدار رسمي من قاعدة بيانات الترجمة الكبرى عالمياً لمختلف اللغات (بما فيها العربية).
* **Public Domain Movies (`https://caching.stremio.net/publicdomainmovies.now.sh/manifest.json`):**
  * **الوظيفة:** يوفر مكتبة تضم أكثر من 500 فيلم من كلاسيكيات السينما التي أصبحت ضمن الملكية العامة وتعمل مجاناً بدون اشتراكات.

---

### 2. ملحقات إضافية مميزة ومفيدة جداً (ينصح بإضافتها)

| الملحق | الوظيفة والفائدة | الرابط / المصدر |
| :--- | :--- | :--- |
| **CyberFlix Catalog** | يعرض أحدث إصدارات منصات البث مقسمة حسب كل منصة (Netflix, Disney+, Apple TV+, HBO Max) مباشرة في الشاشة الرئيسية. | `https://cyberflix.kamyroll.tech/manifest.json` |
| **Anime Kitsu** | يوفر بيانات وصفية متكاملة للأنمي الياباني متصلة بقاعدة بيانات Kitsu لترتيب الحلقات والمواسم بدقة. | متاح مباشرة من قسم Addons الرسمي في التطبيق. |
| **Trakt Scrobbler** | لمزامنة تقدم المشاهدة وسجل الحلقات تلقائياً عبر حسابك في موقع Trakt.tv. | يتم تفعيله من إعدادات حساب Stremio. |
| **Subscene Community** | مصدر ترجمات عربي وإنجليزي بديل في حال لم تكن ترجمات OpenSubtitles متوافقة زمنياً مع النسخة المختارة. | مجتمعي (Community Addon). |

---

### 3. كيفية تشغيل الكود المعدّل

1. **نشر الكود:** ضع ملف `master_addon_server.js` على أي منصة سحابية تدعم دوال الـ Serverless (مثل Vercel أو Render أو Node.js Server).
2. **تثبيت التبعيات:** تأكد من وجود `node-fetch` في ملف `package.json`:
   ```bash
   npm install node-fetch
   ```
3. **التثبيت في Stremio:** بعد نشر الخادم والحصول على رابطه، انسخ رابط الـ `manifest.json` الخاص بك (مثلاً: `https://your-domain.vercel.app/manifest.json`)، ثم ألصقه في شريط البحث داخل قسم الـ **Addons** في تطبيق Stremio.
```

تم دمج الروابط من الصور الأربع داخل الخادم المجمّع (`master_addon_server.js`) ليتولى معالجة الكتالوجات والميتا والترجمات وروابط البث من مصدر موحد، كما تضمن ملف الدليل شرحاً تفصيلياً للملحقات الإضافية المقترحة. هل تحتاج لمساعدة في طريقة نشر الكود على Vercel أو ضبط إعدادات معينة؟
