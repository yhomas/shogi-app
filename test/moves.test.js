import { test } from "node:test";
import assert from "node:assert/strict";
import { destinationsFrom, applyMove, isDrop, isPromotion } from "../public/js/moves.js";
import { createInitialPosition, emptyHands, boardIndex } from "../public/js/state.js";
import { boardToSfen } from "../public/js/coords.js";

test("打つ手と成る手の判定", () => {
  assert.equal(isDrop("P@e5"), true);
  assert.equal(isDrop("p@e5"), true);
  assert.equal(isDrop("c3c4"), false);
  assert.equal(isPromotion("e8e9+"), true);
  assert.equal(isPromotion("c3c4"), false);
});

test("destinationsFrom: 盤上の駒の行き先（成りの印は外す）", () => {
  const moves = ["h2c2", "h2d2", "h2i2", "c3c4", "P@e5", "h2h3+"];
  assert.deepEqual(destinationsFrom(moves, "h2"), ["c2", "d2", "i2", "h3"]);
});

test("destinationsFrom: 持ち駒を打つ行き先", () => {
  const moves = ["P@e5", "P@a1", "c3c4", "p@e5"];
  assert.deepEqual(destinationsFrom(moves, "P@"), ["e5", "a1"]);
});

test("applyMove: 移動と手番", () => {
  const after = applyMove(createInitialPosition(), "c3c4");
  assert.deepEqual(after.board[boardIndex(7, 6)], { type: "P", owner: "w", promoted: false });
  assert.equal(after.board[boardIndex(7, 7)], null);
  assert.equal(after.turn, "b");
});

test("applyMove: 元の局面を書き換えない", () => {
  const before = createInitialPosition();
  const snapshot = boardToSfen(before);
  applyMove(before, "c3c4");
  assert.equal(boardToSfen(before), snapshot);
});

test("applyMove: 取った駒は持ち駒に加わり、成駒は元の種類に戻る", () => {
  const position = {
    board: new Array(81).fill(null),
    hands: { w: emptyHands(), b: emptyHands() },
    turn: "w",
  };
  position.board[boardIndex(5, 5)] = { type: "R", owner: "w", promoted: false };
  position.board[boardIndex(5, 3)] = { type: "P", owner: "b", promoted: true };
  const after = applyMove(position, "e5e7");
  assert.deepEqual(after.board[boardIndex(5, 3)], { type: "R", owner: "w", promoted: false });
  assert.equal(after.board[boardIndex(5, 5)], null);
  assert.equal(after.hands.w.P, 1);
  assert.equal(after.turn, "b");
});

test("applyMove: 成る手", () => {
  const position = {
    board: new Array(81).fill(null),
    hands: { w: emptyHands(), b: emptyHands() },
    turn: "w",
  };
  position.board[boardIndex(8, 8)] = { type: "B", owner: "w", promoted: false };
  const after = applyMove(position, "b2h8+");
  assert.deepEqual(after.board[boardIndex(2, 2)], { type: "B", owner: "w", promoted: true });
});

test("applyMove: 打つ駒は持ち駒から減る", () => {
  const position = {
    board: new Array(81).fill(null),
    hands: { w: { ...emptyHands(), P: 2 }, b: emptyHands() },
    turn: "w",
  };
  const after = applyMove(position, "P@e5");
  assert.deepEqual(after.board[boardIndex(5, 5)], { type: "P", owner: "w", promoted: false });
  assert.equal(after.hands.w.P, 1);
  assert.equal(after.turn, "b");
});

test("▲７六歩 △３四歩 の局面が仕様の SFEN と一致する", () => {
  let position = createInitialPosition();
  position = applyMove(position, "c3c4");
  position = applyMove(position, "g7g6");
  assert.equal(
    boardToSfen(position),
    "lnsgkgsnl/1r5b1/pppppp1pp/6p2/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL[-] w 0 1",
  );
});
