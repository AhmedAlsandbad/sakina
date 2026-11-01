"use strict";
(() => {
  if (window.__sakinaUiRefresh) return;
  window.__sakinaUiRefresh = true;

  const $ = s => document.querySelector(s);
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
    if (isStandalone() || $("#sakinaHomeInstall")) return;
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

  function init() {
    modernizeDiscoverIcons();
    syncFriday();
    installCard();
    setupSleepCountdown();
    makePlayerFriendlier();
    setInterval(syncFriday, 30000);
    setTimeout(installCard, 900);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once:true });
  else init();
})();
