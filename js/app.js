(() => {
  "use strict";

  // ===== 1. 準備 =====================================================
  const questions = window.QUESTIONS || [];
  const NUMBERS = ["1", "2", "3", "4", "5", "6"];
  const SVG_NS = "http://www.w3.org/2000/svg";
  const MODE_KEY = "exam-puzzle:mode";
  const HINTS = {
    line: "選択肢をタップしてから、正しい説明をタップしよう",
    sort: "説明をドラッグして、となりの選択肢と合うように並べ替えよう(タップで2つを入れ替えることもできる)",
  };

  // よく使う画面の部品を、最初にまとめて取っておく
  const el = {
    mode: document.getElementById("mode"),
    progress: document.getElementById("progress"),
    tag: document.getElementById("tag"),
    stem: document.getElementById("stem"),
    hint: document.getElementById("hint"),
    board: document.getElementById("board"),
    lines: document.getElementById("lines"),
    terms: document.getElementById("terms"),
    meanings: document.getElementById("meanings"),
    result: document.getElementById("result"),
    check: document.getElementById("check"),
    next: document.getElementById("next"),
    source: document.getElementById("source"),
  };

  // ===== 2. 状態(いま画面がどうなっているか) =========================
  const state = {
    mode: loadMode(),  // "line"(線でつなぐ) か "sort"(並び替え)
    index: 0,          // 何問目か
    meaningOrder: [],  // 説明の並び順(items の番号)
    pairs: {},         // { 選択肢の番号: 説明の番号 }
    selectedTerm: null,// 線モード: いま選んでいる選択肢
    swapPick: null,    // 並び替えモード: タップで選んだ行
    justPaired: null,  // 線モード: たったいまつないだ選択肢
    justMoved: [],     // 並び替えモード: たったいま入れ替えた行(2つ)
    checked: false,    // 答え合わせ済みか
    entering: false,   // 問題を開いた直後か(登場アニメ用)
  };

  // ===== 3. 小さな道具 ===============================================
  function shuffle(array) {
    const a = array.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // 文字は必ず textContent で入れる(innerHTML は使わない = XSS対策)
  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  const colorOf = (t) => `var(--c${(t % 4) + 1})`;

  function ownerOf(meaningIndex) {
    const found = Object.keys(state.pairs).find((t) => state.pairs[t] === meaningIndex);
    return found === undefined ? null : Number(found);
  }

  // 並び替えモードでは「同じ行にあるもの同士」がペアになる
  function syncPairsFromOrder() {
    state.pairs = {};
    state.meaningOrder.forEach((m, row) => { state.pairs[row] = m; });
  }

  // ブラウザに保存(使えない環境でもエラーで止まらないように try/catch)
  function loadMode() {
    try {
      const saved = localStorage.getItem(MODE_KEY);
      return saved === "sort" ? "sort" : "line";
    } catch {
      return "line";
    }
  }
  function saveMode(mode) {
    try { localStorage.setItem(MODE_KEY, mode); } catch { /* 保存できなくても遊べる */ }
  }

  // ===== 4. 問題を読み込む ===========================================
  function load(i, { shuffleAgain = true } = {}) {
    const q = questions[i];
    Object.assign(state, {
      index: i,
      meaningOrder: shuffleAgain ? shuffle(q.items.map((_, n) => n)) : state.meaningOrder,
      pairs: {},
      selectedTerm: null,
      swapPick: null,
      justPaired: null,
      justMoved: [],
      checked: false,
    });
    if (state.mode === "sort") syncPairsFromOrder();

    el.progress.textContent = `${i + 1} / ${questions.length}`;
    el.tag.textContent = q.tag;
    el.stem.textContent = q.stem;
    el.hint.textContent = HINTS[state.mode];
    el.source.textContent = q.source;
    el.result.hidden = true;
    el.result.replaceChildren();
    el.next.hidden = true;
    el.check.hidden = false;

    state.entering = true; // 次の render だけ、カードが下から出てくるアニメをつける
    render();
  }

  // ===== 5. 画面を作る(状態 → 見た目) ================================
  function render() {
    const q = questions[state.index];
    const sort = state.mode === "sort";

    el.mode.querySelectorAll("button").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.mode === state.mode));
    });

    el.terms.replaceChildren(...q.items.map((item, t) => termCard(item, t)));
    el.meanings.replaceChildren(
      ...state.meaningOrder.map((m, row) => (sort ? sortCard(q, m, row) : meaningCard(q, m, row)))
    );
    el.check.disabled = Object.keys(state.pairs).length !== q.items.length;
    el.board.classList.toggle("mode-sort", sort);
    el.board.classList.toggle("enter", state.entering);
    state.entering = false;
    el.board.classList.toggle("picking", !sort && state.selectedTerm !== null);

    if (sort) {
      el.lines.replaceChildren();
      equalizeRows();
    } else {
      el.board.style.removeProperty("--row-h");
      drawLines();
    }
    state.justPaired = null;
    state.justMoved = [];
  }

  function termCard(item, t) {
    const li = make("li");
    const btn = make("button", "card term");
    btn.type = "button";
    btn.dataset.term = t;
    btn.style.setProperty("--pair", colorOf(t));
    btn.style.setProperty("--i", t);
    btn.append(make("span", "badge", NUMBERS[t]), make("span", "label", item.term));

    if (state.mode === "sort") {
      btn.classList.add("static");
      btn.tabIndex = -1;
    } else {
      if (state.selectedTerm === t) btn.classList.add("selected");
      if (state.pairs[t] !== undefined) btn.classList.add("paired");
      btn.addEventListener("click", () => {
        state.selectedTerm = state.selectedTerm === t ? null : t;
        render();
      });
    }
    if (state.checked) {
      btn.classList.add(state.pairs[t] === t ? "correct" : "wrong");
      btn.disabled = true;
    }
    li.append(btn);
    return li;
  }

  // --- 線モードの説明カード ---
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
        btn.classList.add("nudge"); // 先に選択肢を選んでね、の合図
        return;
      }
      if (owner !== null) delete state.pairs[owner]; // 前のつながりを外す
      state.pairs[state.selectedTerm] = m;
      state.justPaired = state.selectedTerm;
      state.selectedTerm = null;
      render();
    });
    li.append(btn);
    return li;
  }

  // --- 並び替えモードの説明カード ---
  function sortCard(q, m, row) {
    const li = make("li");
    const btn = make("button", "card meaning sortable");
    btn.type = "button";
    btn.dataset.meaning = m;
    btn.style.setProperty("--i", row);
    btn.style.setProperty("--pair", colorOf(row));
    btn.append(
      make("span", "badge", NUMBERS[row]),
      make("span", "label", q.items[m].meaning),
      make("span", "grip", "⋮⋮")
    );
    if (state.swapPick === row) btn.classList.add("selected");
    if (state.justMoved.includes(row)) btn.classList.add("pop");

    if (state.checked) {
      btn.classList.add(m === row ? "correct" : "wrong");
      btn.disabled = true;
    } else {
      btn.addEventListener("pointerdown", (e) => startDrag(e, row, btn));
      // キーボード(Enter/Space)で押されたときだけ click で入れ替え
      btn.addEventListener("click", (e) => { if (e.detail === 0) tapRow(row); });
    }
    li.append(btn);
    return li;
  }

  // 並び替えモードで、左右のカードの高さをそろえる
  function equalizeRows() {
    el.board.style.removeProperty("--row-h");
    const cards = el.board.querySelectorAll(".card");
    let max = 0;
    cards.forEach((c) => { max = Math.max(max, c.offsetHeight); });
    el.board.style.setProperty("--row-h", `${max}px`);
  }

  // ===== 6. 並び替え(ドラッグ) =======================================
  let drag = null;

  function startDrag(e, row, node) {
    if (state.checked || e.button > 0) return;
    const items = [...el.meanings.querySelectorAll(".card")];
    const step = items.length > 1
      ? items[1].getBoundingClientRect().top - items[0].getBoundingClientRect().top
      : 0;
    drag = { row, node, items, step, startY: e.clientY, target: row, moved: false };
    node.setPointerCapture(e.pointerId);
    node.addEventListener("pointermove", onDragMove);
    node.addEventListener("pointerup", endDrag, { once: true });
    node.addEventListener("pointercancel", endDrag, { once: true });
  }

  function onDragMove(e) {
    if (!drag) return;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.abs(dy) < 6) return; // 少し動いただけならタップ扱い
    drag.moved = true;
    drag.node.classList.add("dragging");
    drag.node.style.transform = `translateY(${dy}px) scale(1.03)`;

    const last = drag.items.length - 1;
    drag.target = Math.min(last, Math.max(0, drag.row + Math.round(dy / drag.step)));

    // 落とす先のカードだけを、元の場所へ逃がして見せる(ほかは動かさない)
    drag.items.forEach((item, i) => {
      if (i === drag.row) return;
      if (i === drag.target) {
        item.style.transform = `translateY(${(drag.row - i) * drag.step}px)`;
        item.classList.add("swap-target");
      } else {
        item.style.transform = "";
        item.classList.remove("swap-target");
      }
    });
  }

  function endDrag() {
    if (!drag) return;
    const { row, node, target, moved } = drag;
    node.removeEventListener("pointermove", onDragMove);
    drag = null;

    if (!moved) {
      tapRow(row);
      return;
    }
    swapRows(row, target);
    render();
  }

  // 2つの行の説明を入れ替える(ドラッグもタップもここを使う)
  function swapRows(a, b) {
    state.swapPick = null;
    if (a === b) return;
    const order = state.meaningOrder.slice();
    [order[a], order[b]] = [order[b], order[a]];
    state.meaningOrder = order;
    state.justMoved = [a, b];
    syncPairsFromOrder();
  }

  // タップで2つの行を入れ替える
  function tapRow(row) {
    if (state.swapPick === null) {
      state.swapPick = row;
    } else if (state.swapPick === row) {
      state.swapPick = null;
    } else {
      swapRows(state.swapPick, row);
    }
    render();
  }

  // ===== 7. 線を引く(線モード) =======================================
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
      rubber.id = "rubber";
      rubber.classList.add("rubber");
      rubber.style.setProperty("--pair", colorOf(state.selectedTerm));
      el.lines.append(rubber);
    }
  }

  el.board.addEventListener("pointermove", (e) => {
    const rubber = document.getElementById("rubber");
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
    if (state.mode === "sort") equalizeRows();
    else drawLines();
  });

  // ===== 8. 答え合わせ ===============================================
  function check() {
    const q = questions[state.index];
    state.checked = true;
    render();

    const correctCount = q.items.filter((_, t) => state.pairs[t] === t).length;
    const allCorrect = correctCount === q.items.length;
    const box = el.result;
    box.replaceChildren();
    box.classList.toggle("perfect", allCorrect);
    box.append(
      make("p", "score", allCorrect ? `全問正解！ ${correctCount} / ${q.items.length}` : `${correctCount} / ${q.items.length} 正解`)
    );

    q.items.forEach((item, t) => {
      if (state.pairs[t] === t) return;
      const row = make("p", "fix");
      row.append(make("strong", null, `${NUMBERS[t]} ${item.term}`), make("span", null, `：${item.meaning}`));
      box.append(row);
    });

    if (typeof q.answer === "number") {
      const ans = make("div", "original");
      ans.append(
        make("p", "original-title", "もとの4択問題の答え"),
        make("p", null, q.stem),
        make("p", "original-answer", `${NUMBERS[q.answer]} ${q.items[q.answer].term}`)
      );
      box.append(ans);
    }

    box.hidden = false;
    el.check.hidden = true;
    el.next.hidden = false;
    el.next.textContent = state.index + 1 < questions.length ? "次の問題" : "最初から";
  }

  // ===== 9. スタート =================================================
  el.mode.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-mode]");
    if (!btn || btn.dataset.mode === state.mode) return;
    state.mode = btn.dataset.mode;
    saveMode(state.mode);
    load(state.index, { shuffleAgain: false }); // 同じ問題・同じ並びのままモードだけ切り替え
  });
  el.check.addEventListener("click", check);
  el.next.addEventListener("click", () => load((state.index + 1) % questions.length));

  if (questions.length === 0) {
    el.stem.textContent = "問題データがありません。";
  } else {
    load(0);
  }
})();
