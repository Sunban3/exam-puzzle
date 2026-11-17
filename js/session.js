// 1回分の学習(セッション)の流れ
// 設定画面(何問やるか) → 問題を解く → 結果画面
// 問題の表示そのものは、各モード(player)に任せる
(() => {
  "use strict";

  const { make, storage, records } = window.App;
  const STEP = 5;
  const DEFAULT_COUNT = 15;

  // player に必要なもの:
  //   questions() … いまの絞り込みで出せる問題の配列
  //   play(i)     … i 番目の問題を表示する
  //   refresh()   … ジャンルが変わったときに問題を選び直す
  //   shown()     … 画面に表示されたとき
  function createSession({ mode, prefix, player }) {
    const $ = (name) => document.getElementById(`${prefix}-${name}`);
    const el = {
      stats: $("stats"),
      progress: $("progress"),
      setup: $("setup"),
      setupInfo: $("setup-info"),
      count: $("count"),
      minus: $("minus"),
      plus: $("plus"),
      start: $("start"),
      play: $("play"),
      summary: $("summary"),
      summaryBody: $("summary-body"),
      again: $("again"),
      back: $("back"),
    };

    const COUNT_KEY = `exam-puzzle:count:${mode}`;
    const state = {
      target: loadTarget(), // 何問やるか
      queue: [],            // 出題する問題の番号の列
      pos: 0,               // いま何問目か(0から)
      results: [],          // { q, ok } の列
    };

    function loadTarget() {
      const n = Number(storage.get(COUNT_KEY));
      return Number.isInteger(n) && n > 0 ? n : DEFAULT_COUNT;
    }

    // 選べる範囲: 最小は5問(問題がそれより少なければ全部)、最大は全問
    function limits() {
      const total = player.questions().length;
      return { min: Math.min(STEP, total), max: total };
    }

    function clampTarget() {
      const { min, max } = limits();
      state.target = Math.max(min, Math.min(max, state.target));
    }

    function statsText() {
      const qs = player.questions();
      const ids = qs.map((q) => q.id);
      return `${records.queueText(records.queue(mode, qs))}　${records.summaryText(records.summary(mode, ids))}`;
    }

    function showOnly(name) {
      el.setup.hidden = name !== "setup";
      el.play.hidden = name !== "play";
      el.summary.hidden = name !== "summary";
    }

    // ===== 設定画面 =====
    function showSetup() {
      showOnly("setup");
      el.progress.textContent = "";
      el.stats.textContent = statsText();

      const total = player.questions().length;
      if (total === 0) {
        el.count.textContent = "0問";
        el.setupInfo.textContent = "このジャンルの問題はありません。ジャンルの選び方を変えてみてね。";
        [el.minus, el.plus, el.start].forEach((b) => (b.disabled = true));
        return;
      }

      clampTarget();
      const { min, max } = limits();
      el.count.textContent = state.target >= max ? `${state.target}問（全部）` : `${state.target}問`;
      el.minus.disabled = state.target <= min;
      el.plus.disabled = state.target >= max;
      el.start.disabled = false;

      const qu = records.queue(mode, player.questions());
      const ready = qu.due + qu.fresh;
      el.setupInfo.textContent = ready >= state.target
        ? `復習 ${qu.due}問・新しい問題 ${qu.fresh}問 の中から出題します`
        : `復習と新しい問題は ${ready}問。足りない分は、次の復習が近い問題から出します`;
    }

    function changeTarget(diff) {
      state.target += diff;
      clampTarget();
      // 5の倍数にそろえる(全部を選んだときは除く)
      const { max } = limits();
      if (state.target < max) state.target = Math.max(limits().min, Math.round(state.target / STEP) * STEP);
      storage.set(COUNT_KEY, String(state.target));
      showSetup();
    }

    // ===== 解く =====
    function start() {
      state.queue = records.plan(mode, player.questions(), state.target);
      state.pos = 0;
      state.results = [];
      if (!state.queue.length) return;
      showOnly("play");
      playCurrent();
    }

    function playCurrent() {
      el.progress.textContent = `${state.pos + 1} / ${state.queue.length}問目`;
      player.play(state.queue[state.pos]);
    }

    // 各モードが「答えた」ときに呼ぶ。記録を返すので、モード側で次の復習を表示できる
    function answered(q, ok) {
      state.results.push({ q, ok });
      el.stats.textContent = statsText();
      return records.add(mode, q.id, ok);
    }

    function isLast() {
      return state.pos >= state.queue.length - 1;
    }

    function next() {
      state.pos += 1;
      if (state.pos >= state.queue.length) showSummary();
      else playCurrent();
    }

    // ===== 結果画面 =====
    function showSummary() {
      showOnly("summary");
      el.progress.textContent = "";
      el.stats.textContent = statsText();

      const total = state.results.length;
      const correct = state.results.filter((r) => r.ok).length;
      const rate = total ? Math.round((correct / total) * 100) : 0;

      // ジャンルごとに集計
      const byTag = new Map();
      state.results.forEach(({ q, ok }) => {
        const t = byTag.get(q.tag) || { tag: q.tag, total: 0, correct: 0 };
        t.total += 1;
        if (ok) t.correct += 1;
        byTag.set(q.tag, t);
      });
      // 正解率が低い順(同じなら問題数が多い順)
      const tags = [...byTag.values()]
        .map((t) => ({ ...t, rate: t.correct / t.total }))
        .sort((a, b) => a.rate - b.rate || b.total - a.total);

      const nodes = [];

      // 全体の正解率
      const head = make("div", "summary-head");
      head.style.setProperty("--rate", `${rate}%`);
      head.append(
        make("p", "summary-label", "今日の正解率"),
        make("p", "summary-rate", `${rate}%`),
        make("p", "summary-count", `${total}問中 ${correct}問 正解`)
      );
      nodes.push(head);

      // 苦手ジャンル(いちばん正解率が低いもの。同じ率なら全部)
      const lowest = tags.length ? tags[0].rate : 1;
      const weak = tags.filter((t) => t.rate === lowest);
      if (lowest < 1) {
        const names = weak.map((t) => `${t.tag.split("：").pop()}（${t.correct}/${t.total}）`);
        nodes.push(make("p", "summary-weak", `今日の苦手ジャンル：${names.join("・")}`));
      } else if (total) {
        nodes.push(make("p", "summary-perfect", "全ジャンル全問正解！"));
      }

      // ジャンル別の成績
      const table = make("div", "genre-list");
      table.append(make("p", "summary-section", "ジャンル別の成績"));
      tags.forEach((t) => {
        const row = make("div", "genre-row");
        row.style.setProperty("--rate", `${Math.round(t.rate * 100)}%`);
        if (t.rate < 0.6) row.classList.add("low");
        row.append(
          make("span", "genre-name", t.tag.split("：").pop()),
          make("span", "genre-bar"),
          make("span", "genre-score", `${t.correct}/${t.total}`)
        );
        table.append(row);
      });
      nodes.push(table);

      // 間違えた問題
      const wrong = state.results.filter((r) => !r.ok);
      if (wrong.length) {
        const list = make("div", "wrong-list");
        list.append(make("p", "summary-section", `間違えた問題（${wrong.length}問）`));
        wrong.forEach(({ q }) => {
          const item = make("p", "wrong-item");
          const stem = q.stem.split("\n")[0];
          item.append(
            make("span", "wrong-tag", q.tag.split("：").pop()),
            make("span", null, stem.length > 60 ? `${stem.slice(0, 60)}…` : stem)
          );
          list.append(item);
        });
        list.append(make("p", "wrong-note", "間違えた問題は、次の学習のときに優先して出ます"));
        nodes.push(list);
      }

      el.summaryBody.replaceChildren(...nodes);
    }

    el.minus.addEventListener("click", () => changeTarget(-STEP));
    el.plus.addEventListener("click", () => changeTarget(STEP));
    el.start.addEventListener("click", start);
    el.again.addEventListener("click", start);
    el.back.addEventListener("click", showSetup);

    return {
      answered,
      next,
      isLast,
      // ジャンルが変わったら、問題を選び直して設定画面へ
      refresh() {
        player.refresh();
        showSetup();
      },
      shown() {
        if (!el.play.hidden) player.shown();
      },
      showSetup,
    };
  }

  window.App.createSession = createSession;
})();
