// kif（柿木将棋形式）の棋譜を読み、エンジン記法の指し手に変換する。
//
// 実装で気をつけている点:
//   - 「(77)」は消費時間ではなく移動元のマス。指し手本体の直後の括弧だけを移動元として読む。
//     消費時間は「( 0:01/00:00:01)」のように空白から始まるので、数字2桁の括弧とは区別できる。
//   - 「同」は直前の手の移動先。
//   - 「打」は駒打ち。移動元が無い。
//   - 「不成」は成らない。それ以外の「成」および と・馬・龍・成香・成桂・成銀 は成り。
//   - 「変化：N手」以降は本筋ではないので読み飛ばす。
//   - 盤面図から始まる棋譜（途中図）には対応しない。見つけたら理由を付けて記録する。
//     黙って別の局面を再現するより、読めないと言うほうが安全なため。

import { createInitialPosition, HAND_PIECE_TYPES } from "./state.js";
import { squareToEngine, engineToSquare } from "./coords.js";
import { applyMove } from "./moves.js";
import { canMoveTo } from "./attack-map.js";
import { parseKifPosition } from "./kif-position.js";

const RANK_KANJI = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];

// 位置が先に来るものから順に見る（「成銀」を「銀」と読まないため）
const PIECE_TOKENS = [
  "成香", "成桂", "成銀", "と", "馬", "龍", "竜",
  "歩", "香", "桂", "銀", "金", "角", "飛", "玉", "王",
];

const PIECE_TYPE = {
  歩: "P", 香: "L", 桂: "N", 銀: "S", 金: "G", 角: "B", 飛: "R", 玉: "K", 王: "K",
  と: "P", 馬: "B", 龍: "R", 竜: "R", 成香: "L", 成桂: "N", 成銀: "S",
  // 持ち駒の行で使われる長い名前（仕様 4.3 の例「桂馬 二 銀 一」）
  歩兵: "P", 香車: "L", 桂馬: "N", 銀将: "S", 金将: "G", 角行: "B", 飛車: "R",
  玉将: "K", 王将: "K",
};

const ALREADY_PROMOTED = new Set(["と", "馬", "龍", "竜", "成香", "成桂", "成銀"]);

const RESULT_WORDS = [
  "投了", "中断", "詰み", "不詰", "千日手", "持将棋", "切れ負け", "反則勝ち", "反則負け",
  "入玉勝ち", "宣言勝ち", "時間切れ",
];

const KANJI_DIGIT = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

/** 全角数字と全角括弧を半角にする。 */
function normalize(text) {
  return text
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/（/g, "(")
    .replace(/）/g, ")");
}

function kanjiOrDigit(text) {
  if (text >= "1" && text <= "9") return Number(text);
  return KANJI_DIGIT[text] ?? 0;
}

function parseCount(text) {
  if (text === "") return 1;
  if (/^[0-9]+$/.test(text)) return Number(text);
  if (text === "十") return 10;
  if (text.startsWith("十")) return 10 + kanjiOrDigit(text[1]);
  if (text.endsWith("十")) return kanjiOrDigit(text[0]) * 10;
  const value = kanjiOrDigit(text[0]);
  return value > 0 ? value : 1;
}

function applyHands(position, ownerLabel, value) {
  const side = ownerLabel === "先手" || ownerLabel === "下手" ? "w" : "b";
  const hands = position.hands[side];
  for (const type of HAND_PIECE_TYPES) hands[type] = 0;

  const cleaned = value.trim();
  if (cleaned === "" || cleaned === "なし" || cleaned === "無し") return;

  // 2つの書き方がある。
  //   「金　歩三」… 駒名と枚数が続く形（枚数は駒名に直接付く）
  //   「桂馬 二 銀 一」… 駒名と枚数が空白で分かれる形
  // 後者では駒名だけのトークンを保留し、次が枚数だけならそれを対応付ける。
  let held = null;
  const flush = () => {
    if (held) {
      hands[held] += 1;
      held = null;
    }
  };

  for (const token of cleaned.split(/[\s　]+/)) {
    if (token === "") continue;
    const pieceChar = token.replace(/[0-9０-９一二三四五六七八九十]/g, "");
    const countText = token.replace(/[^0-9０-９一二三四五六七八九十]/g, "");

    if (pieceChar === "") {
      // 枚数だけのトークン → 保留している駒名に効く
      if (held) {
        hands[held] += parseCount(countFromNormalized(countText));
        held = null;
      }
      continue;
    }

    const type = PIECE_TYPE[pieceChar];
    if (!type || type === "K") {
      flush();
      continue;
    }

    if (countText === "") {
      // 駒名だけ。直前の保留は1枚で確定し、この駒名が枚数待ちになる。
      flush();
      held = type;
      continue;
    }

    flush();
    hands[type] += parseCount(countFromNormalized(countText));
  }
  flush();
}

