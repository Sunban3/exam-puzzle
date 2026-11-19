// data/changelog.js から CHANGELOG.md を作る
// 使い方: node tools/build-changelog.js
// 更新履歴はアプリの画面と CHANGELOG.md の両方に出る。書くのは data/changelog.js だけ
const fs = require("fs");
const path = require("path");

global.window = {};
require(path.join(__dirname, "..", "data", "changelog.js"));
const list = window.CHANGELOG;

const LABEL = { new: "追加", improve: "改善", fix: "修正" };
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// ===== データのチェック =====
const errors = [];
let prev = "9999-99-99";
list.forEach((e, i) => {
  const where = e.date || `${i + 1}番目`;
  if (!DATE.test(e.date)) errors.push(`${where}: 日付は 2026-11-19 の形で書く`);
  if (e.date >= prev) errors.push(`${where}: 新しい日付を上に、同じ日付は1つにまとめる`);
  prev = e.date;
  if (!Array.isArray(e.changes) || !e.changes.length) errors.push(`${where}: changes が空`);
  (e.changes || []).forEach((c) => {
    if (!LABEL[c.type]) errors.push(`${where}: type は new / improve / fix のどれか (${c.type})`);
    if (!c.text) errors.push(`${where}: text が空`);
  });
});
if (errors.length) {
  console.log(`エラー ${errors.length}件(CHANGELOG.md は作っていません)`);
  errors.forEach((e) => console.log("  " + e));
  process.exit(1);
}

// ===== Markdown を作る =====
const lines = [
  "# 更新履歴",
  "",
  "<!-- このファイルは tools/build-changelog.js が data/changelog.js から作っています。直接編集しないでください -->",
  "",
];
list.forEach((e) => {
  lines.push(`## ${e.date}`, "");
  e.changes.forEach((c) => lines.push(`- **${LABEL[c.type]}**　${c.text}`));
  lines.push("");
});

fs.writeFileSync(path.join(__dirname, "..", "CHANGELOG.md"), lines.join("\n"));
console.log(`CHANGELOG.md を作りました(${list.length}日分・${list.reduce((n, e) => n + e.changes.length, 0)}件)`);
