# 将棋鍛錬アプリ 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ブラウザだけで動く将棋の終盤練習アプリ（公開AIとの対戦、利きの可視化、kifからの局面再現と対戦、指す前の自己点検）を作り、Firebase Hosting に配信する。

**Architecture:** 依存ゼロの素の ES modules と WASM。ビルド工程なし。エンジン（Fairy-Stockfish WASM）を同一オリジンに同梱し、合法手の生成と局面の進行を担当させる。自前で実装するのは利きの計算だけにする。状態の保存は localStorage のみ。

**Tech Stack:** HTML / CSS / ES modules / WebAssembly。ビルドツール・バンドラは使わない。単体テストは Node.js 組み込みの `node --test`（依存パッケージ0個）。配信は Firebase Hosting。

**Spec:** `docs/superpowers/specs/2026-10-03-shogi-practice-app-design.md`

## Global Constraints

- ES modules のみ。ビルド工程なし。実行時の npm 依存は **0個**（テストも 0個）。
- 配信物は `public/` 配下だけ。`package.json` はテスト実行のためにのみ使い、配信物には含めない。
- 必須ヘッダー: `Cross-Origin-Embedder-Policy: require-corp` と `Cross-Origin-Opener-Policy: same-origin`。両方ないとエンジンは起動しない。
- エンジンは同一オリジン（`public/engine/`）に同梱する。CDN からは読まない（`new Worker()` がクロスオリジンを拒否するため）。
- エンジン記法: `<列の文字 a-i><段の数字 1-9>`。駒打ちは `P@e5`。成りは末尾に `+`。USI ではない。
- 座標変換: `engineFile = "abcdefghi"[FEN行内インデックス]`、`engineRank = 10 - 段番号`。
- FEN: 1行目が1段、行内は9列→1列。大文字=先手。持ち駒は `[` `]` で囲み、空は `[-]`。手番は先手 `w`、後手 `b`。
- 先手は段番号が小さくなる向き、後手は段番号が大きくなる向きが「前」。
- 利きは**自駒がいるマスも数える**（守りの強さ）。飛び駒は最初にぶつかった駒のマスまで数えて止まる。
- 保存は localStorage のみ。棋譜は保存しない。
- ライセンス: エンジンは GPL-3.0。`public/engine/COPYING.txt` を同梱し、アプリから参照できるようにする。
- コード内の識別子は英語、コメントと画面表示は日本語。

## Review Focus

仕様が暗黙に前提していて、どのタスクのテストでも直接は扱わないが、利用者が最初に踏む可能性が高い順に5件。それぞれ担当タスクにテストを置く。

1. **kif の非標準な表記**（`同`／`不成`／全角数字／`変化`／コメント行）でパースが壊れないか → Task 10
2. **COOP/COEP ヘッダーが無い環境**（`python3 -m http.server` や別ホスト）でエンジンが起動せず、原因が分からないまま固まらないか → Task 7
3. **持ち駒つき局面の SFEN が往復するか**（`[-]`／成駒の `+`／手番）— 往復が壊れると別の局面で対局が始まる → Task 4
4. **端末差**（`hardwareConcurrency` が小さい、メモリ不足で `Hash` を確保できない）で起動に失敗しないか → Task 14
5. **localStorage の破損・容量超過**で起動できなくならないか → Task 12

---

### Task 1: 土台（配信・ヘッダー・エンジン同梱）

**Files:**
- Create: `package.json`, `.gitignore`, `serve.py`, `firebase.json`, `public/index.html`, `public/404.html`, `public/css/style.css`
- Create: `public/engine/stockfish.js`, `public/engine/stockfish.wasm`, `public/engine/stockfish.worker.js`, `public/engine/COPYING.txt`

**Interfaces:**
- Consumes: なし
- Produces: `public/` を配信ルートとする構成。以降のタスクは `public/js/` にファイルを足す。

- [ ] **Step 1: `package.json` を作る**

テスト実行のためだけに使う。依存は0個。

```json
{
  "name": "shogi-app",
  "private": true,
  "type": "module",
  "scripts": { "test": "node --test test/" }
}
```

- [ ] **Step 2: `.gitignore` を作る**

```
node_modules/
.DS_Store
tmp/
```

- [ ] **Step 3: `serve.py` を作る**

`public/` を 127.0.0.1:8000 で配信し、COOP/COEP を必ず付ける。`python3 -m http.server` はヘッダーを送らないため、これがないとエンジンが起動しない。

```python
import functools
import http.server
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent / "public"


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        super().end_headers()

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    http.server.ThreadingHTTPServer(
        ("127.0.0.1", 8000), functools.partial(Handler, directory=str(ROOT))
    ).serve_forever()
```

- [ ] **Step 4: `public/index.html` と `public/404.html` と `public/css/style.css` の骨を作る**

`index.html` は `<meta charset="utf-8">`、`<script type="module" src="./js/main.js"></script>`、盤面を入れる `<div id="board">` を持つ。中身は Task 7 で作る。

- [ ] **Step 5: `firebase.json` を作る**

```json
{
  "hosting": {
    "public": "public",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "headers": [
      {
        "source": "**",
        "headers": [
          { "key": "Cross-Origin-Embedder-Policy", "value": "require-corp" },
          { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" }
        ]
      },
      {
        "source": "engine/**.wasm",
        "headers": [{ "key": "Cache-Control", "value": "max-age=31536000, immutable" }]
      }
    ]
  }
}
```

- [ ] **Step 6: エンジンの3ファイルとライセンスを取得して同梱する**

npm の配布物から取り出す。バージョンは 1.1.12 に固定する。

