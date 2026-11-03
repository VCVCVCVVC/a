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

// قاموس تعريب التصنيفات (Genres) لضمان ظهورها بالعربية في الواجهة الرئيسية والداخلية
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
  "Action & Adventure": "حركة ومغامرة",
  "Sci-Fi & Fantasy": "خيال علمي وفانتازيا"
};

function localizeGenres(genres) {
  if (!Array.isArray(genres)) return [];
  return genres.map(g => GENRE_AR_MAP[g] || g);
}

// فحص ما إذا كان النص عربياً بالفعل
function isTextArabic(text) {
  if (!text || typeof text !== "string") return false;
  const arabicChars = text.match(/[\u0600-\u06FF]/g);
  return Boolean(arabicChars && arabicChars.length >= 6);
}

// دالة ترجمة نص مفرد مع 3 محركات متتالية (GTX -> Clients5 -> MyMemory) وعدم تخزين النص إلا إذا تعرب فعلياً
async function translateToArabic(text) {
  if (!text || typeof text !== "string") return text;
  const cleanText = text.trim();
  if (!cleanText || isTextArabic(cleanText)) return cleanText;

  const cacheKey = `tr_ar_v14_${cleanText.slice(0, 160)}`;
  const cached = getFromCache(cacheKey, true);
  if (cached && isTextArabic(cached)) return cached;

  // المحرك الأول: Google GTX
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ar&dt=t&q=${encodeURIComponent(cleanText)}`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
    });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && Array.isArray(data[0])) {
        const translated = data[0].map(part => (part && part[0]) ? part[0] : "").join("").trim();
        if (isTextArabic(translated)) {
          saveToCache(cacheKey, translated);
          return translated;
        }
      }
    }
  } catch {
    // الانتقال للمحرك الثاني
  }

  // المحرك الثاني: Google Clients5
  try {
    const controller2 = new AbortController();
    const timer2 = setTimeout(() => controller2.abort(), 3500);
    const url2 = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=en&tl=ar&q=${encodeURIComponent(cleanText)}`;
    const res2 = await fetch(url2, {
      signal: controller2.signal,
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
    });
    clearTimeout(timer2);
    if (res2.ok) {
      const data2 = await res2.json();
      const candidate = Array.isArray(data2) ? (Array.isArray(data2[0]) ? data2[0][0] : data2[0]) : null;
      if (typeof candidate === "string" && isTextArabic(candidate)) {
        saveToCache(cacheKey, candidate.trim());
        return candidate.trim();
      }
    }
  } catch {
    // الانتقال للمحرك الثالث
  }

  // المحرك الثالث الاحتياطي: MyMemory API
  try {
    const controller3 = new AbortController();
    const timer3 = setTimeout(() => controller3.abort(), 3500);
    const url3 = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(cleanText.slice(0, 480))}&langpair=en|ar`;
    const res3 = await fetch(url3, { signal: controller3.signal });
    clearTimeout(timer3);
    if (res3.ok) {
      const data3 = await res3.json();
      const candidate3 = data3?.responseData?.translatedText;
      if (typeof candidate3 === "string" && isTextArabic(candidate3)) {
        saveToCache(cacheKey, candidate3.trim());
        return candidate3.trim();
      }
    }
  } catch {
    // تجاهل آمن
  }

  return cleanText;
}

// مترجم الدفعات الموحد (Batch Translator): يترجم عشرات القصص في طلب واحد لمنع حظر Rate-Limit نهائياً
async function batchTranslatePlotsToArabic(plotsArray) {
  if (!Array.isArray(plotsArray) || plotsArray.length === 0) return plotsArray;

  const results = [...plotsArray];
  const pendingIndices = [];
  const pendingTexts = [];

  for (let i = 0; i < plotsArray.length; i++) {
    const txt = (plotsArray[i] || "").trim();
    if (!txt || isTextArabic(txt)) continue;

    const cacheKey = `tr_ar_v14_${txt.slice(0, 160)}`;
    const cached = getFromCache(cacheKey, true);
    if (cached && isTextArabic(cached)) {
      results[i] = cached;
    } else {
      pendingIndices.push(i);
      pendingTexts.push(txt.replace(/\n+/g, " "));
    }
  }

  if (pendingTexts.length === 0) return results;

  // تقسيم النصوص إلى مجموعات (كل 8 قصص في طلب واحد فقط مفصولة بأسطر) لضمان سرعة فائقة وعدم الحظر
  const CHUNK_SIZE = 8;
  for (let start = 0; start < pendingTexts.length; start += CHUNK_SIZE) {
    const chunkTexts = pendingTexts.slice(start, start + CHUNK_SIZE);
    const chunkIndices = pendingIndices.slice(start, start + CHUNK_SIZE);
    const joinedPayload = chunkTexts.join("\n\n");

    let chunkTranslatedSuccess = false;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ar&dt=t&q=${encodeURIComponent(joinedPayload)}`;
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
      });
      clearTimeout(timer);

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && Array.isArray(data[0])) {
          const fullArabicText = data[0].map(part => (part && part[0]) ? part[0] : "").join("");
          const splitParts = fullArabicText.split(/\n\s*\n/);

          if (splitParts.length === chunkTexts.length) {
            chunkTranslatedSuccess = true;
            for (let j = 0; j < chunkTexts.length; j++) {
              const arText = splitParts[j].trim();
              const originalIdx = chunkIndices[j];
              if (isTextArabic(arText)) {
                results[originalIdx] = arText;
                saveToCache(`tr_ar_v14_${chunkTexts[j].slice(0, 160)}`, arText);
              }
            }
          }
        }
      }
    } catch {
      // في حال فشل الدفعة ننتقل للترجمة المفردة الاحتياطية
    }

    if (!chunkTranslatedSuccess) {
      const fallbackTranslations = await Promise.all(
        chunkTexts.map(t => translateToArabic(t))
      );
      for (let j = 0; j < chunkTexts.length; j++) {
        results[chunkIndices[j]] = fallbackTranslations[j];
      }
    }
  }

  return results;
}

