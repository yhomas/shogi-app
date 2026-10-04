import assert from "node:assert/strict";
import { test } from "node:test";

import { lastMoveMark } from "../public/js/last-move.js";

const mine = { raw: "c3c4", from: "c3", to: "c4", owner: "w", type: "P", promoted: false };
const opp = { raw: "g7g6", from: "g7", to: "g6", owner: "b", type: "P", promoted: false };

test("移動元と移動先と持ち主を返す", () => {
  assert.deepEqual(lastMoveMark(mine), { from: "c3", to: "c4", owner: "w" });
});

test("相手の手でも同じ形で返す（誰の手かは owner で分かる）", () => {
  assert.deepEqual(lastMoveMark(opp), { from: "g7", to: "g6", owner: "b" });
});

test("駒打ちは移動元を null にする", () => {
  const drop = { raw: "P@e5", from: null, to: "e5", owner: "w", type: "P", promoted: false };
  assert.deepEqual(lastMoveMark(drop), { from: null, to: "e5", owner: "w" });
});

test("手が無ければ null", () => {
  assert.equal(lastMoveMark(null), null);
  assert.equal(lastMoveMark(undefined), null);
});

test("壊れた情報は無視して null を返す", () => {
  const broken = [{}, { owner: "x", to: "e5" }, { owner: "w" }, { owner: "w", to: "" }, "c3c4", 42, []];
  for (const bad of broken) {
    assert.equal(lastMoveMark(bad), null, `${JSON.stringify(bad)} を手として扱わない`);
  }
});

test("元の情報を書き換えない", () => {
  const info = { ...mine };
  lastMoveMark(info);
  assert.deepEqual(info, mine);
});