```bash
mkdir -p public/engine tmp
curl -sSL "https://registry.npmjs.org/fairy-stockfish-nnue.wasm/-/fairy-stockfish-nnue.wasm-1.1.12.tgz" -o tmp/fs.tgz
tar xzf tmp/fs.tgz -C tmp
cp tmp/package/stockfish.js tmp/package/stockfish.wasm tmp/package/stockfish.worker.js public/engine/
cp tmp/package/Copying.txt public/engine/COPYING.txt
shasum -a 256 public/engine/stockfish.wasm   # 値を控えて README か本計画に追記する
rm -rf tmp
```

期待: `public/engine/` に4ファイル。`stockfish.wasm` は約1.6MB。

- [ ] **Step 7: ヘッダーが実際に付くことを確認する**

```bash
python3 serve.py &
sleep 1
curl -sSI http://127.0.0.1:8000/index.html | grep -i "cross-origin"
```

期待: `cross-origin-embedder-policy: require-corp` と `cross-origin-opener-policy: same-origin` の2行が出る。

- [ ] **Step 8: コミット**

```bash
git add -A
git commit -m "chore: 配信の土台とエンジン同梱を追加"
```

---

### Task 2: coords.js — 座標変換

**Files:**
- Create: `public/js/coords.js`
- Test: `test/coords.test.js`

**Interfaces:**
- Consumes: なし
- Produces:
  - `columnToFileIndex(column: number): number` — 列(1..9) → FEN行内インデックス(0..8)
  - `fileIndexToEngineFile(index: number): string` — 0 → `"a"`、8 → `"i"`
  - `engineFileToFileIndex(letter: string): number`
  - `rankToEngineRank(rank: number): number` — 段(1..9) → `10 - 段`
  - `engineRankToRank(engineRank: number): number`
  - `squareToEngine(column: number, rank: number): string` — 例 `(2, 8) → "h2"`
  - `engineToSquare(square: string): { column: number, rank: number }`

- [ ] **Step 1: 失敗するテストを書く**

四隅と検算は**実測で確定した値**を使う（仕様 2.4）。

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  columnToFileIndex, fileIndexToEngineFile, engineFileToFileIndex,
  rankToEngineRank, engineRankToRank, squareToEngine, engineToSquare,
} from "../public/js/coords.js";

test("FEN の行内インデックスが列文字になる", () => {
  assert.equal(fileIndexToEngineFile(0), "a");
  assert.equal(fileIndexToEngineFile(8), "i");
  assert.equal(engineFileToFileIndex("i"), 8);
});

test("段番号は 10 - 段 でエンジンの段になる", () => {
  assert.equal(rankToEngineRank(1), 9);
  assert.equal(rankToEngineRank(9), 1);
  assert.equal(rankToEngineRank(5), 5);
  assert.equal(engineRankToRank(2), 8);
});

test("四隅と中央の座標", () => {
  assert.equal(squareToEngine(9, 1), "a9");
  assert.equal(squareToEngine(1, 1), "i9");
  assert.equal(squareToEngine(9, 9), "a1");
  assert.equal(squareToEngine(1, 9), "i1");
  assert.equal(squareToEngine(5, 5), "e5");
});

test("初期局面の検算（先手の玉5九、先手の飛2八）", () => {
  assert.equal(squareToEngine(5, 9), "e1");
  assert.equal(squareToEngine(2, 8), "h2");
});

test("kif の指し手表記がエンジン記法になる", () => {
  // ▲７六歩(77) → c3c4 / △３四歩(33) → g7g6
  assert.equal(squareToEngine(7, 7) + squareToEngine(7, 6), "c3c4");
  assert.equal(squareToEngine(3, 3) + squareToEngine(3, 4), "g7g6");
});

test("逆変換が往復する", () => {
  assert.deepEqual(engineToSquare("h2"), { column: 2, rank: 8 });
  assert.deepEqual(engineToSquare("e1"), { column: 5, rank: 9 });
});

test("範囲外は例外", () => {
  assert.throws(() => fileIndexToEngineFile(9), RangeError);
  assert.throws(() => rankToEngineRank(0), RangeError);
  assert.throws(() => engineToSquare("z9"), RangeError);
});
```

- [ ] **Step 2: 失敗することを確認する**

Run: `node --test test/coords.test.js`
Expected: FAIL（`Cannot find module ... coords.js`）

- [ ] **Step 3: `public/js/coords.js` を実装する**

```js
const FILES = "abcdefghi";
```

`columnToFileIndex(column) = 9 - column`、`squareToEngine(column, rank) = fileIndexToEngineFile(9 - column) + rankToEngineRank(rank)`。範囲外は `RangeError`。

- [ ] **Step 4: 通ることを確認する**

Run: `node --test test/coords.test.js`
Expected: PASS（7件）

- [ ] **Step 5: コミット**

```bash
git add public/js/coords.js test/coords.test.js
git commit -m "feat: 座標変換を追加"
```

---

### Task 3: state.js — 局面データと初期局面

**Files:**
- Create: `public/js/state.js`
- Test: `test/state.test.js`

**Interfaces:**
- Consumes: `coords.js` の `squareToEngine` など
- Produces:
  - 型 `Piece = { type: "P"|"L"|"N"|"S"|"G"|"B"|"R"|"K", owner: "w"|"b", promoted: boolean }`
  - 型 `Hands = { P: number, L: number, N: number, S: number, G: number, B: number, R: number }`
  - 型 `Position = { board: (Piece|null)[81], hands: { w: Hands, b: Hands }, turn: "w"|"b" }`
  - `boardIndex(column: number, rank: number): number` — `(rank - 1) * 9 + (9 - column)`、0..80
  - `createInitialPosition(): Position` — 平手の初期局面。手番は `"w"`
  - `emptyHands(): Hands`

- [ ] **Step 1: 失敗するテストを書く**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { boardIndex, createInitialPosition, emptyHands } from "../public/js/state.js";

test("盤面の添字は FEN の並びと一致する", () => {
  assert.equal(boardIndex(9, 1), 0);
  assert.equal(boardIndex(1, 1), 8);
  assert.equal(boardIndex(9, 9), 72);
  assert.equal(boardIndex(1, 9), 80);
});

test("初期局面の駒の位置が正しい", () => {
  const p = createInitialPosition();
  assert.equal(p.board.length, 81);
  assert.equal(p.turn, "w");
  assert.deepEqual(p.board[boardIndex(5, 9)], { type: "K", owner: "w", promoted: false });
  assert.deepEqual(p.board[boardIndex(2, 8)], { type: "R", owner: "w", promoted: false });
  assert.deepEqual(p.board[boardIndex(8, 8)], { type: "B", owner: "w", promoted: false });
  assert.deepEqual(p.board[boardIndex(5, 1)], { type: "K", owner: "b", promoted: false });
  assert.equal(p.board.filter(Boolean).length, 40);
});

test("初期局面の持ち駒は空", () => {
  const p = createInitialPosition();
  assert.deepEqual(p.hands.w, emptyHands());
  assert.deepEqual(p.hands.b, emptyHands());
});
```

