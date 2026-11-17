// 振り返りメモ(なぜ間違えたか・わかりにくかったか)を、問題ごとに保存する
// 同じ問題がまた出たときに「前回の自分のメモ」として見返せる。自己分析タブでも集計に使う
(() => {
  "use strict";

  const { make, storage } = window.App;
  const KEY = "exam-puzzle:notes";
  const TEXT_LIMIT = 2000; // メモの最大文字数(保存データが大きくなりすぎないように)

  // 選べる理由(key は保存用、label は表示用)
  const REASONS = [
    { key: "unknown", label: "用語を知らなかった" },
    { key: "confused", label: "似た用語と混同" },
    { key: "calc", label: "計算ミス" },
    { key: "misread", label: "問題文の読み違い" },
    { key: "time", label: "時間が足りない" },
    { key: "unclear", label: "わかりにくい問題" },
  ];
  const KNOWN = new Set(REASONS.map((r) => r.key));
  const labelOf = (key) => REASONS.find((r) => r.key === key)?.label || key;

  // 保存データの形
  // { "fe-r05-a-03": { reasons: ["confused"], text: "AとBを逆に覚えてた", at: 1731800000000 } }
  // localStorage は書き換えられることもあるので、読み込むときに形を確かめ、知らない値は捨てる
  function load() {
    let raw;
    try {
      raw = JSON.parse(storage.get(KEY) || "{}");
    } catch {
      return {};
    }
    const out = {};
    if (!raw || typeof raw !== "object") return out;
    Object.entries(raw).forEach(([id, n]) => {
      if (!n || typeof n !== "object") return;
      const reasons = Array.isArray(n.reasons) ? n.reasons.filter((r) => KNOWN.has(r)) : [];
      const text = typeof n.text === "string" ? n.text.slice(0, TEXT_LIMIT) : "";
      const at = typeof n.at === "number" ? n.at : 0;
      if (reasons.length || text) out[id] = { reasons, text, at };
    });
    return out;
  }

  let data = load();

  function save() {
    storage.set(KEY, JSON.stringify(data));
  }

  function get(id) {
    return data[id] || null;
  }

  // 理由もメモも空なら、記録ごと消す(空のメモが一覧に並ばないように)
  function set(id, { reasons, text }) {
    if (!reasons.length && !text.trim()) delete data[id];
    else data[id] = { reasons: [...reasons], text: text.slice(0, TEXT_LIMIT), at: Date.now() };
    save();
  }

  function all() {
    return Object.entries(data).map(([id, n]) => ({ id, ...n }));
  }

  // ===== 答えたあとに出す「振り返りメモ」の欄 =====
  // open が true なら最初から開いておく(間違えたとき・たまたま正解のとき)
  function editor(q, { open = false } = {}) {
    const saved = get(q.id);
    const state = { reasons: new Set(saved?.reasons || []), text: saved?.text || "" };

    const box = make("details", "note-box");
    box.open = open || Boolean(saved);
    box.append(make("summary", null, "振り返りメモ（自己分析タブで見返せる）"));

    const status = make("p", "note-status", saved ? "前に書いたメモを読み込みました" : "");
    const persist = () => {
      set(q.id, { reasons: [...state.reasons], text: state.text });
      status.textContent = "保存しました";
    };

    // 理由のボタン(複数選べる)
    const chips = make("div", "note-reasons");
    REASONS.forEach(({ key, label }) => {
      const btn = make("button", "chip", label);
      btn.type = "button";
      btn.setAttribute("aria-pressed", String(state.reasons.has(key)));
      btn.addEventListener("click", () => {
        if (state.reasons.has(key)) state.reasons.delete(key);
        else state.reasons.add(key);
        btn.setAttribute("aria-pressed", String(state.reasons.has(key)));
        persist();
      });
      chips.append(btn);
    });

    const area = make("textarea", "note-text");
    area.rows = 3;
    area.maxLength = TEXT_LIMIT;
    area.placeholder = "例）ハブとスイッチを逆に覚えていた。スイッチはMACアドレスで送り先を選ぶ";
    area.value = state.text;
    area.setAttribute("aria-label", "振り返りメモ");
    // 打つたびに保存する(保存ボタンを押し忘れて消える、を防ぐ)
    area.addEventListener("input", () => {
      state.text = area.value;
      persist();
    });

    box.append(make("p", "note-ask", "なぜ間違えた？（いくつでも）"), chips, area, status);
    return box;
  }

  // ===== 問題を出すときの「前回の自分のメモ」 =====
  // メモに答えが書いてあることもあるので、本文は押すまで隠しておく
  function showPast(container, q) {
    const n = get(q.id);
    container.hidden = !n;
    if (!n) {
      container.replaceChildren();
      return;
    }
    const head = make("p", "past-title", "前回の自分のメモ");
    const tags = make("div", "past-reasons");
    n.reasons.forEach((r) => tags.append(make("span", "past-reason", labelOf(r))));
    const nodes = [head];
    if (n.reasons.length) nodes.push(tags);
    if (n.text) {
      const more = make("details", "past-text");
      more.append(make("summary", null, "メモを見る（答えが書いてあるかも）"), make("p", null, n.text));
      nodes.push(more);
    }
    container.replaceChildren(...nodes);
  }

  window.App.notes = { REASONS, labelOf, get, set, all, editor, showPast };
})();
