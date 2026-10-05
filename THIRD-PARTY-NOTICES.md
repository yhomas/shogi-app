# 同梱しているソフトウェアと、その出所

このアプリは、将棋エンジンを1つ同梱しています。アプリ本体は GPL-3.0 で配布します。

## アプリ本体

- ライセンス: **GPL-3.0**（全文は [`LICENSE`](./LICENSE)）
- 対応するソース: https://github.com/yhomas/shogi-app
- **無保証**: 本ソフトウェアは無保証です。法律が許す限り、いかなる保証も付きません（GPL-3.0 §15〜§17）。

## Yuji Mai（駒の文字に使う行書体）

| 項目 | 内容 |
|---|---|
| 名称 | Yuji Mai |
| 作者 | The Yuji Project Authors（https://github.com/Kinutafontfactory/Yuji） |
| ライセンス | **SIL Open Font License 1.1**（全文は [`public/fonts/OFL-YujiMai.txt`](./public/fonts/OFL-YujiMai.txt)） |
| 入手元 | Google Fonts / https://github.com/google/fonts/tree/main/ofl/yujimai |
| 改変 | **サブセット化**（駒で使う文字＝歩香桂銀金角飛玉と杏圭全馬龍 の14文字だけを残した）。OFL は改変と再配布を認めています |
| 同梱物 | `public/fonts/yuji-mai-pieces.woff2`（約7KB） |

将棋の駒の文字は、すべてこの書体で表示します。

## Fairy-Stockfish（WebAssembly 版）

| 項目 | 内容 |
|---|---|
| 名称 | fairy-stockfish-nnue.wasm |
| 版 | 1.1.12 |
| ライセンス | **GPL-3.0**（全文は [`public/engine/COPYING.txt`](./public/engine/COPYING.txt) と [`LICENSE`](./LICENSE)） |
| 改変 | **無改変**で同梱しています（バイト列をそのまま配信） |
| 上流 | https://github.com/fairy-stockfish/fairy-stockfish.wasm |
| 上流の版 | エンジン自身が `commit: b2e693ef` と名乗ります |
| ビルド手順 | 上流リポジトリの `src/emscripten/README.md` |

同梱しているファイルと、その SHA-256:

```
9080a62e3133e50da0c47b88b186d9c29ed37cc5129401bdeed8bffb5b9a4ca9  public/engine/stockfish.js
7cea742b8ca1a324fbc500f89112f168134cf68eb49475df23be6c42336255c6  public/engine/stockfish.wasm
067be484ac62f728b0dad28496997e5862f3c61f9091f59bb35d9d1b1ed14573  public/engine/stockfish.worker.js
```

### 対応するソース（GPL-3.0 §6(d)）

上流のリポジトリ（上記 URL）から入手できます。無改変で配布しているため、
上流のソースがそのまま「対応するソース」になります。ビルド手順は上流の
`src/emscripten/README.md` にあります。

入手方法が分からない場合や、上流が公開をやめている場合は、お手数ですが
リポジトリの Issue でご連絡ください。必要なら、こちらで入手できる形にして提供します。

### このアプリでの使われ方

- `public/engine/stockfish.js` を Web Worker として起動し、USI で対局・検討を行います
- `UCI_Variant=shogi` を指定して将棋のルールで動かします
- 評価は古典評価です（NNUE の評価ファイルは同梱していません）
- 著作物の結合について: 画面のアプリ本体とエンジンは分けて同梱しており、
  表示・棋譜・チェック項目などのアプリ側のコードは本リポジトリの成果物です
