// 問題データのチェック
// 使い方: node tools/check-data.js
// ・データの形が正しいか
// ・正解がIPAの解答例と一致しているか
const path = require("path");

global.window = {};
for (const year of ["r05", "r06", "r07", "r08", "r01a", "h31s"]) {
  require(path.join(__dirname, "..", "data", `fe-${year}.js`));
}
require(path.join(__dirname, "..", "data", "fe-b.js"));
require(path.join(__dirname, "..", "data", "fe-b-sample.js"));
require(path.join(__dirname, "..", "data", "techniques.js"));
const questions = window.QUESTIONS;

// IPAの解答例(公開問題は問1〜問20、午前は問1〜問80)。ア=0, イ=1, ウ=2, エ=3
const KANA = { ア: 0, イ: 1, ウ: 2, エ: 3 };
const OFFICIAL = {
  R5: "ウウエエイウイエウウエウエウエイウウエア",
  R6: "ウエイエウアウウウエウエウウエエアエエア",
  R7: "エイイウアウエエウアウエエエウエイエエイ",
  R8: "イウイイイイエアウウアウアエウアイアアイ",
  R1A: [
    "エウウアアウエウエイ", "ウエアイアウエウウエ", "イイウエイウイイウエ", "イイイイイイエウアウ",
    "イウイエエイアエイウ", "イウウイイアエアエイ", "イアイウイアエアエウ", "アアウエウウウイウア",
  ].join(""),
  H31S: [
    "ウウエウイアエアウイ", "エウエエエイアエアエ", "エイアウウイイイウエ", "アエエアウアウアアア",
    "イアアウイアイウアア", "イエエイイアエアエエ", "イエイイアエイイイイ", "エエエウイエアエエウ",
  ].join(""),
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

  if ("calc" in q && q.calc !== true) errors.push(`${where}: calcはtrueだけを書く`);

  if (q.match) {
    const { terms, meanings } = q.match;
    if (!terms && !meanings) errors.push(`${where}: matchにtermsもmeaningsもない`);
    if (terms && terms.length !== 4) errors.push(`${where}: termsが4つではない`);
    if (meanings && meanings.length !== 4) errors.push(`${where}: meaningsが4つではない`);
  }
});

// ===== 科目B =====
// 選択肢は最大10個(ア〜コ)
const KANA_B = { ア: 0, イ: 1, ウ: 2, エ: 3, オ: 4, カ: 5, キ: 6, ク: 7, ケ: 8, コ: 9 };
const OFFICIAL_B = {
  R5B: "アクエエエア",
  R6B: "イエエイオウ",
  R7B: "カアイクオク",
  R8B: "エカアエイケ",
  SB: "カウアイウオ", // サンプル問題(2022年4月)。問6は入れていない
  SBS: "カウカエオアカエウカアエウクアクカエエカ", // サンプル問題セット(2022年12月)
};
const bQuestions = window.KAMOKU_B || [];
bQuestions.forEach((q) => {
  const where = q.id || "(idなし)";
  if (ids.has(q.id)) errors.push(`${where}: idが重複`);
  ids.add(q.id);

  if (!OFFICIAL_B[q.year]) errors.push(`${where}: yearが不明 (${q.year})`);
  if (!q.stem) errors.push(`${where}: stemがない`);
  if (!q.title) errors.push(`${where}: titleがない`);
  if (!Array.isArray(q.choices) || q.choices.length < 2 || q.choices.length > 10) {
    errors.push(`${where}: choicesは2〜10個`);
  }
  const official = KANA_B[OFFICIAL_B[q.year]?.[q.no - 1]];
  if (q.answer !== official) errors.push(`${where}: 正解が解答例と違う (データ:${q.answer} 解答例:${official})`);
});
console.log(`科目B ${bQuestions.length}問`);

// ===== 計算問題のテクニック =====
// すべての計算問題にテクニックがあり、存在しないテクニックや問題を指していないか
const TECH = window.TECHNIQUES || {};
const TECH_FOR = window.TECHNIQUE_FOR || {};
// 科目Aの計算問題は手順(steps)が必要。科目Bは問題データの point を使うので hint だけでよい
const calcIds = new Set(questions.filter((q) => q.calc).map((q) => q.id));
const bIds = new Set(bQuestions.map((q) => q.id));
[...calcIds, ...bIds].forEach((id) => {
  if (!TECH_FOR[id]) errors.push(`${id}: テクニックがない`);
});
Object.entries(TECH_FOR).forEach(([id, f]) => {
  if (!calcIds.has(id) && !bIds.has(id)) errors.push(`${id}: テクニックがあるのに計算問題でも科目Bでもない`);
  if (!TECH[f.tech]) errors.push(`${id}: テクニック ${f.tech} が一覧にない`);
  if (!f.hint) errors.push(`${id}: hint がない`);
  if (calcIds.has(id) && (!Array.isArray(f.steps) || !f.steps.length)) errors.push(`${id}: steps がない`);
});
const usedTech = new Set(Object.values(TECH_FOR).map((f) => f.tech));
Object.keys(TECH).forEach((k) => {
  if (!usedTech.has(k)) errors.push(`テクニック ${k}: どの問題にも使われていない`);
});
console.log(`テクニック ${Object.keys(TECH).length}種類`);

const matchCount = questions.filter((q) => q.match).length;
const calcCount = questions.filter((q) => q.calc).length;
console.log(`全${questions.length}問(あてはめ ${matchCount}問・計算 ${calcCount}問)`);
if (errors.length) {
  console.log(`エラー ${errors.length}件`);
  errors.forEach((e) => console.log("  " + e));
  process.exit(1);
} else {
  console.log("問題なし");
}
