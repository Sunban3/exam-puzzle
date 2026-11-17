// 計算問題のテクニック(ヒントと解き方)を表示する部品
// データは data/techniques.js(window.TECHNIQUES と window.TECHNIQUE_FOR)
(() => {
  "use strict";

  const { make } = window.App;
  const TECHNIQUES = window.TECHNIQUES || {};
  const FOR = window.TECHNIQUE_FOR || {};

  // 問題に使うテクニック(なければ null)
  function of(q) {
    const use = FOR[q.id];
    const tech = use && TECHNIQUES[use.tech];
    return tech ? { key: use.tech, ...tech, hint: use.hint, steps: use.steps } : null;
  }

  // 答える前：押すと開くヒント(テクニックの名前と、考え方の入り口だけ)
  function showHint(container, q) {
    const t = of(q);
    container.hidden = !t;
    if (!t) {
      container.replaceChildren();
      return;
    }
    const box = make("details", "tech-hint");
    const body = make("div", "tech-hint-body");
    body.append(make("p", "tech-name", t.name), make("p", null, t.hint));
    box.append(make("summary", null, "ヒント：使えるテクニックを見る"), body);
    container.replaceChildren(box);
  }

  // 答えたあと：テクニックを使った解き方
  // 手順(steps)があれば番号つきで、なければ問題データの「解き方のポイント」(point)を出す
  function explain(q) {
    const t = of(q);
    if (!t) return null;
    const box = make("div", "original tech-explain");
    box.append(make("p", "original-title", "解き方のテクニック"), make("p", "tech-name", t.name));
    if (t.steps?.length) {
      const steps = make("ol", "tech-steps");
      t.steps.forEach((s) => steps.append(make("li", null, s)));
      box.append(steps);
    } else if (q.point) {
      box.append(make("p", "point", q.point));
    }
    box.append(make("p", "tech-lesson", `ほかの問題でも：${t.lesson}`));
    return box;
  }

  window.App.technique = { of, showHint, explain, TECHNIQUES, FOR };
})();
