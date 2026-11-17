// 1回分の学習(セッション)の流れ
// 設定画面(何問やるか) → 問題を解く → 結果画面
// 問題の表示そのものは、各モード(player)に任せる
(() => {
  "use strict";

  const { make, storage, records, notes } = window.App;
  const STEP = 5;
  const DEFAULT_COUNT = 15;
  const CALC_EVERY = 5; // 計算問題を何問ごとに入れるか

  // player に必要なもの:
  //   questions() … いまの絞り込みで出せる問題の配列
  //   play(i)     … i 番目の問題を表示する
  //   refresh()   … ジャンルが変わったときに問題を選び直す
  //   shown()     … 画面に表示されたとき
  //   calcIsExtra … true なら、計算問題は「5問に1回」のときだけ出す(オフなら出さない)
  //   emptyText   … 問題が1つもないときに設定画面に出す文(なければ、ジャンルの案内)
  //   countStep   … ＋−ボタンで何問ずつ増減するか(なければ5)
  //   defaultCount… 最初の問題数(なければ15)
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
      calcRow: $("calc-row"),
      calc: $("calc"),
      play: $("play"),
      summary: $("summary"),
      summaryBody: $("summary-body"),
      again: $("again"),
      back: $("back"),
    };

    // 何問ずつ増減するか・最初は何問か(モードごとに変えられる)
    const step = player.countStep || STEP;
    const defaultCount = player.defaultCount || DEFAULT_COUNT;
    const COUNT_KEY = `exam-puzzle:count:${mode}`;
    const CALC_KEY = `exam-puzzle:calc:${mode}`;
    const state = {
      target: loadTarget(), // 何問やるか
      calcOn: storage.get(CALC_KEY) !== "off", // 計算問題を5問ごとに入れるか(最初はオン)
      queue: [],            // 出題する問題の番号の列
      pos: 0,               // いま何問目か(0から)
      results: [],          // { q, ok, seconds?, over? } の列(seconds はかかった秒数)
    };

    function loadTarget() {
      const n = Number(storage.get(COUNT_KEY));
      return Number.isInteger(n) && n > 0 ? n : defaultCount;
    }

    // 出せる問題の中に計算問題があるか(なければ設定を出さない)
    function hasCalc() {
      return player.questions().some((q) => q.calc);
    }

    // いまの設定で出せる問題の数
    function available() {
      const qs = player.questions();
      if (player.calcIsExtra && !(state.calcOn && hasCalc())) return qs.filter((q) => !q.calc).length;
      return qs.length;
    }

    // 選べる範囲: 最小は5問(問題がそれより少なければ全部)、最大は全問
    function limits() {
      const total = available();
      return { min: Math.min(step, total), max: total };
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

      const total = available();
      if (total === 0) {
        el.count.textContent = "0問";
        el.setupInfo.textContent = player.emptyText || "このジャンルの問題はありません。ジャンルの選び方を変えてみてね。";
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
      const quota = records.newQuota(state.target, qu.fresh);
      el.setupInfo.textContent = ready >= state.target
        ? `復習 ${qu.due}問・新しい問題 ${qu.fresh}問 の中から出題します` +
          (quota && qu.due > state.target - quota ? `（新しい問題を${quota}問は必ず入れます）` : "")
        : `復習と新しい問題は ${ready}問。足りない分は、次の復習が近い問題から出します`;

      el.calcRow.hidden = !hasCalc();
      el.calc.checked = state.calcOn;
    }

    function changeTarget(diff) {
      state.target += diff;
      clampTarget();
      // step の倍数にそろえる(全部を選んだときは除く)
      const { max } = limits();
      if (state.target < max) state.target = Math.max(limits().min, Math.round(state.target / step) * step);
      storage.set(COUNT_KEY, String(state.target));
      showSetup();
    }

    // ===== 解く =====
    function start() {
      const calcEvery = state.calcOn && hasCalc() ? CALC_EVERY : 0;
      const skipCalc = Boolean(player.calcIsExtra) && !calcEvery;
      state.queue = records.plan(mode, player.questions(), state.target, { calcEvery, skipCalc });
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
    // extra には、タイマーがあるモードなら { seconds, over } を入れる
    function answered(q, ok, extra = {}) {
      state.results.push({ q, ok, ...extra });
      el.stats.textContent = statsText();
      return records.add(mode, q.id, ok);
    }

    // 答えたあとに出す「次の復習」と「振り返りメモ」の欄
    // 正解したときだけ「自信あり／たまたま」を選べる。何も押さなければ「自信あり」
    // 振り返りメモは、間違えたときは最初から開いておく
    function reviewBox(q, rec) {
      const box = make("div", "review-box");
      const text = make("p", "next-review", records.nextText(rec));
      box.append(text);
      const result = state.results[state.results.length - 1];
      const note = notes.editor(q, { open: !result?.ok });
      if (!result || !result.ok) {
        box.append(note);
        return box;
      }

      const row = make("div", "sure-row");
      row.append(make("span", "sure-label", "この正解、自信ある？"));
      const buttons = [
        { unsure: false, label: "自信あり" },
        { unsure: true, label: "たまたま" },
      ].map(({ unsure, label }) => {
        const btn = make("button", "chip", label);
        btn.type = "button";
        btn.addEventListener("click", () => {
          const updated = records.setUnsure(mode, q.id, unsure);
          result.unsure = unsure;                       // 結果画面の一覧用
          text.textContent = records.nextText(updated); // 次の復習の日をその場で書き換える
          if (unsure) note.open = true;                 // たまたまなら、理由を書きやすいように開く
          paint();
        });
        return { btn, unsure };
      });
      // 押されている方のボタンを、色つきにする
      function paint() {
        buttons.forEach(({ btn, unsure }) => btn.setAttribute("aria-pressed", String(Boolean(result.unsure) === unsure)));
      }
      paint();
      row.append(...buttons.map((b) => b.btn));
      box.append(row, note);
      return box;
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

      // かかった時間(タイマーがあるモードだけ)
      const timed = state.results.filter((r) => typeof r.seconds === "number");
      if (timed.length) nodes.push(timeSection(timed));

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

      // 間違えた問題・たまたま正解した問題
      const wrong = state.results.filter((r) => !r.ok);
      if (wrong.length) {
        nodes.push(questionList(`間違えた問題（${wrong.length}問）`, wrong, "間違えた問題は、次の学習のときに優先して出ます"));
      }
      const lucky = state.results.filter((r) => r.ok && r.unsure);
      if (lucky.length) {
        nodes.push(questionList(`たまたま正解した問題（${lucky.length}問）`, lucky, "明日また出ます。今のうちに解説を読み直しておこう"));
      }

      el.summaryBody.replaceChildren(...nodes);
    }

    // 結果画面の問題一覧(ジャンル名と、問題の最初の60文字)
    function questionList(title, results, note) {
      const list = make("div", "wrong-list");
      list.append(make("p", "summary-section", title));
      results.forEach(({ q }) => {
        const item = make("p", "wrong-item");
        const stem = q.title || q.stem.split("\n")[0]; // 科目Bは長文なので、短い名前を使う
        item.append(
          make("span", "wrong-tag", q.tag.split("：").pop()),
          make("span", null, stem.length > 60 ? `${stem.slice(0, 60)}…` : stem)
        );
        list.append(item);
      });
      list.append(make("p", "wrong-note", note));
      return list;
    }

    // 秒数を「4分12秒」の形にする
    function formatTime(sec) {
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return m ? `${m}分${s}秒` : `${s}秒`;
    }

    function timeSection(timed) {
      const box = make("div", "time-list");
      const avg = Math.round(timed.reduce((sum, r) => sum + r.seconds, 0) / timed.length);
      const overCount = timed.filter((r) => r.over).length;
      box.append(
        make("p", "summary-section", "かかった時間"),
        make("p", overCount ? "time-total over" : "time-total",
          `1問平均 ${formatTime(avg)}　時間オーバー ${overCount}問`)
      );
      timed.forEach(({ q, ok, seconds, over }, i) => {
        const row = make("p", "time-row");
        if (over) row.classList.add("over");
        row.append(
          make("span", "time-no", `${i + 1}問目`),
          make("span", ok ? "time-mark ok" : "time-mark ng", ok ? "○" : "×"),
          make("span", "time-name", q.title || q.stem.split("\n")[0].slice(0, 30)),
          make("span", "time-sec", formatTime(seconds) + (over ? "（オーバー）" : ""))
        );
        box.append(row);
      });
      return box;
    }

    el.calc.addEventListener("change", () => {
      state.calcOn = el.calc.checked;
      storage.set(CALC_KEY, state.calcOn ? "on" : "off");
      showSetup(); // 出せる問題数が変わることがあるので、表示を更新
    });
    el.minus.addEventListener("click", () => changeTarget(-step));
    el.plus.addEventListener("click", () => changeTarget(step));
    el.start.addEventListener("click", start);
    el.again.addEventListener("click", start);
    el.back.addEventListener("click", showSetup);

    return {
      answered,
      reviewBox,
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
