import assert from "node:assert/strict";
import { test } from "node:test";

import { describeScore, formatPv, formatPvMove, squareToJapanese } from "../public/js/pv-text.js";

test("マスを将棋の書き方に直す", () => {
  assert.equal(squareToJapanese("c4"), "７六");
  assert.equal(squareToJapanese("a9"), "９一");
  assert.equal(squareToJapanese("i1"), "１九");
  assert.equal(squareToJapanese("e5"), "５五");
});

test("読み筋の一手を読める形にする", () => {
  assert.equal(formatPvMove("c3c4"), "７七→７六");
  assert.equal(formatPvMove("e8e9+"), "５二→５一成");
  assert.equal(formatPvMove("P@e5"), "５五に歩を打つ");
  assert.equal(formatPvMove("G@e5"), "５五に金を打つ");
});

test("分からない手はそのまま出す", () => {
  assert.equal(formatPvMove("(none)"), "(none)");
  assert.equal(formatPvMove(""), "");
});

test("読み筋を並べる（既定は8手まで）", () => {
  const moves = ["c3c4", "g7g6", "a3a4"];
  assert.equal(formatPv(moves), "７七→７六 ３三→３四 ９七→９六");
  assert.equal(formatPv(["c3c4", "g7g6", "a3a4"], 2), "７七→７六 ３三→３四");
  assert.equal(formatPv(null), "");
  assert.equal(formatPv(undefined), "");
});

test("評価値を言葉にする", () => {
  // 区切りは将棋ウォーズ風（互角 ±200 / 有利 500 / 優勢 1000 / 勝勢 1000以上）
  assert.equal(describeScore(0), "ほぼ互角");
  assert.equal(describeScore(199), "ほぼ互角");
  assert.equal(describeScore(-199), "ほぼ互角");
  assert.equal(describeScore(200), "先手が有利");
  assert.equal(describeScore(499), "先手が有利");
  assert.equal(describeScore(-400), "後手が有利");
  assert.equal(describeScore(500), "先手が優勢");
  assert.equal(describeScore(999), "先手が優勢");
  assert.equal(describeScore(1000), "先手が勝勢");
  assert.equal(describeScore(-3000), "後手が勝勢");
});

test("数値でなければ空文字", () => {
  assert.equal(describeScore(null), "");
  assert.equal(describeScore(undefined), "");
  assert.equal(describeScore("abc"), "");
});
