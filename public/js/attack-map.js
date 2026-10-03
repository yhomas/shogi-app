// 各マスに、先手／後手の駒がそれぞれ何個利いているかを数える。
//
// ここでいう「利き」は「そのマスに動ける（そのマスを守れる・取れる）駒の数」。
// 将棋の利きと同じで、次の2点をこのアプリの約束とする（仕様 4.2 の決定事項）。
//   - 自駒がいるマスにも数える（そのマスを守っている駒として意味があるため）
//   - 飛び駒は最初に当たった駒のマスまで数えて、そこで止まる
//
// 段の向きに注意: このアプリでは段番号は 1（後手の後ろ段）から 9（先手の後ろ段）へ増える。
// 先手の「前」は段番号が減る向き、後手の「前」は増える向き。方向表は先手の向きで書き、
// 後手のときは段の成分の符号を反転する。

import { boardIndex } from "./state.js";

const STEP = 1;
const SLIDE = Infinity;

// [段の増分, 列の増分, 最大歩数]。段の増分は先手から見た向き。
const GOLD_DIRECTIONS = [
  [-1, -1, STEP], [-1, 0, STEP], [-1, 1, STEP],
  [0, -1, STEP], [0, 1, STEP],
  [1, 0, STEP],
];

const KING_DIRECTIONS = [
  [-1, -1, STEP], [-1, 0, STEP], [-1, 1, STEP],
  [0, -1, STEP], [0, 1, STEP],
  [1, -1, STEP], [1, 0, STEP], [1, 1, STEP],
];

const DIAGONALS = [[-1, -1, SLIDE], [-1, 1, SLIDE], [1, -1, SLIDE], [1, 1, SLIDE]];
const ORTHOGONALS = [[-1, 0, SLIDE], [1, 0, SLIDE], [0, -1, SLIDE], [0, 1, SLIDE]];
const ORTHOGONAL_STEPS = ORTHOGONALS.map(([dRank, dColumn]) => [dRank, dColumn, STEP]);
const DIAGONAL_STEPS = DIAGONALS.map(([dRank, dColumn]) => [dRank, dColumn, STEP]);

const SILVER_DIRECTIONS = [
  [-1, -1, STEP], [-1, 0, STEP], [-1, 1, STEP],
  [1, -1, STEP], [1, 1, STEP],
];

const BEFORE_PROMOTION = {
  P: [[-1, 0, STEP]],            // 歩: 前に1マス
  L: [[-1, 0, SLIDE]],           // 香: 前に何マスでも
  N: [[-2, -1, STEP], [-2, 1, STEP]], // 桂: 前に2マス＋左右1マス
  S: SILVER_DIRECTIONS,
  G: GOLD_DIRECTIONS,
  K: KING_DIRECTIONS,
  B: DIAGONALS,
  R: ORTHOGONALS,
};

/**
 * その駒が利く方向の一覧。
 * @param {{type: string, owner: string, promoted: boolean}} piece
 * @returns {number[][]} [段の増分, 列の増分, 最大歩数] の配列（段は先手から見た向き）
 */
function movementOf(piece) {
  if (piece.promoted) {
    switch (piece.type) {
      // と・成香・成桂・成銀は金と同じ
      case "P": case "L": case "N": case "S":
        return GOLD_DIRECTIONS;
      // 馬は角に加えて縦横に1マス
      case "B":
        return [...DIAGONALS, ...ORTHOGONAL_STEPS];
      // 龍は飛に加えて斜めに1マス
      case "R":
        return [...ORTHOGONALS, ...DIAGONAL_STEPS];
      default:
        // 金と玉は成れない
        break;
    }
  }
  const directions = BEFORE_PROMOTION[piece.type];
  if (!directions) {
    throw new Error(`知らない駒の種類です: ${JSON.stringify(piece.type)}`);
  }
  return directions;
}

/**
 * 各マスの利き数を数える。
 * @param {{board: (object|null)[], hands: object, turn: string}} position
 * @returns {{w: Int16Array, b: Int16Array}} 添字は boardIndex と同じ
 */
export function countAttacks(position) {
  const counts = { w: new Int16Array(81), b: new Int16Array(81) };

  for (let index = 0; index < 81; index += 1) {
    const piece = position.board[index];
    if (!piece) continue;

    const squares = counts[piece.owner];
    // 方向表は先手の向き（段番号が減る向きが前）で書いてあるので、
    // 後手のときは段の成分の符号を反転する。
    const forward = piece.owner === "w" ? 1 : -1;
    const rank = Math.floor(index / 9) + 1;
    const column = 9 - (index % 9);

    for (const [dRank, dColumn, maxSteps] of movementOf(piece)) {
      const stepRank = dRank * forward;
      let r = rank + stepRank;
      let c = column + dColumn;
      let steps = 0;

      while (steps < maxSteps && r >= 1 && r <= 9 && c >= 1 && c <= 9) {
        const target = boardIndex(c, r);
        squares[target] += 1;
        // 駒に当たったら、自駒でも数えたうえでそこで止まる
        if (position.board[target]) break;
        r += stepRank;
        c += dColumn;
        steps += 1;
      }
    }
  }

  return counts;
}
