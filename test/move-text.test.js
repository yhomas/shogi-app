import assert from "node:assert/strict";
import { test } from "node:test";

import { shogiMoveText } from "../public/js/move-text.js";

// エンジンのマス ↔ 将棋のマス: 筋 = 9 - 文字の位置（a→9筋）、段 = 10 - 数字
// c2=７八 / c3=７七 / c1=７九 / e2=５八 / e1=５九 / e8=５二 / e9=５一 / f1=４九 / d1=６九

const FILES = "abcdefghi";
function spot(engineSquare) {
  const column = 9 - FILES.indexOf(engineSquare[0]);
  const row = 10 - Number(engineSquare[1]);
  return (row - 1) * 9 + (9 - column);
}

/** 指定したマスに駒を置いた盤面を作る。 */
function board(spec) {
  const squares = new Array(81).fill(null);
  for (const [square, piece] of Object.entries(spec)) squares[spot(square)] = piece;
  return squares;
}

const goldW = { type: "G", owner: "w", promoted: false };
const goldB = { type: "G", owner: "b", promoted: false };

test("行き先と駒名を、手番の印つきで出す（７八の金を７七へ）", () => {
  const position = { board: board({ c2: goldW }), turn: "w" };
  assert.equal(shogiMoveText("c2c3", position), "▲７七金");
  assert.equal(shogiMoveText("c2c3", { ...position, turn: "b" }), "△７七金");
});

test("持ち駒から打つときは「打」を付ける", () => {
  const position = { board: board({}), turn: "w" };
  assert.equal(shogiMoveText("P@e5", position), "▲５五歩打");
  assert.equal(shogiMoveText("B@e5", { ...position, turn: "b" }), "△５五角打");
});

test("成る手は「成」を付ける（５二の角が５一へ成る）", () => {
  const position = { board: board({ e8: { type: "B", owner: "w", promoted: false } }), turn: "w" };
  assert.equal(shogiMoveText("e8e9+", position), "▲５一角成");
});

test("成っている駒は成った後の名前を使う", () => {
  const position = { board: board({ e8: { type: "B", owner: "w", promoted: true } }), turn: "w" };
  assert.equal(shogiMoveText("e8e9", position), "▲５一馬");
});

test("先手: ４九と６九の金が５八へ行けるとき、４九が「右」", () => {
  const position = { board: board({ f1: goldW, d1: goldW }), turn: "w" };
  const legal = ["f1e2", "d1e2"];
  assert.equal(shogiMoveText("f1e2", position, legal), "▲５八金右"); // ４九（筋4が小さい）
  assert.equal(shogiMoveText("d1e2", position, legal), "▲５八金左"); // ６九
});

test("後手: 同じ局面では、６九が「右」４九が「左」", () => {
  const position = { board: board({ f1: goldB, d1: goldB }), turn: "b" };
  const legal = ["f1e2", "d1e2"];
  assert.equal(shogiMoveText("d1e2", position, legal), "△５八金右"); // ６九（筋6が大きい）
  assert.equal(shogiMoveText("f1e2", position, legal), "△５八金左"); // ４九
});

test("先手: ７八と７九の金が７七へ行けるとき、７九が「下」", () => {
  const position = { board: board({ c2: goldW, c1: goldW }), turn: "w" };
  const legal = ["c2c3", "c1c3"];
  assert.equal(shogiMoveText("c1c3", position, legal), "▲７七金下"); // ７九（段9が大きい）
  assert.equal(shogiMoveText("c2c3", position, legal), "▲７七金上"); // ７八
});

test("後手: 同じ局面では、７八が「下」７九が「上」", () => {
  const position = { board: board({ c2: goldB, c1: goldB }), turn: "b" };
  const legal = ["c2c3", "c1c3"];
  assert.equal(shogiMoveText("c2c3", position, legal), "△７七金下"); // ７八（段8が小さい）
  assert.equal(shogiMoveText("c1c3", position, legal), "△７七金上"); // ７九
});

test("同じ名前の駒が他に行けないときは、左右上下を付けない", () => {
  const position = { board: board({ c2: goldW, a1: { type: "R", owner: "w", promoted: false } }), turn: "w" };
  assert.equal(shogiMoveText("c2c3", position, ["c2c3"]), "▲７七金");
});

test("合法手が分からないときは、左右上下を付けない", () => {
  const position = { board: board({ f1: goldW, d1: goldW }), turn: "w" };
  assert.equal(shogiMoveText("f1e2", position), "▲５八金");
  assert.equal(shogiMoveText("f1e2", position, null), "▲５八金");
});

test("知らない形はそのまま返す", () => {
  const position = { board: board({}), turn: "w" };
  assert.equal(shogiMoveText("(none)", position), "(none)");
  assert.equal(shogiMoveText("", position), "");
});
