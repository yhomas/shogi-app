import assert from "node:assert/strict";
import { test } from "node:test";

import { shogiPvText } from "../public/js/move-text.js";

const FILES = "abcdefghi";
function spot(engineSquare) {
  const column = 9 - FILES.indexOf(engineSquare[0]);
  const row = 10 - Number(engineSquare[1]);
  return (row - 1) * 9 + (9 - column);
}

function board(spec) {
  const squares = new Array(81).fill(null);
  for (const [square, piece] of Object.entries(spec)) squares[spot(square)] = piece;
  return squares;
}

const P = (owner = "w") => ({ type: "P", owner, promoted: false });

test("2手目以降も棋譜の書き方で出る（手番が入れ替わる）", () => {
  // ５五の歩(先手) → ５四へ。次に ４四の歩(後手) → ４三へ。
  const position = { board: board({ e5: P("w"), d4: P("b") }), turn: "w" };
  assert.equal(shogiPvText(["e5e6", "d4d3"], position), "▲５四歩 △６七歩");
});

test("成る手・打つ手も混ざって出る", () => {
  const position = {
    board: board({ e8: { type: "B", owner: "w", promoted: false }, e5: P("b") }),
    turn: "w",
  };
  // 角が５一へ成る → 後手が５四へ歩打ち
  assert.equal(shogiPvText(["e8e9+", "P@e6"], position), "▲５一角成 △５四歩打");
});

test("読み筋が空なら空文字", () => {
  const position = { board: board({}), turn: "w" };
  assert.equal(shogiPvText([], position), "");
  assert.equal(shogiPvText(null, position), "");
  assert.equal(shogiPvText(["c2c3"], null), "");
});

test("先頭の1手だけは、合法手があれば左右上下が付く", () => {
  const gold = { type: "G", owner: "w", promoted: false };
  const position = { board: board({ f1: gold, d1: gold }), turn: "w" };
  const legal = ["f1e2", "d1e2"];
  assert.equal(shogiPvText(["f1e2"], position, legal), "▲５八金右");
  assert.equal(shogiPvText(["f1e2"], position), "▲５八金");
});

test("適用できない手が混ざっても落ちない（その場合は元の並びを返す）", () => {
  const position = { board: board({ e5: P() }), turn: "w" };
  const out = shogiPvText(["e5e6", "zzzz"], position);
  assert.equal(out, "e5e6 zzzz");
  assert.equal(typeof shogiPvText(["e5e6"], position), "string");
});
