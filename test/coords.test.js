import { test } from "node:test";
import assert from "node:assert/strict";
import {
  columnToFileIndex, fileIndexToEngineFile, engineFileToFileIndex,
  rankToEngineRank, engineRankToRank, squareToEngine, engineToSquare,
} from "../public/js/coords.js";

test("FEN の行内インデックスが列文字になる", () => {
  assert.equal(fileIndexToEngineFile(0), "a");
  assert.equal(fileIndexToEngineFile(8), "i");
  assert.equal(engineFileToFileIndex("i"), 8);
});

test("段番号は 10 - 段 でエンジンの段になる", () => {
  assert.equal(rankToEngineRank(1), 9);
  assert.equal(rankToEngineRank(9), 1);
  assert.equal(rankToEngineRank(5), 5);
  assert.equal(engineRankToRank(2), 8);
});

test("四隅と中央の座標", () => {
  assert.equal(squareToEngine(9, 1), "a9");
  assert.equal(squareToEngine(1, 1), "i9");
  assert.equal(squareToEngine(9, 9), "a1");
  assert.equal(squareToEngine(1, 9), "i1");
  assert.equal(squareToEngine(5, 5), "e5");
});

test("初期局面の検算（先手の玉5九、先手の飛2八）", () => {
  assert.equal(squareToEngine(5, 9), "e1");
  assert.equal(squareToEngine(2, 8), "h2");
});

test("kif の指し手表記がエンジン記法になる", () => {
  // ▲７六歩(77) → c3c4 / △３四歩(33) → g7g6
  assert.equal(squareToEngine(7, 7) + squareToEngine(7, 6), "c3c4");
  assert.equal(squareToEngine(3, 3) + squareToEngine(3, 4), "g7g6");
});

test("逆変換が往復する", () => {
  assert.deepEqual(engineToSquare("h2"), { column: 2, rank: 8 });
  assert.deepEqual(engineToSquare("e1"), { column: 5, rank: 9 });
});

test("範囲外は例外", () => {
  assert.throws(() => fileIndexToEngineFile(9), RangeError);
  assert.throws(() => rankToEngineRank(0), RangeError);
  assert.throws(() => engineToSquare("z9"), RangeError);
});
