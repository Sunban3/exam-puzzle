// 学習記録(どの問題を、いつ、正解したか)をブラウザに保存する
(() => {
  "use strict";

  const { storage } = window.App;
  const KEY = "exam-puzzle:records";
  const HISTORY_LIMIT = 20; // 1問あたり、直近何回分の履歴を残すか

  // 保存データの形
  // {
  //   match:  { "fe-r05-a-03": { attempts: 3, correct: 2, history: [{ at: 1731800000000, ok: true }, ...] } },
  //   (正解したけど自信がなかった回は { at, ok: true, unsure: true })
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

  // 最後に解いた回を「たまたま正解」にする(unsure が false なら「自信あり」に戻す)
  // 正解率(correct)はそのまま。復習の間隔だけが変わる
  function setUnsure(mode, id, unsure) {
    const rec = get(mode, id);
    const last = rec?.history?.[rec.history.length - 1];
    if (!last || !last.ok) return rec; // 不正解の回は、もともと間隔が0に戻るので何もしない
    if (unsure) last.unsure = true;
    else delete last.unsure;
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

  // ===== 復習サイクル(間隔反復) =====
  // 連続正解の回数が増えるほど、次に出すまでの間隔(日数)をのばす
  // 間違えると連続正解が0に戻り、間隔0日 = すぐにまた出る
  const DAY = 24 * 60 * 60 * 1000;
  const INTERVALS = [0, 1, 3, 7, 14, 30]; // 連続正解 0回,1回,2回,3回,4回,5回以上

  // 「自信をもって正解した」回か(たまたま正解は数えない)
  const isSure = (h) => h.ok && h.unsure !== true;

  // 最後から数えて、何回連続で「自信をもって」正解しているか
  function streakOf(rec) {
    let n = 0;
    for (let i = rec.history.length - 1; i >= 0 && isSure(rec.history[i]); i--) n++;
    return n;
  }

  // 最後の回が「たまたま正解」か
  function lastUnsure(rec) {
    const last = rec.history[rec.history.length - 1];
    return Boolean(last && last.ok && last.unsure === true);
  }

  function intervalDays(rec) {
    // たまたま正解は「覚えた」とは言えないので、間隔をのばさずに明日また出す
    if (lastUnsure(rec)) return INTERVALS[1];
    return INTERVALS[Math.min(streakOf(rec), INTERVALS.length - 1)];
  }

  // 次に出す時刻 = 最後に解いた時刻 + 間隔
  function dueAt(rec) {
    const last = rec.history[rec.history.length - 1];
    return last.at + intervalDays(rec) * DAY;
  }

  // 問題の状態: "new"(まだ解いてない) / "due"(復習の時期) / "later"(まだ先)
  function status(rec, now = Date.now()) {
    if (!rec || !Array.isArray(rec.history) || rec.history.length === 0) return "new";
    return dueAt(rec) <= now ? "due" : "later";
  }

  // 1回のうち、新しい問題に必ず空けておく割合
  // (復習がたまっても、新しい問題がまったく出ない日を作らないため)
  const NEW_SHARE = 1 / 3;

  // n問のうち、新しい問題を何問入れるか(新しい問題が足りなければ、ある分だけ)
  function newQuota(n, fresh) {
    return Math.min(fresh, Math.ceil(n * NEW_SHARE));
  }

  // 1回分(n問)の出題リストを作る
  // 1. 復習の時期が来た問題(時期を過ぎているものほど先)。ただし新しい問題の枠は空けておく
  // 2. まだ解いていない問題(データの順)
  // 3. 枠に入りきらなかった復習
  // 4. それでも足りなければ、次の復習が近い問題から
  // calcEvery を指定すると、その問題数ごとに1回、計算問題(calc: true)を入れる
  // skipCalc を true にすると、計算問題を出さない
  function plan(mode, questions, n, { calcEvery = 0, skipCalc = false } = {}) {
    const now = Date.now();
    const list = questions.map((q, index) => {
      const rec = get(mode, q.id);
      const st = status(rec, now);
      return { index, st, calc: Boolean(q.calc), due: st === "new" ? 0 : dueAt(rec) };
    });
    const byDue = (a, b) => a.due - b.due;
    const usable = list.filter((x) => !(skipCalc && x.calc));
    const due = usable.filter((x) => x.st === "due").sort(byDue);
    const fresh = usable.filter((x) => x.st === "new");
    const later = usable.filter((x) => x.st === "later").sort(byDue);

    // 復習は「n問 － 新しい問題の枠」までにする。入りきらなかった復習は、新しい問題のあとに回す
    const dueRoom = n - newQuota(n, fresh.length);
    const ordered = [...due.slice(0, dueRoom), ...fresh, ...due.slice(dueRoom), ...later];
    if (!calcEvery) return ordered.slice(0, n).map((x) => x.index);

    // 計算問題と、それ以外に分けてから組み合わせる
    // 5問目・10問目…は計算問題、それ以外は計算以外。片方が尽きたら、もう片方で埋める
    const calc = ordered.filter((x) => x.calc);
    const normal = ordered.filter((x) => !x.calc);
    const out = [];
    while (out.length < n && (calc.length || normal.length)) {
      const wantCalc = (out.length + 1) % calcEvery === 0;
      const from = wantCalc ? (calc.length ? calc : normal) : (normal.length ? normal : calc);
      out.push(from.shift().index);
    }
    return out;
  }

  // 今日の残り(復習・新規)と、いちばん近い次の復習
  function queue(mode, questions) {
    const now = Date.now();
    let due = 0;
    let fresh = 0;
    let soonest = Infinity;
    questions.forEach((q) => {
      const rec = get(mode, q.id);
      const st = status(rec, now);
      if (st === "due") due += 1;
      else if (st === "new") fresh += 1;
      else soonest = Math.min(soonest, dueAt(rec));
    });
    return { due, fresh, soonest };
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

  function queueText(qu) {
    return `今日の復習 ${qu.due}問・新しい問題 ${qu.fresh}問`;
  }

  // 次の復習がいつかを、人が読みやすい言葉にする
  function laterText(time) {
    if (!isFinite(time)) return "なし";
    const days = Math.ceil((time - Date.now()) / DAY);
    if (days <= 0) return "今日";
    if (days === 1) return "明日";
    return `${days}日後`;
  }

  function nextText(rec) {
    if (lastUnsure(rec)) return "次の復習：明日（たまたま正解なので、間隔はのばさない）";
    const days = intervalDays(rec);
    if (days === 0) return "次の復習：このあともう一度出ます";
    return `次の復習：${days === 1 ? "明日" : `${days}日後`}（${streakOf(rec)}回連続正解）`;
  }

  window.App.records = {
    get, add, setUnsure, summary, plan, queue, newQuota,
    questionText, summaryText, queueText, laterText, nextText,
  };
})();
