// 自己分析タブ
// 全モード・全期間の記録と振り返りメモから、得意・苦手と「なぜ間違えるか」を見えるようにする
(() => {
  "use strict";

  const { make, records, notes } = window.App;
  const MIN_ATTEMPTS = 5;   // ジャンルの得意・苦手を判断するのに必要な解答数
  const STRONG = 0.8;       // これ以上なら得意
  const WEAK = 0.6;         // これ未満なら苦手
  const WEAK_LIST_SIZE = 10;

  // 理由ごとの「次にやるとよいこと」
  const ADVICE = {
    unknown: "知らない用語が多いみたい。「用語あてはめ」で、用語と意味をセットで覚えよう。",
    confused: "似た用語の取り違えが多いみたい。間違えた2つを並べて、違いを1行でメモしておくと効く。",
    calc: "計算ミスが多いみたい。計算メモ欄に途中式を書いて、単位をそろえてから計算しよう。",
    misread: "読み違いが多いみたい。「適切なもの／適切でないもの」や条件の数字を、指でなぞるつもりで読もう。",
    time: "時間が足りないことが多いみたい。科目Bは追う変数を絞って、選択肢を当てはめて消す練習をしよう。",
    unclear: "「わかりにくい」と感じた問題がたまっている。解説を読み直して、自分の言葉でメモし直そう。",
  };

  const body = document.getElementById("analysis-body");
  const view = { reason: "all" }; // メモ一覧の絞り込み(タブを切り替えても覚えておく)

  // ジャンル名を短くする(科目Bは「科目B・アルゴリズム」のように、科目Aと区別する)
  const genreName = (tag) => (tag.startsWith("科目B") ? tag.replace("：", "・") : tag.split("：").pop());
  const percent = (c, a) => (a ? Math.round((c / a) * 100) : 0);
  const shortText = (q) => {
    const t = q.title || q.stem.split("\n")[0];
    return t.length > 60 ? `${t.slice(0, 60)}…` : t;
  };
  const dateText = (at) => {
    const d = new Date(at);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  // ===== データを集める =====
  function collect() {
    const all = [...(window.QUESTIONS || []), ...(window.KAMOKU_B || [])];
    const byId = new Map(all.map((q) => [q.id, q]));

    // 問題ごと(同じ問題をあてはめと4択の両方で解いていたら、合計する)
    const perQ = new Map();
    records.entries().forEach(({ id, rec }) => {
      const q = byId.get(id);
      if (!q) return; // データから消えた問題の記録は使わない
      const a = perQ.get(id) || { q, attempts: 0, correct: 0, lastAt: 0, unsure: false };
      a.attempts += rec.attempts;
      a.correct += rec.correct;
      const last = rec.history[rec.history.length - 1];
      if (last && last.at > a.lastAt) {
        a.lastAt = last.at;
        a.unsure = records.lastUnsure(rec);
      }
      perQ.set(id, a);
    });

    // ジャンルごと
    const perTag = new Map();
    perQ.forEach(({ q, attempts, correct }) => {
      const t = perTag.get(q.tag) || { tag: q.tag, attempts: 0, correct: 0, questions: 0 };
      t.attempts += attempts;
      t.correct += correct;
      t.questions += 1;
      perTag.set(q.tag, t);
    });

    // 振り返りメモ(問題が見つかるものだけ)
    const memo = notes.all()
      .map((n) => ({ ...n, q: byId.get(n.id), stat: perQ.get(n.id) }))
      .filter((n) => n.q)
      .sort((a, b) => b.at - a.at);

    return { total: all.length, perQ, perTag, memo };
  }

  // ===== 描く =====
  function render() {
    const d = collect();
    if (d.perQ.size === 0 && d.memo.length === 0) {
      body.replaceChildren(card("まだ記録がありません",
        make("p", "an-empty", "問題を解くと、ここに得意・苦手なジャンルや、間違えやすい理由が出てくるよ。")));
      return;
    }
    body.replaceChildren(overview(d), genres(d), reasons(d), weakQuestions(d), memoList(d));
  }

  function card(title, ...children) {
    const box = make("section", "an-card");
    box.append(make("h2", "an-title", title), ...children);
    return box;
  }

  // 全体のまとめ
  function overview(d) {
    let attempts = 0;
    let correct = 0;
    let unsure = 0;
    d.perQ.forEach((a) => {
      attempts += a.attempts;
      correct += a.correct;
      if (a.unsure) unsure += 1;
    });
    const grid = make("div", "an-stats");
    [
      ["解いた問題", `${d.perQ.size}`, `/ ${d.total}問`],
      ["正解率", `${percent(correct, attempts)}`, `%（${attempts}回）`],
      ["たまたま正解", `${unsure}`, "問"],
      ["振り返りメモ", `${d.memo.length}`, "問"],
    ].forEach(([label, num, unit]) => {
      const s = make("div", "an-stat");
      const v = make("p", "an-stat-value");
      v.append(make("span", "an-num", num), make("span", "an-unit", unit));
      s.append(make("p", "an-stat-label", label), v);
      grid.append(s);
    });
    return card("これまでの記録", grid);
  }

  // ジャンル別の得意・苦手
  function genres(d) {
    const tags = [...d.perTag.values()]
      .map((t) => ({ ...t, rate: t.correct / t.attempts }))
      .sort((a, b) => a.rate - b.rate || b.attempts - a.attempts);
    const judged = tags.filter((t) => t.attempts >= MIN_ATTEMPTS);
    const weak = judged.filter((t) => t.rate < WEAK);
    const strong = judged.filter((t) => t.rate >= STRONG).reverse();

    const nodes = [];
    const line = (cls, label, list) => {
      const p = make("p", `an-verdict ${cls}`);
      p.append(make("strong", null, label),
        make("span", null, list.length ? list.map((t) => `${genreName(t.tag)}（${percent(t.correct, t.attempts)}%）`).join("・") : "まだなし"));
      return p;
    };
    nodes.push(line("weak", "苦手：", weak), line("strong", "得意：", strong));

    const list = make("div", "genre-list");
    tags.forEach((t) => {
      const row = make("div", "genre-row an-genre");
      const rate = percent(t.correct, t.attempts);
      row.style.setProperty("--rate", `${rate}%`);
      const few = t.attempts < MIN_ATTEMPTS;
      if (!few && t.rate < WEAK) row.classList.add("low");
      if (few) row.classList.add("few");
      const badge = few ? "データ少なめ" : t.rate < WEAK ? "苦手" : t.rate >= STRONG ? "得意" : "";
      const name = make("span", "genre-name", genreName(t.tag));
      if (badge) name.append(make("span", `an-badge ${few ? "few" : t.rate < WEAK ? "weak" : "strong"}`, badge));
      row.append(name, make("span", "genre-bar"), make("span", "genre-score", `${rate}%`));
      list.append(row);
    });
    nodes.push(list, make("p", "an-note", `${MIN_ATTEMPTS}回以上解いたジャンルだけ、得意（${STRONG * 100}%以上）・苦手（${WEAK * 100}%未満）を判断しています`));
    return card("ジャンル別の得意・苦手", ...nodes);
  }

  // 間違えた理由の集計
  function reasons(d) {
    const counts = new Map(notes.REASONS.map((r) => [r.key, 0]));
    d.memo.forEach((n) => n.reasons.forEach((r) => counts.set(r, counts.get(r) + 1)));
    const max = Math.max(...counts.values());
    if (max === 0) {
      return card("間違えやすい理由",
        make("p", "an-empty", "答えたあとの「振り返りメモ」で理由を選ぶと、ここに集まるよ。"));
    }

    const list = make("div", "genre-list");
    [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .forEach(([key, n]) => {
        const row = make("div", "genre-row an-reason");
        row.style.setProperty("--rate", `${(n / max) * 100}%`);
        row.append(make("span", "genre-name", notes.labelOf(key)), make("span", "genre-bar"), make("span", "genre-score", `${n}問`));
        list.append(row);
      });

    // いちばん多い理由(同じ数なら全部)へのアドバイス
    const tops = [...counts.entries()].filter(([, n]) => n === max).map(([k]) => k);
    const advice = make("div", "an-advice");
    advice.append(make("p", "an-advice-title", "次にやるとよいこと"));
    tops.forEach((k) => advice.append(make("p", null, ADVICE[k])));
    return card("間違えやすい理由", list, advice);
  }

  // 正解率が低い問題
  function weakQuestions(d) {
    const list = [...d.perQ.values()]
      .filter((a) => a.attempts >= 2 && a.correct / a.attempts < WEAK)
      .sort((a, b) => a.correct / a.attempts - b.correct / b.attempts || b.attempts - a.attempts)
      .slice(0, WEAK_LIST_SIZE);
    if (!list.length) {
      return card("つまずいている問題", make("p", "an-empty", "2回以上解いて正解率が60%未満の問題は、今のところありません。"));
    }
    const box = make("div", "an-list");
    list.forEach((a) => {
      const item = make("div", "an-item");
      const head = make("p", "an-item-head");
      head.append(make("span", "wrong-tag", genreName(a.q.tag)), make("span", "an-item-rate", `${a.attempts}回中${a.correct}回正解`));
      item.append(head, make("p", "an-item-text", shortText(a.q)));
      const n = notes.get(a.q.id);
      if (n?.reasons.length) item.append(reasonTags(n.reasons));
      box.append(item);
    });
    return card("つまずいている問題", box, make("p", "an-note", "復習の時期が来ると、優先して出題されます"));
  }

  function reasonTags(keys) {
    const tags = make("div", "past-reasons");
    keys.forEach((r) => tags.append(make("span", "past-reason", notes.labelOf(r))));
    return tags;
  }

  // 振り返りメモの一覧(理由で絞り込める)
  function memoList(d) {
    const box = card("振り返りメモ");
    if (!d.memo.length) {
      box.append(make("p", "an-empty", "答えたあとに書いた振り返りメモが、ここに並ぶよ。"));
      return box;
    }

    const filters = make("div", "chips an-filters");
    const listBox = make("div", "an-list");
    const options = [{ key: "all", label: "すべて", n: d.memo.length },
      ...notes.REASONS.map((r) => ({ ...r, n: d.memo.filter((m) => m.reasons.includes(r.key)).length }))
        .filter((r) => r.n > 0)];
    if (!options.some((o) => o.key === view.reason)) view.reason = "all";

    function draw() {
      filters.replaceChildren(...options.map((o) => {
        const btn = make("button", "chip", `${o.label} ${o.n}`);
        btn.type = "button";
        btn.setAttribute("aria-pressed", String(view.reason === o.key));
        btn.addEventListener("click", () => {
          view.reason = o.key;
          draw();
        });
        return btn;
      }));
      const shown = d.memo.filter((m) => view.reason === "all" || m.reasons.includes(view.reason));
      listBox.replaceChildren(...shown.map((m) => {
        const item = make("div", "an-item");
        const head = make("p", "an-item-head");
        const rate = m.stat ? `${m.stat.attempts}回中${m.stat.correct}回正解` : "";
        head.append(make("span", "wrong-tag", genreName(m.q.tag)), make("span", "an-item-rate", `${rate}　${dateText(m.at)}`));
        item.append(head, make("p", "an-item-text", shortText(m.q)));
        if (m.reasons.length) item.append(reasonTags(m.reasons));
        if (m.text) item.append(make("p", "an-memo", m.text));
        return item;
      }));
    }
    draw();
    box.append(filters, listBox);
    return box;
  }

  window.App.analysis = { render };
})();
