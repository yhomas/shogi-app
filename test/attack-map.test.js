import { test } from "node:test";
import assert from "node:assert/strict";
import { countAttacks } from "../public/js/attack-map.js";
import { createInitialPosition, boardIndex } from "../public/js/state.js";

test("初期局面: 先手の利き数が実測と一致する", () => {
  const a = countAttacks(createInitialPosition());
  const at = (col, rank) => a.w[boardIndex(col, rank)];
  // 同じアルゴリズムをブラウザで初期局面に適用して得た実測値（手計算とも一致）
  assert.equal(at(3, 8), 3);
  assert.equal(at(4, 8), 4);
  assert.equal(at(5, 8), 4);
  assert.equal(at(6, 8), 4);
  assert.equal(at(7, 8), 3);
  assert.equal(at(8, 8), 2);   // 飛 + 銀。自駒の角のマスも守りとして数えて止まる
  assert.equal(at(9, 8), 1);   // 香のみ。飛は角で止まるので届かない
  assert.equal(at(2, 7), 1);   // 飛のみ。自歩で止まる
  assert.equal(at(2, 6), 2);   // 2六は2（2七の歩と、2七の歩を越えた飛。歩も前に進めるので越える）
  assert.equal(at(1, 6), 2);   // 1六も2（1七の歩と、越えた1九の香）
});

test("利きは合算される（5八は玉と両金で3以上）", () => {
  const a = countAttacks(createInitialPosition());
  assert.ok(a.w[boardIndex(5, 8)] >= 3);
});

test("後手の歩は段番号が増える向きに利く", () => {
  // 盤に後手の歩を1枚だけ置いて、向きを単独で確かめる。
  // （初期局面の5二は玉・両金・飛も利かせていて、歩だけを見られない）
  const p = createInitialPosition();
  p.board.fill(null);
  p.board[boardIndex(5, 3)] = { type: "P", owner: "b", promoted: false };
  const b = countAttacks(p).b;
  assert.equal(b[boardIndex(5, 4)], 1); // 前は段番号が増える向き
  assert.equal(b[boardIndex(5, 2)], 0); // 後ろには利かない
});

test("金は6マス、銀は5マス、玉は8マス", () => {
  const reach = (piece) => {
    const p = createInitialPosition();
    p.board.fill(null);
    p.board[boardIndex(5, 5)] = piece;
    return countAttacks(p).w.reduce((n, v) => n + (v > 0 ? 1 : 0), 0);
  };
  assert.equal(reach({ type: "G", owner: "w", promoted: false }), 6);
  assert.equal(reach({ type: "S", owner: "w", promoted: false }), 5);
  assert.equal(reach({ type: "K", owner: "w", promoted: false }), 8);
});

test("成駒: と・成香・成桂・成銀は金と同じ6マス", () => {
  const reach = (piece) => {
    const p = createInitialPosition();
    p.board.fill(null);
    p.board[boardIndex(5, 5)] = piece;
    return countAttacks(p).w.reduce((n, v) => n + (v > 0 ? 1 : 0), 0);
  };
  for (const type of ["P", "L", "N", "S"]) {
    assert.equal(reach({ type, owner: "w", promoted: true }), 6, type);
  }
  // 盤の中央なら、斜め4方向×4マス＋縦横1マス4つ = 20
  assert.equal(reach({ type: "B", owner: "w", promoted: true }), 20);
  // 縦横4方向×4マス＋斜め1マス4つ = 20
  assert.equal(reach({ type: "R", owner: "w", promoted: true }), 20);
});
