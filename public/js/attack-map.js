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
 * その駒が、この向きに進めるとしたら最大何マスか。
 *
 *   0        … この向きには進めない（桂、横向きの歩、縦横の向きの角など）
 *   1        … 1マスだけ進める（歩・金・銀・玉など）
 *   SLIDE    … 何マスでも進める（香・飛・角、龍の縦横、馬の斜め）
 *
 * @param {{type: string, owner: string, promoted: boolean}} piece
 * @param {number} dRank 段の増分（先手から見た向き）
 * @param {number} dColumn 列の増分
 * @param {number} forward その駒の向き（先手 1 / 後手 -1）
 * @returns {number}
 */
function stepsInDirection(piece, dRank, dColumn, forward) {
  const stepRank = dRank * forward;
  const pieceForward = piece.owner === "w" ? 1 : -1;
  for (const [mRank, mColumn, maxSteps] of movementOf(piece)) {
    if (mRank * pieceForward === stepRank && mColumn === dColumn) return maxSteps;
  }
  return 0;
}

/**
 * from の駒が to へ動けるか。利きの計算と同じ規則を使う。
 * kif で移動元が省略されているときに、盤面から駒を特定するために使う（仕様4.3.4）。
 * @param {object} position
 * @param {number} fromColumn
 * @param {number} fromRank
 * @param {number} toColumn
 * @param {number} toRank
 * @returns {boolean}
 */
export function canMoveTo(position, fromColumn, fromRank, toColumn, toRank) {
  const piece = position.board[boardIndex(fromColumn, fromRank)];
  if (!piece) return false;

  const forward = piece.owner === "w" ? 1 : -1;
  for (const [dRank, dColumn, maxSteps] of movementOf(piece)) {
    const stepRank = dRank * forward;
    let r = fromRank + stepRank;
    let c = fromColumn + dColumn;
    let steps = 0;

    while (steps < maxSteps && r >= 1 && r <= 9 && c >= 1 && c <= 9) {
      if (r === toRank && c === toColumn) return true;
      if (position.board[boardIndex(c, r)]) break;
      r += stepRank;
      c += dColumn;
      steps += 1;
    }
  }
  return false;
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
      // この向きに2マス以上進める駒が、この線上にいくつあるか（手前の駒を含む）。
      // 2つ以上たまると、味方を越えてその先も数え続ける（数の攻めが届く範囲）。
      let sliders = maxSteps === SLIDE ? 1 : 0;
      let budget = maxSteps;

      while (budget > 0 && r >= 1 && r <= 9 && c >= 1 && c <= 9) {
        const target = boardIndex(c, r);
        squares[target] += 1;
        const blocker = position.board[target];
        if (blocker) {
          // 駒に当たったら、そのマスは数えたうえで止まる。
          if (blocker.owner !== piece.owner) break;
          const blockerSteps = stepsInDirection(blocker, dRank, dColumn, forward);
          // その向きに進めない駒（桂など）で止まる
          if (blockerSteps === 0) break;
          if (blockerSteps === SLIDE) sliders += 1;
          // 2マス以上進める駒が2つ以上なら、その先も数え続ける。
          // 1つだけなら、ぶつかった駒の次の1マスまで。
          budget = sliders >= 2 ? Infinity : 2;
        }
        r += stepRank;
        c += dColumn;
        budget -= 1;
      }
    }
  }

  return counts;
}
