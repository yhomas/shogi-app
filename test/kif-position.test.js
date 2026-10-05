import assert from "node:assert/strict";
import { test } from "node:test";

import { parseKifPosition, parseHands } from "../public/js/kif-position.js";
import { parseKif } from "../public/js/kif-parser.js";

// ぴよ将棋が出力する「途中図だけの棋譜」（指し手が無い）の例
const KIF = `# ----  ぴよ将棋 棋譜ファイル  ----
棋戦：終盤道場 2026/10/3
手合割：平手
後手の持駒：飛　金　歩二　
  ９ ８ ７ ６ ５ ４ ３ ２ １
+---------------------------+
| ・ 杏 玉 杏 ・ ・ ・v桂v香|一
| ・ ・ と とv歩v龍 ・v玉 ・|二
|v歩 ・ 全 ・ ・v桂 ・v歩 ・|三
|v馬 ・ ・ ・v馬v歩v歩v銀v歩|四
| ・ ・ ・ ・ 桂 ・ ・ ・ ・|五
| 歩 歩 ・v歩 金 金 銀 ・ ・|六
| ・ ・ ・ ・ ・ 歩 歩 ・ 歩|七
| ・ ・ ・ ・ ・ ・ ・ ・ ・|八
|vと ・ ・ ・ ・ ・ ・ 桂 香|九
+---------------------------+
先手の持駒：金　銀　歩　
先手：プレイヤー
後手：Lv32 ピヨ男(R2050 五段)
手数----指手---------消費時間--
   1 中断         ( 0:01/00:00:01)
まで0手で中断
`;

test("持ち駒の行を読む（全角スペース・漢数字・なし）", () => {
  assert.deepEqual(parseHands("後手の持駒：飛　金　歩二　"), { P: 2, L: 0, N: 0, S: 0, G: 1, B: 0, R: 1 });
  assert.deepEqual(parseHands("先手の持駒：金　銀　歩　"), { P: 1, L: 0, N: 0, S: 1, G: 1, B: 0, R: 0 });
  assert.deepEqual(parseHands("先手の持駒：なし"), { P: 0, L: 0, N: 0, S: 0, G: 0, B: 0, R: 0 });
  assert.deepEqual(parseHands("先手の持駒："), { P: 0, L: 0, N: 0, S: 0, G: 0, B: 0, R: 0 });
});

test("局面図から盤面を作る（成駒・後手の駒・空マス）", () => {
  const position = parseKifPosition(KIF);
  assert.ok(position, "局面図を読める");
  const at = (file, rank) => position.board[(rank - 1) * 9 + (9 - file)];
  // ９一は空、８一は後手の香(杏=成香)、７一は後手の玉...ではなく先手の玉
  assert.equal(at(9, 1), null, "９一は空マス");
  assert.deepEqual(at(8, 1), { type: "L", owner: "w", promoted: true }, "８一は成香");
  assert.deepEqual(at(7, 1), { type: "K", owner: "w", promoted: false }, "７一は玉");
  assert.deepEqual(at(2, 1), { type: "N", owner: "b", promoted: false }, "２一は後手の桂");
  assert.deepEqual(at(1, 1), { type: "L", owner: "b", promoted: false }, "１一は後手の香");
  assert.deepEqual(at(5, 5), { type: "N", owner: "w", promoted: false }, "５五は先手の桂");
  assert.deepEqual(at(9, 9), { type: "P", owner: "b", promoted: true }, "９九は後手のと金");
});

test("持ち駒も盤面と一緒に読む", () => {
  const position = parseKifPosition(KIF);
  assert.equal(position.hands.b.R, 1, "後手の飛");
  assert.equal(position.hands.b.G, 1, "後手の金");
  assert.equal(position.hands.b.P, 2, "後手の歩2");
  assert.equal(position.hands.w.G, 1, "先手の金");
  assert.equal(position.turn, "w", "手番は先手から");
});

test("局面図が無い棋譜では null（平手として扱う）", () => {
  assert.equal(parseKifPosition("先手：a\n後手：b\n   1 ７六歩(77)\n"), null);
});

test("棋譜の読み込みに組み込まれている（0手の途中図でも局面ができる）", () => {
  const parsed = parseKif(KIF);
  assert.equal(parsed.moves.length, 0, "指し手は0件");
  // 図から作った局面になっている（平手ではない）
  const board = parsed.startPosition.board;
  const count = board.filter((piece) => piece).length;
  assert.ok(count > 0 && count < 40, `平手でも空でもない（駒数 ${count}）`);
});
