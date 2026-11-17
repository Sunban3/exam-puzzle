// ほぼ同じ問題(年度をまたいで再出題されたものなど)を探す
// 使い方: node tools/find-duplicates.js
// 問題文と選択肢を文字の2-gram(となり合う2文字の組)に分けて、どれくらい重なるかで似ている度合いを測る
const path = require("path");

global.window = {};
for (const year of ["r05", "r06", "r07", "r08", "r01a", "h31s"]) {
  require(path.join(__dirname, "..", "data", `fe-${year}.js`));
}
const questions = window.QUESTIONS;

// 比べやすくするため、空白と句読点を取り除く
const normalize = (text) => text.replace(/[\s，,。．、・“”（）()「」\[\]]/g, "");

function bigrams(text) {
  const t = normalize(text);
  const set = new Set();
  for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2));
  return set;
}

// ジャカード係数: 共通部分 ÷ 合わせた全体(0〜1。1なら完全に同じ)
function jaccard(a, b) {
  let common = 0;
  a.forEach((x) => { if (b.has(x)) common += 1; });
  return common / (a.size + b.size - common || 1);
}

const items = questions.map((q) => ({
  q,
  stem: bigrams(q.stem),
  choices: bigrams(q.choices.join("|")),
}));

const THRESHOLD = 0.6; // これ以上似ていたら候補として出す
const found = [];
for (let i = 0; i < items.length; i++) {
  for (let j = i + 1; j < items.length; j++) {
    const s = jaccard(items[i].stem, items[j].stem);
    const c = jaccard(items[i].choices, items[j].choices);
    const score = (s + c) / 2;
    if (score >= THRESHOLD) found.push({ a: items[i].q, b: items[j].q, s, c, score });
  }
}

found.sort((x, y) => y.score - x.score);
console.log(`全${questions.length}問を比較、似ている組み合わせ ${found.length}件`);
found.forEach(({ a, b, s, c, score }) => {
  const pct = (v) => `${Math.round(v * 100)}%`;
  console.log(`\n${pct(score)}（問題文 ${pct(s)} / 選択肢 ${pct(c)}）`);
  console.log(`  ${a.id}: ${a.stem.slice(0, 50)}`);
  console.log(`  ${b.id}: ${b.stem.slice(0, 50)}`);
});
