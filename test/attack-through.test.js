import assert from "node:assert/strict";
import { test } from "node:test";

import { countAttacks } from "../public/js/attack-map.js";
import { createInitialPosition } from "../public/js/state.js";

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

const P = (type, owner = "w", promoted = false) => ({ type, owner, promoted });

test("飛の後ろに飛がいる（同じ筋）: 前の飛を越えて、その先も利きに数える", () => {
  // ５九(e1) と ５五(e5) に先手の飛。５五の飛が５四(e6)へ行けるなら、
  // ５九の飛も５四へ参戦できるので、５四の利きは 2。
  const position = { board: board({ e1: P("R"), e5: P("R") }), hands: {}, turn: "w" };
  const { w } = countAttacks(position);
  assert.equal(w[spot("e6")], 2, "５四は2（前の飛と、越えた後ろの飛）");
  assert.equal(w[spot("e7")], 1, "５三は1（前の飛の利きだけ。越えられるのは次の1マスまで）");
  assert.equal(w[spot("e9")], 1, "５一も1（同上）");
  assert.equal(w[spot("e5")], 1, "５五（前の飛のマス）は後ろの飛の1");
});

test("飛の前に歩がいる: 歩も前に進めるので、飛はその先まで数える", () => {
  const position = { board: board({ e1: P("R"), e5: P("P") }), hands: {}, turn: "w" };
  const { w } = countAttacks(position);
  assert.equal(w[spot("e6")], 2, "５四は2（歩を越えた飛の分と、歩自身の利き）");
  assert.equal(w[spot("e7")], 0, "５三は0（越えられるのは歩の次の1マスまで）");
});

test("初期局面の１六は2、２六は2（香と飛が歩を越える）", () => {
  const position = createInitialPosition();
  const { w } = countAttacks(position);
  assert.equal(w[spot("i4")], 2, "１六は2（１九の香＋１七の歩）");
  assert.equal(w[spot("h4")], 2, "２六は2（２八の飛＋２七の歩）");
  assert.equal(w[spot("i5")], 0, "１五は0（越えられるのは歩の次の1マスまで。2マス目は数えない）");
  assert.equal(w[spot("h5")], 0, "２五は0（同上）");
});

test("香の後ろに香がいる: 同じ向きなら越える", () => {
  const position = { board: board({ a1: P("L"), a5: P("L") }), hands: {}, turn: "w" };
  const { w } = countAttacks(position);
  assert.equal(w[spot("a6")], 2, "９四は2（前の香と後ろの香）");
});

test("飛の前に角がいる: 角は縦横に進めないので越えない", () => {
  const position = { board: board({ e1: P("R"), e5: P("B") }), hands: {}, turn: "w" };
  const { w } = countAttacks(position);
  assert.equal(w[spot("e6")], 0, "５四には届かない（角は斜めだけ）");
  assert.equal(w[spot("d6")], 1, "４四は角の利き1");
});

test("後手でも同じ（向きが逆になるだけ）", () => {
  // 後手の飛を ５一(e9) と ５五(e5) に置く。後手の前は段が増える向き。
  const position = { board: board({ e9: P("R", "b"), e5: P("R", "b") }), hands: {}, turn: "b" };
  const { b } = countAttacks(position);
  assert.equal(b[spot("e4")], 2, "５六は2（前の飛と、越えた後ろの飛）");
  assert.equal(b[spot("e1")], 1, "５九は1（前の飛の利きだけ。次の1マスまで）");
});

test("相手の駒なら越えない（そこで止まる）", () => {
  const position = { board: board({ e1: P("R"), e5: P("R", "b") }), hands: {}, turn: "w" };
  const { w } = countAttacks(position);
  assert.equal(w[spot("e6")], 0, "相手の駒より先へは数えない");
  assert.equal(w[spot("e5")], 1, "相手の駒のマスまでは数える");
});