- [ ] **Step 2: 失敗を確認** — Run: `node --test test/state.test.js` / Expected: FAIL

- [ ] **Step 3: `public/js/state.js` を実装する**

初期局面は平手の配置を素直に書き下す（歩9、香2、桂2、銀2、金2、玉1、飛1、角1 の両者で40枚）。持ち駒は `{ P:0, L:0, N:0, S:0, G:0, B:0, R:0 }`。

- [ ] **Step 4: 通ることを確認** — Run: `node --test test/state.test.js` / Expected: PASS（3件）

- [ ] **Step 5: コミット**

```bash
git add public/js/state.js test/state.test.js
git commit -m "feat: 局面データと初期局面を追加"
```

---

### Task 4: coords.js — SFEN の生成と解析

**Files:**
- Modify: `public/js/coords.js`
- Test: `test/sfen.test.js`

**Interfaces:**
- Consumes: `state.js` の `Position` 型
- Produces:
  - `boardToSfen(position: Position): string`
  - `parseSfen(sfen: string): Position`

**仕様で確定した書式**（実測）: 9行、1行目が1段、行内は9列→1列。成駒は `+` を前置。持ち駒は `[...]`、空は `[-]`。並びは R B G S N L P の順で先手が大文字・後手が小文字、枚数は数字を前置（例 `2R2B`）。手番は `w`/`b`。

- [ ] **Step 1: 失敗するテストを書く**

**Review Focus 3 のテスト**（持ち駒と成駒の往復）をここに置く。

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { boardToSfen, parseSfen } from "../public/js/coords.js";
import { createInitialPosition } from "../public/js/state.js";

const START = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL[-] w 0 1";

test("初期局面の SFEN が実測値と一致する", () => {
  assert.equal(boardToSfen(createInitialPosition()), START);
});

test("SFEN を読み直すと同じ局面に戻る（往復）", () => {
  assert.deepEqual(parseSfen(START), createInitialPosition());
});

test("持ち駒つき・成駒つきの局面が往復する", () => {
  const sfen = "l5s1l/4k4/2n2g1p1/2ppppp2/9/P1P3P2/1P1PPP1PP/1B5R1/LN5NL[GSNP] b - - 0 1";
  assert.equal(boardToSfen(parseSfen(sfen)), sfen);
});

test("持ち駒が空なら [-]", () => {
  assert.match(boardToSfen(createInitialPosition()), /\[-\]/);
});
```

- [ ] **Step 2: 失敗を確認** — Run: `node --test test/sfen.test.js` / Expected: FAIL

- [ ] **Step 3: `public/js/coords.js` に `boardToSfen` と `parseSfen` を実装する**

- [ ] **Step 4: 通ることを確認** — Run: `node --test test/sfen.test.js` / Expected: PASS（4件）

- [ ] **Step 5: 仕様の初期局面文字列と突き合わせる**

Run: `node -e "import('./public/js/coords.js').then(m => console.log(m.boardToSfen(m.parseSfen('lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL[-] w 0 1'))))"`
Expected: 入力と同じ文字列が出る。違えば Task 13 の perft 確認で必ず落ちるので、ここで直す。

- [ ] **Step 6: コミット**

```bash
git add public/js/coords.js test/sfen.test.js
git commit -m "feat: SFEN の生成と解析を追加"
```

---

### Task 5: attack-map.js — 利き数の計算

**Files:**
- Create: `public/js/attack-map.js`
- Test: `test/attack-map.test.js`

**Interfaces:**
- Consumes: `state.js` の `Position`
- Produces: `countAttacks(position: Position): { w: Int16Array(81), b: Int16Array(81) }` — 添字は `boardIndex` と同じ

**実装の要点**: 各駒の攻撃方向を `[dRank, dColumn, 最大歩数]` の配列で持ち、`max === Infinity` なら最初に駒に当たるマスまで数えて止める。当たった駒が自駒でも数える。先手は段番号が減る向き、後手は増える向きが前。

- [ ] **Step 1: 失敗するテストを書く**

**初期局面の利きは実測値と突き合わせる**（エンジンの合法手と一致することを検証済み）。

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { countAttacks } from "../public/js/attack-map.js";
import { createInitialPosition, boardIndex } from "../public/js/state.js";

test("初期局面: 先手の利き数が実測と一致する", () => {
  const a = countAttacks(createInitialPosition());
  const at = (col, rank) => a.w[boardIndex(col, rank)];
  // 同じアルゴリズムをブラウザで初期局面に適用して得た実測値（手計算とも一致）
  assert.equal(at(3, 8), 3);
  assert.equal(at(4, 8), 4);
  assert.equal(at(5, 8), 4);
  assert.equal(at(6, 8), 4);
  assert.equal(at(7, 8), 3);
  assert.equal(at(8, 8), 2);   // 飛 + 銀。自駒の角のマスも守りとして数えて止まる
  assert.equal(at(9, 8), 1);   // 香のみ。飛は角で止まるので届かない
  assert.equal(at(2, 7), 1);   // 飛のみ。自歩で止まる
  assert.equal(at(2, 6), 1);   // 2七の歩のみ。飛は2七で止まるので2六へは伸びない
});

test("利きは合算される（5八は玉と両金で3以上）", () => {
  const a = countAttacks(createInitialPosition());
  assert.ok(a.w[boardIndex(5, 8)] >= 3);
});

test("後手の歩は段番号が増える向きに利く", () => {
  const a = countAttacks(createInitialPosition());
  // 後手の歩は3段目。前は4段目
  assert.equal(a.b[boardIndex(5, 4)], 1);
  assert.equal(a.b[boardIndex(5, 2)], 0);
});

test("金は6マス、銀は5マス、玉は8マス", () => {
  const reach = (piece) => {
    const p = createInitialPosition();
    p.board.fill(null);
    p.board[boardIndex(5, 5)] = piece;
    return countAttacks(p).w.reduce((n, v) => n + (v > 0 ? 1 : 0), 0);
  };
  assert.equal(reach({ type: "G", owner: "w", promoted: false }), 6);
  assert.equal(reach({ type: "S", owner: "w", promoted: false }), 5);
  assert.equal(reach({ type: "K", owner: "w", promoted: false }), 8);
});

test("成駒: と・成香・成桂・成銀は金と同じ6マス", () => {
  const reach = (piece) => {
    const p = createInitialPosition();
    p.board.fill(null);
    p.board[boardIndex(5, 5)] = piece;
    return countAttacks(p).w.reduce((n, v) => n + (v > 0 ? 1 : 0), 0);
  };
  for (const type of ["P", "L", "N", "S"]) {
    assert.equal(reach({ type, owner: "w", promoted: true }), 6, type);
  }
  // 盤の中央なら、斜め4方向×4マス＋縦横1マス4つ = 20
  assert.equal(reach({ type: "B", owner: "w", promoted: true }), 20);
  // 縦横4方向×4マス＋斜め1マス4つ = 20
  assert.equal(reach({ type: "R", owner: "w", promoted: true }), 20);
});
```

