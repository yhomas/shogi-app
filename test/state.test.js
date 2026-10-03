import { test } from "node:test";
import assert from "node:assert/strict";
import { boardIndex, createInitialPosition, emptyHands } from "../public/js/state.js";

test("盤面の添字は FEN の並びと一致する", () => {
  assert.equal(boardIndex(9, 1), 0);
  assert.equal(boardIndex(1, 1), 8);
  assert.equal(boardIndex(9, 9), 72);
  assert.equal(boardIndex(1, 9), 80);
});

test("初期局面の駒の位置が正しい", () => {
  const p = createInitialPosition();
  assert.equal(p.board.length, 81);
  assert.equal(p.turn, "w");
  assert.deepEqual(p.board[boardIndex(5, 9)], { type: "K", owner: "w", promoted: false });
  assert.deepEqual(p.board[boardIndex(2, 8)], { type: "R", owner: "w", promoted: false });
  assert.deepEqual(p.board[boardIndex(8, 8)], { type: "B", owner: "w", promoted: false });
  assert.deepEqual(p.board[boardIndex(5, 1)], { type: "K", owner: "b", promoted: false });
  assert.equal(p.board.filter(Boolean).length, 40);
});

test("初期局面の持ち駒は空", () => {
  const p = createInitialPosition();
  assert.deepEqual(p.hands.w, emptyHands());
  assert.deepEqual(p.hands.b, emptyHands());
});
