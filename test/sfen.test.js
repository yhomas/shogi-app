import { test } from "node:test";
import assert from "node:assert/strict";
import { boardToSfen, parseSfen } from "../public/js/coords.js";
import { createInitialPosition } from "../public/js/state.js";

const START = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL[-] w 0 1";

test("初期局面の SFEN が実測値と一致する", () => {
  assert.equal(boardToSfen(createInitialPosition()), START);
});

test("SFEN を読み直すと同じ局面に戻る（往復）", () => {
  assert.deepEqual(parseSfen(START), createInitialPosition());
});

test("持ち駒つき・成駒つきの局面が往復する", () => {
  const sfen = "l5s1l/4k4/2n2g1p1/2ppppp2/9/P1P3P2/1P1PPP1PP/1B5R1/LN5NL[GSNP] b 0 1";
  assert.equal(boardToSfen(parseSfen(sfen)), sfen);
});

test("手番より後ろの欄が長い形（FEN 風）も読み飛ばして読める", () => {
  // このアプリは常に "w 0 1" の形で書き出すが、外から来た文字列には
  // "- - 0 1" のような欄が付いていることがある。局面としては同じに読めること。
  const short = "l5s1l/4k4/2n2g1p1/2ppppp2/9/P1P3P2/1P1PPP1PP/1B5R1/LN5NL[GSNP] b 0 1";
  const long = "l5s1l/4k4/2n2g1p1/2ppppp2/9/P1P3P2/1P1PPP1PP/1B5R1/LN5NL[GSNP] b - - 0 1";
  assert.deepEqual(parseSfen(long), parseSfen(short));
});

test("持ち駒が空なら [-]", () => {
  assert.match(boardToSfen(createInitialPosition()), /\[-\]/);
});
