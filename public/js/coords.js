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

// ---- SFEN ----
//
// 同梱エンジンとのやり取りに使う文字列（仕様 2.6）。実測で確定した書式:
//   <9行を / で連結。1行目が1段、行内は9列→1列。成駒は + を前置>
//   [持ち駒。空は -]
//   <手番 w|b> <手数> <手数>
// 例: lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL[-] w 0 1
//
// 持ち駒の並びは 飛・角・金・銀・桂・香・歩。先手は大文字、後手は小文字。
// 2枚以上は枚数を前置する（例 2R）。
//
// このモジュールは他のモジュールを読み込まない（仕様 3 の依存表）。
// 添字の計算は columnToFileIndex を使って自前で書く。state.js の boardIndex と
// 同じ式だが、依存を増やさないことを優先している。

/** SFEN の駒文字（玉・飛・角・金・銀・桂・香・歩）。 */
const SFEN_PIECE_LETTERS = ["K", "R", "B", "G", "S", "N", "L", "P"];

/** 持ち駒を書き出す順番。飛・角・金・銀・桂・香・歩。 */
const SFEN_HAND_ORDER = ["R", "B", "G", "S", "N", "L", "P"];

/** FEN の行内インデックス。state.js の boardIndex と同じ式。 */
function boardSlot(column, rank) {
  return (rank - 1) * 9 + columnToFileIndex(column);
}

function emptyHandCounts() {
  return { P: 0, L: 0, N: 0, S: 0, G: 0, B: 0, R: 0 };
}

function pieceFromLetter(letter) {
  const upper = letter.toUpperCase();
  if (!SFEN_PIECE_LETTERS.includes(upper)) {
    throw new Error(`駒を表す文字として解釈できません: ${JSON.stringify(letter)}`);
  }
  // 大文字は先手、小文字は後手
  return { type: upper, owner: letter === upper ? "w" : "b" };
}

function handToSfen(hand, upperCase) {
  let out = "";
  for (const type of SFEN_HAND_ORDER) {
    const count = hand[type];
    if (!count) continue;
    out += (count > 1 ? String(count) : "") + (upperCase ? type : type.toLowerCase());
  }
  return out;
}

function handsToSfen(hands) {
  const body = handToSfen(hands.w, true) + handToSfen(hands.b, false);
  return body === "" ? "[-]" : `[${body}]`;
}

function parseHandsInto(field, hands) {
  if (field === "" || field === "-") return;
  let digits = "";
  for (const letter of field) {
    if (letter >= "0" && letter <= "9") {
      digits += letter;
      continue;
    }
    const { type, owner } = pieceFromLetter(letter);
    if (type === "K") {
      throw new Error("玉を持ち駒にすることはできません。");
    }
    hands[owner][type] += digits === "" ? 1 : Number(digits);
    digits = "";
  }
}

/**
 * 局面を SFEN にする。持ち駒の枚数・成駒・手番を含む。
 * @param {{board: (object|null)[], hands: {w: object, b: object}, turn: string}} position
 * @returns {string}
 */
export function boardToSfen(position) {
  const rows = [];
  for (let rank = 1; rank <= 9; rank += 1) {
    let row = "";
    let blank = 0;
    for (let column = 9; column >= 1; column -= 1) {
      const piece = position.board[boardSlot(column, rank)];
      if (!piece) {
        blank += 1;
        continue;
      }
      if (blank > 0) {
        row += String(blank);
        blank = 0;
      }
      const letter = piece.owner === "w" ? piece.type : piece.type.toLowerCase();
      row += (piece.promoted ? "+" : "") + letter;
    }
    if (blank > 0) row += String(blank);
    rows.push(row);
  }
  return `${rows.join("/")}${handsToSfen(position.hands)} ${position.turn} 0 1`;
}

/**
 * SFEN を局面にする。boardToSfen の逆。
 * 手番より後ろ（手数など）は読み飛ばすので、`b - - 0 1` のような形も受け付ける。
 * @param {string} sfen
 * @returns {{board: (object|null)[], hands: {w: object, b: object}, turn: string}}
 */
export function parseSfen(sfen) {
  if (typeof sfen !== "string" || sfen.trim() === "") {
    throw new Error("SFEN が空です。");
  }
  const fields = sfen.trim().split(/\s+/);

  // 持ち駒は最終行の末尾に空白なしで付く（例: ...LNSGKGSNL[-]）
  let boardField = fields[0];
  let handsField = "";
  const handsStart = boardField.indexOf("[");
  if (handsStart !== -1) {
    const handsEnd = boardField.indexOf("]", handsStart);
    if (handsEnd === -1) {
      throw new Error(`持ち駒の閉じ括弧がありません: ${JSON.stringify(sfen)}`);
    }
    handsField = boardField.slice(handsStart + 1, handsEnd);
    boardField = boardField.slice(0, handsStart);
  }

  const rows = boardField.split("/");
  if (rows.length !== 9) {
    throw new Error(`盤面は9行です（${rows.length}行ありました）。`);
  }

  const board = new Array(81).fill(null);
  rows.forEach((row, index) => {
    const rank = index + 1;
    let column = 9;
    let promoted = false;
    for (const letter of row) {
      if (letter === "+") {
        promoted = true;
        continue;
      }
      if (letter >= "1" && letter <= "9") {
        column -= Number(letter);
        continue;
      }
      if (column < 1) {
        throw new Error(`${rank}段目の駒が多すぎます。`);
      }
      const { type, owner } = pieceFromLetter(letter);
      board[boardSlot(column, rank)] = { type, owner, promoted };
      promoted = false;
      column -= 1;
    }
  });

  const hands = { w: emptyHandCounts(), b: emptyHandCounts() };
  parseHandsInto(handsField, hands);

  return { board, hands, turn: fields[1] === "b" ? "b" : "w" };
}

