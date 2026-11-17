// 用語あてはめモード(問題を表示して、答え合わせをする役)
// あてはめ問題は線でつなぎ、計算問題(5問に1回)は4択で出す
(() => {
  "use strict";

  const { NUMBERS, make, shuffle, sourceText, renderExtras, renderChoices, matchItems, matchNote, records, filter } = window.App;
  const MODE = "match";
  const SVG_NS = "http://www.w3.org/2000/svg";
  const session = () => window.App.sessions[MODE]; // 流れの管理役(app.js で作られる)

  // あてはめ形式の問題(match があるもの)と、計算問題(calc: true)を使う
  const all = (window.QUESTIONS || [])
    .filter((q) => q.match || q.calc)
    .map((q) => (q.match ? { ...q, items: matchItems(q) } : q));
  let questions = all.filter(filter.matches); // ジャンルで絞り込んだ問題

  const el = {
    tag: document.getElementById("m-tag-text"),
    calcBadge: document.getElementById("m-calc-badge"),
    hint: document.getElementById("m-hint"),
    choices: document.getElementById("m-choices"),
    record: document.getElementById("m-record"),
    stem: document.getElementById("m-stem"),
    extras: document.getElementById("m-extras"),
    board: document.getElementById("m-board"),
    lines: document.getElementById("m-lines"),
    terms: document.getElementById("m-terms"),
    meanings: document.getElementById("m-meanings"),
    result: document.getElementById("m-result"),
    check: document.getElementById("m-check"),
    next: document.getElementById("m-next"),
    source: document.getElementById("m-source"),
  };

  const state = {
    kind: "match",      // "match"(線でつなぐ) か "choice"(計算問題の4択)
    picked: null,       // 4択のとき、選んだ番号
    index: 0,
    meaningOrder: [],
    pairs: {},          // { 選択肢の番号: 説明の番号 }
    selectedTerm: null,
    justPaired: null,
    checked: false,
    entering: false,
  };

  const colorOf = (t) => `var(--c${(t % 4) + 1})`;

  function ownerOf(meaningIndex) {
    const found = Object.keys(state.pairs).find((t) => state.pairs[t] === meaningIndex);
    return found === undefined ? null : Number(found);
  }

  // ----- 問題を表示する -----
  function play(i) {
    const q = questions[i];
    const kind = q.match ? "match" : "choice";
    Object.assign(state, {
      kind,
      picked: null,
      index: i,
      meaningOrder: kind === "match" ? shuffle(q.items.map((_, n) => n)) : [],
      pairs: {},
      selectedTerm: null,
      justPaired: null,
      checked: false,
      entering: true,
    });

    el.tag.textContent = q.tag;
    el.calcBadge.hidden = !q.calc;
    el.stem.textContent = q.stem;
    el.extras.replaceChildren(renderExtras(q));
    el.source.textContent = kind === "match" ? sourceText(q, [matchNote(q)]) : sourceText(q);
    el.result.hidden = true;
    el.result.replaceChildren();
    el.next.hidden = true;

    // 問題の種類で、使う部品を切り替える
    const isMatch = kind === "match";
    el.board.hidden = !isMatch;
    el.hint.hidden = !isMatch;
    el.check.hidden = !isMatch;
    el.choices.hidden = isMatch;
    showRecord(q);

    render();
  }

  function showRecord(q) {
    el.record.textContent = records.questionText(records.get(MODE, q.id));
  }

  // ----- 画面を作る(状態 → 見た目) -----
  function render() {
    const q = questions[state.index];

    if (state.kind === "choice") {
      renderChoices(el.choices, q, { picked: state.picked, onPick: answerChoice, entering: state.entering });
      state.entering = false;
      return;
    }

    el.terms.replaceChildren(...q.items.map((item, t) => termCard(item, t)));
    el.meanings.replaceChildren(...state.meaningOrder.map((m, row) => meaningCard(q, m, row)));
    el.check.disabled = Object.keys(state.pairs).length !== q.items.length;
    el.board.classList.toggle("enter", state.entering);
    el.board.classList.toggle("picking", state.selectedTerm !== null);

    drawLines();
    state.entering = false;
    state.justPaired = null;
  }

  function termCard(item, t) {
    const li = make("li");
    const btn = make("button", "card term");
    btn.type = "button";
    btn.dataset.term = t;
    btn.style.setProperty("--pair", colorOf(t));
    btn.style.setProperty("--i", t);
    btn.append(make("span", "badge", NUMBERS[t]), make("span", "label", item.term));

    if (state.selectedTerm === t) btn.classList.add("selected");
    if (state.pairs[t] !== undefined) btn.classList.add("paired");
    if (state.checked) {
      btn.classList.add(state.pairs[t] === t ? "correct" : "wrong");
      btn.disabled = true;
    }

    btn.addEventListener("click", () => {
      state.selectedTerm = state.selectedTerm === t ? null : t;
      render();
    });
    li.append(btn);
    return li;
  }

  function meaningCard(q, m, row) {
    const li = make("li");
    const btn = make("button", "card meaning");
    btn.type = "button";
    btn.dataset.meaning = m;
    btn.style.setProperty("--i", row);

    const owner = ownerOf(m);
    const badge = make("span", "badge", owner === null ? "?" : NUMBERS[owner]);
    if (owner === null) {
      badge.classList.add("empty");
    } else {
      btn.style.setProperty("--pair", colorOf(owner));
      btn.classList.add("paired");
      if (owner === state.justPaired) btn.classList.add("pop");
    }
    btn.append(badge, make("span", "label", q.items[m].meaning));

    if (state.checked) {
      btn.classList.add(owner === m ? "correct" : "wrong");
      btn.disabled = true;
    }

    btn.addEventListener("click", () => {
      if (state.selectedTerm === null) {
        btn.classList.remove("nudge");
        void btn.offsetWidth;
        btn.classList.add("nudge");
        return;
      }
      if (owner !== null) delete state.pairs[owner];
      state.pairs[state.selectedTerm] = m;
      state.justPaired = state.selectedTerm;
      state.selectedTerm = null;
      render();
    });
    li.append(btn);
    return li;
  }

  // ----- 線を引く -----
  function anchor(node, side) {
    const box = el.board.getBoundingClientRect();
    const r = node.getBoundingClientRect();
    return {
      x: (side === "right" ? r.right : r.left) - box.left,
      y: r.top + r.height / 2 - box.top,
    };
  }

  function curve(a, b) {
    const dx = Math.max(24, (b.x - a.x) / 2);
    return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
  }

  function drawLines() {
    const box = el.board.getBoundingClientRect();
    el.lines.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
    el.lines.replaceChildren();

    Object.keys(state.pairs).forEach((key) => {
      const t = Number(key);
      const m = state.pairs[t];
      const from = el.terms.querySelector(`[data-term="${t}"]`);
      const to = el.meanings.querySelector(`[data-meaning="${m}"]`);
      if (!from || !to) return;

      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", curve(anchor(from, "right"), anchor(to, "left")));
      path.setAttribute("pathLength", "1");
      path.classList.add("line");
      path.style.setProperty("--pair", colorOf(t));
      if (t === state.justPaired) path.classList.add("draw");
      if (state.checked) path.classList.add(m === t ? "correct" : "wrong");
      el.lines.append(path);
    });

    if (state.selectedTerm !== null && !state.checked) {
      const rubber = document.createElementNS(SVG_NS, "path");
      rubber.classList.add("rubber");
      rubber.dataset.rubber = "";
      rubber.style.setProperty("--pair", colorOf(state.selectedTerm));
      el.lines.append(rubber);
    }
  }

  el.board.addEventListener("pointermove", (e) => {
    const rubber = el.lines.querySelector("[data-rubber]");
    if (!rubber) return;
    const from = el.terms.querySelector(`[data-term="${state.selectedTerm}"]`);
    if (!from) return;
    const box = el.board.getBoundingClientRect();
    const a = anchor(from, "right");
    const b = { x: e.clientX - box.left, y: e.clientY - box.top };
    if (b.x <= a.x) {
      rubber.removeAttribute("d");
      return;
    }
    rubber.setAttribute("d", curve(a, b));
  });

  window.addEventListener("resize", () => {
    if (questions.length && state.kind === "match") drawLines();
  });

  // ----- 答え合わせ -----
  function check() {
    const q = questions[state.index];
    state.checked = true;
    render();

    const correctCount = q.items.filter((_, t) => state.pairs[t] === t).length;
    const allCorrect = correctCount === q.items.length;
    const rec = session().answered(q, allCorrect); // 4つ全部合っていたら「正解」として記録
    showRecord(q);

    const box = el.result;
    box.replaceChildren();
    box.classList.toggle("perfect", allCorrect);
    box.append(
      make("p", "score", allCorrect ? `全問正解！ ${correctCount} / ${q.items.length}` : `${correctCount} / ${q.items.length} 正解`),
      make("p", "next-review", records.nextText(rec))
    );

    q.items.forEach((item, t) => {
      if (state.pairs[t] === t) return;
      const row = make("p", "fix");
      row.append(make("strong", null, `${NUMBERS[t]} ${item.term}`), make("span", null, `：${item.meaning}`));
      box.append(row);
    });

    const ans = make("div", "original");
    ans.append(
      make("p", "original-title", "もとの4択問題の答え"),
      make("p", null, q.stem),
      make("p", "original-answer", `${NUMBERS[q.answer]} ${q.items[q.answer].term}`)
    );
    box.append(ans);

    box.hidden = false;
    el.check.hidden = true;
    el.next.hidden = false;
    el.next.textContent = session().isLast() ? "結果を見る" : "次の問題";
  }

  // ----- 計算問題(4択)に答える -----
  function answerChoice(i) {
    if (state.picked !== null) return;
    const q = questions[state.index];
    state.picked = i;
    render();

    const ok = i === q.answer;
    const rec = session().answered(q, ok);
    showRecord(q);

    const box = el.result;
    box.replaceChildren();
    box.classList.toggle("perfect", ok);
    box.append(
      make("p", "score", ok ? "正解！" : `不正解… 正解は ${NUMBERS[q.answer]}`),
      make("p", "next-review", records.nextText(rec))
    );
    box.hidden = false;
    el.next.hidden = false;
    el.next.textContent = session().isLast() ? "結果を見る" : "次の問題";
  }

  el.check.addEventListener("click", check);
  el.next.addEventListener("click", () => session().next());

  // ----- 外から使う窓口 -----
  window.App.match = {
    questions: () => questions,
    count: () => questions.filter((q) => q.match).length, // タブに出す数は、あてはめ問題だけ
    calcIsExtra: true, // 計算問題は「5問に1回」がオンのときだけ出す
    play,
    refresh() { questions = all.filter(filter.matches); },
    // 非表示から表示に切り替わったら、カードの位置が変わるので線を引き直す
    shown() { if (state.kind === "match") drawLines(); },
  };
})();
