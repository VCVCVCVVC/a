import fetch from "node-fetch";

const UPSTREAM_URL = "https://torrentio.strem.fun/qualityfilter=scr,cam|torbox=3183a8fd-2d85-41fb-a58d-39c5737efae3";

export default async function handler(req, res) {
  // تفعيل CORS بالكامل
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
      id: "org.clean.torrentio.torbox.v2",
      version: "2.0.0",
      name: "Torrentio Clean",
      description: "عرض مرتب ومختصر للجودة والحجم فقط",
      resources: ["stream"],
      types: ["movie", "series"],
      catalogs: []
    });
  }

  // مسار البث واستخراج الروابط
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
        const fullInfo = `${originalName}\n${originalTitle}`;

        // 1. الدقة
        let quality = "HD";
        const resMatch = fullInfo.match(/\b(4320p|8k|2160p|4k|1080p|720p|480p)\b/i);
        if (resMatch) {
          const raw = resMatch[1].toUpperCase();
          quality = (raw === "2160P" || raw === "4K") ? "4K" : (raw === "4320P" || raw === "8K" ? "8K" : raw);
        }

        // 2. تقنيات الألوان
        const visualTags = [];
        if (/\b(DV|Dolby[\s.-]?Vision)\b/i.test(fullInfo)) visualTags.push("DV");
        if (/\bHDR10\+/i.test(fullInfo)) visualTags.push("HDR10+");
        else if (/\bHDR\b/i.test(fullInfo)) visualTags.push("HDR");

        const visualString = visualTags.length > 0 ? ` | ${visualTags.join(" + ")}` : "";

        // 3. الحجم
        const sizeMatch = originalTitle.match(/([0-9]+(?:\.[0-9]+)?\s*(?:GB|MB|GiB|MiB))/i);
        const size = sizeMatch ? sizeMatch[1].toUpperCase() : "";

        // 4. عدد المحملين
        const seedersMatch = originalTitle.match(/(?:👤|👥|\bS:?\s*)(\d+)/i);
        const seeders = seedersMatch ? `👤 ${seedersMatch[1]}` : "";

        const bottomDetails = [size ? `💾 ${size}` : "", seeders].filter(Boolean).join("   •   ");

        return {
          ...stream,
          name: `[TB+] Torrentio\n✨ ${quality}${visualString}`,
          title: `-------------------------------------------\n${bottomDetails || "تشغيل سريع"}`
        };
      });

      return res.status(200).json({ streams: cleanedStreams });
    } catch (err) {
      return res.status(200).json({ streams: [] });
    }
  }

  return res.status(404).json({ error: "Not found" });
}
