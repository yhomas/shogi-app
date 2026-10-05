// 指す前に確認する項目（チェック項目）の保存と、表示条件の判定。
//
// 条件は「直前の相手の指し手」と「今の盤面」から判定する（仕様 4.4）。
// `piece` の判定は成駒を元の種類として扱う（`rook` は龍も含む）。
//
// 動かした駒の種類は、本来なら「指す前」の盤面でしか分からない。
// そのため Context には lastMoveInfo（手を適用する時点で作った情報）を渡せるようにし、
// 無い場合は従来どおり現在の盤面の移動元マスから推定する。

import { boardIndex } from "./state.js";
import { engineToSquare } from "./coords.js";
import { countAttacks } from "./attack-map.js";

const STORAGE_KEY = "shogi-app.checklist.v1";
const PRIORITY_ORDER = { high: 0, normal: 1, low: 2 };

const PIECE_NAMES = {
  pawn: "P", lance: "L", knight: "N", silver: "S", gold: "G",
  bishop: "B", rook: "R", king: "K",
};

function specToTypes(spec) {
  return String(spec ?? "")
    .split(/[_,、\s]+/)
    .filter(Boolean)
    .map((name) => PIECE_NAMES[name])
    .filter(Boolean);
}

function pieceMatches(piece, spec) {
  const raw = String(spec ?? "").trim();
  // 指定が無ければ「種類を問わない」
  if (raw === "") return true;
  const types = specToTypes(raw);
  // 解釈できない指定は一致させない。
  // ここで true を返すと、綴りを間違えた条件が毎手成立してしまう。
  if (types.length === 0) return false;
  return Boolean(piece) && types.includes(piece.type);
}

function squareIndex(square) {
  const { column, rank } = engineToSquare(square);
  return boardIndex(column, rank);
}

function isItem(item) {
  return Boolean(item) && typeof item === "object" && typeof item.text === "string";
}

/** 直前の手の情報。lastMoveInfo があればそれを、無ければ盤面から推定する。 */
function movedPiece(context) {
  if (context.lastMoveInfo) return context.lastMoveInfo;
  const lastMove = context.lastMove;
  if (!lastMove) return null;

  if (lastMove.includes("@")) {
    const [, to] = lastMove.split("@");
    return {
      from: null, to, isDrop: true, promoted: false,
      type: String(lastMove[0]).toUpperCase(), owner: null,
    };
  }

  const from = lastMove.slice(0, 2);
  const to = lastMove.slice(2, 4);
  const piece = context.position?.board?.[squareIndex(from)] ?? null;
  return {
    from, to, isDrop: false,
    type: piece ? piece.type : null,
    owner: piece ? piece.owner : null,
    promoted: piece ? piece.promoted : false,
  };
}

function kingIndex(position, side) {
  const index = position.board.findIndex((piece) => piece && piece.type === "K" && piece.owner === side);
  return index;
}

/** その側の玉が、相手の利きに入っているか。 */
function kingAttacked(position, side) {
  const index = kingIndex(position, side);
  if (index === -1) return false;
  const attacks = countAttacks(position);
  const attacker = side === "w" ? "b" : "w";
  return attacks[attacker][index] > 0;
}

/** その側の持ち駒に、指定の駒があるか。 */
function handHas(position, side, spec) {
  const hands = position.hands?.[side] ?? {};
  return specToTypes(spec).some((type) => (hands[type] ?? 0) > 0);
}

/**
 * 条件が今の状況に当てはまるか。
 *
 * context.opponentCaptured / myCaptured は「直前の手で取った駒」（無ければ null）。
 * 盤面からは分からない（取った駒はもう盤上に無い）ので、呼ぶ側が渡す。
 * @param {{type: string, piece?: string}} condition
 * @param {{position: object, lastMove: string|null, lastMoveInfo?: object|null, opponentCaptured?: object|null, myCaptured?: object|null, ply: number, mySide: "w"|"b"}} context
 * @returns {boolean}
 */
export function matchesCondition(condition, context) {
  if (!condition) return false;
  const mySide = context.mySide;
  const opponent = mySide === "w" ? "b" : "w";
  const position = context.position;

  switch (condition.type) {
    case "always":
      return true;

    case "opponentMovedPiece": {
      const moved = movedPiece(context);
      if (!moved || moved.isDrop) return moved ? pieceMatches({ type: moved.type }, condition.piece) : false;
      return pieceMatches({ type: moved.type, promoted: moved.promoted }, condition.piece);
    }

    case "opponentInCheck":
      return kingAttacked(position, opponent);

    case "opponentCapturedPiece":
      return pieceMatches(context.opponentCaptured, condition.piece);

    case "opponentHandHasPiece":
      return handHas(position, opponent, condition.piece);

    case "myKingThreatened":
      return kingAttacked(position, mySide);

    case "myCapturedPiece":
      return pieceMatches(context.myCaptured, condition.piece);

    case "handHasPiece":
      return handHas(position, mySide, condition.piece);

    default:
      return false;
  }
}

/**
 * 表示すべき項目を返す。有効で、条件に当てはまるものだけ。優先度の高い順。
 */
export function evaluate(items, context) {
  return (items ?? [])
    .filter((item) => isItem(item) && item.enabled !== false && matchesCondition(item.condition, context))
    .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1));
}

/**
 * 保存されている項目を読む。壊れていても例外を投げず、空配列に戻す。
 */
export function loadItems(storage = globalThis.localStorage) {
  if (!storage || typeof storage.getItem !== "function") return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isItem);
  } catch (error) {
    return [];
  }
}

/** 項目を保存する。保存できない場合も例外を投げない。 */
export function saveItems(items, storage = globalThis.localStorage) {
  if (!storage || typeof storage.setItem !== "function") return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(items ?? []));
  } catch (error) {
    // 容量超過など。保存できなくても対局は続けられるようにする。
  }
}
