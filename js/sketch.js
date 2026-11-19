// 手書きメモ(iPad の Apple Pencil・マウス・指で書ける)
// メモ欄に「文字／手書き」の切り替えをつける。どちらを使うかは端末ごとに覚えておく
(() => {
  "use strict";

  const { make, storage } = window.App;
  const MODE_KEY = "exam-puzzle:memo-mode"; // "text" か "draw"
  const HEIGHTS = [240, 480];               // 手書きの欄の高さ(ふつう・広げた)
  const COLORS = { ink: "--text", red: "--ng" }; // 色はCSSの変数から取る(ダークモードでも見える色になる)

  let mode = storage.get(MODE_KEY) === "draw" ? "draw" : "text"; // 保存値を疑う
  const pads = []; // 作った手書き欄(切り替えを全部の欄にそろえるため)

  // memoBox … メモ欄の入れ物、textarea … 文字のメモ
  function attach(memoBox, textarea) {
    const state = {
      strokes: [],      // 書いた線 [{ tool, color, points: [{x, y, w}] }]
      current: null,    // 書いている途中の線
      tool: "pen",      // "pen" か "eraser"
      color: "ink",
      penSeen: false,   // 一度でもペンを使ったら、指や手のひらでは書かない
      tall: false,
    };

    // ----- 切り替え(文字／手書き) -----
    const switcher = make("div", "memo-switch");
    switcher.setAttribute("role", "group");
    switcher.setAttribute("aria-label", "メモの書き方");
    const btnText = make("button", "chip", "文字");
    const btnDraw = make("button", "chip", "手書き");
    [btnText, btnDraw].forEach((b) => (b.type = "button"));
    btnText.addEventListener("click", () => setMode("text"));
    btnDraw.addEventListener("click", () => setMode("draw"));
    switcher.append(btnText, btnDraw);
    memoBox.querySelector(".memo-title").after(switcher);

    // ----- 手書きの欄 -----
    const wrap = make("div", "sketch");
    const tools = make("div", "sketch-tools");
    const toolBtn = (label, onClick, extra) => {
      const b = make("button", extra ? `sketch-btn ${extra}` : "sketch-btn", label);
      b.type = "button";
      b.addEventListener("click", onClick);
      tools.append(b);
      return b;
    };
    const penInk = toolBtn("ペン", () => choose("pen", "ink"), "ink");
    const penRed = toolBtn("赤ペン", () => choose("pen", "red"), "red");
    const eraser = toolBtn("消しゴム", () => choose("eraser"));
    toolBtn("1つ戻す", () => {
      state.strokes.pop();
      redraw();
    });
    toolBtn("全部消す", clear);
    const grow = toolBtn("広げる", () => {
      state.tall = !state.tall;
      grow.textContent = state.tall ? "せまくする" : "広げる";
      resize();
    });

    const canvas = make("canvas", "sketch-canvas");
    canvas.setAttribute("aria-label", "手書きメモ");
    const ctx = canvas.getContext("2d");
    const hint = make("p", "sketch-hint", "Apple Pencil で書くと、手のひらが触れても線は引かれません");
    wrap.append(tools, canvas, hint);
    textarea.after(wrap);

    function choose(tool, color) {
      state.tool = tool;
      if (color) state.color = color;
      penInk.setAttribute("aria-pressed", String(tool === "pen" && state.color === "ink"));
      penRed.setAttribute("aria-pressed", String(tool === "pen" && state.color === "red"));
      eraser.setAttribute("aria-pressed", String(tool === "eraser"));
    }
    choose("pen", "ink");

    // ----- 大きさ：画面の大きさに合わせて、くっきり描けるようにする -----
    // canvas は「見た目の大きさ」と「中の点の数」が別。高解像度の画面では点の数を倍にしないと線がぼやける
    function resize() {
      const width = canvas.clientWidth;
      if (!width) return; // 隠れているときは何もしない
      const height = HEIGHTS[state.tall ? 1 : 0];
      const ratio = window.devicePixelRatio || 1;
      canvas.style.height = `${height}px`;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0); // これ以降は「見た目の px」で描ける
      redraw();
    }
    if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);

    // ----- 描く -----
    const colorOf = (key) => getComputedStyle(document.documentElement).getPropertyValue(COLORS[key]).trim() || "#000";

    function drawStroke(s) {
      const pts = s.points;
      ctx.save();
      ctx.globalCompositeOperation = s.tool === "eraser" ? "destination-out" : "source-over"; // 消しゴムは「透明で塗る」
      ctx.strokeStyle = colorOf(s.color);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (pts.length === 1) {
        // 点だけ(トンと置いただけ)
        ctx.beginPath();
        ctx.arc(pts[0].x, pts[0].y, pts[0].w / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      // 2点ずつ、間の点を通る曲線でつなぐ(カクカクしないように)。太さは点ごとに変える(筆圧)
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const prev = pts[i - 2] || a;
        ctx.beginPath();
        ctx.lineWidth = (a.w + b.w) / 2;
        ctx.moveTo((prev.x + a.x) / 2, (prev.y + a.y) / 2);
        ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    function redraw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      state.strokes.forEach(drawStroke);
      if (state.current) drawStroke(state.current);
    }

    function pointOf(e) {
      const r = canvas.getBoundingClientRect();
      const isPen = e.pointerType === "pen";
      // 筆圧：ペンなら 0〜1、マウスは 0.5 くらいが返る。0 が返る環境もあるので下限をつける
      const p = isPen ? Math.max(0.15, e.pressure || 0.5) : 0.5;
      const base = state.tool === "eraser" ? 22 : 2.6;
      return { x: e.clientX - r.left, y: e.clientY - r.top, w: base * (0.4 + p * 1.2) };
    }

    // 手のひらで書かないように：一度ペンを使ったら、指(touch)は線を引かない
    const accept = (e) => {
      if (e.pointerType === "pen") state.penSeen = true;
      return !(e.pointerType === "touch" && state.penSeen);
    };

    canvas.addEventListener("pointerdown", (e) => {
      if (!accept(e)) return;
      e.preventDefault();
      try {
        canvas.setPointerCapture(e.pointerId); // 欄の外まで動いても線を続ける
      } catch {
        /* つかまえられなくても、欄の中なら書ける */
      }
      state.current = { tool: state.tool, color: state.color, points: [pointOf(e)], id: e.pointerId };
      redraw();
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!state.current || state.current.id !== e.pointerId) return;
      // 速く動かしたときの途中の点も拾う(対応している環境だけ)
      // 対応していても空の配列を返す環境があるので、空なら今の点だけ使う
      const coalesced = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      const events = coalesced.length ? coalesced : [e];
      events.forEach((ev) => state.current.points.push(pointOf(ev)));
      redraw();
    });
    const end = (e) => {
      if (!state.current || state.current.id !== e.pointerId) return;
      const { id, ...stroke } = state.current;
      state.strokes.push(stroke);
      state.current = null;
      redraw();
    };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);

    function clear() {
      state.strokes = [];
      state.current = null;
      redraw();
    }

    // ----- 文字と手書きの切り替え -----
    function show() {
      const draw = mode === "draw";
      textarea.hidden = draw;
      wrap.hidden = !draw;
      btnText.setAttribute("aria-pressed", String(!draw));
      btnDraw.setAttribute("aria-pressed", String(draw));
      if (draw) requestAnimationFrame(resize); // 表示されてから大きさを測る
    }

    const pad = { show, clear: () => { clear(); textarea.value = ""; } };
    pads.push(pad);
    show();
    return pad;
  }

  // どこかの欄で切り替えたら、全部の欄をそろえる
  function setMode(next) {
    mode = next;
    storage.set(MODE_KEY, mode);
    pads.forEach((p) => p.show());
  }

  window.App.sketch = { attach };
})();