// تعريب قائمة عناصر الكتالوج دفعة واحدة مع جلب الوصف المفقود وتعريب كافة الحقول
async function localizeCatalogList(items, type = "movie") {
  if (!Array.isArray(items) || items.length === 0) return [];

  // 1. تجهيز العناصر وتطهير الإيموجيات وتعريب التصنيفات
  const prepared = items.map(item => ({
    ...item,
    name: stripAllEmojis(item.name || ""),
    genres: localizeGenres(item.genres),
    genre: localizeGenres(item.genre)
  }));

  // 2. إذا كان العنصر من أوائل عناصر البنر الرئيسي ولا يحتوي على قصة في الكتالوج، نجلب قصته من TMDB العربي أو Cinemeta
  const heroItemsCount = Math.min(prepared.length, 15);
  await Promise.all(
    prepared.slice(0, heroItemsCount).map(async (item) => {
      const existingPlot = item.description || item.overview || item.synopsis || "";
      if (!existingPlot && item.id && item.id.startsWith("tt")) {
        const arMeta = await safeFetchJson(`${UPSTREAM_ADDONS.tmdbAddon}/meta/${type}/${item.id}.json`, {}, 2500);
        const arDesc = arMeta?.meta?.description || arMeta?.meta?.overview;
        if (arDesc) {
          item.description = arDesc;
        } else {
          const enMeta = await safeFetchJson(`${UPSTREAM_ADDONS.cinemeta}/meta/${type}/${item.id}.json`, {}, 2500);
          if (enMeta?.meta?.description) item.description = enMeta.meta.description;
        }
      }
    })
  );

  // 3. جمع كل القصص وترجمتها بنظام الدفعات الموحد المضمون 100%
  const rawPlots = prepared.map(item => item.description || item.overview || item.synopsis || "");
  const translatedPlots = await batchTranslatePlotsToArabic(rawPlots);

  for (let i = 0; i < prepared.length; i++) {
    const arPlot = translatedPlots[i];
    if (arPlot) {
      prepared[i].description = arPlot;
      prepared[i].overview = arPlot;
      prepared[i].synopsis = arPlot;
    }
  }

  return prepared;
}