- [ ] **Step 2: 失敗を確認** — Run: `node --test test/attack-map.test.js` / Expected: FAIL

- [ ] **Step 3: `public/js/attack-map.js` を実装する**

駒種ごとの方向表と、飛び駒の遮断処理を書く。

- [ ] **Step 4: 通ることを確認** — Run: `node --test test/attack-map.test.js` / Expected: PASS（5件）

- [ ] **Step 5: コミット**

```bash
git add public/js/attack-map.js test/attack-map.test.js
git commit -m "feat: 利き数の計算を追加"
```

---

### Task 6: board.js — 盤面と利きの描画

**Files:**
- Create: `public/js/board.js`
- Modify: `public/index.html`, `public/css/style.css`

**Interfaces:**
- Consumes: `state.js` の `Position`、`attack-map.js` の `countAttacks`
- Produces:
  - `renderBoard(rootEl: Element, position: Position, options: { attacks, mode, selected, destinations }): void`
  - `mode` は `"both" | "mine" | "opp" | "none"`

**表示の仕様**（仕様 4.2）: 自分の利き数は右下に青、相手は左上に赤。濃さは 1→0.15、2→0.30、3→0.45、4→0.60、5以上→0.75。両方あるマスは斜め2分割（左上=赤、右下=青）。合法手は点滅する枠で別に示す。後手の駒は180度回転する。タップ領域は44px以上。

**参考**: `docs/mockups/attack-map-preview.html` が動く見本（計算も実装済み）。CSS と描画構造はこれを踏襲する。

- [ ] **Step 1: `main.js` の代わりに一時的な起動で盤面を描く**

`public/index.html` から `./js/board.js` を直接呼び、初期局面を描画する（Task 11 で `main.js` に置き換える）。

- [ ] **Step 2: `python3 serve.py` で開いて確認する**

Run: `python3 serve.py` → ブラウザで `http://127.0.0.1:8000/`
Expected: 9×9 の盤面。40枚の駒。後手の駒が180度回転。利きの数字が四隅に出る。

- [ ] **Step 3: 利きの数字と濃さを目視で検証する**

初期局面で次を確認する（Task 5 のテストと同じ値）。

| マス | 期待 |
|---|---|
| 5八 | 自分の利きが3以上（玉と両金）で濃い |
| 2八 | 先手の飛のマス。相手の利き1が左上に出る |
| 8八 | 自分の利き2（飛と銀） |

- [ ] **Step 4: 両方の利きがあるマスの分割を確認する**

マスを斜めに2分割し、左上が赤・右下が青になっていることを確認する。

- [ ] **Step 5: 表示の切り替えを実装する**

`mode` を `"both"` / `"mine"` / `"opp"` / `"none"` で切り替えるトグルを付ける。既定は `"both"`。`"mine"` では赤の三角形と相手の数字を描かない。あわせて、AIの手番中は利きの表示を消す（盤面が読みにくくなるため）。

- [ ] **Step 6: コミット**

```bash
git add public/js/board.js public/index.html public/css/style.css
git commit -m "feat: 盤面と利きの描画を追加"
```

---

### Task 7: usi-engine.js — エンジン制御

**Files:**
- Create: `public/js/usi-engine.js`
- Test: `tools/engine-check.html`（ブラウザでの確認用ページ）

**Interfaces:**
- Consumes: なし
- Produces:
  - `async function createEngine({ url, onLine }): Engine`
  - `Engine` のメソッド: `setOption(name, value)`, `isReady()`, `setPositionSfen(sfen)`, `setPositionMoves(moves)`, `goDepth(depth)`, `stop()`, `quit()`
  - `Engine.onLine` は `info` 行を1行ずつ受け取るコールバック
  - `guardCrossOriginIsolation(): { ok: boolean, message: string }`

