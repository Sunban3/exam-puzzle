// 記録のバックアップ(書き出し・読み込み)
// 記録はブラウザの中(localStorage)にしかないので、ファイルや文字に書き出して、別の端末で読み込めるようにする
// 読み込むときは「置き換え」ではなく「合わせる」。PCとスマホで別々に解いた分も、両方残る
(() => {
  "use strict";

  const { make, storage } = window.App;
  const FORMAT = 1;                       // バックアップの書き方の版(変えたら読み込み側も対応する)
  const MAX_TEXT = 5 * 1024 * 1024;       // 読み込む文字の最大(5MB)。大きすぎるものは受け付けない
  const HISTORY_LIMIT = 20;               // records.js と同じ(1問あたりの履歴の数)
  const BACKUP_AT = "exam-puzzle:backup-at";
  const DONE = "exam-puzzle:import-done"; // 読み込んだあと、ページを開き直したときに結果を出すため
  const REMIND_DAYS = 7;
  const DAY = 24 * 60 * 60 * 1000;

  // バックアップに入れてよいキー(知らないキーは書き出さない・読み込まない)
  const ALLOWED = /^exam-puzzle:(records|notes|genres|timer|view|memo-mode|changelog-seen|count:[A-Za-z]+|calc:[A-Za-z]+)$/;
  // 端末ごとの設定。今の端末に値があれば今の値を残す(なければ読み込んだ値を使う)
  const SETTINGS = /^exam-puzzle:(genres|timer|view|memo-mode|count:[A-Za-z]+|calc:[A-Za-z]+)$/;

  // ===== 書き出す =====
  function allKeys() {
    const keys = [];
    try {
      for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    } catch {
      /* 使えない環境では空のまま */
    }
    return keys.filter((k) => ALLOWED.test(k));
  }

  function exportText() {
    const data = {};
    allKeys().forEach((k) => {
      const v = storage.get(k);
      if (v !== null) data[k] = v;
    });
    return JSON.stringify({ app: "exam-puzzle", format: FORMAT, exportedAt: new Date().toISOString(), data }, null, 1);
  }

  const today = () => new Date().toISOString().slice(0, 10);

  function download() {
    const blob = new Blob([exportText()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = make("a");
    a.href = url;
    a.download = `exam-puzzle-backup-${today()}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000); // 使い終わったURLは片付ける
    storage.set(BACKUP_AT, today());
  }

  // ===== 読み込む：まず中身を確かめる =====
  // 返り値 { ok: true, data, summary } か { ok: false, error }
  function parse(text) {
    if (text.length > MAX_TEXT) return { ok: false, error: "ファイルが大きすぎます" };
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false, error: "バックアップの形式ではありません（JSONとして読めません）" };
    }
    if (!json || json.app !== "exam-puzzle" || !json.data || typeof json.data !== "object") {
      return { ok: false, error: "このアプリのバックアップではありません" };
    }
    if (json.format !== FORMAT) return { ok: false, error: "対応していない版のバックアップです" };

    const data = {};
    Object.entries(json.data).forEach(([k, v]) => {
      if (ALLOWED.test(k) && typeof v === "string") data[k] = v; // 知らないキー・文字列でない値は捨てる
    });
    const records = readJSON(data["exam-puzzle:records"]);
    const notes = readJSON(data["exam-puzzle:notes"]);
    const recCount = Object.values(records).reduce((n, m) => n + (m && typeof m === "object" ? Object.keys(m).length : 0), 0);
    const date = typeof json.exportedAt === "string" ? new Date(json.exportedAt) : null;
    return {
      ok: true,
      data,
      summary: {
        records: recCount,
        notes: Object.keys(notes).length,
        exportedAt: date && !isNaN(date) ? date : null,
      },
    };
  }

  function readJSON(text) {
    try {
      const v = JSON.parse(text || "{}");
      return v && typeof v === "object" && !Array.isArray(v) ? v : {};
    } catch {
      return {};
    }
  }

  // ===== 読み込む：今の記録と合わせる =====
  // 1回分の履歴として正しい形か
  const validHistory = (h) => h && typeof h.at === "number" && typeof h.ok === "boolean";

  function cleanRec(r) {
    if (!r || typeof r.attempts !== "number" || typeof r.correct !== "number" || !Array.isArray(r.history)) return null;
    const history = r.history.filter(validHistory).map((h) => (h.unsure === true ? { at: h.at, ok: h.ok, unsure: true } : { at: h.at, ok: h.ok }));
    return { attempts: Math.max(0, r.attempts), correct: Math.max(0, Math.min(r.correct, r.attempts)), history };
  }

  // 1問分を合わせる：解いた日時(at)が今の記録にない回だけを足す
  // (同じバックアップを2回読み込んでも、二重に数えない)
  function mergeRec(local, incoming) {
    const b = cleanRec(incoming);
    if (!b) return local;
    if (!local) return { ...b, history: b.history.slice(-HISTORY_LIMIT) };
    const seen = new Set(local.history.map((h) => h.at));
    const extra = b.history.filter((h) => !seen.has(h.at));
    return {
      attempts: local.attempts + extra.length,
      correct: local.correct + extra.filter((h) => h.ok).length,
      history: [...local.history, ...extra].sort((x, y) => x.at - y.at).slice(-HISTORY_LIMIT),
    };
  }

  function mergeRecords(localAll, incomingAll) {
    const out = { ...localAll };
    Object.entries(incomingAll).forEach(([mode, recs]) => {
      if (!recs || typeof recs !== "object") return;
      out[mode] = { ...(out[mode] || {}) };
      Object.entries(recs).forEach(([id, r]) => {
        const merged = mergeRec(cleanRec(out[mode][id]), r);
        if (merged) out[mode][id] = merged;
      });
    });
    return out;
  }

  // 振り返りメモは、あとで書いた方(at が大きい方)を残す
  function mergeNotes(localAll, incomingAll) {
    const out = { ...localAll };
    Object.entries(incomingAll).forEach(([id, n]) => {
      if (!n || typeof n !== "object" || typeof n.at !== "number") return;
      if (!out[id] || (out[id].at || 0) < n.at) out[id] = n;
    });
    return out;
  }

  function apply(data) {
    const recKey = "exam-puzzle:records";
    const noteKey = "exam-puzzle:notes";
    storage.set(recKey, JSON.stringify(mergeRecords(readJSON(storage.get(recKey)), readJSON(data[recKey]))));
    storage.set(noteKey, JSON.stringify(mergeNotes(readJSON(storage.get(noteKey)), readJSON(data[noteKey]))));
    Object.entries(data).forEach(([k, v]) => {
      if (SETTINGS.test(k) && storage.get(k) === null) storage.set(k, v);
    });
    // 更新履歴の「見た日」は、新しい方を残す
    const seenKey = "exam-puzzle:changelog-seen";
    const a = storage.get(seenKey) || "";
    const b = data[seenKey] || "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(b) && b > a) storage.set(seenKey, b);
  }

  // ===== 自己分析タブに出すカード =====
  function daysSinceBackup() {
    const v = storage.get(BACKUP_AT) || "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
    return Math.floor((Date.parse(today()) - Date.parse(v)) / DAY);
  }

  function card({ hasRecords }) {
    const box = make("section", "an-card backup-card");
    box.append(make("h2", "an-title", "記録のバックアップ"));

    // 読み込んだ直後なら、結果を1回だけ出す
    const done = storage.get(DONE);
    if (done) {
      box.append(make("p", "backup-done", done));
      storage.set(DONE, "");
    }

    const days = daysSinceBackup();
    const last = days === null ? "まだバックアップしていません" : days === 0 ? "最後のバックアップ：今日" : `最後のバックアップ：${days}日前`;
    const status = make("p", "backup-status", last);
    if (hasRecords && (days === null || days >= REMIND_DAYS)) {
      status.classList.add("warn");
      status.textContent += "。記録はこのブラウザの中にしかないので、ときどき書き出しておこう";
    }
    box.append(
      status,
      make("p", "an-note", "PCとスマホの記録を合わせたいときは、片方で書き出して、もう片方で読み込んでね。読み込むと今の記録と合わさる（消えない）。")
    );

    // 書き出す
    const exportRow = make("div", "backup-row");
    const dl = make("button", "primary", "ファイルに書き出す");
    dl.type = "button";
    const copy = make("button", null, "文字としてコピー");
    copy.type = "button";
    const copyMsg = make("p", "backup-msg");
    dl.addEventListener("click", () => {
      download();
      status.textContent = "最後のバックアップ：今日";
      status.classList.remove("warn");
    });
    copy.addEventListener("click", async () => {
      const text = exportText();
      try {
        await navigator.clipboard.writeText(text);
        storage.set(BACKUP_AT, today());
        copyMsg.textContent = "コピーしました。メモアプリなどに貼り付けて保存してね";
      } catch {
        // コピーできない環境では、文字を表示して手でコピーしてもらう
        const area = make("textarea", "backup-text");
        area.value = text;
        area.readOnly = true;
        copyMsg.replaceChildren(make("span", null, "自動でコピーできなかったので、下の文字を全部選んでコピーしてね"), area);
        area.select();
      }
    });
    exportRow.append(dl, copy);

    // 読み込む
    const importBox = make("details", "backup-import");
    importBox.append(make("summary", null, "バックアップを読み込む"));
    const file = make("input");
    file.type = "file";
    file.accept = ".json,application/json";
    file.setAttribute("aria-label", "バックアップのファイル");
    const paste = make("textarea", "backup-text");
    paste.placeholder = "または、コピーした文字をここに貼り付け";
    paste.setAttribute("aria-label", "バックアップの文字");
    const check = make("button", null, "中身を確かめる");
    check.type = "button";
    const preview = make("div", "backup-preview");

    function showPreview(text) {
      const r = parse(text);
      if (!r.ok) {
        preview.replaceChildren(make("p", "backup-error", r.error));
        return;
      }
      const s = r.summary;
      const when = s.exportedAt ? `${s.exportedAt.getMonth() + 1}/${s.exportedAt.getDate()} ${s.exportedAt.getHours()}:${String(s.exportedAt.getMinutes()).padStart(2, "0")} に書き出したもの` : "書き出した日時は不明";
      const go = make("button", "primary", "今の記録と合わせる");
      go.type = "button";
      go.addEventListener("click", () => {
        apply(r.data);
        storage.set(DONE, `読み込みました（記録 ${s.records}問分・振り返りメモ ${s.notes}件を合わせました）`);
        location.reload(); // 記録を読み込み直すため、ページを開き直す
      });
      preview.replaceChildren(make("p", null, `${when}：記録 ${s.records}問分・振り返りメモ ${s.notes}件`), go);
    }

    file.addEventListener("change", () => {
      const f = file.files && file.files[0];
      if (!f) return;
      if (f.size > MAX_TEXT) {
        preview.replaceChildren(make("p", "backup-error", "ファイルが大きすぎます"));
        return;
      }
      f.text().then(showPreview, () => preview.replaceChildren(make("p", "backup-error", "ファイルを読めませんでした")));
    });
    check.addEventListener("click", () => showPreview(paste.value.trim()));
    importBox.append(file, paste, check, preview);

    box.append(exportRow, copyMsg, importBox);
    return box;
  }

  window.App.backup = { card, exportText, parse, mergeRecords, mergeNotes };
})();
