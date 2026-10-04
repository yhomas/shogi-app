import assert from "node:assert/strict";
import { test } from "node:test";

import { lastMoveMarks } from "../public/js/last-move.js";

const mine = { raw: "c3c4", from: "c3", to: "c4", owner: "w", type: "P", promoted: false };
const opp = { raw: "g7g6", from: "g7", to: "g6", owner: "b", type: "P", promoted: false };
const drop = { raw: "P@e5", from: null, to: "e5", owner: "w", type: "P", promoted: false };

test("自分と相手の手をそれぞれ選ぶ", () => {
  const marks = lastMoveMarks({ current: opp, previous: mine, mySide: "w" });
  assert.equal(marks.mine, mine);
  assert.equal(marks.opp, opp);
});

test("手番の側が逆でも、所有者で振り分ける", () => {
  const marks = lastMoveMarks({ current: mine, previous: opp, mySide: "b" });
  assert.equal(marks.mine, opp, "mySide=b なら後手の手が自分の手");
  assert.equal(marks.opp, mine);
});

test("1手だけなら、その側にだけ入る", () => {
  const marks = lastMoveMarks({ current: opp, previous: null, mySide: "w" });
  assert.equal(marks.mine, null);
  assert.equal(marks.opp, opp);
});

test("同じ側の手が2つ来たら、新しい方を採る", () => {
  const oldMine = { ...mine, raw: "a1a2" };
  const marks = lastMoveMarks({ current: mine, previous: oldMine, mySide: "w" });
  assert.equal(marks.mine, mine);
});

test("駒打ち（移動元が無い手）も使える", () => {
  const marks = lastMoveMarks({ current: drop, previous: mine, mySide: "w" });
  assert.equal(marks.mine, drop);
  assert.equal(marks.mine.from, null);
});

test("何も無ければ両方 null", () => {
  const marks = lastMoveMarks({ current: null, previous: null, mySide: "w" });
  assert.equal(marks.mine, null);
  assert.equal(marks.opp, null);
});

test("壊れた情報は無視する", () => {
  const broken = [{}, { owner: "x", to: "e5" }, { owner: "w" }, null, "c3c4", 42];
  for (const bad of broken) {
    const marks = lastMoveMarks({ current: bad, previous: mine, mySide: "w" });
    assert.equal(marks.mine, mine, `${JSON.stringify(bad)} を手として扱わない`);
    assert.equal(marks.opp, null);
  }
});

test("引数を省略しても落ちない", () => {
  const marks = lastMoveMarks({ mySide: "w" });
  assert.equal(marks.mine, null);
  assert.equal(marks.opp, null);
});
