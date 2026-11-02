"use strict";
(() => {
  if (window.__sakinaUiRefresh) return;
  window.__sakinaUiRefresh = true;

  const $ = s => document.querySelector(s);
  const ua = navigator.userAgent || "";
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const ICONS = {
    stations:'<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" aria-hidden="true"><rect x="4" y="9" width="16" height="10" rx="3"/><path d="M8 9l8-5"/><circle cx="9" cy="14" r="2"/><path d="M14 13h3M14 16h3"/></svg>',
    favorites:'<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" aria-hidden="true"><path d="M20.8 5.8a5.4 5.4 0 0 0-7.6 0L12 7l-1.2-1.2a5.4 5.4 0 1 0-7.6 7.6L12 22l8.8-8.6a5.4 5.4 0 0 0 0-7.6Z"/></svg>',
    reciters:'<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" aria-hidden="true"><path d="M9 18V6l10-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/></svg>',
    surahs:'<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" aria-hidden="true"><path d="M12 6c-2-1.5-5-2-8-1.5V19c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V4.5C17 4 14 4.5 12 6Z"/><path d="M12 6v14.5"/></svg>'
  };

  function modernizeDiscoverIcons() {
    document.querySelectorAll(".discover-card[data-discover]").forEach(card => {
      const host = card.querySelector(":scope > span");
      const svg = ICONS[card.dataset.discover];
      if (host && svg) host.innerHTML = svg;
    });
  }

  function syncFriday() {
    const friday = new Date().getDay() === 5;
    document.body.classList.toggle("sakina-friday", friday);
    const card = $(".friday-card");
    if (!card || !friday) return;
    const label = $("#fridayLabel"), title = $("#fridayTitle"), hint = $("#fridayHint");
    if (label) label.textContent = "رسالة الجمعة";
    if (title) title.textContent = "جمعة مباركة 🤍";
    if (hint) hint.textContent = "لا تنسَ قراءة سورة الكهف والصلاة على النبي ﷺ";
  }

  function installCard() {
    if (!isMobile || isStandalone() || $("#sakinaHomeInstall")) return;
    const home = $("#v-radio");
    const hero = $("#hero");
    if (!home || !hero) return;
    const card = document.createElement("section");
    card.id = "sakinaHomeInstall";
    card.className = "sakina-home-install";
    card.setAttribute("aria-label", "إضافة سكينة إلى الشاشة الرئيسية");
    card.innerHTML = '<span class="sakina-home-install-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 4v10"/><path d="m8 10 4 4 4-4"/><rect x="4" y="17" width="16" height="3" rx="1.5"/></svg></span><span class="sakina-home-install-copy"><b>خلّي سكينة على شاشتك الرئيسية</b><small>افتح القرآن والإذاعات والأذكار بسرعة كأنه تطبيق على الموبايل.</small></span><button type="button">إضافة الآن</button>';
    card.querySelector("button").addEventListener("click", () => {
      if (window.sakinaTrack) window.sakinaTrack("home_install_cta", { page_path: location.pathname });
      if (window.SakinaPWA && window.SakinaPWA.showInstallPrompt) window.SakinaPWA.showInstallPrompt();
      else {
        const btn = $("#installBtn");
        if (btn) btn.click();
        else setTimeout(() => window.SakinaPWA && window.SakinaPWA.showInstallPrompt && window.SakinaPWA.showInstallPrompt(), 500);
      }
    });
    hero.insertAdjacentElement("afterend", card);
    addEventListener("appinstalled", () => card.remove(), { once:true });
  }

  let sleepDeadline = 0;
  let sleepMode = "off";
  let ticker = 0;

  function formatLeft(ms) {
    const sec = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return h ? `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` : `${m}:${String(s).padStart(2,"0")}`;
  }

  function ensureSleepCountdown() {
    const row = $(".sheet-row");
    if (!row) return null;
    let box = $("#sakinaSleepCountdown");
    if (!box) {
      box = document.createElement("div");
      box.id = "sakinaSleepCountdown";
      box.className = "sakina-sleep-countdown";
      box.hidden = true;
      box.innerHTML = '<span class="sakina-sleep-countdown-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z"/><path d="M12 8v4l2.5 1.5"/></svg><span>مؤقت النوم</span></span><time aria-live="polite">—</time>';
      row.insertAdjacentElement("beforebegin", box);
    }
    return box;
  }

  function renderSleepCountdown() {
    const box = ensureSleepCountdown();
    const mini = $("#sleepTxt");
    if (!box) return;
    const time = box.querySelector("time");
    if (sleepMode === "end") {
      box.hidden = false;
      time.textContent = "نهاية السورة";
      if (mini) mini.textContent = "نهاية السورة";
      return;
    }
    if (!sleepDeadline) {
      box.hidden = true;
      if (mini && sleepMode === "off") mini.textContent = "";
      return;
    }
    const left = sleepDeadline - Date.now();
    if (left <= 0) {
      sleepDeadline = 0; sleepMode = "off"; box.hidden = true;
      if (mini) mini.textContent = "";
      return;
    }
    const txt = formatLeft(left);
    box.hidden = false;
    time.textContent = txt;
    if (mini) mini.textContent = txt;
  }

  function syncSleepFromSelect() {
    const sel = $("#sleepSel");
    if (!sel) return;
    const value = Number(sel.value || 0);
    if (value === -1) { sleepMode = "end"; sleepDeadline = 0; }
    else if (value > 0) { sleepMode = "timer"; sleepDeadline = Date.now() + value * 60000; }
    else { sleepMode = "off"; sleepDeadline = 0; }
    renderSleepCountdown();
  }

  function setupSleepCountdown() {
    const sel = $("#sleepSel"), btn = $("#sleepBtn");
    if (!sel || !btn) return;
    ensureSleepCountdown();
    sel.addEventListener("change", () => setTimeout(syncSleepFromSelect, 0));
    btn.addEventListener("click", () => setTimeout(syncSleepFromSelect, 0));
    clearInterval(ticker); ticker = setInterval(renderSleepCountdown, 1000);
  }

  function makePlayerFriendlier() {
    const sheet = $("#sheet");
    if (!sheet) return;
    sheet.setAttribute("aria-label", "مشغل سكينة");
    const cap = $("#capsule"); if (cap) cap.setAttribute("aria-label", "المشغل المصغر");
  }

  /* Dynamic Media Session artwork for Android/iOS lock screens. The browser still owns
     the lock-screen layout; Sakina supplies the cover, title, reciter and playback state. */
  let lockArtKey = "";
  let lockArtTimer = 0;

  function lockContentType(title, eyebrow) {
    const t = (title || "").trim(), e = (eyebrow || "").trim();
    if (/^إذاعة\s|إذاعات|بث مباشر/.test(t + " " + e)) return { label:"مباشر", live:true };
    if (/الرقية/.test(t + " " + e)) return { label:"الرقية الشرعية", live:false };
    if (/قبل النوم|النوم/.test(e)) return { label:"قبل النوم", live:false };
    if (/صدقة جارية/.test(e)) return { label:"صدقة جارية", live:false };
    return { label:"تلاوة قرآنية", live:false };
  }

  function roundedRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function fitFont(ctx, text, maxWidth, start, min) {
    let size = start;
    while (size > min) {
      ctx.font = `700 ${size}px "Readex Pro", Arial, sans-serif`;
      if (ctx.measureText(text).width <= maxWidth) break;
      size -= 2;
    }
    return size;
  }

  function wrapLines(ctx, text, maxWidth, maxLines) {
    const words = String(text || "").trim().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const lines = [];
    let line = "";
    for (let i = 0; i < words.length; i++) {
      const test = line ? line + " " + words[i] : words[i];
      if (!line || ctx.measureText(test).width <= maxWidth) line = test;
      else { lines.push(line); line = words[i]; }
      if (lines.length === maxLines - 1) {
        const rest = [line].concat(words.slice(i + 1)).join(" ");
        let clipped = rest;
        while (clipped.length > 3 && ctx.measureText(clipped + "…").width > maxWidth) clipped = clipped.slice(0, -1);
        lines.push(clipped === rest ? rest : clipped.trim() + "…");
        return lines;
      }
    }
    if (line) lines.push(line);
    return lines.slice(0, maxLines);
  }

  function createLockArtwork(title, artist, eyebrow) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "/icon-512.png";
    ctx.direction = "rtl";

    const bg = ctx.createLinearGradient(0, 0, 512, 512);
    bg.addColorStop(0, "#15362e");
    bg.addColorStop(.55, "#0b211c");
    bg.addColorStop(1, "#06120f");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, 512, 512);

    const glow = ctx.createRadialGradient(370, 80, 20, 370, 80, 330);
    glow.addColorStop(0, "rgba(224,180,94,.22)");
    glow.addColorStop(1, "rgba(224,180,94,0)");
    ctx.fillStyle = glow; ctx.fillRect(0, 0, 512, 512);

    ctx.save();
    ctx.globalAlpha = .08;
    ctx.strokeStyle = "#e0b45e";
    ctx.lineWidth = 1;
    for (let x = -70; x < 590; x += 74) {
      for (let y = -70; y < 590; y += 74) {
        ctx.beginPath(); ctx.arc(x, y, 27, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - 20, y); ctx.lineTo(x, y - 20); ctx.lineTo(x + 20, y); ctx.lineTo(x, y + 20); ctx.closePath(); ctx.stroke();
      }
    }
    ctx.restore();

    roundedRect(ctx, 26, 26, 460, 460, 36);
    ctx.strokeStyle = "rgba(224,180,94,.28)"; ctx.lineWidth = 2; ctx.stroke();

    ctx.textAlign = "center";
    ctx.fillStyle = "#f2d487";
    ctx.font = '700 30px "Aref Ruqaa", "Readex Pro", Arial, sans-serif';
    ctx.fillText("سكينة قرآن", 256, 72);

    const type = lockContentType(title, eyebrow);
    ctx.font = '600 17px "Readex Pro", Arial, sans-serif';
    const badgeW = Math.max(96, ctx.measureText(type.label).width + 44);
    roundedRect(ctx, (512 - badgeW) / 2, 98, badgeW, 38, 19);
    ctx.fillStyle = type.live ? "rgba(255,107,87,.16)" : "rgba(224,180,94,.12)"; ctx.fill();
    ctx.strokeStyle = type.live ? "rgba(255,107,87,.55)" : "rgba(224,180,94,.34)"; ctx.lineWidth = 1; ctx.stroke();
    if (type.live) { ctx.fillStyle = "#ff7967"; ctx.beginPath(); ctx.arc(256 + badgeW / 2 - 24, 117, 4.5, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = type.live ? "#ff9b8f" : "#e8c77f";
    ctx.fillText(type.label, 256 - (type.live ? 5 : 0), 123);

    const titleText = String(title || "سكينة قرآن").replace(/^إذاعة\s+/, "إذاعة ").trim();
    let titleSize = fitFont(ctx, titleText, 410, 52, 34);
    ctx.font = `700 ${titleSize}px "Readex Pro", Arial, sans-serif`;
    const lines = wrapLines(ctx, titleText, 410, 2);
    ctx.fillStyle = "#fff8e8";
    const baseY = lines.length > 1 ? 222 : 250;
    lines.forEach((line, i) => ctx.fillText(line, 256, baseY + i * (titleSize + 15)));

    const artistText = String(artist || "سكينة قرآن").replace(/^اضغط للمتابعة\s*·\s*/, "").trim();
    ctx.font = '500 25px "Readex Pro", Arial, sans-serif';
    let artist = artistText;
    while (artist.length > 3 && ctx.measureText(artist).width > 390) artist = artist.slice(0, -1);
    if (artist !== artistText) artist = artist.trim() + "…";
    ctx.fillStyle = "#b8c9c0";
    ctx.fillText(artist || "سكينة قرآن", 256, 365);

    ctx.strokeStyle = "rgba(224,180,94,.26)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(116, 404); ctx.lineTo(396, 404); ctx.stroke();

    ctx.fillStyle = "#e0b45e";
    ctx.beginPath(); ctx.arc(256, 431, 5, 0, Math.PI * 2); ctx.fill();
    ctx.font = '500 16px "Readex Pro", Arial, sans-serif';
    ctx.fillStyle = "#8fa69b";
    ctx.fillText("استمع بهدوء", 256, 462);

    try { return canvas.toDataURL("image/png"); }
    catch (_) { return "/icon-512.png"; }
  }

  function syncLockscreenArtwork() {
    if (!("mediaSession" in navigator) || typeof MediaMetadata !== "function") return;
    const titleEl = $("#capTitle"), subEl = $("#capSub");
    if (!titleEl || !subEl) return;
    const title = (titleEl.textContent || "").trim();
    if (!title || title === "لم يبدأ التشغيل") return;
    const artist = (subEl.textContent || "سكينة قرآن").trim();
    const eyebrow = ($("#shEyebrow")?.textContent || "").trim();
    const key = title + "|" + artist + "|" + eyebrow;
    if (key === lockArtKey) return;
    lockArtKey = key;
    const art = createLockArtwork(title, artist, eyebrow);
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title,
        artist: artist.replace(/^اضغط للمتابعة\s*·\s*/, ""),
        album: "سكينة قرآن",
        artwork: [
          { src: art, sizes: "512x512", type: "image/png" },
          { src: new URL("/icon-512.png", location.origin).href, sizes: "512x512", type: "image/png" },
          { src: new URL("/icon-192.png", location.origin).href, sizes: "192x192", type: "image/png" }
        ]
      });
    } catch (_) {}
  }

  function scheduleLockscreenArtwork() {
    clearTimeout(lockArtTimer);
    lockArtTimer = setTimeout(syncLockscreenArtwork, 70);
  }

  function setupLockscreenArtwork() {
    if (!("mediaSession" in navigator) || typeof MediaMetadata !== "function") return;
    const title = $("#capTitle"), sub = $("#capSub"), eyebrow = $("#shEyebrow"), audio = $("#audio");
    if (!title || !sub) return;
    const observer = new MutationObserver(scheduleLockscreenArtwork);
    [title, sub, eyebrow].filter(Boolean).forEach(el => observer.observe(el, { childList:true, subtree:true, characterData:true }));
    if (audio) {
      audio.addEventListener("playing", () => {
        try { navigator.mediaSession.playbackState = "playing"; } catch (_) {}
        scheduleLockscreenArtwork();
      });
      audio.addEventListener("pause", () => { try { navigator.mediaSession.playbackState = "paused"; } catch (_) {} });
      audio.addEventListener("ended", () => { try { navigator.mediaSession.playbackState = "none"; } catch (_) {} });
      audio.addEventListener("loadedmetadata", scheduleLockscreenArtwork);
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleLockscreenArtwork).catch(() => {});
    scheduleLockscreenArtwork();
  }

  function init() {
    modernizeDiscoverIcons();
    syncFriday();
    installCard();
    setupSleepCountdown();
    makePlayerFriendlier();
    setupLockscreenArtwork();
    setInterval(syncFriday, 30000);
    setTimeout(installCard, 900);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once:true });
  else init();
})();