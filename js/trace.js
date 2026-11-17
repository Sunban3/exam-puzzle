// 科目Bのプログラムを「触れる」ようにする部品
//  ・変数をタップすると、トレース表の列に集まり、同じ変数が同じ色に光る
//  ・行番号をタップすると「いまここ」の印をつけられる
//  ・トレース表は行を足すと前の行の値を引き継ぐ
(() => {
  "use strict";

  const { make } = window.App;

  // 擬似言語のキーワード(変数ではないので、タップの対象にしない)
  const KEYWORDS = new Set([
    "if", "elseif", "else", "endif", "while", "endwhile", "do", "for", "endfor",
    "and", "or", "not", "mod", "return", "to", "from", "increasing", "decreasing",
    "true", "false", "null", "of", "in", "is", "empty",
  ]);
  const colorOf = (n) => `var(--c${(n % 4) + 1})`;

  function createTrace({ codeEl, tableEl }) {
    const state = {
      vars: [],        // 集めた変数名(列の順)
      rows: [],        // 各行の値 [{ 変数名: 値 }]
      currentLine: null,
    };

    // ===== プログラムの表示 =====
    // 1行ずつ、英字で始まる名前(識別子)をボタンにする
    const IDENT = /[A-Za-z_][A-Za-z0-9_]*/g;

    function renderCode(code) {
      state.currentLine = null;
      const lines = code.split("\n");
      codeEl.replaceChildren(
        ...lines.map((line, n) => {
          const row = make("div", "code-line");
          row.dataset.line = n;

          const no = make("button", "line-no", String(n + 1));
          no.type = "button";
          no.title = "ここに「いまここ」の印をつける";
          no.addEventListener("click", () => markLine(n));

          const body = make("span", "line-body");
          splitLine(line).forEach((part) => {
            if (part.plain) body.append(make("span", part.plain, part.text));
            else appendCode(body, part.text);
          });

          row.append(no, body);
          return row;
        })
      );
      paintVars();
    }

    // 1行を「プログラム部分」と「文字列・コメント部分」に分ける
    // 文字列 "A" やコメント // ... の中の英字は変数ではないので、タップの対象から外す
    const PLAIN = /"[^"]*"|“[^”]*”|\/\/.*$|\/\*.*?\*\//g;
    function splitLine(line) {
      const parts = [];
      let last = 0;
      for (const m of line.matchAll(PLAIN)) {
        if (m.index > last) parts.push({ text: line.slice(last, m.index) });
        const isComment = m[0].startsWith("/");
        parts.push({ text: m[0], plain: isComment ? "comment" : "str" });
        last = m.index + m[0].length;
      }
      if (last < line.length) parts.push({ text: line.slice(last) });
      return parts;
    }

    // プログラム部分の英字の名前(識別子)をボタンにする
    function appendCode(body, text) {
      let last = 0;
      for (const m of text.matchAll(IDENT)) {
        const name = m[0];
        const before = text.slice(last, m.index);
        if (before) body.append(document.createTextNode(before));
        const isCall = text[m.index + name.length] === "("; // 関数の呼び出しは対象外
        if (KEYWORDS.has(name) || isCall) {
          body.append(make("span", "kw", name));
        } else {
          const v = make("button", "var", name);
          v.type = "button";
          v.dataset.var = name;
          v.addEventListener("click", () => toggleVar(name));
          body.append(v);
        }
        last = m.index + name.length;
      }
      if (last < text.length) body.append(document.createTextNode(text.slice(last)));
    }

    function markLine(n) {
      state.currentLine = state.currentLine === n ? null : n;
      codeEl.querySelectorAll(".code-line").forEach((row) => {
        row.classList.toggle("current", Number(row.dataset.line) === state.currentLine);
      });
    }

    // 集めた変数に色をつける(プログラム中の同じ名前を全部)
    function paintVars() {
      codeEl.querySelectorAll(".var").forEach((v) => {
        const i = state.vars.indexOf(v.dataset.var);
        v.classList.toggle("picked", i >= 0);
        if (i >= 0) v.style.setProperty("--pair", colorOf(i));
        else v.style.removeProperty("--pair");
      });
    }

    function toggleVar(name) {
      const i = state.vars.indexOf(name);
      if (i >= 0) state.vars.splice(i, 1);
      else state.vars.push(name);
      if (state.rows.length === 0 && state.vars.length) state.rows.push({});
      paintVars();
      renderTable();
    }

    // ===== トレース表 =====
    function renderTable() {
      if (state.vars.length === 0) {
        tableEl.replaceChildren(make("p", "trace-empty", "プログラムの変数をタップすると、ここに集まるよ"));
        return;
      }

      const table = make("table", "trace-table");
      const head = make("tr");
      head.append(make("th", null, "手順"));
      state.vars.forEach((name, i) => {
        const th = make("th");
        th.style.setProperty("--pair", colorOf(i));
        const del = make("button", "trace-del", "×");
        del.type = "button";
        del.setAttribute("aria-label", `${name}を表から外す`);
        del.addEventListener("click", () => toggleVar(name));
        th.append(make("span", "trace-var", name), del);
        head.append(th);
      });
      const thead = make("thead");
      thead.append(head);

      const tbody = make("tbody");
      state.rows.forEach((row, r) => {
        const tr = make("tr");
        tr.append(make("td", "trace-step", String(r + 1)));
        state.vars.forEach((name) => {
          const td = make("td");
          const input = make("input");
          input.type = "text";
          input.value = row[name] ?? "";
          input.setAttribute("aria-label", `${r + 1}行目の${name}`);
          // 入力した値は状態に保存するだけ(表を作り直すと入力中の文字が消えるので、ここでは描き直さない)
          input.addEventListener("input", () => { row[name] = input.value; });
          td.append(input);
          tr.append(td);
        });
        tbody.append(tr);
      });
      table.append(thead, tbody);

      const actions = make("div", "trace-actions");
      const add = make("button", "trace-add", "＋1行（前の行の値を引き継ぐ）");
      add.type = "button";
      add.addEventListener("click", () => {
        const last = state.rows[state.rows.length - 1] || {};
        state.rows.push({ ...last }); // 前の行をコピー。変わった値だけ書き換えればいい
        renderTable();
        const inputs = tableEl.querySelectorAll("tbody tr:last-child input");
        if (inputs.length && inputs[0].focus) inputs[0].focus();
      });
      const undo = make("button", "trace-undo", "最後の行を消す");
      undo.type = "button";
      undo.disabled = state.rows.length <= 1;
      undo.addEventListener("click", () => {
        state.rows.pop();
        renderTable();
      });
      actions.append(add, undo);

      const wrap = make("div", "table-wrap");
      wrap.append(table);
      tableEl.replaceChildren(wrap, actions);
    }

    // 新しい問題になったら、全部リセット
    function reset(code) {
      state.vars = [];
      state.rows = [];
      renderCode(code || "");
      renderTable();
    }

    return { reset };
  }

  window.App.createTrace = createTrace;
})();
