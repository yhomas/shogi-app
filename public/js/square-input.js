// マスの入力を受け取って、アプリとエンジンの記法（例 c4）に直す。
//
// 将棋では「７六」のように書くが、内部と将棋エンジンは「a1〜i9」を使う。
// 入力する側はどちらの書き方でもよいようにする（全角の数字や漢数字も受け付ける）。

const FULL_WIDTH = {
  "１": "1", "２": "2", "３": "3", "４": "4", "５": "5",
  "６": "6", "７": "7", "８": "8", "９": "9",
};
const KANJI_NUMERALS = {
  "一": "1", "二": "2", "三": "3", "四": "4", "五": "5",
  "六": "6", "七": "7", "八": "8", "九": "9",
};
const FILE_LETTERS = "abcdefghi";

/**
 * マスの書き方を、エンジンの記法に直す。
 *
 *   「７六」→ "c4"   「76」→ "c4"   「c4」→ "c4"   それ以外 → null
 *
 * @param {string} text
 * @returns {string|null}
 */
export function parseSquareInput(text) {
  let s = String(text ?? "").trim();
  if (s === "") return null;
  s = s.replace(/[１-９]/g, (c) => FULL_WIDTH[c]);
  s = s.replace(/[一二三四五六七八九]/g, (c) => KANJI_NUMERALS[c]);

  // すでにエンジンの記法（例 c4）
  const engine = s.match(/^([a-i])([1-9])$/);
  if (engine) return engine[0];

  // 将棋の書き方（例 76）。1文字目が筋、2文字目が段。
  const shogi = s.match(/^([1-9])([1-9])$/);
  if (shogi) {
    const file = Number(shogi[1]);
    const rank = Number(shogi[2]);
    return FILE_LETTERS[9 - file] + String(10 - rank);
  }

  return null;
}