// تعريب كائن الفيلم أو المسلسل المفرد بالكامل لجميع الحقول التي تقرأها الواجهة الخارجية والداخلية
async function localizeMetaItem(item) {
  if (!item) return item;
  const localized = {
    ...item,
    name: stripAllEmojis(item.name || "")
  };

  if (Array.isArray(localized.genres)) {
    localized.genres = localizeGenres(localized.genres);
  }
  if (Array.isArray(localized.genre)) {
    localized.genre = localizeGenres(localized.genre);
  }

  const rawPlot = localized.description || localized.overview || localized.synopsis || "";
  if (rawPlot) {
    const arabicPlot = await translateToArabic(rawPlot);
    localized.description = arabicPlot;
    localized.overview = arabicPlot;
    localized.synopsis = arabicPlot;
  }

  return localized;
}

// قائمة منتقاة ومحدثة لأبرز المسلسلات العربية والخليجية والرمضانية مع قصصها العربية الكاملة
const ARABIC_SERIES_CURATED = {
  general: [
    {
      id: "tt13406136",
      type: "series",
      name: "ما وراء الطبيعة",
      poster: "https://images.metahub.space/poster/medium/tt13406136/img",
      background: "https://images.metahub.space/background/medium/tt13406136/img",
      genres: ["دراما", "غموض", "رعب", "تشويق وإثارة"],
      imdbRating: "8.0",
      releaseInfo: "2020",
      description: "في حقبة الستينيات من القرن الماضي، يعيش الطبيب رفعت إسماعيل أستاذ أمراض الدم سلسلة من الأحداث الخارقة للطبيعة التي تقلب قناعاته العلمية رأساً على عقب."
    },
    {
      id: "tt27415216",
      type: "series",
      name: "الحشاشين",
      poster: "https://images.metahub.space/poster/medium/tt27415216/img",
      background: "https://images.metahub.space/background/medium/tt27415216/img",
      genres: ["تاريخي", "دراما", "حركة وإثارة"],
      imdbRating: "8.2",
      releaseInfo: "2024",
      description: "في القرن الحادي عشر، يؤسس حسن الصباح طائفة الحشاشين ويتخذ من قلعة آلموت الحصينة مقراً له، ناشراً الرعب والاغتيالات السياسية في أنحاء المنطقة."
    },
    {
      id: "tt19380956",
      type: "series",
      name: "الصفارة",
      poster: "https://images.metahub.space/poster/medium/tt19380956/img",
      background: "https://images.metahub.space/background/medium/tt19380956/img",
      genres: ["كوميديا", "فانتازيا"],
      imdbRating: "7.7",
      releaseInfo: "2023",
      description: "مرشد سياحي يسرق صفارة أثرية للملك توت عنخ آمون تمنحه القدرة على العودة بالزمن ثلاث دقائق لتغيير حياته، لكن كل محاولة تقوده إلى مفاجآت غير متوقعة."
    },
    {
      id: "tt14466294",
      type: "series",
      name: "لعبة نيوتن",
      poster: "https://images.metahub.space/poster/medium/tt14466294/img",
      background: "https://images.metahub.space/background/medium/tt14466294/img",
      genres: ["دراما", "تشويق وإثارة"],
      imdbRating: "8.4",
      releaseInfo: "2021",
      description: "يتخذ الزوجان هنا وحازم قراراً بالسفر إلى الولايات المتحدة لإنجاب طفلهما هناك، إلا أن رحلتهما تتحول إلى سلسلة من الأزمات المعقدة والمصيرية."
    },
    {
      id: "tt27197059",
      type: "series",
      name: "تحت الوصاية",
      poster: "https://images.metahub.space/poster/medium/tt27197059/img",
      background: "https://images.metahub.space/background/medium/tt27197059/img",
      genres: ["دراما"],
      imdbRating: "8.6",
      releaseInfo: "2023",
      description: "أرملة شابة تقرر الهروب بمركب الصيد الخاص بزوجها الراحل مع طفليها إلى مدينة دمياط، لتخوض معركة شرسة في عالم الصيادين لحماية مستقبل أبنائها."
    },
    {
      id: "tt18274572",
      type: "series",
      name: "الكبير أوي",
      poster: "https://images.metahub.space/poster/medium/tt18274572/img",
      background: "https://images.metahub.space/background/medium/tt18274572/img",
      genres: ["كوميديا", "عائلي"],
      imdbRating: "8.3",
      releaseInfo: "2010",
      description: "يوميات كوميدية ساخرة لعمدة قرية المزاريطة وأشقائه التوائم وسط مفارقات اجتماعية ومغامرات لا تنتهي مع أهل القرية."
    },
    {
      id: "tt11969464",
      type: "series",
      name: "الاختيار",
      poster: "https://images.metahub.space/poster/medium/tt11969464/img",
      background: "https://images.metahub.space/background/medium/tt11969464/img",
      genres: ["حركة وإثارة", "تاريخي", "دراما"],
      imdbRating: "8.5",
      releaseInfo: "2020",
      description: "عمل درامي يوثق بطولات وتضحيات رجال الأمن والقوات المسلحة في مواجهة العمليات الإرهابية وحماية الأمن القومي."
    },
    {
      id: "tt15438940",
      type: "series",
      name: "الغرفة 207",
      poster: "https://images.metahub.space/poster/medium/tt15438940/img",
      background: "https://images.metahub.space/background/medium/tt15438940/img",
      genres: ["غموض", "رعب", "تشويق وإثارة"],
      imdbRating: "7.8",
      releaseInfo: "2022",
      description: "في عام 1968 داخل فندق عريق، يكتشف موظف الاستقبال جمال الصواف أسراراً مرعبة وغامضة تحيط بالغرفة رقم 207 التي تغير مصير كل من يدخلها."
    },
    {
      id: "tt6060992",
      type: "series",
      name: "الهيبة",
      poster: "https://images.metahub.space/poster/medium/tt6060992/img",
      background: "https://images.metahub.space/background/medium/tt6060992/img",
      genres: ["حركة وإثارة", "جريمة", "دراما"],
      imdbRating: "7.4",
      releaseInfo: "2017",
      description: "جبل شيخ الجبل يتزعم عشيرته في قرية حدودية تحكمها الأعراف العشائرية وتجارة السلاح، ويواجه صراعات دامية لحماية عائلته ونفوذه."
    },
    {
      id: "tt13833688",
      type: "series",
      name: "مدرسة الروابي للبنات",
      poster: "https://images.metahub.space/poster/medium/tt13833688/img",
      background: "https://images.metahub.space/background/medium/tt13833688/img",
      genres: ["دراما", "تشويق وإثارة"],
      imdbRating: "7.2",
      releaseInfo: "2021",
      description: "تتحد مجموعة من الطالبات المهمشات في مدرسة مرموقة للانتقام من المتنمرات، ليكتشفن أن لكل شخص وجهاً آخر وأسراراً خفية."
    }
  ],
  gulf: [
    {
      id: "tt11640018",
      type: "series",
      name: "رشاش",
      poster: "https://images.metahub.space/poster/medium/tt11640018/img",
      background: "https://images.metahub.space/background/medium/tt11640018/img",
      genres: ["جريمة", "حركة وإثارة", "دراما"],
      imdbRating: "8.7",
      releaseInfo: "2021",
      description: "عمل درامي سعودي مستوحى من أحداث حقيقية في الثمانينيات، يروي قصة عصابة رشاش والجهود الأمنية المكثفة للإيقاع بها وتقديمها للعدالة."
    },
    {
      id: "tt7927936",
      type: "series",
      name: "العاصوف",
      poster: "https://images.metahub.space/poster/medium/tt7927936/img",
      background: "https://images.metahub.space/background/medium/tt7927936/img",
      genres: ["دراما", "تاريخي"],
      imdbRating: "7.6",
      releaseInfo: "2018",
      description: "يرصد المسلسل التحولات الاجتماعية والثقافية في المجتمع السعودي بمدينة الرياض منذ سبعينيات القرن الماضي من خلال عائلة الطيان."
    },
    {
      id: "tt5645432",
      type: "series",
      name: "سيلفي",
      poster: "https://images.metahub.space/poster/medium/tt5645432/img",
      background: "https://images.metahub.space/background/medium/tt5645432/img",
      genres: ["كوميديا", "دراما"],
      imdbRating: "8.1",
      releaseInfo: "2015",
      description: "حلقات منفصلة متصلة تناقش أبرز القضايا الاجتماعية والظواهر المعاصرة في المجتمع الخليجي والعربي بأسلوب كوميدي ساخر وجريء."
    },
    {
      id: "tt31015642",
      type: "series",
      name: "خيوط المعازيب",
      poster: "https://images.metahub.space/poster/medium/tt31015642/img",
      background: "https://images.metahub.space/background/medium/tt31015642/img",
      genres: ["تاريخي", "دراما"],
      imdbRating: "9.0",
      releaseInfo: "2024",
      description: "في ستينيات القرن الماضي بمحافظة الأحساء، تتشابك قصص صناع البشوت الحساوية وسط صراعات إنسانية واجتماعية مؤثرة."
    },
    {
      id: "tt13109952",
      type: "series",
      name: "محامي الشيطان",
      poster: "https://images.metahub.space/poster/medium/tt13109952/img",
      background: "https://images.metahub.space/background/medium/tt13109952/img",
      genres: ["جريمة", "غموض", "تشويق وإثارة"],
      imdbRating: "7.9",
      releaseInfo: "2023",
      description: "يتولى محامٍ بارع الدفاع عن لاعب كرة قدم متهم بقتل زوجته، ليجد نفسه وسط شبكة معقدة من الأسرار والمؤامرات."
    },
    {
      id: "tt19896150",
      type: "series",
      name: "من شارع الهرم إلى...",
      poster: "https://images.metahub.space/poster/medium/tt19896150/img",
      background: "https://images.metahub.space/background/medium/tt19896150/img",
      genres: ["دراما", "كوميديا"],
      imdbRating: "7.1",
      releaseInfo: "2022",
      description: "تضطر راقصة استعراضية للبقاء في منزل عائلة خليجية عريقة بعد حفل زفاف، مما يفجر سلسلة من المواقف والصراعات العائلية غير المتوقعة."
    },
    {
      id: "tt14500214",
      type: "series",
      name: "اختطاف",
      poster: "https://images.metahub.space/poster/medium/tt14500214/img",
      background: "https://images.metahub.space/background/medium/tt14500214/img",
      genres: ["تشويق وإثارة", "دراما", "غموض"],
      imdbRating: "7.5",
      releaseInfo: "2021",
      description: "تتعرض الطفلة لينا للاختطاف وتحتجز في قبو معزول لسنوات طويلة، بينما تستمر عائلتها وشقيقتها التوأم في رحلة البحث عنها."
    },
    {
      id: "tt10293938",
      type: "series",
      name: "دفعة القاهرة",
      poster: "https://images.metahub.space/poster/medium/tt10293938/img",
      background: "https://images.metahub.space/background/medium/tt10293938/img",
      genres: ["دراما", "تاريخي", "رومانسي"],
      imdbRating: "8.0",
      releaseInfo: "2019",
      description: "قصة أول دفعة من الطالبات والطلاب الخليجيين المبتعثين للدراسة في جامعة القاهرة عام 1956 وما واجهوه من تحديات وتجارب حياتية."
    }
  ]
};

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
        الإصدار الثاني عشر // تعريب فوري + خانات فرز الدقات العلوية
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
    let path = decodeURIComponent(rawUrl.split("?")[0]).replace(/\/+$/, "") || "/";

    // فحص ما إذا كان الطلب موجهاً لخانة دقة محددة (/4k/... أو /1080p/... أو /720p/... أو /480p/...)
    let resolutionFilter = null;
    const resPrefixMatch = path.match(/^\/(8k|4k|2k|1080p|720p|480p)(\/.*)?$/i);
    if (resPrefixMatch) {
      const rawRes = resPrefixMatch[1].toUpperCase();
      resolutionFilter = rawRes === "1080P" ? "1080p" : rawRes === "720P" ? "720p" : rawRes === "480P" ? "480p" : rawRes;
      path = resPrefixMatch[2] || "/";
    }

    // -----------------------------------------------------------------
    // ب. ملف التعريف (Manifest) - يدعم الإضافة الشاملة أو خانات الدقة المستقلة
    // -----------------------------------------------------------------
    if (path === "/manifest.json" || path === "/api/index" || path === "/api" || path === "/manifest") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      const { countryName } = getUserRegionInfo(req);

      // إذا قام المستخدم بتثبيت خانة دقة مخصصة (مثل 4K أو 1080p) لتظهر كزر علوي مستقل في المشغل
      if (resolutionFilter) {
        return res.status(200).json({
          id: `org.sovereign.arabic.res.${resolutionFilter.toLowerCase()}`,
          version: "12.0.0",
          name: resolutionFilter,
          description: `سيرفرات دقة ${resolutionFilter} فقط`,
          resources: ["stream"],
          types: ["movie", "series"],
          idPrefixes: ["tt", "kitsu"],
          catalogs: [],
          behaviorHints: {
            configurable: false,
            configurationRequired: false
          }
        });
      }

      return res.status(200).json({
        id: "org.sovereign.arabic.movies.series",
        version: "13.0.0",
        name: "Movies & Series",
        description: "المركز السيادي للأفلام والمسلسلات | تعريب فوري للقصة والعناوين مع المسلسلات العربية وتصنيف الدقات",
        resources: ["stream", "subtitles", "catalog", "meta"],
        types: ["movie", "series"],
        idPrefixes: ["tt", "kitsu"],
        catalogs: [
          {
            type: "movie",
            id: "top10_region_movies",
            name: `Movies // أفضل 10 في ${countryName}`
          },
          {
            type: "series",
            id: "top10_region_series",
            name: `Series // أفضل 10 في ${countryName}`
          },
          {
            type: "series",
            id: "arabic_series_top",
            name: "Series // مسلسلات عربية",
            extra: [{ name: "search", isRequired: false }, { name: "skip", isRequired: false }]
          },
          {
            type: "series",
            id: "arabic_gulf_series",
            name: "Series // مسلسلات خليجية ورمضانية",
            extra: [{ name: "search", isRequired: false }, { name: "skip", isRequired: false }]
          },
          {
            type: "movie",
            id: "trending_daily_movies",
            name: "Movies // ترند اليوم",
            extra: [{ name: "skip", isRequired: false }]
          },
          {
            type: "series",
            id: "trending_daily_series",
            name: "Series // ترند اليوم",
            extra: [{ name: "skip", isRequired: false }]
          },
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
    // ج. مسار الكتالوجات (مع تعريب شامل لكل القصص ودعم تصنيفي المسلسلات العربية)
    // -----------------------------------------------------------------
    if (path.includes("/catalog/")) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      const subPath = path.substring(path.indexOf("/catalog/"));
      const parts = subPath.split("/").filter(Boolean);
      const type = parts[1] || "movie";
      const catalogId = (parts[2] || "").replace(".json", "");
      const extraPart = parts[3] ? parts[3].replace(".json", "") : "";

      const { countryCode } = getUserRegionInfo(req);
      const daySeed = Math.floor(Date.now() / (1000 * 60 * 60 * 12));

      const cacheKey = `cat_ar_v14_${type}_${catalogId}_${countryCode}_${daySeed}_${extraPart}`;
      const cachedCat = getFromCache(cacheKey);
      if (cachedCat) return res.status(200).json(cachedCat);

      // معالجة تصنيفي المسلسلات العربية والخليجية المخصصين
      if (catalogId === "arabic_series_top" || catalogId === "arabic_gulf_series") {
        const baseCurated = catalogId === "arabic_gulf_series"
          ? [...ARABIC_SERIES_CURATED.gulf, ...ARABIC_SERIES_CURATED.general]
          : [...ARABIC_SERIES_CURATED.general, ...ARABIC_SERIES_CURATED.gulf];

        // دمج نتائج إضافية من البحث العربي في Cinemeta لزيادة المكتبة العربية
        const searchTerms = catalogId === "arabic_gulf_series" ? ["Saudi", "Kuwait", "Rashash"] : ["Egypt", "Ramadan", "Arabic"];
        const searchResponses = await Promise.all(
          searchTerms.map(term => safeFetchJson(`${UPSTREAM_ADDONS.cinemeta}/catalog/series/top/search=${encodeURIComponent(term)}.json`))
        );

        const combinedArabic = [...baseCurated];
        const seenArIds = new Set(combinedArabic.map(item => item.id));

        for (const resObj of searchResponses) {
          if (resObj && Array.isArray(resObj.metas)) {
            for (const m of resObj.metas) {
              if (m && m.id && !seenArIds.has(m.id)) {
                seenArIds.add(m.id);
                combinedArabic.push(m);
              }
            }
          }
        }

        const localizedArabic = await localizeCatalogList(combinedArabic.slice(0, 35), "series");

        const arPayload = { metas: localizedArabic };
        saveToCache(cacheKey, arPayload);
        return res.status(200).json(arPayload);
      }

      const extraSuffix = extraPart ? `/${extraPart}.json` : ".json";
      // جلب متوازي من TMDB العربي و Cinemeta ثم دمج القصة العربية من TMDB مع البيانات الكاملة من Cinemeta
      let tmdbUrl = `${UPSTREAM_ADDONS.tmdbAddon}/catalog/${type}/tmdb.top${extraSuffix}`;
      let cinemetaUrl = `${UPSTREAM_ADDONS.cinemeta}/catalog/${type}/top${extraSuffix}`;

      if (catalogId === "trending_daily_movies" || catalogId === "trending_daily_series") {
        tmdbUrl = `${UPSTREAM_ADDONS.tmdbAddon}/catalog/${type}/tmdb.trending${extraSuffix}`;
      } else if (catalogId === "top10_region_movies" || catalogId === "top10_region_series") {
        tmdbUrl = `${UPSTREAM_ADDONS.tmdbAddon}/catalog/${type}/tmdb.trending.json`;
        cinemetaUrl = `${UPSTREAM_ADDONS.cinemeta}/catalog/${type}/top.json`;
      }

      const [tmdbData, cinemetaData] = await Promise.all([
        safeFetchJson(tmdbUrl),
        safeFetchJson(cinemetaUrl)
      ]);

      // بناء خريطة للقصص العربية الجاهزة من TMDB لتطعيم عناصر Cinemeta بها فوراً
      const arabicPlotsById = new Map();
      if (tmdbData && Array.isArray(tmdbData.metas)) {
        for (const tm of tmdbData.metas) {
          const plot = tm?.description || tm?.overview || "";
          if (tm?.id && isTextArabic(plot)) {
            arabicPlotsById.set(tm.id, plot);
          }
        }
      }

      const sourceList = (tmdbData && Array.isArray(tmdbData.metas) && tmdbData.metas.length > 0)
        ? tmdbData.metas
        : (cinemetaData && Array.isArray(cinemetaData.metas) ? cinemetaData.metas : []);

      // خريطة الأوصاف الإنجليزية من Cinemeta في حال كان عنصر TMDB بلا وصف
      const englishPlotsById = new Map();
      if (cinemetaData && Array.isArray(cinemetaData.metas)) {
        for (const cm of cinemetaData.metas) {
          const plot = cm?.description || cm?.overview || "";
          if (cm?.id && plot) {
            englishPlotsById.set(cm.id, plot);
          }
        }
      }

      let cleanMetas = [];
      const seenIds = new Set();

      for (const m of sourceList) {
        if (m && m.id && !seenIds.has(m.id)) {
          seenIds.add(m.id);
          const bestPlot = arabicPlotsById.get(m.id) || m.description || m.overview || englishPlotsById.get(m.id) || "";
          cleanMetas.push({
            ...m,
            name: stripAllEmojis(m.name || ""),
            description: bestPlot,
            overview: bestPlot,
            synopsis: bestPlot,
            genres: localizeGenres(m.genres)
          });
        }
      }

      // معالجة خاصة لقسم "أفضل 10 في منطقتك": ترتيب ديناميكي متغير وترقيم من 1 إلى 10
      if (catalogId === "top10_region_movies" || catalogId === "top10_region_series") {
        const regionHash = countryCode.charCodeAt(0) + (countryCode.charCodeAt(1) || 0) + daySeed;
        const pool = cleanMetas.slice(0, 25);
        pool.sort((a, b) => {
          const scoreA = ((a.id.charCodeAt(a.id.length - 1) || 1) * regionHash) % 97;
          const scoreB = ((b.id.charCodeAt(b.id.length - 1) || 1) * regionHash) % 97;
          return scoreB - scoreA;
        });

        cleanMetas = pool.slice(0, 10).map((item, idx) => ({
          ...item,
          name: `TOP ${idx + 1} - ${item.name}`
        }));
      }

      // تعريب جميع القصص دفعة واحدة عبر Batch Translator الموحد لمنع بقاء أي قصة بالإنجليزية
      const batchToLocalize = cleanMetas.slice(0, 45);
      const remainingItems = cleanMetas.slice(45);
      const localizedBatch = await localizeCatalogList(batchToLocalize, type);
      const finalMetas = [...localizedBatch, ...remainingItems];

      const payload = { metas: finalMetas };
      if (finalMetas.length > 0) saveToCache(cacheKey, payload);
      return res.status(200).json(payload);
    }

    // -----------------------------------------------------------------
    // د. مسار تفاصيل العرض (Meta) - معرب بالكامل (الاسم + القصة + التصنيفات)
    // -----------------------------------------------------------------
    if (path.includes("/meta/")) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      const parts = path.substring(path.indexOf("/meta/")).split("/").filter(Boolean);
      const type = parts[1] || "movie";
      const id = (parts[2] || "").replace(".json", "");

      const cacheKey = `meta_ar_${type}_${id}`;
      const cachedMeta = getFromCache(cacheKey);
      if (cachedMeta) return res.status(200).json(cachedMeta);

      let metaRes = null;
      if (id.startsWith("kitsu:")) {
        metaRes = await safeFetchJson(`${UPSTREAM_ADDONS.animeKitsu}/meta/${type}/${id}.json`);
      } else {
        // جلب البيانات العربية من TMDB-AR بالتوازي مع Cinemeta لضمان وجود القصة العربية والحلقات الكاملة
        const [arMetaRes, cinemetaRes] = await Promise.all([
          safeFetchJson(`${UPSTREAM_ADDONS.tmdbAddon}/meta/${type}/${id}.json`),
          safeFetchJson(`${UPSTREAM_ADDONS.cinemeta}/meta/${type}/${id}.json`)
        ]);

        if (cinemetaRes && cinemetaRes.meta) {
          metaRes = cinemetaRes;
          if (arMetaRes && arMetaRes.meta) {
            if (arMetaRes.meta.name && /[\u0600-\u06FF]/.test(arMetaRes.meta.name)) {
              metaRes.meta.name = arMetaRes.meta.name;
            }
            if (arMetaRes.meta.description && /[\u0600-\u06FF]/.test(arMetaRes.meta.description)) {
              metaRes.meta.description = arMetaRes.meta.description;
            }
          }
        } else {
          metaRes = arMetaRes;
        }
      }

      if (metaRes && metaRes.meta) {
        metaRes.meta = await localizeMetaItem(metaRes.meta);
        const resultObj = { meta: metaRes.meta };
        saveToCache(cacheKey, resultObj);
        return res.status(200).json(resultObj);
      }

      return res.status(200).json({ meta: null });
    }

    // -----------------------------------------------------------------
    // هـ. مسار الترجمات العربية (معزول ومفلتر)
    // -----------------------------------------------------------------
    // و. مسار البث الموحد (مع دعم الفلترة حسب خانة الدقة 4K / 1080p / 720p)
    // -----------------------------------------------------------------
    if (path.includes("/stream/")) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      const streamSubPath = path.substring(path.indexOf("/stream/"));
      const cacheKey = `str_${resolutionFilter || "ALL"}_${streamSubPath}`;
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
            ) {
              continue;
            }
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

      // إذا كان الطلب قادماً من خانة دقة مخصصة (مثل 4K أو 1080p أو 720p) نرجع سيرفرات تلك الدقة فقط
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
      name: "Movies & Series // المركز السيادي V12.0"
    });

  } catch {
    return res.status(200).json({ streams: [], metas: [], subtitles: [] });
  }
}