function countFromNormalized(text) {
  return text.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

/**
 * 指し手の本文を解析して、エンジン記法の手を返す。読めなければ理由を返す。
 * @param {string} text 移動元の括弧や消費時間を含む本文
 * @param {{previousTo: string|null, isFirstPlayer: boolean, position: object}} context
 */
function parseMoveText(text, { previousTo, isFirstPlayer, position }) {
  let rest = text.replace(/^[▲△▼▽☗☖^◐]+/, " ");

  // 移動元のマス。指し手本体の直後の (数字2桁) だけ。
  let fromSquare = null;
  const fromMatch = rest.match(/\((\d)(\d)\)/);
  if (fromMatch) {
    fromSquare = squareToEngine(Number(fromMatch[1]), Number(fromMatch[2]));
    rest = rest.replace(fromMatch[0], " ");
  }
  // 残りの括弧は消費時間なので落とす
  rest = rest.replace(/\([^)]*\)/g, " ");

  // 行き先
  let toSquare = null;
  if (rest.includes("同")) {
    if (!previousTo) return { error: "「同」の前に手がありません" };
    toSquare = previousTo;
    rest = rest.replace(/同/g, " ");
  } else {
    const destMatch = rest.match(/([1-9])([一二三四五六七八九])/);
    if (!destMatch) return { error: "行き先のマスが読めません" };
    toSquare = squareToEngine(Number(destMatch[1]), RANK_KANJI.indexOf(destMatch[2]) + 1);
    rest = rest.replace(destMatch[0], " ");
  }

  // 駒。いちばん手前に出てくるものを採る。
  let pieceToken = null;
  let pieceAt = -1;
  for (const token of PIECE_TOKENS) {
    const at = rest.indexOf(token);
    if (at !== -1 && (pieceAt === -1 || at < pieceAt)) {
      pieceAt = at;
      pieceToken = token;
    }
  }
  if (!pieceToken) return { error: "駒の種類が読めません" };

  const isDropMove = rest.includes("打");
  let promoted;
  if (rest.includes("不成")) promoted = false;
  else if (ALREADY_PROMOTED.has(pieceToken)) promoted = true;
  else promoted = rest.includes("成");

  const letter = PIECE_TYPE[pieceToken];

  if (isDropMove) {
    // 駒打ちの種類は手番によらず大文字に揃える（画面・棋譜・エンジンで同じ表記にする）
    return { move: `${letter}@${toSquare}`, to: toSquare };
  }

  if (!fromSquare) {
    // 移動元が省略されている場合は、そのマスへ動ける同じ駒種の駒を盤面から探す（仕様 4.3.4）
    const owner = isFirstPlayer ? "w" : "b";
    const found = findFromSquare(position, toSquare, letter, owner, rest);
    if (found.error) return { error: found.error };
    fromSquare = found.square;
  }

  return { move: `${fromSquare}${toSquare}${promoted ? "+" : ""}`, to: toSquare };
}

