// 4択クイズモード
(() => {
  "use strict";

  const { NUMBERS, make, sourceText, renderExtras, matchItems, records } = window.App;
  const MODE = "choice";
  const questions = window.QUESTIONS || [];

  const el = {
    progress: document.getElementById("c-progress"),
    tag: document.getElementById("c-tag"),
    stem: document.getElementById("c-stem"),
    extras: document.getElementById("c-extras"),
    choices: document.getElementById("c-choices"),
    result: document.getElementById("c-result"),
    next: document.getElementById("c-next"),
    source: document.getElementById("c-source"),
    stats: document.getElementById("c-stats"),
    record: document.getElementById("c-record"),
  };

  const state = {
    index: 0,
    picked: null,   // 選んだ選択肢の番号(まだなら null)
    entering: false,
  };

  // ----- 問題を読み込む -----
  function load(i) {
    const q = questions[i];
    Object.assign(state, { index: i, picked: null, entering: true });

    el.progress.textContent = `${i + 1} / ${questions.length}`;
    el.tag.textContent = q.tag;
    el.stem.textContent = q.stem;
    el.extras.replaceChildren(renderExtras(q));
    el.source.textContent = sourceText(q);
    showRecord(q);
    el.result.hidden = true;
    el.result.replaceChildren();
    el.next.hidden = true;

    render();
  }

  // ----- 学習記録の表示 -----
  function showRecord(q) {
    el.record.textContent = records.questionText(records.get(MODE, q.id));
    el.stats.textContent = records.summaryText(records.summary(MODE, questions.map((x) => x.id)));
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
    records.add(MODE, q.id, ok);
    showRecord(q);
    const box = el.result;
    box.replaceChildren();
    box.classList.toggle("perfect", ok);
    box.append(make("p", "score", ok ? "正解！" : `不正解… 正解は ${NUMBERS[q.answer]}`));

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
    el.next.textContent = state.index + 1 < questions.length ? "次の問題" : "最初から";
  }

  el.next.addEventListener("click", () => load((state.index + 1) % questions.length));

  window.App.choice = {
    count: questions.length,
    start() { if (questions.length) load(0); },
    shown() {},
  };
})();
