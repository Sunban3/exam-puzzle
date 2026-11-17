// 科目Bモード(長文・擬似言語の問題を、タイマーつきで解く役)
(() => {
  "use strict";

  const { NUMBERS, make, sourceText, renderExtras, renderChoices, records, storage } = window.App;
  const MODE = "kamokuB";
  const TIMER_KEY = "exam-puzzle:timer";
  const TIMER_CHOICES = [5, 7, 10]; // 選べる分数(本番のペースは1問5分)
  const session = () => window.App.sessions[MODE];

  // 科目Bの問題は、4択とは別の入れ物(window.KAMOKU_B)に入っている
  const questions = window.KAMOKU_B || [];

  const el = {
    tag: document.getElementById("b-tag"),
    record: document.getElementById("b-record"),
    title: document.getElementById("b-title"),
    stem: document.getElementById("b-stem"),
    extras: document.getElementById("b-extras"),
    choices: document.getElementById("b-choices"),
    memo: document.getElementById("b-memo"),
    result: document.getElementById("b-result"),
    next: document.getElementById("b-next"),
    source: document.getElementById("b-source"),
    timer: document.getElementById("b-timer"),
    timerChoices: document.getElementById("b-timer-choices"),
    code: document.getElementById("b-code"),
    traceBox: document.getElementById("b-trace-box"),
    desk: document.getElementById("b-desk"),
    play: document.getElementById("b-play"),
  };

  // プログラムを「触れる」表示にする部品(trace.js)
  const trace = window.App.createTrace({
    codeEl: el.code,
    tableEl: document.getElementById("b-trace"),
  });

  const state = {
    index: 0,
    picked: null,
    entering: false,
    minutes: loadMinutes(), // 1問あたりの制限時間(分)
    startedAt: 0,           // 問題を表示した時刻(ミリ秒)
    tick: null,             // setInterval の番号
  };

  // ===== タイマーの設定 =====
  function loadMinutes() {
    const n = Number(storage.get(TIMER_KEY));
    return TIMER_CHOICES.includes(n) ? n : 10; // 保存値を疑い、知っている値だけ使う
  }

  function renderTimerChoices() {
    el.timerChoices.replaceChildren(
      ...TIMER_CHOICES.map((m) => {
        const btn = make("button", "chip", m === 5 ? `${m}分（本番ペース）` : `${m}分`);
        btn.type = "button";
        btn.setAttribute("aria-pressed", String(m === state.minutes));
        btn.addEventListener("click", () => {
          state.minutes = m;
          storage.set(TIMER_KEY, String(m));
          renderTimerChoices();
        });
        return btn;
      })
    );
  }

  // ===== タイマー本体 =====
  // 1秒ごとに「始めた時刻からの経過時間」を計算し直す
  // (1秒ずつ数を引いていく方式だと、タブが裏にあるときにずれるため)
  function elapsedSeconds() {
    return Math.floor((Date.now() - state.startedAt) / 1000);
  }

  function formatClock(sec) {
    const m = Math.floor(sec / 60);
    const s = String(sec % 60).padStart(2, "0");
    return `${m}:${s}`;
  }

  function updateTimer() {
    const limit = state.minutes * 60;
    const left = limit - elapsedSeconds();
    el.timer.classList.toggle("warn", left <= 60 && left > 0);
    el.timer.classList.toggle("over", left <= 0);
    el.timer.textContent = left > 0 ? `残り ${formatClock(left)}` : `時間オーバー +${formatClock(-left)}`;
  }

  function startTimer() {
    stopTimer();
    state.startedAt = Date.now();
    updateTimer();
    state.tick = setInterval(updateTimer, 1000);
  }

  function stopTimer() {
    if (state.tick !== null) clearInterval(state.tick);
    state.tick = null;
  }

  // ===== 問題を表示する =====
  function play(i) {
    const q = questions[i];
    Object.assign(state, { index: i, picked: null, entering: true });

    el.tag.textContent = q.tag;
    el.title.textContent = q.title || "";
    el.stem.textContent = q.stem;
    // プログラムは trace が「タップできる形」で表示するので、renderExtras からは外す
    el.extras.replaceChildren(renderExtras({ ...q, code: undefined }));
    const hasCode = Boolean(q.code);
    el.code.hidden = !hasCode;
    el.traceBox.hidden = !hasCode;
    trace.reset(q.code); // 変数・トレース表・いまここ印を白紙に戻す
    el.source.textContent = sourceText(q);
    el.memo.value = ""; // メモは問題ごとに白紙から
    el.result.hidden = true;
    el.result.replaceChildren();
    el.next.hidden = true;
    el.record.textContent = records.questionText(records.get(MODE, q.id));

    render();
    startTimer();
    // 前の問題で下までスクロールしていても、問題の最初から読めるように戻す
    el.desk.scrollTop = 0;
    if (el.play.getBoundingClientRect().top < 0) el.play.scrollIntoView({ block: "start" });
  }

  function render() {
    const q = questions[state.index];
    renderChoices(el.choices, q, { picked: state.picked, onPick: answer, entering: state.entering });
    state.entering = false;
  }

  // ===== 答える =====
  function answer(i) {
    if (state.picked !== null) return;
    const q = questions[state.index];
    state.picked = i;
    stopTimer();
    render();

    const seconds = elapsedSeconds();
    const over = seconds > state.minutes * 60;
    const ok = i === q.answer;
    const rec = session().answered(q, ok, { seconds, over });
    el.record.textContent = records.questionText(rec);

    const box = el.result;
    box.replaceChildren();
    box.classList.toggle("perfect", ok);
    box.append(
      make("p", "score", ok ? "正解！" : `不正解… 正解は ${NUMBERS[q.answer]}`),
      make("p", over ? "time-used over" : "time-used",
        `かかった時間 ${formatClock(seconds)}（目安 ${state.minutes}分${over ? "・オーバー" : "以内"}）`),
      session().reviewBox(q, rec)
    );

    // 解き方のポイント(データにあれば)
    if (q.point) {
      const tip = make("div", "original");
      tip.append(make("p", "original-title", "解き方のポイント"), make("p", "point", q.point));
      box.append(tip);
    }

    box.hidden = false;
    el.next.hidden = false;
    el.next.textContent = session().isLast() ? "結果を見る" : "次の問題";
  }

  el.next.addEventListener("click", () => session().next());
  renderTimerChoices();

  // ===== 外から使う窓口 =====
  window.App.kamokuB = {
    questions: () => questions,
    count: () => questions.length,
    emptyText: "科目Bの問題データがまだありません。",
    countStep: 1,    // 1問に5〜10分かかるので、1問ずつ選べるようにする
    defaultCount: 3, // 最初は3問(10分なら30分)
    play,
    refresh() {}, // ジャンルの絞り込みは、科目Bには使わない
    // ほかのタブを見ている間も時間は進む(本番と同じ)。タイマーは時刻で計算しているので、戻ればそのまま正しい残り時間が出る
    shown() {},
  };
})();
