// KIF の「局面図」と「持ち駒」を読む。
//
// ぴよ将棋などが出力する「途中図だけの棋譜」（指し手が無い）で、盤面と持ち駒を再現するために使う。
// 指し手の解釈は kif-parser.js が行う。ここは局面図の読み取りだけを担当する。

import { boardIndex, createInitialPosition } from "./state.js";

const GLYPHS = {
  歩: ["P", false], 香: ["L", false], 桂: ["N", false], 銀: ["S", false],
  金: ["G", false], 角: ["B", false], 飛: ["R", false], 玉: ["K", false], 王: ["K", false],
  と: ["P", true], 杏: ["L", true], 圭: ["N", true], 全: ["S", true],
  馬: ["B", true], 龍: ["R", true], 竜: ["R", true],
};

const KANJI_COUNT = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const HAND_TYPE = { 歩: "P", 香: "L", 桂: "N", 銀: "S", 金: "G", 角: "B", 飛: "R" };

/** 図の1マス（例 "v桂"）を駒にする。空マスや読めない文字は null。 */
function glyphToPiece(cell) {
  const raw = String(cell ?? "").trim();
  if (raw === "" || raw === "・" || raw === "*") return null;
  const owner = raw.startsWith("v") ? "b" : "w";
  const found = GLYPHS[raw.replace(/^v/, "").trim()];
  if (!found) return null;
  return { type: found[0], owner, promoted: found[1] };
}

/**
 * 「後手の持駒：飛　金　歩二」のような行を、持ち駒の数にする。
 * 「なし」や空なら全部0。漢数字（歩二）も読む。
 * @param {string} line
 * @returns {{P: number, L: number, N: number, S: number, G: number, B: number, R: number}}
 */
export function parseHands(line) {
  const hands = { P: 0, L: 0, N: 0, S: 0, G: 0, B: 0, R: 0 };
  const raw = String(line ?? "").replace(/^[^：:]*[：:]/, "").trim();
  if (raw === "" || raw === "なし") return hands;

  for (const token of raw.split(/[　\s]+/).filter(Boolean)) {
    const found = token.match(/^([歩香桂銀金角飛])([一二三四五六七八九十]*)$/);
    if (!found) continue;
    const type = HAND_TYPE[found[1]];
    hands[type] += found[2] === "" ? 1 : KANJI_COUNT[found[2]] ?? 0;
  }
  return hands;
}

/** 局面図の行（例 "| ・ 杏 玉 …|一"）を読む。9行そろわなければ null。 */
function parseDiagram(lines) {
  const rows = [];
  for (const line of lines) {
    const found = String(line).match(/^\s*\|(.+)\|\s*([一二三四五六七八九])\s*$/);
    if (!found) continue;
    // 図のマスは2文字ずつ並ぶ（例 " ・"、" 杏"、"v桂"）。空白で区切られていないので、
    // 2文字ずつに切って読む。
    const body = found[1];
    if (body.length < 18) return null;
    const cells = [];
    for (let i = 0; i < 18; i += 2) cells.push(body.slice(i, i + 2).trim());
    rows.push({ rank: KANJI_COUNT[found[2]], cells });
  }
  return rows.length === 9 ? rows : null;
}

/**
 * KIF の本文から、局面図と持ち駒を読んで局面を作る。
 *
 * @param {string} text KIF の本文
 * @returns {object|null} 局面図が無ければ null（＝平手の初期局面として扱ってよい）
 */
export function parseKifPosition(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  const rows = parseDiagram(lines);
  if (!rows) return null;

  const position = createInitialPosition();
  position.board = new Array(81).fill(null);
  position.hands = { w: parseHands(""), b: parseHands("") };

  for (const { rank, cells } of rows) {
    cells.forEach((cell, index) => {
      const piece = glyphToPiece(cell);
      if (!piece) return;
      // 図は９筋が左端。左から ９，８，…，１ と並ぶ。
      const column = 9 - index;
      position.board[boardIndex(column, rank)] = piece;
    });
  }

  for (const line of lines) {
    if (/後手の持駒/.test(line)) position.hands.b = parseHands(line);
    if (/先手の持駒/.test(line)) position.hands.w = parseHands(line);
  }

  // 局面図には手番の記載が無いので、平手の並びと同じく先手から始める
  position.turn = "w";
  return position;
}
