// このアプリの座標と、同梱エンジン（Fairy-Stockfish）の座標の変換。
//
// このアプリの中では「列(1..9)は右から左へ」「段(1..9)は上から下へ」で数える
// （将棋の慣習。column 1 = 9筋 = 先手から見て左端、rank 1 = 一段目 = 後手の後ろ段）。
//
// エンジンは FEN の行内位置と段番号から次のように決まる記法を使う（実測で確定。仕様 2.4）。
//   engineFile = "abcdefghi"[FEN行内インデックス]   （a = 9筋 … i = 1筋）
//   engineRank = 10 - 段番号                          （1 = 9段 … 9 = 1段）
//
// したがって 9一 は "a9"、1九 は "i1" になる。USI の記法とは異なるので注意。

const FILES = "abcdefghi";

const RANK_OR_FILE_ERROR = "1 から 9 の範囲で指定してください";

function assertRange(value, min, max, what) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${what}は${min}から${max}の整数です（受け取った値: ${value}）。${RANK_OR_FILE_ERROR}`);
  }
}

/** 列(1..9) → FEN の行内インデックス(0..8)。1列目が行の末尾。 */
export function columnToFileIndex(column) {
  assertRange(column, 1, 9, "列");
  return 9 - column;
}

/** FEN の行内インデックス(0..8) → エンジンの筋文字(a..i)。 */
export function fileIndexToEngineFile(index) {
  assertRange(index, 0, 8, "行内インデックス");
  return FILES[index];
}

/** エンジンの筋文字(a..i) → FEN の行内インデックス(0..8)。 */
export function engineFileToFileIndex(letter) {
  const index = FILES.indexOf(letter);
  if (index === -1) {
    throw new RangeError(`筋文字は a から i のいずれかです（受け取った値: ${JSON.stringify(letter)}）。`);
  }
  return index;
}

/** 段番号(1..9) → エンジンの段(9..1)。 */
export function rankToEngineRank(rank) {
  assertRange(rank, 1, 9, "段");
  return 10 - rank;
}

/** エンジンの段(1..9) → 段番号(9..1)。 */
export function engineRankToRank(engineRank) {
  assertRange(engineRank, 1, 9, "エンジンの段");
  return 10 - engineRank;
}

/** (列, 段) → エンジン記法のマス。例: (2, 8) → "h2"。 */
export function squareToEngine(column, rank) {
  return fileIndexToEngineFile(columnToFileIndex(column)) + rankToEngineRank(rank);
}

/** エンジン記法のマス → { column, rank }。例: "h2" → { column: 2, rank: 8 }。 */
export function engineToSquare(square) {
  if (typeof square !== "string" || !/^[a-i][1-9]$/.test(square)) {
    throw new RangeError(
      `マスは a から i の筋文字と 1 から 9 の段を並べた 2 文字です（受け取った値: ${JSON.stringify(square)}）。`,
    );
  }
  return {
    column: 9 - engineFileToFileIndex(square[0]),
    rank: engineRankToRank(Number(square[1])),
  };
}
