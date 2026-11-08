/* Content pages: styled audio players (progressive enhancement over <audio controls>) + theme toggle */
"use strict";
(() => {
  const AR = "٠١٢٣٤٥٦٧٨٩", ard = s => String(s).replace(/\d/g, d => AR[d]);
  const fmt = s => { if (!isFinite(s) || s < 0) s = 0; s = Math.floor(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
    return ard((h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0")); };
  const IC = {
    play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5v14l11.5-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>',
    load: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><circle cx="12" cy="12" r="8" stroke-dasharray="30 60"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/></circle></svg>'
  };
  const isLive = src => !/\.mp3(\?|$)/i.test(src);
  const titleFor = a => {
    const card = a.closest(".card"); if (card) { const b = card.querySelector("b, a"); if (b) return b.textContent.trim(); }
    const box = a.closest(".box"); const h = box && box.querySelector("h2, h3"); if (h) return h.textContent.trim();
    const h1 = document.querySelector("h1"); return h1 ? h1.textContent.trim() : document.title;
  };
  let current = null;

  document.querySelectorAll(".seo-content audio").forEach(a => {
    let src = a.getAttribute("src") || (a.querySelector("source") || {}).src || "";
    const live = isLive(src); let title = titleFor(a);
    a.removeAttribute("controls"); a.preload = "none";
    const wrap = document.createElement("div"); wrap.className = "sp";
    wrap.innerHTML = `<button class="sp-btn" type="button" aria-label="تشغيل ${title}">${IC.play}</button>
      <div class="sp-body">${live ? '<div class="sp-row"><span class="sp-live">بث مباشر</span><span class="sp-state">اضغط للاستماع</span></div>'
        : '<div class="sp-row"><span class="t-cur">٠:٠٠</span><input type="range" min="0" max="1000" value="0" aria-label="موضع التلاوة"><span class="t-dur">--:--</span></div><span class="sp-state">اضغط للاستماع</span>'}</div>`;
    a.replaceWith(wrap); wrap.appendChild(a);
    const btn = wrap.querySelector(".sp-btn"), state = wrap.querySelector(".sp-state"), bar = wrap.querySelector("input"),
      cur = wrap.querySelector(".t-cur"), dur = wrap.querySelector(".t-dur"), card = wrap.closest(".card");
    const set = st => {
      btn.innerHTML = st === "playing" ? IC.pause : st === "loading" ? IC.load : IC.play;
      btn.setAttribute("aria-label", (st === "playing" ? "إيقاف " : "تشغيل ") + title);
      wrap.classList.toggle("playing", st === "playing"); if (card) card.classList.toggle("on", st !== "idle");
      if (state) state.textContent = { idle: "اضغط للاستماع", loading: "جارٍ التحميل…", playing: live ? "على الهواء الآن" : "يتم التشغيل", error: "تعذّر التشغيل، حاول مرة أخرى" }[st];
    };
    let retried = false;
    const retry = () => {
      if (retried) { set("error"); return; }
      retried = true; set("loading");
      setTimeout(() => { a.src = live ? src + (src.includes("?") ? "&" : "?") + "t=" + Date.now() : src; a.load(); a.play().catch(() => set("error")); }, 600);
    };
    btn.addEventListener("click", () => {
      if (!a.paused) { a.pause(); return; }
      if (current && current !== a) current.pause();
      current = a;
      retried = false;
      if (live) a.src = src + (src.includes("?") ? "&" : "?") + "t=" + Date.now();
      else if (a.error || a.networkState === 3 || !a.currentTime) { a.src = src; a.load(); }
      set("loading"); a.play().catch(() => retry());
      if (window.sakinaTrack) window.sakinaTrack("play", { content_type: live ? "station_page" : "surah_page", item_name: title, page: location.pathname });
      if ("mediaSession" in navigator) try { navigator.mediaSession.metadata = new MediaMetadata({ title, artist: "سكينة قرآن", artwork: [{ src: "/icon-512.png", sizes: "512x512", type: "image/png" }] }); } catch (e) {}
    });

    /* On an individual reciter/surah page, use the provider's actual surah list.
       Keep the original page and reciter while advancing audio in place. */
    const match = src.match(/^(https:\/\/cdn\.mp3quran\.net\/audio\/[^/]+\/r\d+\/)(\d{3})\.mp3$/i);
    const detailPage = /^\/reciters\/[^/]+\/[^/]+\/$/.test(location.pathname);
    if (match && detailPage) {
      const base = match[1]; let number = +match[2], list = [], names = {}, reciterName = "", loadingList = null;
      const seq = document.createElement("div");
      seq.className = "chips sp-sequence";
      seq.setAttribute("role", "group"); seq.setAttribute("aria-label", "الانتقال بين السور");
      const prev = document.createElement("button"), next = document.createElement("button"), label = document.createElement("span");
      prev.type = next.type = "button"; prev.className = next.className = "chip";
      prev.textContent = "السورة السابقة"; next.textContent = "السورة التالية";
      prev.disabled = next.disabled = true; label.className = "dim"; label.setAttribute("aria-live", "polite"); label.textContent = "جارٍ تجهيز قائمة السور…";
      seq.append(prev, next, label); wrap.after(seq);
      function update() {
        const i = list.indexOf(number);
        prev.disabled = i <= 0; next.disabled = i < 0 || i >= list.length - 1;
        label.textContent = "سورة " + (names[number] || ard(number)) + (reciterName ? " · " + reciterName : "");
      }
      function prepare() {
        if (loadingList) return loadingList;
        loadingList = Promise.all([
          fetch("https://mp3quran.net/api/v3/reciters?language=ar").then(r => { if (!r.ok) throw Error("reciters"); return r.json(); }),
          fetch("https://mp3quran.net/api/v3/suwar?language=ar").then(r => { if (!r.ok) throw Error("suwar"); return r.json(); })
        ]).then(([data, surahs]) => {
          let owner, moshaf;
          for (const r of data.reciters || []) { const m = (r.moshaf || []).find(x => x.server === base); if (m) { owner = r; moshaf = m; break; } }
          if (!moshaf) throw Error("moshaf");
          list = String(moshaf.surah_list).split(",").map(Number).filter(n => n >= 1 && n <= 114);
          if (!list.includes(number)) throw Error("surah");
          (surahs.suwar || []).forEach(x => { names[x.id] = x.name; });
          reciterName = owner.name.trim(); update(); return true;
        }).catch(() => { label.textContent = "تعذّر تحميل قائمة السور. اضغط المحاولة مرة أخرى."; next.textContent = "إعادة المحاولة"; next.disabled = false; loadingList = null; return false; });
        return loadingList;
      }
      async function advance(delta) {
        if (!list.length && !(await prepare())) return;
        const i = list.indexOf(number), n = list[i + delta];
        if (!n) return;
        number = n; src = base + String(n).padStart(3, "0") + ".mp3";
        title = "سورة " + (names[n] || ard(n)) + (reciterName ? " · " + reciterName : "");
        next.textContent = "السورة التالية"; retried = false;
        if (current && current !== a) current.pause(); current = a;
        a.pause(); a.src = src; a.load(); update(); set("loading");
        if ("mediaSession" in navigator) try { navigator.mediaSession.metadata = new MediaMetadata({ title, artist: reciterName, artwork: [{ src: "/icon-512.png", sizes: "512x512", type: "image/png" }] }); } catch (e) {}
        a.play().catch(() => retry());
      }
      prev.addEventListener("click", () => advance(-1));
      next.addEventListener("click", () => { if (!list.length) { next.disabled = true; next.textContent = "السورة التالية"; label.textContent = "جارٍ تجهيز قائمة السور…"; prepare(); } else advance(1); });
      a.addEventListener("ended", () => advance(1));
      prepare();
    }
    a.addEventListener("playing", () => set("playing"));
    a.addEventListener("waiting", () => set("loading"));
    a.addEventListener("pause", () => set("idle"));
    a.addEventListener("error", () => { if (a.getAttribute("src")) retry(); });
    if (bar) {
      let drag = false;
      a.addEventListener("loadedmetadata", () => { dur.textContent = fmt(a.duration); });
      a.addEventListener("timeupdate", () => { if (drag) return; const d = a.duration || 0; bar.value = d ? a.currentTime / d * 1000 : 0; cur.textContent = fmt(a.currentTime); });
      bar.addEventListener("input", () => { drag = true; cur.textContent = fmt(bar.value / 1000 * (a.duration || 0)); });
      bar.addEventListener("change", () => { const d = a.duration || 0; if (d) a.currentTime = bar.value / 1000 * d; drag = false; });
    }
  });

  if (location.pathname.startsWith("/prayer-times/") && document.getElementById("status") && document.getElementById("times")) {
    const s = document.createElement("script");
    s.src = "/prayer-page.js?v=1";
    s.defer = true;
    document.head.appendChild(s);
  }

  const tb = document.getElementById("themeBtn");
  if (tb) tb.onclick = () => { const r = document.documentElement;
    const dark = r.dataset.theme ? r.dataset.theme === "dark" : !matchMedia("(prefers-color-scheme: light)").matches;
    r.dataset.theme = dark ? "light" : "dark"; try { localStorage.setItem("sakina:theme", JSON.stringify(r.dataset.theme)); } catch (e) {} };
})();