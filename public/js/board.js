// 盤面の描画。駒と、各マスの利き数を出す。
//
// 表示の約束（仕様 4.2）:
//   - 自分の利き数はマスの右下に青、相手の利き数は左上に赤
//   - 濃さは利きの数に応じて5段階（attackOpacity）
//   - 自分の利きと相手の利きが両方あるマスは、斜めに2分割して左上が赤・右下が青
//   - 相手の駒は180度回転して置く
//
// DOM の組み立てだけを行い、状態は持たない。呼ばれるたびに rootEl を作り直す。

import { countAttacks } from "./attack-map.js";
import { boardIndex } from "./state.js";

const PIECE_GLYPH = { P: "歩", L: "香", N: "桂", S: "銀", G: "金", B: "角", R: "飛", K: "玉" };
const PROMOTED_GLYPH = { P: "と", L: "杏", N: "圭", S: "全", B: "馬", R: "龍" };

const OPACITY_BY_COUNT = { 0: 0, 1: 0.15, 2: 0.3, 3: 0.45, 4: 0.6 };
const OPACITY_MAX = 0.75;

const MINE_RGB = "60, 120, 220";
const OPP_RGB = "220, 60, 60";

/**
 * 利き数に対応する色の濃さ。0 なら塗らない。
 * @param {number} count
 * @returns {number} 0 から 0.75
 */
export function attackOpacity(count) {
  if (count <= 0) return 0;
  return OPACITY_BY_COUNT[count] ?? OPACITY_MAX;
}

function rgba(rgb, alpha) {
  return `rgba(${rgb}, ${alpha})`;
}

function squareBackground(mineCount, oppCount) {
  if (mineCount > 0 && oppCount > 0) {
    // 左上が相手（赤）、右下が自分（青）
    return `linear-gradient(to bottom right, ${rgba(OPP_RGB, attackOpacity(oppCount))} 50%, ${rgba(MINE_RGB, attackOpacity(mineCount))} 50%)`;
  }
  if (mineCount > 0) return rgba(MINE_RGB, attackOpacity(mineCount));
  if (oppCount > 0) return rgba(OPP_RGB, attackOpacity(oppCount));
  return "";
}

function pieceGlyph(piece) {
  if (piece.promoted) return PROMOTED_GLYPH[piece.type] ?? PIECE_GLYPH[piece.type];
  return PIECE_GLYPH[piece.type];
}

/**
 * 盤面を描く。
 * @param {Element} rootEl 盤面を入れる要素（中身は作り直す）
 * @param {{board: (object|null)[], hands: object, turn: string}} position
 * @param {{
 *   attacks?: {w: Int16Array|number[], b: Int16Array|number[]},
 *   mode?: "both"|"mine"|"opp"|"none",
 *   mySide?: "w"|"b",
 *   selected?: string|null,
 *   destinations?: string[],
 * }} [options]
 */
export function renderBoard(rootEl, position, options = {}) {
  const {
    attacks = countAttacks(position),
    mode = "both",
    mySide = "w",
    selected = null,
    destinations = [],
  } = options;

  const oppSide = mySide === "w" ? "b" : "w";
  const showMine = mode === "both" || mode === "mine";
  const showOpp = mode === "both" || mode === "opp";
  const destinationSet = new Set(destinations);

  rootEl.innerHTML = "";
  rootEl.dataset.mySide = mySide;

  for (let rank = 1; rank <= 9; rank += 1) {
    for (let column = 9; column >= 1; column -= 1) {
      const index = boardIndex(column, rank);
      const mineCount = showMine ? attacks[mySide][index] : 0;
      const oppCount = showOpp ? attacks[oppSide][index] : 0;

      const square = document.createElement("div");
      square.className = "sq";
      square.dataset.index = String(index);
      square.dataset.column = String(column);
      square.dataset.rank = String(rank);

      const background = squareBackground(mineCount, oppCount);
      if (background) square.style.background = background;

      const piece = position.board[index];
      if (piece) {
        const el = document.createElement("div");
        el.className = `piece${piece.owner === mySide ? "" : " opposite"}`;
        el.textContent = pieceGlyph(piece);
        square.appendChild(el);
      }

      // 相手の利きは左上、自分の利きは右下
      if (oppCount > 0) {
        const el = document.createElement("span");
        el.className = "cnt opp";
        el.textContent = String(oppCount);
        square.appendChild(el);
      }
      if (mineCount > 0) {
        const el = document.createElement("span");
        el.className = "cnt mine";
        el.textContent = String(mineCount);
        square.appendChild(el);
      }

      if (String(index) === String(selected)) square.classList.add("selected");
      if (destinationSet.has(String(index)) || destinationSet.has(index)) {
        square.classList.add("dest");
      }

      rootEl.appendChild(square);
    }
  }
}
