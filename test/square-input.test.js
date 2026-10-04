import assert from "node:assert/strict";
import { test } from "node:test";

import { parseSquareInput } from "../public/js/square-input.js";

test("将棋の書き方をエンジンの記法に直す", () => {
  assert.equal(parseSquareInput("７六"), "c4");
  assert.equal(parseSquareInput("76"), "c4");
  assert.equal(parseSquareInput("9一"), "a9");
  assert.equal(parseSquareInput("1九"), "i1");
  assert.equal(parseSquareInput("5五"), "e5");
});

test("全角の数字と漢数字を受け付ける", () => {
  assert.equal(parseSquareInput("７六"), "c4");
  assert.equal(parseSquareInput("７６"), "c4");
  assert.equal(parseSquareInput("七六"), "c4");
});

test("すでにエンジンの記法なら、そのまま返す", () => {
  assert.equal(parseSquareInput("c4"), "c4");
  assert.equal(parseSquareInput("a9"), "a9");
  assert.equal(parseSquareInput("i1"), "i1");
});

test("前後の空白は無視する", () => {
  assert.equal(parseSquareInput("  ７六 "), "c4");
});

test("数字だけでもマスとして解釈する（42 は４二）", () => {
  assert.equal(parseSquareInput(42), "f8");
});

test("分からない書き方は null", () => {
  for (const bad of ["", "  ", "同", "c0", "j4", "0四", "７", "七", "c44", "76x", null, undefined]) {
    assert.equal(parseSquareInput(bad), null, `${JSON.stringify(bad)} は受け付けない`);
  }
});

test("全81マスが自分自身に戻る（往復）", () => {
  const files = "abcdefghi";
  for (let file = 1; file <= 9; file += 1) {
    for (let rank = 1; rank <= 9; rank += 1) {
      const written = `${file}${rank}`;
      const engine = `${files[9 - file]}${10 - rank}`;
      assert.equal(parseSquareInput(written), engine, `${written}`);
      assert.equal(parseSquareInput(engine), engine, `${engine}`);
    }
  }
});
