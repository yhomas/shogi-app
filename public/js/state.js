// 局面のデータ構造と、平手の初期局面。
//
// 盤面は 81 要素の配列。添字は FEN の並びと同じにする（仕様 2.4）。
//   添字 = (段 - 1) * 9 + (9 - 列)
// つまり 0 が 9一（FEN の1行目の左端）、8 が 1一、80 が 1九。
// こうしておくと、SFEN との変換が素直な走査で書ける。
//
// 座標変換（coords.js）はここでは使わない。添字の計算は算術だけで閉じる。

/** 駒の種類。歩・香・桂・銀・金・角・飛・玉。 */
export const PIECE_TYPES = ["P", "L", "N", "S", "G", "B", "R", "K"];

/** 持ち駒になる種類（玉はならない）。 */
export const HAND_PIECE_TYPES = ["P", "L", "N", "S", "G", "B", "R"];

/**
 * マスの添字。0..80。
 * @param {number} column 列(1..9)。1 が 9筋、9 が 1筋。
 * @param {number} rank 段(1..9)。1 が一段目（後手の後ろ段）。
 * @returns {number}
 */
export function boardIndex(column, rank) {
  if (!Number.isInteger(column) || column < 1 || column > 9) {
    throw new RangeError(`列は1から9の整数です（受け取った値: ${column}）。`);
  }
  if (!Number.isInteger(rank) || rank < 1 || rank > 9) {
    throw new RangeError(`段は1から9の整数です（受け取った値: ${rank}）。`);
  }
  return (rank - 1) * 9 + (9 - column);
}

/** 空の持ち駒。 */
export function emptyHands() {
  return { P: 0, L: 0, N: 0, S: 0, G: 0, B: 0, R: 0 };
}

// 一段目（後手の後ろ段）と九段目（先手の後ろ段）の並び。9筋から1筋へ。
const BACK_RANK = ["L", "N", "S", "G", "K", "G", "S", "N", "L"];

/**
 * 平手の初期局面。手番は先手。
 * @returns {{board: (object|null)[], hands: {w: object, b: object}, turn: "w"|"b"}}
 */
export function createInitialPosition() {
  const board = new Array(81).fill(null);

  const place = (column, rank, type, owner) => {
    board[boardIndex(column, rank)] = { type, owner, promoted: false };
  };

  // 後手の後ろ段（一段目）と先手の後ろ段（九段目）
  BACK_RANK.forEach((type, i) => place(9 - i, 1, type, "b"));
  BACK_RANK.forEach((type, i) => place(9 - i, 9, type, "w"));

  // 歩。後手は三段目、先手は七段目
  for (let column = 1; column <= 9; column += 1) {
    place(column, 3, "P", "b");
    place(column, 7, "P", "w");
  }

  // 飛と角。後手は 8二の飛・2二の角、先手は 8八の角・2八の飛
  place(8, 2, "R", "b");
  place(2, 2, "B", "b");
  place(8, 8, "B", "w");
  place(2, 8, "R", "w");

  return { board, hands: { w: emptyHands(), b: emptyHands() }, turn: "w" };
}
