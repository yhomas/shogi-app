import { test } from "node:test";
import assert from "node:assert/strict";
import { attackOpacity } from "../public/js/board.js";

test("利き数の濃さは仕様 4.2 の5段階", () => {
  assert.equal(attackOpacity(0), 0);
  assert.equal(attackOpacity(1), 0.15);
  assert.equal(attackOpacity(2), 0.30);
  assert.equal(attackOpacity(3), 0.45);
  assert.equal(attackOpacity(4), 0.60);
  assert.equal(attackOpacity(5), 0.75);
});

test("5以上は同じ濃さで頭打ち", () => {
  assert.equal(attackOpacity(6), 0.75);
  assert.equal(attackOpacity(20), 0.75);
});
