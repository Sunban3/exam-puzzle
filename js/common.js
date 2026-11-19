// どのモードからも使う、共通の道具箱
window.App = window.App || {};

(() => {
  "use strict";

  const NUMBERS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]; // 科目Bは選択肢が10個まである
  // 年度コード → 出典に書く試験名
  const EXAMS = {
    H31S: "平成31年度 春期 基本情報技術者試験 午前",
    R1A: "令和元年度 秋期 基本情報技術者試験 午前",
    R5: "令和5年度 基本情報技術者試験 科目A 公開問題",
    R6: "令和6年度 基本情報技術者試験 科目A 公開問題",
    R7: "令和7年度 基本情報技術者試験 科目A 公開問題",
    R8: "令和8年度 基本情報技術者試験 科目A 公開問題",
    R5B: "令和5年度 基本情報技術者試験 科目B 公開問題",
    R6B: "令和6年度 基本情報技術者試験 科目B 公開問題",
    R7B: "令和7年度 基本情報技術者試験 科目B 公開問題",
    R8B: "令和8年度 基本情報技術者試験 科目B 公開問題",
    SB: "基本情報技術者試験 科目B サンプル問題（2022年4月公開）",
    SBS: "基本情報技術者試験 科目B サンプル問題セット（2022年12月公開）",
  };

  // 文字は必ず textContent で入れる(innerHTML は使わない = XSS対策)
  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function shuffle(array) {
    const a = array.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // 出典の文字列を、データ(年度・問番号・改変内容)から組み立てる
  function sourceText(q, notes = []) {
    const base = `出典：${EXAMS[q.year]} 問${q.no}`;
    const all = [q.note, ...notes].filter(Boolean);
    return all.length ? `${base}(${all.join("、")})` : base;
  }

  // 表・プログラム・図の説明など、問題文の下につく「おまけ」を作る
  function renderExtras(q) {
    const frag = document.createDocumentFragment();

    if (q.figure) frag.append(make("pre", "figure", q.figure));
    if (q.code) frag.append(make("pre", "code", q.code));

    (q.tables || []).forEach((t) => {
      const wrap = make("div", "table-wrap");
      const table = make("table");
      if (t.caption) table.append(make("caption", null, t.caption));
      const thead = make("thead");
      const headRow = make("tr");
      t.head.forEach((h) => headRow.append(make("th", null, h)));
      thead.append(headRow);
      const tbody = make("tbody");
      t.rows.forEach((row) => {
        const tr = make("tr");
        row.forEach((cell) => tr.append(make("td", null, cell)));
        tbody.append(tr);
      });
      table.append(thead, tbody);
      wrap.append(table);
      frag.append(wrap);
    });

    return frag;
  }

  // あてはめ用の「用語と説明のペア」を作る
  // terms がなければ選択肢そのものが用語、meanings がなければ選択肢そのものが説明
  function matchItems(q) {
    const { terms, meanings } = q.match;
    return q.choices.map((choice, i) => ({
      term: terms ? terms[i] : choice,
      meaning: meanings ? meanings[i] : choice,
    }));
  }

  function matchNote(q) {
    const { terms, meanings, note } = q.match;
    if (note) return note;
    if (meanings && !terms) return "説明文は独自に作成";
    return "選択肢に用語名を追加";
  }

  // 4択の選択肢ボタンを並べる(4択モードと、あてはめモードの計算問題で使う)
  //   picked … 選んだ番号(まだなら null)。選んだあとは正解・不正解の色をつける
  //   onPick … ボタンが押されたときに呼ぶ関数
  function renderChoices(container, q, { picked, onPick, entering }) {
    const answered = picked !== null;
    container.replaceChildren(
      ...q.choices.map((text, i) => {
        const li = make("li");
        const btn = make("button", "choice");
        btn.type = "button";
        btn.style.setProperty("--i", i);
        btn.append(make("span", "badge", NUMBERS[i]), make("span", "label", text));

        if (answered) {
          btn.disabled = true;
          if (i === q.answer) btn.classList.add("correct");
          else if (i === picked) btn.classList.add("wrong");
          else btn.classList.add("dim");
        }

        btn.addEventListener("click", () => onPick(i));
        li.append(btn);
        return li;
      })
    );
    container.classList.toggle("enter", Boolean(entering));
  }

  // ブラウザに保存(使えない環境でもエラーで止まらないように try/catch)
  const storage = {
    get(key) {
      try { return localStorage.getItem(key); } catch { return null; }
    },
    set(key, value) {
      try { localStorage.setItem(key, value); } catch { /* 保存できなくても遊べる */ }
    },
  };

  Object.assign(window.App, { NUMBERS, make, shuffle, sourceText, renderExtras, renderChoices, matchItems, matchNote, storage });
})();
