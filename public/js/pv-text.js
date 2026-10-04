// 評価値と読み筋を、将棋の言葉に直して読めるようにする。
//
// 内部とエンジンは「c4」のような記法を使うが、画面では「７六」と出す。
// 評価値は歩を 1.0 とした目安の言葉を添える。

const FILES = "abcdefghi";
const KANJI_RANK = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
const FULL_WIDTH = { 1: "１", 2: "２", 3: "３", 4: "４", 5: "５", 6: "６", 7: "７", 8: "８", 9: "９" };
const PIECE_KANJI = { P: "歩", L: "香", N: "桂", S: "銀", G: "金", B: "角", R: "飛", K: "玉" };

/**
 * エンジンのマス（例 "c4"）を将棋の書き方（例 "７六"）に直す。
 * @param {string} engineSquare
 * @returns {string}
 */
export function squareToJapanese(engineSquare) {
  const text = String(engineSquare ?? "");
  const match = text.match(/^([a-i])([1-9])$/);
  if (!match) return text || "?";
  const file = 9 - FILES.indexOf(match[1]);
  const rank = 10 - Number(match[2]);
  return `${FULL_WIDTH[file]}${KANJI_RANK[rank]}`;
}

/**
 * 読み筋の一手を読める形にする。
 *   "c3c4"    → "７七→７六"
 *   "e8e9+"   → "５八→５九成"
 *   "P@e5"    → "５五に歩を打つ"
 * @param {string} move
 * @returns {string}
 */
export function formatPvMove(move) {
  const text = String(move ?? "");

  const drop = text.match(/^([A-Za-z])@([a-i][1-9])$/);
  if (drop) {
    const piece = PIECE_KANJI[drop[1].toUpperCase()] ?? "";
    return `${squareToJapanese(drop[2])}に${piece}を打つ`;
  }

  const normal = text.match(/^([a-i][1-9])([a-i][1-9])(\+?)$/);
  if (normal) {
    return `${squareToJapanese(normal[1])}→${squareToJapanese(normal[2])}${normal[3] ? "成" : ""}`;
  }

  return text;
}

/**
 * 読み筋を並べて出す。
 * @param {string[]} moves
 * @param {number} [limit]
 * @returns {string}
 */
export function formatPv(moves, limit = 8) {
  return (Array.isArray(moves) ? moves : []).slice(0, limit).map(formatPvMove).join(" ");
}

/**
 * 先手から見た評価値（歩 = 1.0）を、言葉の目安にする。
 * @param {number} value
 * @returns {string} 数値でなければ空文字
 */
export function describeScore(value) {
  if (value === null || value === undefined || value === "") return "";
  const v = Number(value);
  if (!Number.isFinite(v)) return "";
  const size = Math.abs(v);
  const lead = v > 0 ? "先手" : "後手";
  if (size < 0.5) return "ほぼ互角";
  if (size < 1.5) return `${lead}が少し有利`;
  if (size < 4) return `${lead}が有利`;
  if (size < 8) return `${lead}が大きく有利`;
  return `${lead}が勝勢`;
}
