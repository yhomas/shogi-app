// 指し手の照合と適用。
//
// 指し手はエンジンの記法（仕様 2.4）で扱う。
//   - 移動: 「from + to」の4文字。例 c3c4（7七→7六）
//   - 成り: 末尾に + を付ける。例 e8e9+
//   - 打ち: 「駒の種類 + @ + to」。例 P@e5（歩を5五へ打つ）。
//     駒の種類は手番によらず大文字に揃える（エンジンの返し方に左右されないようにするため）。
//
// 合法手の判定そのものはエンジンに任せる。このモジュールは、エンジンが返した合法手を
// 画面で使える形にし、選ばれた手を局面に適用する。

import { boardIndex } from "./state.js";
import { engineToSquare, boardToSfen } from "./coords.js";

/** 打つ手かどうか。 */
export function isDrop(move) {
  return /^[A-Za-z]@/.test(move);
}

/** 成る手かどうか（末尾の +）。 */
export function isPromotion(move) {
  return move.endsWith("+");
}

/**
 * あるマス（または持ち駒）から行ける先を、合法手の一覧から抜き出す。
 * @param {string[]} moves エンジンが返した合法手
 * @param {string} from マス（例 "h2"）または持ち駒（例 "P@"）
 * @returns {string[]} 行き先のマス。成りの + は外す。
 */
export function destinationsFrom(moves, from) {
  const destinations = [];
  for (const move of moves) {
    if (!move.startsWith(from)) continue;
    const to = move.slice(from.length).replace(/\+$/, "");
    if (to) destinations.push(to);
  }
  return destinations;
}

/**
 * 指そうとしている行き先に対応する手を、合法手の一覧から決める。
 * 成る手と成らない手の両方が合法なときだけ、本人に選んでもらう必要がある。
 * @param {string[]} moves エンジンが返した合法手
 * @param {string} from マス（例 "e8"）または持ち駒（例 "P@"）
 * @param {string} to 行き先のマス（例 "e9"）
 * @returns {{move: string|null, needsPromotionChoice: boolean, plain?: string, promoted?: string}|null}
 *   合法な手が無ければ null
 */
export function resolveMove(moves, from, to) {
  const plain = `${from}${to}`;
  const promoted = `${plain}+`;
  const hasPlain = moves.includes(plain);
  const hasPromoted = moves.includes(promoted);

  if (hasPlain && hasPromoted) {
    return { move: null, needsPromotionChoice: true, plain, promoted };
  }
  if (hasPromoted) return { move: promoted, needsPromotionChoice: false };
  if (hasPlain) return { move: plain, needsPromotionChoice: false };
  return null;
}

function cloneHands(hands) {
  return {
    w: { ...hands.w },
    b: { ...hands.b },
  };
}

/**
 * 指し手を局面に適用した新しい局面を返す。元の局面は書き換えない
 * （待ったで戻せるようにするため）。
 * @param {{board: (object|null)[], hands: object, turn: string}} position
 * @param {string} move
 * @returns {{board: (object|null)[], hands: object, turn: string}}
 */
export function applyMove(position, move) {
  const board = position.board.slice();
  const hands = cloneHands(position.hands);
  const mover = position.turn;
  const opponent = mover === "w" ? "b" : "w";

  if (isDrop(move)) {
    const [letter, to] = move.split("@");
    const type = letter.toUpperCase();
    const { column, rank } = engineToSquare(to);
    board[boardIndex(column, rank)] = { type, owner: mover, promoted: false };
    hands[mover][type] -= 1;
    return { board, hands, turn: opponent };
  }

  const from = move.slice(0, 2);
  const to = move.slice(2, 4);
  const fromSquare = engineToSquare(from);
  const toSquare = engineToSquare(to);
  const fromIndex = boardIndex(fromSquare.column, fromSquare.rank);
  const toIndex = boardIndex(toSquare.column, toSquare.rank);

  const piece = board[fromIndex];
  if (!piece) {
    throw new Error(`動かす駒がありません: ${move}`);
  }

  // 取った駒は持ち駒に加える。成駒は元の種類に戻す。
  const captured = board[toIndex];
  if (captured) {
    hands[mover][captured.type] += 1;
  }

  board[fromIndex] = null;
  board[toIndex] = {
    type: piece.type,
    owner: piece.owner,
    promoted: isPromotion(move) || piece.promoted,
  };

  return { board, hands, turn: opponent };
}

/**
 * 棋譜の手列を、エンジンに照合しながら順に再生する。
 * 途中に合法でない手があれば、そこで止めて何手目かを報告する。
 * 黙って別の局面を再現しないための検査でもある。
 * @param {object} engine
 * @param {object} startPosition
 * @param {string[]} moves
 * @param {number} [upto] 何手目まで再生するか（既定は最後まで）
 * @returns {Promise<{position: object, invalidAtIndex: number, move?: string, legal?: string[]}>}
 */
export async function replayMoves(engine, startPosition, moves, upto = moves.length) {
  let position = startPosition;
  let previousPosition = startPosition;
  const limit = Math.max(0, Math.min(upto, moves.length));

  for (let index = 0; index < limit; index += 1) {
    const move = moves[index];
    const legal = await enumerateLegalMoves(engine, position);
    if (!legal.includes(move)) {
      return { position, previousPosition, invalidAtIndex: index, move, legal };
    }
    previousPosition = position;
    position = applyMove(position, move);
  }

  return { position, previousPosition, invalidAtIndex: -1 };
}

/** 駒打ちの文字は大文字に揃える。エンジンの返し方に左右されないようにするため。 */
function normalizeDrop(move) {
  return move.includes("@") ? move[0].toUpperCase() + move.slice(1) : move;
}

/**
 * エンジンに聞いて、その局面の合法手を漏れなく集める。
 * perft 1 を使う。MultiPV を使う方法と違って手数の上限に縛られない。
 * @param {{setOption: Function, setPositionSfen: Function, goPerft: Function, subscribe: Function}} engine
 * @param {{board: (object|null)[], hands: object, turn: string}} position
 * @returns {Promise<string[]>}
 */
export async function enumerateLegalMoves(engine, position) {
  const collected = new Set();
  const movePattern = /^([a-i][1-9][a-i][1-9]\+?|[A-Za-z]@[a-i][1-9])\s*:\s*\d+/;

  const unsubscribe = engine.subscribe((line) => {
    const match = line.match(movePattern);
    if (match) collected.add(normalizeDrop(match[1]));
  });

  try {
    engine.setPositionSfen(boardToSfen(position));
    await engine.goPerft(1);
  } finally {
    unsubscribe();
  }

  return [...collected];
}