- [ ] **Step 1: `guardCrossOriginIsolation` を先に書く（Review Focus 2）**

`crossOriginIsolated` が偽なら、エンジンを読み込む前に警告を返す。**ここが無いと、原因不明のまま固まる**。

```js
export function guardCrossOriginIsolation() {
  if (typeof self !== "undefined" && self.crossOriginIsolated) return { ok: true, message: "" };
  return {
    ok: false,
    message:
      "このアプリは COOP/COEP ヘッダーが必要です。ホスティングの設定を確認してください。" +
      "ローカルで試すときは python3 serve.py を使ってください。",
  };
}
```

- [ ] **Step 2: 確認用ページ `tools/engine-check.html` を作る**

`guardCrossOriginIsolation` の結果、エンジンの `id name`、初期局面の `bestmove`、初期局面の合法手30手を表示する。

- [ ] **Step 3: エンジンを読み込んで初期化する**

`public/engine/stockfish.js` を `<script>` で読み、`Stockfish()` で初期化する。出力は `addMessageListener` で受ける（`print` コールバックでは受け取れない。**実測で確認済み**）。初期化は `uci` → `uciok` 待ち → `setoption name UCI_Variant value shogi` → `setoption name Threads value N` → `isready` → `readyok` 待ち。`Protocol` という option は存在しないので送らない。

- [ ] **Step 4: ブラウザで確認する**

Run: `python3 serve.py` → `http://127.0.0.1:8000/tools/engine-check.html`
Expected: `id name Fairy-Stockfish` が出る。`bestmove c3c4` が返る。合法手が30手。

- [ ] **Step 5: ヘッダーなしのときの警告を確認する**

Run: `python3 -m http.server 8001 --directory public` → `http://127.0.0.1:8001/tools/engine-check.html`
Expected: 「COOP/COEP ヘッダーが必要です」の警告が出る。エンジンの読み込みは試みない。

- [ ] **Step 6: コミット**

```bash
git add public/js/usi-engine.js tools/engine-check.html
git commit -m "feat: エンジン制御と分離の判定を追加"
```

---

### Task 8: moves.js — 指し手の入力と照合

**Files:**
- Create: `public/js/moves.js`

**Interfaces:**
- Consumes: `Engine`（Task 7）、`coords.js`、`state.js`
- Produces:
  - `async function enumerateLegalMoves(engine: Engine, position: Position): Promise<string[]>`
  - `destinationsFrom(moves: string[], from: string): string[]`
  - `applyMove(position: Position, move: string): Position` — 盤面と持ち駒と手番を更新する
  - `isDrop(move: string): boolean`、`isPromotion(move: string): boolean`

**合法手の列挙**（実測で確認済みの方法）: `setoption name MultiPV value 300` を設定して `go depth 1`。`info ... pv <手>` の先頭を集めると全合法手になる（初期局面で30手）。

- [ ] **Step 1: `enumerateLegalMoves` を実装し、確認用ページで30手を確認する**

Run: `python3 serve.py` → `http://127.0.0.1:8000/tools/engine-check.html`
Expected: 初期局面で30手。`a1a2` `c3c4` `h2c2` などを含む。

- [ ] **Step 2: `applyMove` を実装する**

移動・取り・成り・打ちを扱う。取った駒は持ち駒に加える（成りを戻して `type` にする）。打ちは持ち駒から減らす。

- [ ] **Step 3: SFEN と突き合わせて検証する**

`▲７六歩 △３四歩` を `applyMove` で適用し、`boardToSfen` の結果が次と一致することを確認する（Task 4 のテストと同じ文字列）。

```
lnsgkgsnl/1r5b1/pppppp1pp/6p2/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL[-] w - - 0 1
```

- [ ] **Step 4: エンジンの perft と突き合わせる**

同じ局面を2通りでエンジンに渡し、`go perft 3` のノード数が一致することを確認する。

- `position fen <上のSFEN>`
- `position startpos moves c3c4 g7g6`

Expected: 両方 **54375 nodes**（実測値）。

- [ ] **Step 5: コミット**

```bash
git add public/js/moves.js
git commit -m "feat: 指し手の照合と適用を追加"
```

---

### Task 9: main.js — 対局の流れ

**Files:**
- Create: `public/js/main.js`
- Modify: `public/index.html`

**Interfaces:**
- Consumes: これまでの全モジュール
- Produces: 対局の状態機械。`phase` は `"idle" | "human" | "thinking" | "over"`。

- [ ] **Step 1: 画面の骨を組む**

ヘッダ（手番・AIの深さ）、盤面、持ち駒、操作ボタン（新対局・待った）。

- [ ] **Step 2: 人間の指し手を反映する**

駒をタップ → 行き先を `destinationsFrom` で絞って表示 → タップで確定 → `applyMove` → SFEN を組み立ててエンジンに `position fen` で渡す。持ち駒はタップで打てるようにする（打てるマスだけを候補に出す）。成りの選択が必要な場合は、成る／成らないを選ぶ小さなダイアログを出す。

- [ ] **Step 3: AIの指し手を反映する**

`go depth N` → `bestmove` → `applyMove` → 描画。深さは設定から取る（既定10）。

- [ ] **Step 4: 終局を扱う**

エンジンが `bestmove` を返さない、または投了を示す値を返した場合に `"over"` にする。**戻り値の実際の形は実測して確定する**（未検証事項）。

- [ ] **Step 5: ブラウザで1局通す**

Run: `python3 serve.py` → 5手指す
Expected: 交互に進む。待ったが効く。評価値は表示しない（練習モード）。

- [ ] **Step 6: コミット**

