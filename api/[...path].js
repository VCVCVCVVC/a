import fetch from "node-fetch";

const UPSTREAM_URL = "https://torrentio.strem.fun/qualityfilter=scr,cam|torbox=3183a8fd-2d85-41fb-a58d-39c5737efae3";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const path = req.url.split("?")[0];

  // مسار الـ manifest
  if (path === "/manifest.json" || path === "/" || path === "") {
    return res.status(200).json({
      id: "org.clean.torrentio.torbox.v3",
      version: "3.0.0",
      name: "Torrentio Pro Clean",
      description: "تصميم فائق الترتيب مع إحصائيات حقيقية مفصلة",
      resources: ["stream"],
      types: ["movie", "series"],
      catalogs: []
    });
  }

  // مسار جلب الروابط وتنسيقها
  if (path.startsWith("/stream/")) {
    const targetUrl = `${UPSTREAM_URL}${path}`;

    try {
      const response = await fetch(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/json"
        }
      });

      if (!response.ok) {
        return res.status(200).json({ streams: [] });
      }

      const data = await response.json();
      if (!data.streams || !Array.isArray(data.streams)) {
        return res.status(200).json({ streams: [] });
      }

      const cleanedStreams = data.streams.map((stream) => {
        const originalName = stream.name || "";
        const originalTitle = stream.title || "";
        const full = `${originalName}\n${originalTitle}`;

        // 1. الدقة الحقيقية
        let res = "HD";
        const resMatch = full.match(/\b(4320p|8k|2160p|4k|1080p|720p|480p)\b/i);
        if (resMatch) {
          const r = resMatch[1].toUpperCase();
          res = (r === "2160P" || r === "4K") ? "4K UHD" : (r === "4320P" || r === "8K" ? "8K ULTRA" : r);
        }

        // 2. نوع النسخة (Remux, BluRay, WEB-DL)
        let ripType = "";
        if (/\bRemux\b/i.test(full)) ripType = "REMUX";
        else if (/\b(BDRip|BRRip|BluRay)\b/i.test(full)) ripType = "BLURAY";
        else if (/\b(WEB-DL|WEBRip|WEB)\b/i.test(full)) ripType = "WEB-DL";
        else if (/\bHDTV\b/i.test(full)) ripType = "HDTV";

        // 3. تقنيات الصورة (Dolby Vision, HDR10+, HDR)
        const visual = [];
        if (/\b(DV|Dolby[\s.-]?Vision)\b/i.test(full)) visual.push("DV");
        if (/\bHDR10\+/i.test(full)) visual.push("HDR10+");
        else if (/\bHDR\b/i.test(full)) visual.push("HDR");

        // 4. ترميز الفيديو (x265, HEVC, H.264, AV1)
        let codec = "";
        if (/\b(HEVC|x265|H\.?265)\b/i.test(full)) codec = "HEVC";
        else if (/\b(AVC|x264|H\.?264)\b/i.test(full)) codec = "x264";
        else if (/\bAV1\b/i.test(full)) codec = "AV1";

        // 5. تقنيات الصوت الحقيقية (Atmos, TrueHD, DTS-HD, 7.1, 5.1)
        const audio = [];
        if (/\bAtmos\b/i.test(full)) audio.push("Atmos");
        if (/\bTrueHD\b/i.test(full)) audio.push("TrueHD");
        else if (/\b(DTS-HD|DTS)\b/i.test(full)) audio.push("DTS");
        else if (/\b(DD\+|E-AC-?3|DDP)\b/i.test(full)) audio.push("DD+");

        const channelMatch = full.match(/\b(7\.1|5\.1)\b/);
        if (channelMatch) audio.push(channelMatch[1]);

        // 6. حجم الملف الفعلي
        const sizeMatch = originalTitle.match(/([0-9]+(?:\.[0-9]+)?\s*(?:GB|MB|GiB|MiB))/i);
        const size = sizeMatch ? sizeMatch[1].toUpperCase() : null;

        // 7. عدد الـ Seeders الحقيقي
        const seedersMatch = originalTitle.match(/(?:👤|👥|\bS:?\s*)(\d+)/i);
        const seeders = seedersMatch ? `${seedersMatch[1]}` : null;

        // 8. مزود التورنت الأصلي (1337x, ThePirateBay, TorrentGalaxy)
        let tracker = "";
        const trackerMatch = originalTitle.match(/⚙️\s*([a-zA-Z0-9]+)|ThePirateBay|TorrentGalaxy|1337x|RARBG/i);
        if (trackerMatch) {
          tracker = trackerMatch[1] || trackerMatch[0];
        }

        // بناء السطر العلوي الفخم (الجودة، نوع النسخة، التقنيات)
        const badgeList = [res, ripType, visual.join(" | "), codec].filter(Boolean).join("  •  ");

        // بناء السطر السفلي (الحجم، الصوت، السيدرز، المصدر)
        const detailsList = [
          size ? `📦 ${size}` : null,
          audio.length > 0 ? `🔊 ${audio.join(" ")}` : null,
          seeders ? `⚡ ${seeders} Seeds` : null,
          tracker ? `🌐 ${tracker}` : null
        ].filter(Boolean).join("   │   ");

        return {
          ...stream,
          name: `[TB+]  ${badgeList}`,
          title: `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${detailsList || "تشغيل فوري عبر TorBox"}`
        };
      });

      return res.status(200).json({ streams: cleanedStreams });
    } catch (err) {
      return res.status(200).json({ streams: [] });
    }
  }

  return res.status(404).json({ error: "Not found" });
}
