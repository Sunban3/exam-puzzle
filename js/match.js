// 用語あてはめモード
(() => {
  "use strict";

  const { NUMBERS, make, shuffle, sourceText, renderExtras, matchItems, matchNote, records, filter } = window.App;
  const MODE = "match";
  const SVG_NS = "http://www.w3.org/2000/svg";

  // あてはめ形式のデータ(match があるもの)だけを使う
  const all = (window.QUESTIONS || [])
    .filter((q) => q.match)
    .map((q) => ({ ...q, items: matchItems(q) }));
  let questions = all.filter(filter.matches); // ジャンルで絞り込んだ問題

  const el = {
    progress: document.getElementById("m-progress"),
    tag: document.getElementById("m-tag"),
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
    stats: document.getElementById("m-stats"),
    record: document.getElementById("m-record"),
    play: document.getElementById("m-play"),
    done: document.getElementById("m-done"),
    doneTitle: document.getElementById("m-done-title"),
    doneText: document.getElementById("m-done-text"),
    practice: document.getElementById("m-practice"),
  };

  const state = {
    index: 0,
    meaningOrder: [],
    pairs: {},          // { 選択肢の番号: 説明の番号 }
    selectedTerm: null,
    justPaired: null,
    checked: false,
    entering: false,
    practice: false,   // true なら「全問を順番に解く」、false なら復習サイクルで出す
  };

  const colorOf = (t) => `var(--c${(t % 4) + 1})`;

  function ownerOf(meaningIndex) {
    const found = Object.keys(state.pairs).find((t) => state.pairs[t] === meaningIndex);
    return found === undefined ? null : Number(found);
  }

  // ----- 問題を読み込む -----
  function load(i) {
    const q = questions[i];
    Object.assign(state, {
      index: i,
      meaningOrder: shuffle(q.items.map((_, n) => n)),
      pairs: {},
      selectedTerm: null,
      justPaired: null,
      checked: false,
      entering: true,
    });

    el.play.hidden = false;
    el.done.hidden = true;
    el.progress.textContent = state.practice ? `全問モード ${i + 1} / ${questions.length}` : "復習モード";
    el.tag.textContent = q.tag;
    el.stem.textContent = q.stem;
    el.extras.replaceChildren(renderExtras(q));
    el.source.textContent = sourceText(q, [matchNote(q)]);
    showRecord(q);
    el.result.hidden = true;
    el.result.replaceChildren();
    el.next.hidden = true;
    el.check.hidden = false;

    render();
  }

  // ----- 学習記録の表示 -----
  function showRecord(q) {
    el.record.textContent = records.questionText(records.get(MODE, q.id));
    el.stats.textContent = statsText();
  }

  function statsText() {
    const ids = questions.map((x) => x.id);
    return `${records.queueText(records.queue(MODE, questions))}　${records.summaryText(records.summary(MODE, ids))}`;
  }

  // ----- 次の問題へ -----
  function goNext() {
    if (state.practice) {
      load((state.index + 1) % questions.length);
      return;
    }
    const i = records.pick(MODE, questions, questions[state.index]?.id);
    if (i < 0) showDone();
    else load(i);
  }

  // 今日の分が終わったときの画面
  function showDone() {
    el.play.hidden = true;
    el.done.hidden = false;
    el.doneTitle.textContent = "今日の分はおわり！";
    el.practice.hidden = false;
    el.progress.textContent = "復習モード";
    el.stats.textContent = statsText();
    const qu = records.queue(MODE, questions);
    el.doneText.textContent = `次の復習は${records.laterText(qu.soonest)}。それまでは、ほかの勉強をしたり休んだりしよう。`;
  }

  // 絞り込んだ結果、問題が1つもないとき
  function showEmpty() {
    el.play.hidden = true;
    el.done.hidden = false;
    el.doneTitle.textContent = "このジャンルの問題はありません";
    el.doneText.textContent = "ジャンルの選び方を変えてみてね。";
    el.practice.hidden = true;
    el.progress.textContent = "";
    el.stats.textContent = "";
  }

  function start() {
    state.practice = false;
    if (!questions.length) {
      showEmpty();
      return;
    }
    const i = records.pick(MODE, questions);
    if (i < 0) showDone();
    else load(i);
  }

  // ----- 画面を作る(状態 → 見た目) -----
  function render() {
    const q = questions[state.index];

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

  window.addEventListener("resize", drawLines);

  // ----- 答え合わせ -----
  function check() {
    const q = questions[state.index];
    state.checked = true;
    render();

    const correctCount = q.items.filter((_, t) => state.pairs[t] === t).length;
    const allCorrect = correctCount === q.items.length;
    const rec = records.add(MODE, q.id, allCorrect); // 4つ全部合っていたら「正解」として記録
    showRecord(q);
    const box = el.result;
    box.replaceChildren();
    box.classList.toggle("perfect", allCorrect);
    box.append(
      make("p", "score", allCorrect ? `全問正解！ ${correctCount} / ${q.items.length}` : `${correctCount} / ${q.items.length} 正解`)
    );
    box.append(make("p", "next-review", records.nextText(rec)));

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
    el.next.textContent = state.practice && state.index + 1 >= questions.length ? "最初から" : "次の問題";
  }

  el.check.addEventListener("click", check);
  el.next.addEventListener("click", goNext);
  el.practice.addEventListener("click", () => {
    state.practice = true;
    load(0);
  });

  // ----- 外から使う窓口 -----
  window.App.match = {
    count: () => questions.length,
    // ジャンルが変わったら、問題を選び直して最初から
    refresh() {
      questions = all.filter(filter.matches);
      start();
    },
    start,
    // 非表示から表示に切り替わったら、カードの位置が変わるので線を引き直す
    shown() { drawLines(); },
  };
})();