/** 移動元が書かれていないとき、盤面から特定する。 */
function findFromSquare(position, toSquare, type, owner, text) {
  const { column: toColumn, rank: toRank } = engineToSquare(toSquare);
  let candidates = [];

  for (let index = 0; index < position.board.length; index += 1) {
    const piece = position.board[index];
    if (!piece || piece.owner !== owner || piece.type !== type) continue;
    const column = 9 - (index % 9);
    const rank = Math.floor(index / 9) + 1;
    if (canMoveTo(position, column, rank, toColumn, toRank)) candidates.push({ column, rank });
  }

  // 「直」は同じ筋から動かす手を指す
  if (candidates.length > 1 && text.includes("直")) {
    const straight = candidates.filter((candidate) => candidate.column === toColumn);
    if (straight.length === 1) candidates = straight;
  }

  if (candidates.length === 1) {
    return { square: squareToEngine(candidates[0].column, candidates[0].rank) };
  }
  if (candidates.length === 0) {
    return { error: "そのマスへ動ける同じ駒種の駒が盤面にありません" };
  }
  return { error: "移動元が複数考えられ、絞り込めません" };
}

/** 盤面図の行かどうか（途中図から始まる棋譜の検出）。 */
function looksLikeBoardDiagram(trimmed) {
  if (trimmed.startsWith("+") || trimmed.startsWith("|")) return true;
  // 「 ９ ８ ７ ６ ５ ４ ３ ２ １」のような筋の見出し
  return /^[1-9](\s+[1-9]){2,}$/.test(trimmed);
}

/**
 * kif の棋譜を読む。
 * @param {string} text
 * @returns {{
 *   startPosition: object,
 *   moves: string[],
 *   errors: Array<{line: number, text: string, reason: string}>,
 *   result: string|null,
 * }}
 */
export function parseKif(text) {
  // 「途中図だけの棋譜」（指し手が無く局面図から始まる）に対応する。
  // 局面図があればそこから盤面を作り、無ければ平手の初期局面から始める。
  const startPosition = parseKifPosition(text) ?? createInitialPosition();
  const moves = [];
  const errors = [];
  let result = null;
  let previousTo = null;
  let stopped = false;
  // 移動元が省略された手を特定するため、読んだ手を順に局面へ適用していく
  let position = startPosition;

  const lines = String(text).split(/\r?\n/);

  lines.forEach((rawLine, index) => {
    const lineNumber = index + 1;
    if (stopped) return;

    const line = normalize(rawLine);
    const trimmed = line.trim();
    if (trimmed === "") return;
    if (trimmed.startsWith("#") || trimmed.startsWith("*")) return;

    // 変化：N手 以降は本筋ではない
    if (trimmed.startsWith("変化")) {
      stopped = true;
      return;
    }

    // 持ち駒の行
    const handsMatch = trimmed.match(/^(先手|後手|下手|上手)の持駒[:：]\s*(.*)$/);
    if (handsMatch) {
      applyHands(startPosition, handsMatch[1], handsMatch[2]);
      return;
    }

    // 盤面図は仕様 4.3.3 のとおり読み飛ばす（図から局面は作らない）。
    // 途中図から始まる棋譜を平手と取り違えた場合は、棋譜の再生時に
    // 「その局面の合法手にない」として検出される。
    if (looksLikeBoardDiagram(trimmed)) return;

    // 終局の表記
    const resultWord = RESULT_WORDS.find((word) => trimmed.includes(word));
    if (resultWord) {
      result = resultWord;
      stopped = true;
      return;
    }

    // 指し手の行
    const moveMatch = trimmed.match(/^([1-9][0-9]*)\s+(.+)$/);
    if (!moveMatch) return; // 見出しなど、読む必要のない行

    const moveNumber = Number(moveMatch[1]);
    const isFirstPlayer = /[▲☗]/.test(line) ? true : /[△☖]/.test(line) ? false : moveNumber % 2 === 1;

    const parsed = parseMoveText(moveMatch[2], { previousTo, isFirstPlayer, position });
    if (!parsed || parsed.error) {
      errors.push({
        line: lineNumber,
        text: rawLine,
        reason: parsed ? parsed.error : "指し手として読めません",
      });
      return;
    }

    moves.push(parsed.move);
    previousTo = parsed.to;
    try {
      position = applyMove(position, parsed.move);
    } catch (error) {
      // 盤面と合わない手。以降の「同」や移動元の特定が狂うので、そこで止める。
      errors.push({ line: lineNumber, text: rawLine, reason: `局面に適用できません: ${error.message}` });
      stopped = true;
    }
  });

  return { startPosition, moves, errors, result };
}
