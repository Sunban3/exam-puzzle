// ジャンル(タグ)で問題を絞り込む
(() => {
  "use strict";

  const { make, storage } = window.App;
  const KEY = "exam-puzzle:genres";

  // 表示する順番(シラバスの並びに近い順)。ここにないタグは後ろに並ぶ
  const ORDER = {
    テクノロジ: ["基礎理論", "アルゴリズム", "コンピュータ構成要素", "システム構成", "ソフトウェア", "マルチメディア", "データベース", "ネットワーク", "セキュリティ", "開発技術"],
    マネジメント: ["開発手法", "プロジェクトマネジメント", "サービスマネジメント", "システム監査"],
    ストラテジ: ["システム戦略", "経営戦略", "技術戦略", "企業活動", "法務"],
  };

  const all = window.QUESTIONS || [];

  // タグごとの問題数
  const counts = new Map();
  all.forEach((q) => counts.set(q.tag, (counts.get(q.tag) || 0) + 1));

  // "テクノロジ：ネットワーク" → { major: "テクノロジ", minor: "ネットワーク" }
  function split(tag) {
    const [major, minor = tag] = tag.split("：");
    return { major, minor };
  }

  // 大分類ごとにタグをまとめる
  const rank = (major, minor) => {
    const i = (ORDER[major] || []).indexOf(minor);
    return i < 0 ? 999 : i;
  };
  const majors = [...new Set([...Object.keys(ORDER), ...[...counts.keys()].map((t) => split(t).major)])];
  const groups = majors
    .map((major) => ({
      major,
      tags: [...counts.keys()]
        .filter((t) => split(t).major === major)
        .sort((a, b) => rank(major, split(a).minor) - rank(major, split(b).minor)),
    }))
    .filter((g) => g.tags.length);

  // 保存されていた選択を読み込む(実在するタグだけを使う)
  function loadSelected() {
    try {
      const arr = JSON.parse(storage.get(KEY) || "[]");
      return Array.isArray(arr) ? arr.filter((t) => counts.has(t)) : [];
    } catch {
      return [];
    }
  }

  let selected = new Set(loadSelected());
  const listeners = [];

  const el = {
    summary: document.getElementById("filter-summary"),
    body: document.getElementById("filter-body"),
  };

  // その問題が、いまの絞り込みに当てはまるか
  function matches(q) {
    return selected.size === 0 || selected.has(q.tag);
  }

  function change() {
    storage.set(KEY, JSON.stringify([...selected]));
    render();
    listeners.forEach((fn) => fn());
  }

  function chip(label, count, pressed, onClick, className = "chip") {
    const btn = make("button", className);
    btn.type = "button";
    btn.setAttribute("aria-pressed", String(pressed));
    btn.append(make("span", null, label));
    if (count !== null) btn.append(make("span", "chip-count", String(count)));
    btn.addEventListener("click", onClick);
    return btn;
  }

  function render() {
    // 閉じているときに見える一行
    const names = [...selected].map((t) => split(t).minor);
    el.summary.textContent =
      names.length === 0 ? "ジャンル：すべて" :
      names.length <= 3 ? `ジャンル：${names.join("・")}` :
      `ジャンル：${names.length}個を選択中`;

    const allChip = chip("すべて", all.length, selected.size === 0, () => {
      selected.clear();
      change();
    });

    const groupNodes = groups.map((g) => {
      const box = make("div", "filter-group");
      const allIn = g.tags.every((t) => selected.has(t));
      const total = g.tags.reduce((sum, t) => sum + counts.get(t), 0);

      // 大分類の名前: その中を全部選ぶ / 全部外す
      box.append(chip(g.major, total, allIn, () => {
        g.tags.forEach((t) => (allIn ? selected.delete(t) : selected.add(t)));
        change();
      }, "chip chip-major"));

      const row = make("div", "chips");
      g.tags.forEach((t) => {
        row.append(chip(split(t).minor, counts.get(t), selected.has(t), () => {
          selected.has(t) ? selected.delete(t) : selected.add(t);
          change();
        }));
      });
      box.append(row);
      return box;
    });

    el.body.replaceChildren(allChip, ...groupNodes);
  }

  render();

  window.App.filter = {
    matches,
    onChange(fn) { listeners.push(fn); },
  };
})();
