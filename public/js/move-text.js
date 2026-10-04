// 指し手を棋譜の書き方（▲７八金、△７八金打、▲５八金右 など）に直す。
//
// 読み筋の表示に使う。左/右/上/下は「同じ名前の駒が同じマスへ行けるか」で決まるので、
// その局面の合法手が分かるときだけ付ける（分からないときは付けない）。

import { squareToJapanese } from "./pv-text.js";
import { applyMove } from "./moves.js";

const FILES = "abcdefghi";
const PIECE_KANJI = { P: "歩", L: "香", N: "桂", S: "銀", G: "金", B: "角", R: "飛", K: "玉" };
const PROMOTED_KANJI = { P: "と", L: "杏", N: "圭", S: "全", B: "馬", R: "龍" };

/** 盤面のインデックス（board.js の並びと同じ。(段-1)*9 + (9-筋)）。 */
function indexOf(engineSquare) {
  const column = 9 - FILES.indexOf(engineSquare[0]);
  const row = 10 - Number(engineSquare[1]);
  return (row - 1) * 9 + (9 - column);
}

/** 駒の名前（成っている駒は成った後の名前）。 */
function nameOf(piece) {
  if (!piece) return "";
  if (piece.promoted) return PROMOTED_KANJI[piece.type] ?? PIECE_KANJI[piece.type];
  return PIECE_KANJI[piece.type];
}

/** 筋（１〜９。左の９が大きい）。 */
function fileOf(engineSquare) {
  return 9 - FILES.indexOf(engineSquare[0]);
}

/** 段（１〜９。下の９が大きい）。 */
function rankOf(engineSquare) {
  return 10 - Number(engineSquare[1]);
}

/**
 * 同じ名前の駒が同じマスへ行けるときの「右・左・上・下」。
 * 先手は筋の小さい方が右、段の大きい方が下。後手は逆。
 */
function disambiguation(from, to, position, legalMoves) {
  if (!Array.isArray(legalMoves) || legalMoves.length === 0) return "";
  const target = position.board[indexOf(from)];
  if (!target) return "";
  const name = nameOf(target);

  const rivals = [];
  for (const move of legalMoves) {
    const found = String(move).match(/^([a-i][1-9])([a-i][1-9])\+?$/);
    if (!found || found[2] !== to) continue;
    const other = position.board[indexOf(found[1])];
    if (other && other.owner === target.owner && nameOf(other) === name) rivals.push(found[1]);
  }
  if (rivals.length <= 1) return "";

  const files = rivals.map(fileOf);
  const ranks = rivals.map(rankOf);

  if (new Set(files).size === rivals.length) {
    // 筋が全部違う → 右・左
    const mine = fileOf(from);
    if (target.owner === "w") return mine === Math.min(...files) ? "右" : "左";
    return mine === Math.min(...files) ? "左" : "右";
  }
  if (new Set(ranks).size === rivals.length) {
    // 段が全部違う → 上・下
    const mine = rankOf(from);
    if (target.owner === "w") return mine === Math.max(...ranks) ? "下" : "上";
    return mine === Math.min(...ranks) ? "下" : "上";
  }
  return "";
}

/**
 * 指し手を棋譜の書き方に直す。
 *   "g2g3"   → "▲７八金"
 *   "P@e5"   → "▲５五歩打"
 * @param {string} move
 * @param {object} position 指す前の局面
 * @param {string[]|null} [legalMoves] その局面の合法手（分かるときだけ渡す）
 * @returns {string}
 */
export function shogiMoveText(move, position, legalMoves = null) {
  const text = String(move ?? "");
  const mark = position && position.turn === "b" ? "△" : "▲";

  const drop = text.match(/^([A-Za-z])@([a-i][1-9])$/);
  if (drop) {
    const name = PIECE_KANJI[drop[1].toUpperCase()] ?? "";
    return `${mark}${squareToJapanese(drop[2])}${name}打`;
  }

  const found = text.match(/^([a-i][1-9])([a-i][1-9])(\+?)$/);
  if (!found || !position) return text;

  const piece = position.board ? position.board[indexOf(found[1])] : null;
  if (!piece) return squareToJapanese(found[2]);

  const suffix = disambiguation(found[1], found[2], position, legalMoves);
  return `${mark}${squareToJapanese(found[2])}${nameOf(piece)}${suffix}${found[3] ? "成" : ""}`;
}

export { nameOf };

/**
 * 読み筋を、棋譜の書き方で並べる。
 *
 * 指し手を順に適用しながら駒の名前を調べるので、2手目以降も「▲７六歩」の形で出る。
 * 左/右/上/下は「同じ名前の駒がそのマスへ行けるか」で決まるため、その局面の合法手が
 * 分かっているときだけ付ける（いまは先頭の1手だけ）。
 *
 * @param {string[]} pv
 * @param {object} position 読み筋の出発点の局面
 * @param {string[]|null} [legalMoves] 出発点の合法手
 * @returns {string}
 */
export function shogiPvText(pv, position, legalMoves = null) {
  if (!Array.isArray(pv) || pv.length === 0 || !position) return "";
  const parts = [];
  // 持ち駒の情報が無い局面でも落ちないようにそろえる
  let current = position.hands ? position : { ...position, hands: { w: {}, b: {} } };
  try {
    pv.forEach((move, index) => {
      parts.push(shogiMoveText(move, current, index === 0 ? legalMoves : null));
      current = applyMove(current, move);
    });
  } catch (error) {
    return pv.join(" ");
  }
  return parts.join(" ");
}
