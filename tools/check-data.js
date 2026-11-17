// 問題データのチェック
// 使い方: node tools/check-data.js
// ・データの形が正しいか
// ・正解がIPAの解答例と一致しているか
const path = require("path");

global.window = {};
for (const year of ["r05", "r06", "r07", "r08"]) {
  require(path.join(__dirname, "..", "data", `fe-${year}.js`));
}
const questions = window.QUESTIONS;

// IPAの解答例(問1〜問20)。ア=0, イ=1, ウ=2, エ=3
const KANA = { ア: 0, イ: 1, ウ: 2, エ: 3 };
const OFFICIAL = {
  R5: "ウウエエイウイエウウエウエウエイウウエア",
  R6: "ウエイエウアウウウエウエウウエエアエエア",
  R7: "エイイウアウエエウアウエエエウエイエエイ",
  R8: "イウイイイイエアウウアウアエウアイアアイ",
};

const errors = [];
const ids = new Set();

questions.forEach((q) => {
  const where = q.id || "(idなし)";
  if (ids.has(q.id)) errors.push(`${where}: idが重複`);
  ids.add(q.id);

  if (!OFFICIAL[q.year]) errors.push(`${where}: yearが不明 (${q.year})`);
  if (!q.stem) errors.push(`${where}: stemがない`);
  if (!Array.isArray(q.choices) || q.choices.length !== 4) errors.push(`${where}: choicesが4つではない`);

  const official = KANA[OFFICIAL[q.year]?.[q.no - 1]];
  if (q.answer !== official) errors.push(`${where}: 正解が解答例と違う (データ:${q.answer} 解答例:${official})`);

  if (q.match) {
    const { terms, meanings } = q.match;
    if (!terms && !meanings) errors.push(`${where}: matchにtermsもmeaningsもない`);
    if (terms && terms.length !== 4) errors.push(`${where}: termsが4つではない`);
    if (meanings && meanings.length !== 4) errors.push(`${where}: meaningsが4つではない`);
  }
});

const matchCount = questions.filter((q) => q.match).length;
console.log(`全${questions.length}問(あてはめ ${matchCount}問)`);
if (errors.length) {
  console.log(`エラー ${errors.length}件`);
  errors.forEach((e) => console.log("  " + e));
  process.exit(1);
} else {
  console.log("問題なし");
}
