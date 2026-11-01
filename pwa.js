"use strict";
(() => {
  if (window.__sakinaPwaReady) return;
  window.__sakinaPwaReady = true;

  const track = (name, params) => {
    try { if (window.sakinaTrack) window.sakinaTrack(name, params || {}); } catch (e) {}
  };
  const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isMobile = isIOS || isAndroid || /Mobile/i.test(ua);
  let deferredPrompt = null;
  let installSheet = null;
  let notifySheet = null;
  let registrationPromise = null;

  function addStyles() {
    if (document.getElementById("sakinaPwaStyles")) return;
    const style = document.createElement("style");
    style.id = "sakinaPwaStyles";
    style.textContent = `
      .sakina-pwa-sheet{position:fixed;z-index:100000;inset:auto 14px calc(14px + env(safe-area-inset-bottom)) 14px;max-width:520px;margin:auto;background:#0c211c;color:#fff;border:1px solid rgba(224,184,92,.34);border-radius:22px;box-shadow:0 20px 60px rgba(0,0,0,.34);padding:18px;font-family:"Readex Pro",system-ui,sans-serif;direction:rtl}
      .sakina-pwa-sheet[hidden]{display:none!important}.sakina-pwa-head{display:flex;align-items:flex-start;gap:12px}.sakina-pwa-icon{width:52px;height:52px;border-radius:15px;background:#fff;padding:5px;flex:0 0 auto}.sakina-pwa-copy{flex:1;min-width:0}.sakina-pwa-copy h2{font-size:18px;line-height:1.4;margin:0 0 5px;color:#fff}.sakina-pwa-copy p{font-size:13px;line-height:1.75;margin:0;color:#d7e2de}.sakina-pwa-close{border:0;background:transparent;color:#c8d4d0;font-size:24px;line-height:1;cursor:pointer;padding:0 2px}.sakina-pwa-actions{display:flex;gap:9px;margin-top:15px;flex-wrap:wrap}.sakina-pwa-btn{appearance:none;border:0;border-radius:12px;padding:11px 15px;font:inherit;font-size:14px;cursor:pointer}.sakina-pwa-btn.primary{background:#e2b85c;color:#12251f;font-weight:700}.sakina-pwa-btn.secondary{background:rgba(255,255,255,.09);color:#fff;border:1px solid rgba(255,255,255,.12)}.sakina-pwa-steps{margin:11px 0 0;padding:0 20px 0 0;color:#e7efec;font-size:13px;line-height:1.8}.sakina-pwa-note{margin-top:10px!important;font-size:12px!important;color:#aec0ba!important}.sakina-pwa-toast{position:fixed;z-index:100001;left:50%;bottom:calc(18px + env(safe-area-inset-bottom));transform:translate(-50%,20px);background:#10251f;color:#fff;border:1px solid rgba(224,184,92,.35);border-radius:999px;padding:10px 16px;opacity:0;pointer-events:none;transition:.22s ease;font:13px "Readex Pro",system-ui,sans-serif;white-space:nowrap;max-width:92vw;overflow:hidden;text-overflow:ellipsis}.sakina-pwa-toast.show{opacity:1;transform:translate(-50%,0)}
      @media (prefers-color-scheme:light){html[data-theme="light"] .sakina-pwa-sheet{background:#fffaf0;color:#17332a;border-color:#d9c18a}.sakina-pwa-sheet .sakina-pwa-copy h2{color:inherit}html[data-theme="light"] .sakina-pwa-copy p,html[data-theme="light"] .sakina-pwa-steps{color:#465d55}html[data-theme="light"] .sakina-pwa-close{color:#687c75}html[data-theme="light"] .sakina-pwa-btn.secondary{background:#f2ede2;color:#17332a;border-color:#e4dccb}}
    `;
    document.head.appendChild(style);
  }

  function toast(message) {
    addStyles();
    let t = document.getElementById("sakinaPwaToast");
    if (!t) {
      t = document.createElement("div");
      t.id = "sakinaPwaToast";
      t.className = "sakina-pwa-toast";
      t.setAttribute("role", "status");
      t.setAttribute("aria-live", "polite");
      document.body.appendChild(t);
    }
    t.textContent = message;
    t.classList.add("show");
    clearTimeout(t._hideTimer);
    t._hideTimer = setTimeout(() => t.classList.remove("show"), 2800);
  }

  function closeSheet(node) {
    if (!node) return;
    node.remove();
    if (node === installSheet) installSheet = null;
    if (node === notifySheet) notifySheet = null;
  }

  function createSheet(kind, title, body, actions, steps) {
    addStyles();
    const old = kind === "install" ? installSheet : notifySheet;
    if (old) closeSheet(old);
    const el = document.createElement("section");
    el.className = "sakina-pwa-sheet";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", title);
    el.innerHTML = `
      <div class="sakina-pwa-head">
        <img class="sakina-pwa-icon" src="/icon-192.png" width="52" height="52" alt="">
        <div class="sakina-pwa-copy"><h2>${title}</h2><p>${body}</p>${steps ? `<ol class="sakina-pwa-steps">${steps.map(s => `<li>${s}</li>`).join("")}</ol>` : ""}</div>
        <button class="sakina-pwa-close" type="button" aria-label="إغلاق">×</button>
      </div>
      <div class="sakina-pwa-actions"></div>`;
    el.querySelector(".sakina-pwa-close").addEventListener("click", () => closeSheet(el));
    const box = el.querySelector(".sakina-pwa-actions");
    actions.forEach(a => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "sakina-pwa-btn " + (a.primary ? "primary" : "secondary");
      b.textContent = a.label;
      b.addEventListener("click", a.onClick);
      box.appendChild(b);
    });
    document.body.appendChild(el);
    if (kind === "install") installSheet = el; else notifySheet = el;
    return el;
  }

  function hideLegacyInstallButton() {
    const btn = document.getElementById("installBtn");
    if (btn) btn.hidden = true;
  }

  function showInstallSheet(force) {
    if (isStandalone() || !isMobile) return;
    try {
      if (!force && sessionStorage.getItem("sakina:pwa-install-shown") === "1") return;
      sessionStorage.setItem("sakina:pwa-install-shown", "1");
    } catch (e) {}

    hideLegacyInstallButton();
    if (isIOS) {
      createSheet(
        "install",
        "ثبّت سكينة قرآن على الآيفون",
        "افتح سكينة كأنه تطبيق مستقل من الشاشة الرئيسية، واحتفظ بالوصول السريع للمصحف والإذاعات والأذكار.",
        [{ label: "فهمت", primary: true, onClick: () => closeSheet(installSheet) }],
        ["اضغط زر المشاركة في المتصفح.", "اختر «إضافة إلى الشاشة الرئيسية» ثم «إضافة»." ]
      );
      track("pwa_install_message", { platform: "ios" });
      return;
    }

    createSheet(
      "install",
      "ثبّت سكينة قرآن",
      deferredPrompt
        ? "ثبّت الموقع كتطبيق على جهازك للوصول إليه بسرعة وفتحه بواجهة مستقلة."
        : "يمكنك إضافة سكينة إلى الشاشة الرئيسية وفتحه كتطبيق مستقل.",
      [
        { label: deferredPrompt ? "تثبيت الآن" : "طريقة التثبيت", primary: true, onClick: installNow },
        { label: "لاحقًا", primary: false, onClick: () => closeSheet(installSheet) }
      ],
      deferredPrompt ? null : ["افتح قائمة المتصفح.", "اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية»." ]
    );
    track("pwa_install_message", { platform: isAndroid ? "android" : "mobile" });
  }

  async function installNow() {
    if (!deferredPrompt) {
      if (isIOS) return;
      const p = installSheet && installSheet.querySelector(".sakina-pwa-copy p");
      if (p) p.textContent = "افتح قائمة المتصفح واختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».";
      return;
    }
    const ev = deferredPrompt;
    deferredPrompt = null;
    try {
      await ev.prompt();
      const choice = ev.userChoice ? await ev.userChoice : null;
      const outcome = choice && choice.outcome ? choice.outcome : "unknown";
      track("pwa_install", { outcome });
      hideLegacyInstallButton();
      closeSheet(installSheet);
      if (outcome === "accepted") setTimeout(showNotificationOffer, 1400);
    } catch (e) {
      closeSheet(installSheet);
    }
  }

  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault();
    deferredPrompt = e;
    const btn = document.getElementById("installBtn");
    if (btn) btn.hidden = false;
    if (isMobile && !isStandalone()) setTimeout(() => showInstallSheet(false), 350);
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    hideLegacyInstallButton();
    closeSheet(installSheet);
    track("pwa_installed", { platform: isIOS ? "ios" : isAndroid ? "android" : "other" });
    toast("تم تثبيت سكينة قرآن 🤍");
    setTimeout(showNotificationOffer, 1200);
  });

  document.addEventListener("click", e => {
    const btn = e.target && e.target.closest ? e.target.closest("#installBtn") : null;
    if (!btn) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    showInstallSheet(true);
  }, true);

  async function getRegistration() {
    if (!("serviceWorker" in navigator) || location.protocol !== "https:") return null;
    if (!registrationPromise) {
      registrationPromise = navigator.serviceWorker.register("/sw.js", { scope: "/" })
        .then(() => navigator.serviceWorker.ready)
        .catch(() => null);
    }
    return registrationPromise;
  }

  function base64ToUint8Array(value) {
    const padding = "=".repeat((4 - value.length % 4) % 4);
    const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(base64);
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
  }

  async function subscribeRemotePush(reg) {
    const cfg = window.SAKINA_PUSH_CONFIG || {};
    if (!cfg.vapidPublicKey || !cfg.subscribeEndpoint || !reg || !("pushManager" in reg)) return false;
    try {
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64ToUint8Array(cfg.vapidPublicKey)
        });
      }
      const res = await fetch(cfg.subscribeEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub)
      });
      if (!res.ok) throw new Error(String(res.status));
      track("push_subscribed", { status: "success" });
      return true;
    } catch (e) {
      track("push_subscribed", { status: "failed" });
      return false;
    }
  }

  async function enableNotifications() {
    if (!("Notification" in window)) {
      toast("الإشعارات غير مدعومة في هذا المتصفح");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      track("notification_permission", { permission });
      if (permission !== "granted") {
        closeSheet(notifySheet);
        toast("لم يتم تفعيل الإشعارات");
        return;
      }
      const reg = await getRegistration();
      if (reg) {
        await subscribeRemotePush(reg);
        await reg.showNotification("سكينة قرآن", {
          body: "تم تفعيل الإشعارات على هذا الجهاز بنجاح.",
          icon: "/icon-192.png",
          badge: "/icon-192.png",
          tag: "sakina-notifications-enabled",
          dir: "rtl",
          lang: "ar",
          data: { url: "/" }
        });
      }
      closeSheet(notifySheet);
    } catch (e) {
      closeSheet(notifySheet);
      toast("تعذّر تفعيل الإشعارات الآن");
    }
  }

  function showNotificationOffer(force) {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
    if (Notification.permission !== "default") return;
    if (isIOS && !isStandalone()) return;
    try {
      const last = Number(localStorage.getItem("sakina:notify-offer-at") || 0);
      if (!force && last && Date.now() - last < 7 * 24 * 60 * 60 * 1000) return;
      localStorage.setItem("sakina:notify-offer-at", String(Date.now()));
    } catch (e) {}
    createSheet(
      "notify",
      "فعّل إشعارات سكينة",
      "اسمح لسكينة بإرسال إشعارات على جهازك. لن يظهر طلب النظام إلا بعد اختيارك «تفعيل الإشعارات».",
      [
        { label: "تفعيل الإشعارات", primary: true, onClick: enableNotifications },
        { label: "ليس الآن", primary: false, onClick: () => closeSheet(notifySheet) }
      ]
    );
    track("notification_offer", { platform: isIOS ? "ios" : isAndroid ? "android" : "other" });
  }

  window.SakinaPWA = {
    showInstallPrompt: () => showInstallSheet(true),
    showNotificationPrompt: () => showNotificationOffer(true),
    enableNotifications,
    isInstalled: isStandalone
  };

  getRegistration();
  document.addEventListener("DOMContentLoaded", () => {
    if (!isStandalone() && isMobile) setTimeout(() => showInstallSheet(false), 1500);
    if (isStandalone()) setTimeout(() => showNotificationOffer(false), 1800);
  }, { once: true });
})();
