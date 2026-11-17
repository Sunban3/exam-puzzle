// 4択クイズモード(問題を表示して、答え合わせをする役)
(() => {
  "use strict";

  const { NUMBERS, make, sourceText, renderExtras, matchItems, records, filter } = window.App;
  const MODE = "choice";
  const session = () => window.App.sessions[MODE]; // 流れの管理役(app.js で作られる)

  const all = window.QUESTIONS || [];
  let questions = all.filter(filter.matches); // ジャンルで絞り込んだ問題

  const el = {
    tag: document.getElementById("c-tag"),
    record: document.getElementById("c-record"),
    stem: document.getElementById("c-stem"),
    extras: document.getElementById("c-extras"),
    choices: document.getElementById("c-choices"),
    result: document.getElementById("c-result"),
    next: document.getElementById("c-next"),
    source: document.getElementById("c-source"),
  };

  const state = {
    index: 0,
    picked: null,   // 選んだ選択肢の番号(まだなら null)
    entering: false,
  };

  // ----- 問題を表示する -----
  function play(i) {
    const q = questions[i];
    Object.assign(state, { index: i, picked: null, entering: true });

    el.tag.textContent = q.tag;
    el.stem.textContent = q.stem;
    el.extras.replaceChildren(renderExtras(q));
    el.source.textContent = sourceText(q);
    el.result.hidden = true;
    el.result.replaceChildren();
    el.next.hidden = true;
    showRecord(q);

    render();
  }

  function showRecord(q) {
    el.record.textContent = records.questionText(records.get(MODE, q.id));
  }

  // ----- 画面を作る(状態 → 見た目) -----
  function render() {
    const q = questions[state.index];
    const answered = state.picked !== null;

    el.choices.replaceChildren(
      ...q.choices.map((text, i) => {
        const li = make("li");
        const btn = make("button", "choice");
        btn.type = "button";
        btn.style.setProperty("--i", i);
        btn.append(make("span", "badge", NUMBERS[i]), make("span", "label", text));

        if (answered) {
          btn.disabled = true;
          if (i === q.answer) btn.classList.add("correct");
          else if (i === state.picked) btn.classList.add("wrong");
          else btn.classList.add("dim");
        }

        btn.addEventListener("click", () => answer(i));
        li.append(btn);
        return li;
      })
    );
    el.choices.classList.toggle("enter", state.entering);
    state.entering = false;
  }

  // ----- 答える -----
  function answer(i) {
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

    // あてはめデータがある問題は、ほかの選択肢が何の説明なのかも見せる
    if (q.match) {
      const list = make("div", "original");
      list.append(make("p", "original-title", "選択肢の意味"));
      matchItems(q).forEach((item, n) => {
        const row = make("p", "fix");
        row.append(make("strong", null, `${NUMBERS[n]} ${item.term}`), make("span", null, `：${item.meaning}`));
        list.append(row);
      });
      box.append(list);
    }

    box.hidden = false;
    el.next.hidden = false;
    el.next.textContent = session().isLast() ? "結果を見る" : "次の問題";
  }

  el.next.addEventListener("click", () => session().next());

  // ----- 外から使う窓口 -----
  window.App.choice = {
    questions: () => questions,
    play,
    refresh() { questions = all.filter(filter.matches); },
    shown() {},
  };
})();
