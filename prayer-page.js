"use strict";
(() => {
  const status = document.getElementById("status");
  const times = document.getElementById("times");
  if (!status || !times) return;

  const cfgs = {
    cairo:   { name: "القاهرة", city: "Cairo", country: "Egypt", method: 5,  tz: "Africa/Cairo" },
    dubai:   { name: "دبي", city: "Dubai", country: "United Arab Emirates", method: 16, tz: "Asia/Dubai" },
    sharjah: { name: "الشارقة", city: "Sharjah", country: "United Arab Emirates", method: 16, tz: "Asia/Dubai" },
    riyadh:  { name: "الرياض", city: "Riyadh", country: "Saudi Arabia", method: 4, tz: "Asia/Riyadh" },
    makkah:  { name: "مكة المكرمة", city: "Makkah", country: "Saudi Arabia", method: 4, tz: "Asia/Riyadh" },
    madinah: { name: "المدينة المنورة", city: "Medina", country: "Saudi Arabia", method: 4, tz: "Asia/Riyadh" }
  };

  const parts = location.pathname.split("/").filter(Boolean);
  const key = parts[1] || "";
  const cfg = cfgs[key];
  if (!cfg) return;

  const AR = "٠١٢٣٤٥٦٧٨٩";
  const ard = s => String(s).replace(/\d/g, d => AR[d]);
  const prayers = [
    ["Fajr", "الفجر"], ["Dhuhr", "الظهر"], ["Asr", "العصر"],
    ["Maghrib", "المغرب"], ["Isha", "العشاء"]
  ];
  const methodName = { 16: "دبي", 5: "الهيئة المصرية العامة للمساحة", 4: "أم القرى" };

  const cityDate = () => {
    const p = new Intl.DateTimeFormat("en-GB", { timeZone: cfg.tz, day: "2-digit", month: "2-digit", year: "numeric" })
      .formatToParts(new Date()).reduce((o, x) => (o[x.type] = x.value, o), {});
    return `${p.day}-${p.month}-${p.year}`;
  };
  const to12 = value => {
    const clean = String(value || "").replace(/\s*\(.+\)\s*$/, "").trim();
    const [hh, mm] = clean.split(":").map(Number);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return clean;
    const period = hh >= 12 ? "م" : "ص";
    const h = ((hh + 11) % 12) + 1;
    return `${ard(h)}:${ard(String(mm).padStart(2, "0"))} ${period}`;
  };

  async function load() {
    status.textContent = "جارٍ تحميل المواقيت…";
    times.innerHTML = "";
    try {
      const url = `https://api.aladhan.com/v1/timingsByCity/${cityDate()}?city=${encodeURIComponent(cfg.city)}&country=${encodeURIComponent(cfg.country)}&method=${cfg.method}`;
      const r = await fetch(url, { headers: { Accept: "application/json" } });
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      if (!j || !j.data || !j.data.timings) throw new Error("invalid-response");
      const d = j.data;
      const h = d.date && d.date.hijri;
      const g = d.date && d.date.gregorian;
      const dateBits = [];
      if (g) dateBits.push(`${ard(g.day)} ${g.month && g.month.en ? g.month.en : ""} ${ard(g.year)}`);
      if (h) dateBits.push(`${ard(h.day)} ${h.month && h.month.ar ? h.month.ar : ""} ${ard(h.year)} هـ`);
      status.textContent = dateBits.join(" · ") || `مواقيت اليوم في ${cfg.name}`;
      times.innerHTML = prayers.map(([k, n]) => `<div class="time" data-p="${k}"><b>${n}</b><span>${to12(d.timings[k])}</span></div>`).join("");
      const note = document.querySelector(".seo-content .box .muted:last-child");
      if (note && /تُحسب|تحسب|طريقة/.test(note.textContent)) note.textContent = `طريقة الحساب: ${methodName[cfg.method]}. قد تختلف المواعيد دقيقة أو دقيقتين عن التقويم الرسمي أو أذان المسجد القريب.`;
    } catch (e) {
      status.textContent = "تعذّر تحميل المواقيت الآن.";
      times.innerHTML = '<div class="empty">تحقق من الاتصال ثم <button class="link-btn" id="prayerRetry" type="button">أعد المحاولة</button></div>';
      const b = document.getElementById("prayerRetry");
      if (b) b.onclick = load;
    }
  }

  load();
})();