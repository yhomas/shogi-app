import { test } from "node:test";
import assert from "node:assert/strict";
import { destinationsFrom, applyMove, isDrop, isPromotion, resolveMove, replayMoves } from "../public/js/moves.js";
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

test("resolveMove: 成る手しか無いときは成る（歩が最後の段など）", () => {
  assert.deepEqual(resolveMove(["e8e9+"], "e8", "e9"), {
    move: "e8e9+",
    needsPromotionChoice: false,
  });
});

test("resolveMove: 成らない手しか無いときは成らない", () => {
  assert.deepEqual(resolveMove(["c3c4"], "c3", "c4"), {
    move: "c3c4",
    needsPromotionChoice: false,
  });
});

test("resolveMove: どちらも選べるときは本人に選んでもらう", () => {
  const choice = resolveMove(["e8e9", "e8e9+"], "e8", "e9");
  assert.equal(choice.needsPromotionChoice, true);
  assert.equal(choice.plain, "e8e9");
  assert.equal(choice.promoted, "e8e9+");
});

test("resolveMove: 合法でない行き先は null", () => {
  assert.equal(resolveMove(["c3c4"], "c3", "c5"), null);
  assert.equal(resolveMove([], "c3", "c4"), null);
});

test("resolveMove: 打つ手も同じ仕組みで決まる", () => {
  assert.deepEqual(resolveMove(["P@e5"], "P@", "e5"), {
    move: "P@e5",
    needsPromotionChoice: false,
  });
});

// エンジンの代わり。局面ごとに決めた合法手を返すだけ。
function fakeEngine(legalMovesBySfen) {
  let listener = null;
  let sfen = "";
  return {
    subscribe(fn) {
      listener = fn;
      return () => {
        listener = null;
      };
    },
    setPositionSfen(value) {
      sfen = value;
    },
    async goPerft() {
      for (const move of legalMovesBySfen[sfen] ?? []) listener(`${move}: 1`);
      return 0;
    },
  };
}

test("replayMoves: 合法な手を順に適用する", async () => {
  const start = createInitialPosition();
  const afterOne = applyMove(start, "c3c4");
  const engine = fakeEngine({
    [boardToSfen(start)]: ["c3c4", "g3g4"],
    [boardToSfen(afterOne)]: ["g7g6"],
  });
  const r = await replayMoves(engine, start, ["c3c4", "g7g6"]);
  assert.equal(r.invalidAtIndex, -1);
  assert.equal(r.position.turn, "w"); // 2手進んだので先手番に戻る
});

test("replayMoves: 途中に合法でない手があれば、そこを報告して止める", async () => {
  const start = createInitialPosition();
  const afterOne = applyMove(start, "c3c4");
  const engine = fakeEngine({
    [boardToSfen(start)]: ["c3c4"],
    [boardToSfen(afterOne)]: ["g7g6"],
  });
  const r = await replayMoves(engine, start, ["c3c4", "g4g5"]);
  assert.equal(r.invalidAtIndex, 1);
  assert.equal(r.move, "g4g5");
  assert.equal(r.position.turn, "b"); // 1手目までは適用済み
});

test("replayMoves: upto で途中まで再生できる", async () => {
  const start = createInitialPosition();
  const afterOne = applyMove(start, "c3c4");
  const engine = fakeEngine({
    [boardToSfen(start)]: ["c3c4"],
    [boardToSfen(afterOne)]: ["g7g6"],
  });
  const r = await replayMoves(engine, start, ["c3c4", "g7g6"], 1);
  assert.equal(r.invalidAtIndex, -1);
  assert.equal(r.position.turn, "b");
});

test("replayMoves: 0手なら開始局面のまま", async () => {
  const start = createInitialPosition();
  const r = await replayMoves(fakeEngine({}), start, ["c3c4"], 0);
  assert.equal(r.position, start);
  assert.equal(r.invalidAtIndex, -1);
});
