// モード(タブ)の切り替えと、全体のつなぎ役
(() => {
  "use strict";

  const { storage, filter, createSession } = window.App;
  const VIEW_KEY = "exam-puzzle:view";
  const ANALYSIS = "analysis";

  // 各モードに「流れの管理役(セッション)」をつける
  const players = { match: window.App.match, choice: window.App.choice, kamokuB: window.App.kamokuB };
  const prefixes = { match: "m", choice: "c", kamokuB: "b" };
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
    // 自己分析は、問題を解くモードではない(ジャンルの絞り込みも使わない)
    const isAnalysis = view === ANALYSIS;
    document.getElementById("view-analysis").hidden = !isAnalysis;
    document.getElementById("filter").hidden = isAnalysis;
    storage.set(VIEW_KEY, view);
    if (isAnalysis) window.App.analysis.render(); // 開くたびに最新の記録で描き直す
    else sessions[view].shown();
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
  show(saved in players || saved === ANALYSIS ? saved : "match");
})();
