import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseKif } from "../public/js/kif-parser.js";

test("基本の指し手がエンジン記法になる", () => {
  const r = parseKif("   1 ７六歩(77)\n   2 ３四歩(33)\n   3 投了\n");
  assert.deepEqual(r.moves, ["c3c4", "g7g6"]);
  assert.equal(r.result, "投了");
});

test("同 は直前の移動先を使う", () => {
  const r = parseKif("   1 ２二角成(88)\n   2 同　銀(31)\n   3 投了\n");
  // 1手目 8八→2二（b2h8）で成る。2手目の移動先は 2二 と同じ。
  assert.equal(r.moves[0], "b2h8+");
  assert.ok(r.moves[1].endsWith("h8"), r.moves[1]);
});

test("駒打ちは @ 記法になる", () => {
  const r = parseKif("   1 ５五銀打\n   2 投了\n");
  assert.deepEqual(r.moves, ["S@e5"]);
});

test("不成 は + を付けない", () => {
  const r = parseKif("   1 ２二角不成(88)\n   2 投了\n");
  assert.equal(r.moves[0], "b2h8");
});

test("変化 以降は読み飛ばす", () => {
  const r = parseKif("   1 ７六歩(77)\n変化：3手\n   1 ２六歩(27)\n   2 投了\n");
  assert.deepEqual(r.moves, ["c3c4"]);
});

test("解釈できない行はエラーとして記録し、処理は続く", () => {
  const r = parseKif("   1 ７六歩(77)\n   2 ？？？\n   3 ３四歩(33)\n   4 投了\n");
  assert.deepEqual(r.moves, ["c3c4", "g7g6"]);
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].line, 2);
});

test("実ファイルを読める", () => {
  const text = readFileSync(new URL("./fixtures/sample.kif", import.meta.url), "utf8");
  const r = parseKif(text);
  assert.ok(r.moves.length > 0);
  assert.equal(r.errors.length, 0);
  assert.equal(r.result, "投了");
});

test("持ち駒の行から開始局面の持ち駒を取る", () => {
  const r = parseKif("後手の持駒：なし\n先手の持駒：金　歩三\n   1 投了\n");
  assert.equal(r.startPosition.hands.w.G, 1);
  assert.equal(r.startPosition.hands.w.P, 3);
  assert.equal(r.startPosition.hands.b.P, 0);
});

test("開始局面の盤面は平手初期局面", () => {
  const r = parseKif("   1 投了\n");
  assert.equal(r.startPosition.board.filter(Boolean).length, 40);
  assert.equal(r.startPosition.turn, "w");
});