```bash
git add public/js/main.js public/index.html
git commit -m "feat: 対局の流れを追加"
```

---

### Task 10: kif-parser.js — kif の読み込み

**Files:**
- Create: `public/js/kif-parser.js`
- Test: `test/kif-parser.test.js`
- Create: `test/fixtures/sample.kif`

**Interfaces:**
- Consumes: `coords.js` の `squareToEngine`、`state.js`
- Produces: `parseKif(text: string): { startPosition: Position, moves: string[], errors: Array<{ line: number, text: string, reason: string }>, result: string | null }`

**形式**（仕様 4.3）: `後手の持駒：` / `先手の持駒：` の行から初期局面の持ち駒を取る。指し手は `1 ７六歩(77)` の形。`同` は直前の手の移動先。`打` は駒打ち。`成` / `不成` は成りの指定。括弧内は消費時間なので無視。`投了` などの表記で終了。`変化：N手` 以降は読み飛ばす。

- [ ] **Step 1: フィクスチャ `test/fixtures/sample.kif` を作る**

`同` `不成` `打` を含む短い棋譜を自分で書き、`投了` で終える。

- [ ] **Step 2: 失敗するテストを書く**

**Review Focus 1 のテスト**（非標準表記）をここに置く。

```js
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
  // 1手目 8八→2二（h2h8）。2手目の移動先は 2二 と同じ
  assert.equal(r.moves[0], "h2h8");
  assert.ok(r.moves[1].endsWith("h8"), r.moves[1]);
});

test("駒打ちは @ 記法になる", () => {
  const r = parseKif("   1 ５五銀打\n   2 投了\n");
  assert.deepEqual(r.moves, ["S@e5"]);
});

test("不成 は + を付けない", () => {
  const r = parseKif("   1 ２二角不成(88)\n   2 投了\n");
  assert.equal(r.moves[0], "h2h8");
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
});
```

- [ ] **Step 3: 失敗を確認** — Run: `node --test test/kif-parser.test.js` / Expected: FAIL

- [ ] **Step 4: `public/js/kif-parser.js` を実装する**

全角数字を半角に直す。段の漢数字を数値に直す。行頭の `▲` `△` `▼` `^` は手番の判定に使う。

- [ ] **Step 5: 通ることを確認** — Run: `node --test test/kif-parser.test.js` / Expected: PASS（7件）

- [ ] **Step 6: コミット**

```bash
git add public/js/kif-parser.js test/kif-parser.test.js test/fixtures/sample.kif
git commit -m "feat: kif の読み込みを追加"
```

---

### Task 11: kif 局面からの対戦

**Files:**
- Modify: `public/js/main.js`, `public/js/board.js`, `public/index.html`

**Interfaces:**
- Consumes: `parseKif`、`boardToSfen`、`Engine`
- Produces: kif を読み込んだあと、その局面から対局できる状態。

- [ ] **Step 1: kif の読み込みUIを付ける**

ファイル選択と、「何手目から始めるか」のスライダー（既定は最終局面）。

- [ ] **Step 2: 自分が指す側の切替を付ける**

既定は「再現した局面の手番側を自分が指す」。切り替えた場合、局面の手番と自分が指す側が食い違えば AI が先に指す。

- [ ] **Step 3: SFEN を渡して perft で検証する**

読み込んだ局面を `position fen` で渡し、`go perft 2` のノード数を画面に出す。値が取れない・0 の場合は警告を出す（黙って別の局面で始めない）。

- [ ] **Step 4: ブラウザで確認する**

Run: `python3 serve.py` → kif を読み込んで3手指す
Expected: 再現した局面から対局できる。待ったで読み込み直後まで戻れる。

- [ ] **Step 5: コミット**

```bash
git add public/js/main.js public/js/board.js public/index.html
git commit -m "feat: kif の局面から対戦できるようにする"
```

---

### Task 12: checklist.js — チェック項目

**Files:**
- Create: `public/js/checklist.js`
- Test: `test/checklist.test.js`

**Interfaces:**
- Consumes: `coords.js`、`state.js`
- Produces:
  - `loadItems(storage = localStorage): Item[]`、`saveItems(items, storage): void`
  - `matchesCondition(condition: Condition, context: Context): boolean`
  - `evaluate(items: Item[], context: Context): Item[]`
  - `Condition = { type: string, piece?: string, squares?: string[] }`
  - `Context = { position: Position, lastMove: string | null, ply: number, mySide: "w" | "b" }`

**条件の種類**（仕様 4.4）: `always`、`opponentMoved`、`opponentMovedPiece`、`opponentMovedFrom`、`opponentMovedTo`、`opponentInCheck`、`myKingThreatened`、`myPieceAt`、`handHasPiece`、`handCountAtMost`、`plyAtLeast`。`piece` は成駒も含めて判定する（`rook` は龍を含む）。

- [ ] **Step 1: 失敗するテストを書く**

**Review Focus 5 のテスト**（壊れた localStorage）をここに置く。

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadItems, saveItems, matchesCondition, evaluate } from "../public/js/checklist.js";
import { createInitialPosition } from "../public/js/state.js";

const ctx = (over = {}) => ({
  position: createInitialPosition(), lastMove: null, ply: 0, mySide: "w", ...over,
});

test("壊れた localStorage でも既定値に戻る", () => {
  const broken = { getItem: () => "{壊れたJSON", setItem() {} };
  assert.deepEqual(loadItems(broken), []);
  const missing = { getItem: () => null, setItem() {} };
  assert.deepEqual(loadItems(missing), []);
});

test("保存して読み戻せる", () => {
  let store = null;
  const s = { getItem: () => store, setItem: (_k, v) => { store = v; } };
  saveItems([{ id: "1", text: "確認", condition: { type: "always" }, enabled: true, priority: "normal" }], s);
  assert.equal(loadItems(s).length, 1);
});

