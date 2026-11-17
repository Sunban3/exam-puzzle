// モード(タブ)の切り替えと、全体のつなぎ役
(() => {
  "use strict";

  const { storage, filter, createSession } = window.App;
  const VIEW_KEY = "exam-puzzle:view";

  // 各モードに「流れの管理役(セッション)」をつける
  const players = { match: window.App.match, choice: window.App.choice };
  const prefixes = { match: "m", choice: "c" };
  window.App.sessions = {};
  Object.keys(players).forEach((name) => {
    window.App.sessions[name] = createSession({ mode: name, prefix: prefixes[name], player: players[name] });
  });
  const sessions = window.App.sessions;

  let current = "match";
  const tabs = document.getElementById("tabs");

  // タブの横の問題数(絞り込み後の数)
  function updateCounts() {
    Object.keys(players).forEach((name) => {
      document.getElementById(`count-${name}`).textContent = `${players[name].count()}問`;
    });
  }

  function show(view) {
    current = view;
    tabs.querySelectorAll("[data-view]").forEach((b) => {
      b.setAttribute("aria-selected", String(b.dataset.view === view));
    });
    Object.keys(players).forEach((name) => {
      document.getElementById(`view-${name}`).hidden = name !== view;
    });
    storage.set(VIEW_KEY, view);
    sessions[view].shown();
  }

  // イベント委任: タブの親に1つだけイベントをつける
  tabs.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-view]");
    if (btn) show(btn.dataset.view);
  });

  // ジャンルが変わったら、両方のモードを設定画面に戻す
  filter.onChange(() => {
    Object.values(sessions).forEach((s) => s.refresh());
    updateCounts();
  });

  Object.values(sessions).forEach((s) => s.showSetup());
  updateCounts();

  // 保存された値をそのまま信じず、知っているモードのときだけ使う
  const saved = storage.get(VIEW_KEY);
  show(saved in players ? saved : "match");
})();
