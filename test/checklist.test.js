import { test } from "node:test";
import assert from "node:assert/strict";
import { loadItems, saveItems, matchesCondition, evaluate } from "../public/js/checklist.js";
import { createInitialPosition } from "../public/js/state.js";

const ctx = (over = {}) => ({
  position: createInitialPosition(),
  lastMove: null,
  ply: 0,
  mySide: "w",
  ...over,
});

test("壊れた localStorage でも既定値に戻る", () => {
  const broken = { getItem: () => "{壊れたJSON", setItem() {} };
  assert.deepEqual(loadItems(broken), []);
  const missing = { getItem: () => null, setItem() {} };
  assert.deepEqual(loadItems(missing), []);
});

test("保存して読み戻せる", () => {
  let store = null;
  const s = { getItem: () => store, setItem: (_k, v) => { store = v; } };
  saveItems([{ id: "1", text: "確認", condition: { type: "always" }, enabled: true, priority: "normal" }], s);
  assert.equal(loadItems(s).length, 1);
});

test("always は常に成立", () => {
  assert.equal(matchesCondition({ type: "always" }, ctx()), true);
});

test("相手が飛車または角を動かした（成駒も含む）", () => {
  const c = { type: "opponentMovedPiece", piece: "rook_bishop" };
  assert.equal(matchesCondition(c, ctx({ lastMove: "h2c2" })), true);   // 飛
  assert.equal(matchesCondition(c, ctx({ lastMove: "b2h8+" })), true);  // 角（成り）
  assert.equal(matchesCondition(c, ctx({ lastMove: "c3c4" })), false);  // 歩
});

test("evaluate は有効な項目だけを返す", () => {
  const items = [
    { id: "1", text: "常に", condition: { type: "always" }, enabled: true, priority: "normal" },
    { id: "2", text: "無効", condition: { type: "always" }, enabled: false, priority: "normal" },
    { id: "3", text: "相手が飛車を持っている", condition: { type: "opponentHandHasPiece", piece: "rook" }, enabled: true, priority: "low" },
  ];
  assert.deepEqual(evaluate(items, ctx()).map((i) => i.id), ["1"]);
  const withRook = createInitialPosition();
  withRook.hands.b.R = 1;
  assert.deepEqual(evaluate(items, ctx({ position: withRook })).map((i) => i.id), ["1", "3"]);
});

test("lastMoveInfo があればそちらを優先して動いた駒を見る", () => {
  // 実際の対局では「指した後」の局面を渡すので、移動元のマスにはもう駒が無い。
  // そのため、動いた駒の情報は手を適用する時点で作って渡す（裁定1）。
  const moved = createInitialPosition();
  const info = { from: "h2", to: "c2", type: "P", owner: "b", promoted: false, isDrop: false };
  const c = { type: "opponentMovedPiece", piece: "rook_bishop" };
  assert.equal(matchesCondition(c, ctx({ position: moved, lastMoveInfo: info })), false);
  assert.equal(
    matchesCondition({ type: "opponentMovedPiece", piece: "pawn" }, ctx({ position: moved, lastMoveInfo: info })),
    true,
  );
});

test("王手の条件", () => {
  // 後手の玉(5一)を先手の飛(5二)が王手している局面
  const position = createInitialPosition();
  position.board.fill(null);
  position.board[4] = { type: "K", owner: "b", promoted: false };   // 5一
  position.board[13] = { type: "R", owner: "w", promoted: false };  // 5二
  position.hands = { w: { P: 0, L: 0, N: 0, S: 0, G: 0, B: 0, R: 0 }, b: { P: 0, L: 0, N: 0, S: 0, G: 0, B: 0, R: 0 } };
  assert.equal(matchesCondition({ type: "opponentInCheck" }, ctx({ position })), true);
});

test("直前の手で取った駒の条件（相手・自分）", () => {
  const opponentTook = ctx({ opponentCaptured: { type: "R", owner: "w", promoted: false } });
  assert.equal(matchesCondition({ type: "opponentCapturedPiece", piece: "rook" }, opponentTook), true);
  assert.equal(matchesCondition({ type: "opponentCapturedPiece", piece: "rook_bishop" }, opponentTook), true);
  assert.equal(matchesCondition({ type: "opponentCapturedPiece", piece: "pawn" }, opponentTook), false);
  // 取っていない手（＝直前の手が取りでない）では成立しない
  assert.equal(matchesCondition({ type: "opponentCapturedPiece", piece: "rook" }, ctx()), false);

  // 自分が取った駒は、成駒でも元の種類で見る（馬は角）
  const mineTook = ctx({ myCaptured: { type: "B", owner: "b", promoted: true } });
  assert.equal(matchesCondition({ type: "myCapturedPiece", piece: "bishop" }, mineTook), true);
  assert.equal(matchesCondition({ type: "myCapturedPiece", piece: "rook" }, mineTook), false);
  assert.equal(matchesCondition({ type: "myCapturedPiece", piece: "bishop" }, ctx()), false);
});

test("持ち駒の条件（自分・相手）", () => {
  const position = createInitialPosition();
  position.hands.w.B = 1; // 自分の持ち駒に角
  position.hands.b.R = 1; // 相手の持ち駒に飛
  assert.equal(matchesCondition({ type: "handHasPiece", piece: "bishop" }, ctx({ position })), true);
  assert.equal(matchesCondition({ type: "opponentHandHasPiece", piece: "rook" }, ctx({ position })), true);
  // 相手の持ち駒と自分の持ち駒を取り違えないこと
  assert.equal(matchesCondition({ type: "opponentHandHasPiece", piece: "bishop" }, ctx({ position })), false);
  assert.equal(matchesCondition({ type: "handHasPiece", piece: "rook" }, ctx({ position })), false);
});

test("自分の玉が狙われている条件", () => {
  const position = createInitialPosition();
  position.board.fill(null);
  position.board[76] = { type: "K", owner: "w", promoted: false };  // 5九
  position.board[67] = { type: "R", owner: "b", promoted: false };  // 5八（後手の飛）
  assert.equal(matchesCondition({ type: "myKingThreatened" }, ctx({ position })), true);
  position.board[67] = null;
  assert.equal(matchesCondition({ type: "myKingThreatened" }, ctx({ position })), false);
});

test("解釈できない piece 指定は一致しない（条件を絞ったつもりが常に成立するのを防ぐ）", () => {
  assert.equal(matchesCondition({ type: "opponentMovedPiece", piece: "飛車" }, ctx({ lastMove: "c3c4" })), false);
  assert.equal(matchesCondition({ type: "handHasPiece", piece: "なにか" }, ctx()), false);
  // 指定が空なら「種類を問わない」で今までどおり
  assert.equal(matchesCondition({ type: "opponentMovedPiece" }, ctx({ lastMove: "c3c4" })), true);
});