test("always は常に成立", () => {
  assert.equal(matchesCondition({ type: "always" }, ctx()), true);
});

test("相手が飛車または角を動かした（成駒も含む）", () => {
  const c = { type: "opponentMovedPiece", piece: "rook_bishop" };
  assert.equal(matchesCondition(c, ctx({ lastMove: "h2c2" })), true);   // 飛
  assert.equal(matchesCondition(c, ctx({ lastMove: "b2h8+" })), true);  // 角（成り）
  assert.equal(matchesCondition(c, ctx({ lastMove: "c3c4" })), false);  // 歩
});

test("plyAtLeast と handCountAtMost", () => {
  assert.equal(matchesCondition({ type: "plyAtLeast", ply: 60 }, ctx({ ply: 60 })), true);
  assert.equal(matchesCondition({ type: "plyAtLeast", ply: 60 }, ctx({ ply: 59 })), false);
  assert.equal(matchesCondition({ type: "handCountAtMost", count: 0 }, ctx()), true);
});

test("evaluate は有効な項目だけを返す", () => {
  const items = [
    { id: "1", text: "常に", condition: { type: "always" }, enabled: true, priority: "normal" },
    { id: "2", text: "無効", condition: { type: "always" }, enabled: false, priority: "normal" },
    { id: "3", text: "60手から", condition: { type: "plyAtLeast", ply: 60 }, enabled: true, priority: "low" },
  ];
  assert.deepEqual(evaluate(items, ctx()).map((i) => i.id), ["1"]);
  assert.deepEqual(evaluate(items, ctx({ ply: 60 })).map((i) => i.id), ["1", "3"]);
});
```

- [ ] **Step 2: 失敗を確認** — Run: `node --test test/checklist.test.js` / Expected: FAIL

- [ ] **Step 3: `public/js/checklist.js` を実装する**

`loadItems` は JSON の解析に失敗したら空配列を返す（例外を投げない）。

- [ ] **Step 4: 通ることを確認** — Run: `node --test test/checklist.test.js` / Expected: PASS（6件）

- [ ] **Step 5: コミット**

```bash
git add public/js/checklist.js test/checklist.test.js
git commit -m "feat: チェック項目の保存と条件評価を追加"
```

---

### Task 13: チェック項目の表示と登録UI

**Files:**
- Modify: `public/js/main.js`, `public/index.html`, `public/css/style.css`

**Interfaces:**
- Consumes: `checklist.js`
- Produces: 指す前に確認パネルを出す流れ。

- [ ] **Step 1: 駒を掴んだ時点で条件を評価してパネルを出す**

行き先を確定したあと、`evaluate` が返した項目をチェックボックス付きで並べる。全部チェックするまで「指す」を押せない。「この手をやめる」ボタンを必ず置く。

- [ ] **Step 2: 同じ手で二度出さない**

一度確認して指した手については、同じ局面で再度パネルを出さない。相手の手が進んだらリセットする。

- [ ] **Step 3: 登録UIを付ける**

テキスト、条件タイプ、優先度、有効・無効、削除。

- [ ] **Step 4: ブラウザで確認する**

Run: `python3 serve.py` → 条件 `opponentMovedPiece: rook_bishop` の項目を作り、飛車を動かして確認する
Expected: 相手が飛車を動かしたあとの自分の手番で、指す前にパネルが出る。やめると指さずに戻れる。

- [ ] **Step 5: コミット**

```bash
git add public/js/main.js public/index.html public/css/style.css
git commit -m "feat: チェック項目の表示と登録を追加"
```

---

### Task 14: settings.js — 強さ設定と端末差への対応

**Files:**
- Create: `public/js/settings.js`
- Test: `test/settings.test.js`

**Interfaces:**
- Consumes: なし
- Produces:
  - `defaultStrengthSettings(nav: { hardwareConcurrency?: number, deviceMemory?: number }): StrengthSettings`
  - `StrengthSettings = { mode: "depth" | "elo", depth: number, skill: number, elo: number, threads: number, hashMb: number, multiPv: number }`

**端末差の扱い**（Review Focus 4）: スレッド数は `min(8, hardwareConcurrency)`。`Hash` は端末のメモリに応じて 16〜256MB の範囲で決める（`deviceMemory` が取れない端末もあるので既定は 64MB）。

- [ ] **Step 1: 失敗するテストを書く**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultStrengthSettings } from "../public/js/settings.js";

test("既定は深さ指定・深さ10", () => {
  const s = defaultStrengthSettings({ hardwareConcurrency: 8, deviceMemory: 8 });
  assert.equal(s.mode, "depth");
  assert.equal(s.depth, 10);
  assert.equal(s.multiPv, 1);
});

test("スレッド数は端末に合わせて 1..8 に収まる", () => {
  assert.equal(defaultStrengthSettings({ hardwareConcurrency: 2 }).threads, 2);
  assert.equal(defaultStrengthSettings({ hardwareConcurrency: 16 }).threads, 8);
  assert.equal(defaultStrengthSettings({}).threads, 1);
  assert.equal(defaultStrengthSettings({ hardwareConcurrency: 0 }).threads, 1);
});

test("Hash は端末のメモリに応じて 16..256MB に収まる", () => {
  assert.equal(defaultStrengthSettings({ deviceMemory: 1 }).hashMb, 16);
  assert.equal(defaultStrengthSettings({ deviceMemory: 8 }).hashMb, 64);
  assert.equal(defaultStrengthSettings({ deviceMemory: 64 }).hashMb, 256);
  assert.equal(defaultStrengthSettings({}).hashMb, 64);
});
```

- [ ] **Step 2: 失敗を確認** — Run: `node --test test/settings.test.js` / Expected: FAIL

- [ ] **Step 3: `public/js/settings.js` を実装する**

