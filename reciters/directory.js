"use strict";
(() => {
  const input = document.getElementById("directoryQuery");
  const status = document.getElementById("directoryStatus");
  const cards = [...document.querySelectorAll("#directoryCards .directory-card")];
  const number = new Intl.NumberFormat("ar-EG");
  const normalize = value => value.normalize("NFKD").replace(/\p{M}/gu, "")
    .replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/[\sـ]/g, "").toLowerCase();
  const entries = cards.map(card => ({ card, name: normalize(card.querySelector("b").textContent) }));
  function filter() {
    const query = normalize(input.value);
    let visible = 0;
    for (const { card, name } of entries) {
      card.hidden = !name.includes(query);
      if (!card.hidden) visible++;
    }
    status.hidden = !query;
    status.textContent = visible ? `${number.format(visible)} نتيجة` : "مفيش قارئ بالاسم ده في الدليل. جرّب جزءًا من الاسم أو ابحث في المصحف.";
  }
  input.closest(".directory-search").hidden = false;
  input.addEventListener("input", filter);
  filter();
})();
