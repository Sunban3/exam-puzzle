// 学習記録(どの問題を、いつ、正解したか)をブラウザに保存する
(() => {
  "use strict";

  const { storage } = window.App;
  const KEY = "exam-puzzle:records";
  const HISTORY_LIMIT = 20; // 1問あたり、直近何回分の履歴を残すか

  // 保存データの形
  // {
  //   match:  { "fe-r05-a-03": { attempts: 3, correct: 2, history: [{ at: 1731800000000, ok: true }, ...] } },
  //   choice: { ... }
  // }

  // 保存されているデータを読み込む
  // localStorage は書き換えられることもあるので、形がおかしければ空から始める
  function load() {
    try {
      const data = JSON.parse(storage.get(KEY) || "{}");
      return data && typeof data === "object" ? data : {};
    } catch {
      return {};
    }
  }

  let data = load();

  function save() {
    storage.set(KEY, JSON.stringify(data));
  }

  // 1問の記録を取り出す(まだ解いていなければ null)
  function get(mode, id) {
    const rec = data[mode]?.[id];
    if (!rec || typeof rec.attempts !== "number") return null;
    return rec;
  }

  // 解いた結果を1回分追加する
  function add(mode, id, ok) {
    data[mode] = data[mode] || {};
    const rec = get(mode, id) || { attempts: 0, correct: 0, history: [] };
    rec.attempts += 1;
    if (ok) rec.correct += 1;
    rec.history = [...(rec.history || []), { at: Date.now(), ok }].slice(-HISTORY_LIMIT);
    data[mode][id] = rec;
    save();
    return rec;
  }

  // モード全体のまとめ(解いた問題数・正解率)
  function summary(mode, ids) {
    let solved = 0;
    let attempts = 0;
    let correct = 0;
    ids.forEach((id) => {
      const rec = get(mode, id);
      if (!rec) return;
      solved += 1;
      attempts += rec.attempts;
      correct += rec.correct;
    });
    return { solved, total: ids.length, attempts, correct };
  }

  // 表示用の文字列
  const percent = (c, a) => (a ? `${Math.round((c / a) * 100)}%` : "-");

  function questionText(rec) {
    if (!rec) return "はじめての問題";
    return `${rec.attempts}回中${rec.correct}回正解（${percent(rec.correct, rec.attempts)}）`;
  }

  function summaryText(s) {
    return `解いた問題 ${s.solved} / ${s.total}　正解率 ${percent(s.correct, s.attempts)}`;
  }

  window.App.records = { get, add, summary, questionText, summaryText };
})();