`navigator.hardwareConcurrency` や `navigator.deviceMemory` は関数の引数として受け取り、`navigator` を直接参照しない（Node からテストできるようにするため）。`localStorage` への保存・読み出しは `checklist.js` と同じ耐性（壊れていたら既定値）を持たせる。

- [ ] **Step 4: 通ることを確認** — Run: `node --test test/settings.test.js` / Expected: PASS（3件）

- [ ] **Step 5: コミット**

```bash
git add public/js/settings.js test/settings.test.js
git commit -m "feat: 強さ設定と端末差への対応を追加"
```

---

### Task 15: 評価値・候補手の表示と検討モード

**Files:**
- Modify: `public/js/main.js`, `public/index.html`, `public/css/style.css`

**Interfaces:**
- Consumes: `usi-engine.js`、`settings.js`
- Produces: 練習モードと検討モードの切替。

- [ ] **Step 1: 強さ設定UIを付ける**

「深さ指定」と「Elo指定」をラジオで切り替える。深さ指定なら `go depth N` と `Skill Level`、Elo指定なら `UCI_LimitStrength` を有効にして `UCI_Elo` と `go movetime`。両方を同時に有効にしない。`Threads` と `Hash` は Task 14 の既定値を使う。

- [ ] **Step 2: 評価値と候補手の表示を付ける（検討モードのみ）**

`MultiPV` を5にして `info` の `score cp` と `pv` を並べる。

- [ ] **Step 3: 練習モードでは隠す**

練習モードでは評価値・候補手・読み筋を出さない。ヘッダには手番と深さだけ。

- [ ] **Step 4: ブラウザで確認する**

Run: `python3 serve.py`
Expected: 深さを10→15に上げると `info depth` の最大値が上がる。検討モードで候補手が並ぶ。練習モードでは出ない。

- [ ] **Step 5: コミット**

```bash
git add public/js/main.js public/index.html public/css/style.css
git commit -m "feat: 強さ設定と検討モードを追加"
```

---

### Task 16: 仕上げ（レスポンシブ・エラー処理）

**Files:**
- Modify: `public/css/style.css`, `public/index.html`, `public/js/main.js`, `public/js/usi-engine.js`

- [ ] **Step 1: スマホ縦持ちのレイアウトを整える**

盤面を画面の60〜70%に収める。持ち駒はタップで打てる。タップ領域は44px以上。

- [ ] **Step 2: エラー処理を入れる**

エンジンの読み込み失敗、`bestmove` が返らない場合、perft が取れない場合に、それぞれ日本語で原因と対処を出す。あわせて、このエンジンは NNUE の評価ファイルを持たず**古典評価で動く**ため同じ深さでもネイティブ版より弱いことを、強さ設定の近くに注記する（仕様 2.5）。

- [ ] **Step 3: ライセンス表示を入れる**

`public/engine/COPYING.txt` へのリンクと、Fairy-Stockfish が GPL-3.0 であることの表示。

- [ ] **Step 4: 実機で確認する**

- スマホのブラウザ（同一LANから `http://<MacのIP>:8000/`）でタップ操作
- ウィンドウ幅を狭めてレイアウトが崩れないこと

- [ ] **Step 5: 全テストを通す**

Run: `npm test`
Expected: 全件 PASS。

- [ ] **Step 6: コミット**

```bash
git add -A
git commit -m "feat: レスポンシブとエラー処理を仕上げる"
```

---

### Task 17: Firebase への配信

**Files:**
- Create: `.firebaserc`
- Modify: `firebase.json`（必要なら）

**Interfaces:**
- Consumes: Task 1 の `firebase.json`
- Produces: 公開URL

**注意**: `firebase login` はブラウザでの認証が必要で、**本人の操作が要る唯一の手順**。

- [ ] **Step 1: ログインする（本人の操作）**

```bash
npx firebase-tools login
```

- [ ] **Step 2: プロジェクトを作る**

```bash
npx firebase-tools projects:create <project-id> --display-name "将棋鍛錬アプリ"
```

- [ ] **Step 3: `.firebaserc` を作る**

```json
{ "projects": { "default": "<project-id>" } }
```

- [ ] **Step 4: デプロイする**

```bash
npx firebase-tools deploy --only hosting
```

- [ ] **Step 5: ヘッダーを実機で確認する**

```bash
curl -sSI https://<project-id>.web.app/index.html | grep -i cross-origin
curl -sSI https://<project-id>.web.app/engine/stockfish.wasm | grep -i -E "cross-origin|cache-control"
```

Expected: COOP/COEP の2行が出る。WASM に `cache-control: max-age=31536000, immutable` が出る。

- [ ] **Step 6: 公開URLで対局できることを確認する**

Expected: 盤面が出る。AIが指す。利きが表示される。kifが読める。チェック項目が出る。

- [ ] **Step 7: コミット**

```bash
git add .firebaserc firebase.json
git commit -m "chore: Firebase のプロジェクト設定を追加"
```

---

## 補足: 実装中に確定させる未検証事項

仕様 2.7 に挙げた項目は、該当タスクで実測して決める。

| 項目 | 確認するタスク |
|---|---|
| `score cp` の符号（手番側から見た値か、先手から見た値か） | Task 15 |
| 終局時の応答（`bestmove (none)` / `bestmove resign`） | Task 9 Step 4 |
| 千日手の挙動 | Task 9 Step 4 |

## 補足: 仕様からの小さな変更

- `js/settings.js` を追加した（Task 14）。強さ設定と端末差への対応は、エンジン制御ともチェック項目とも別の責務であり、`navigator` を引数で受ける純粋関数にすることで Node からテストできるため。
- `board.js` の責務を「盤面の描画」に限定し、局面データは `state.js` が持つことにした（仕様 3.2 の表現を明確化しただけで、ファイル構成は変わらない）。
- テストは Node.js の組み込みテストランナー（`node --test`）を使う。仕様 6 を更新済み。