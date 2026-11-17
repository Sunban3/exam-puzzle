// モード(タブ)の切り替えと、ジャンルの絞り込み
(() => {
  "use strict";

  const { storage, filter } = window.App;
  const VIEW_KEY = "exam-puzzle:view";
  const modes = { match: window.App.match, choice: window.App.choice };
  let current = "match";

  const tabs = document.getElementById("tabs");

  // タブの横の問題数(絞り込み後の数)
  function updateCounts() {
    document.getElementById("count-match").textContent = `${modes.match.count()}問`;
    document.getElementById("count-choice").textContent = `${modes.choice.count()}問`;
  }

  function show(view) {
    current = view;
    tabs.querySelectorAll("[data-view]").forEach((b) => {
      b.setAttribute("aria-selected", String(b.dataset.view === view));
    });
    Object.keys(modes).forEach((name) => {
      document.getElementById(`view-${name}`).hidden = name !== view;
    });
    storage.set(VIEW_KEY, view);
    modes[view].shown();
  }

  // イベント委任: タブの親に1つだけイベントをつける
  tabs.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-view]");
    if (btn) show(btn.dataset.view);
  });

  // ジャンルが変わったら、両方のモードを選び直す
  filter.onChange(() => {
    Object.values(modes).forEach((m) => m.refresh());
    updateCounts();
    modes[current].shown();
  });

  modes.match.start();
  modes.choice.start();
  updateCounts();

  // 保存された値をそのまま信じず、知っているモードのときだけ使う
  const saved = storage.get(VIEW_KEY);
  show(saved in modes ? saved : "match");
})();
