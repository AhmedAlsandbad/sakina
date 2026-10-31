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
    const src = a.getAttribute("src") || (a.querySelector("source") || {}).src || "";
    const live = isLive(src), title = titleFor(a);
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
    const retry = () => { // first request sometimes fails on a cold connection: reload once, then report
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
      if ("mediaSession" in navigator) try { navigator.mediaSession.metadata = new MediaMetadata({ title, artist: "سكينة قرآن", artwork: [{ src: "/icon-512.png", sizes: "512x512", type: "image/png" }] }); } catch (e) {}
    });
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

  const tb = document.getElementById("themeBtn");
  if (tb) tb.onclick = () => { const r = document.documentElement;
    const dark = r.dataset.theme ? r.dataset.theme === "dark" : !matchMedia("(prefers-color-scheme: light)").matches;
    r.dataset.theme = dark ? "light" : "dark"; try { localStorage.setItem("sakina:theme", JSON.stringify(r.dataset.theme)); } catch (e) {} };
})();
