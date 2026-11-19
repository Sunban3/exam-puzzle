// アプリの「更新履歴」(データは data/changelog.js)
// まだ見ていない更新があると、ボタンに「NEW」をつける
(() => {
  "use strict";

  const { make, storage } = window.App;
  const SEEN_KEY = "exam-puzzle:changelog-seen"; // 最後に見た更新の日付
  const LABEL = { new: "追加", improve: "改善", fix: "修正" };
  const DATE = /^\d{4}-\d{2}-\d{2}$/;

  // データの形を確かめて、知らない書き方のものは使わない
  const list = (window.CHANGELOG || []).filter((e) => DATE.test(e.date) && Array.isArray(e.changes));
  const latest = list[0]?.date || "";

  const el = {
    open: document.getElementById("changelog-open"),
    badge: document.getElementById("changelog-new"),
    dialog: document.getElementById("changelog"),
    close: document.getElementById("changelog-close"),
    body: document.getElementById("changelog-body"),
  };

  // 保存された日付も疑う(日付の形でなければ「まだ見ていない」扱い)
  function seenDate() {
    const v = storage.get(SEEN_KEY) || "";
    return DATE.test(v) ? v : "";
  }

  // "2026-11-19" のような形なら、文字列のまま大小を比べられる
  function updateBadge() {
    el.badge.hidden = !latest || seenDate() >= latest;
  }

  function dateText(d) {
    const [y, m, day] = d.split("-").map(Number);
    return `${y}年${m}月${day}日`;
  }

  function render() {
    el.body.replaceChildren(
      ...list.map((entry) => {
        const sec = make("section", "changelog-day");
        const ul = make("ul", "changelog-list");
        entry.changes.forEach((c) => {
          const li = make("li");
          const type = LABEL[c.type] ? c.type : "new";
          li.append(make("span", `changelog-type ${type}`, LABEL[type]), make("span", null, c.text));
          ul.append(li);
        });
        sec.append(make("h3", "changelog-date", dateText(entry.date)), ul);
        return sec;
      })
    );
  }

  el.open.addEventListener("click", () => {
    render();
    if (el.dialog.showModal) el.dialog.showModal();
    else el.dialog.setAttribute("open", ""); // 古いブラウザ向け
    storage.set(SEEN_KEY, latest);
    updateBadge();
  });

  const close = () => (el.dialog.close ? el.dialog.close() : el.dialog.removeAttribute("open"));
  el.close.addEventListener("click", close);
  // 外側(暗くなった部分)を押しても閉じる
  el.dialog.addEventListener("click", (e) => {
    if (e.target === el.dialog) close();
  });

  updateBadge();
})();
