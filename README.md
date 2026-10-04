# 将棋鍛錬アプリ

ブラウザだけで動く将棋の終盤練習アプリ。公開されている将棋AIと対戦でき、各マスの利きを数で見ながら指せる。kifから終盤の局面を再現して、そこからも対戦できる。指す前に自分のチェック項目を確認できる。

設計と実装計画は `docs/` にある。

- 設計仕様書: `docs/superpowers/specs/2026-10-03-shogi-practice-app-design.md`
- 実装計画: `docs/superpowers/plans/2026-10-03-shogi-practice-app.md`

## ローカルで動かす

```bash
python3 serve.py
# → http://127.0.0.1:8000/
```

`serve.py` は COOP/COEP ヘッダーを付けて配信する。**`python3 -m http.server` では動かない**（ヘッダーが無いとエンジンが起動しない）。付いているかは次で確認できる。

```bash
tools/check-headers.sh
```

## テスト

単体テストは Node.js の組み込みテストランナーを使う。依存パッケージは無い。

```bash
npm test        # node --test test/
```

## 配信

Firebase Hosting。プロジェクトIDは `.firebaserc` に入れる。

```bash
npx firebase-tools login                       # ブラウザでの認証が必要
npx firebase-tools projects:create <project-id>
npx firebase-tools deploy --only hosting
tools/check-headers.sh https://<project-id>.web.app/index.html
```

## 同梱しているエンジン

- 名前: Fairy-Stockfish（WebAssembly 版、`fairy-stockfish-nnue.wasm` パッケージ 1.1.12）
- ライセンス: GPL-3.0（全文は `LICENSE`。同梱物の出所と対応するソースは `THIRD-PARTY-NOTICES.md`）
- 同一オリジンに置いている。`new Worker()` がクロスオリジンの URL を受け付けないため、CDN からは読み込めない。
- この配布物は NNUE の評価ファイルを含まないため、**古典評価**で動く。同じ深さでもネイティブ版より弱い。

SHA-256（取り違えの検出用）

```
7cea742b8ca1a324fbc500f89112f168134cf68eb49475df23be6c42336255c6  stockfish.wasm
9080a62e3133e50da0c47b88b186d9c29ed37cc5129401bdeed8bffb5b9a4ca9  stockfish.js
067be484ac62f728b0dad28496997e5862f3c61f9091f59bb35d9d1b1ed14573  stockfish.worker.js
```

## 構成

```
public/            Firebase Hosting が配信するディレクトリ
  index.html
  css/style.css
  js/              ES modules（ビルド工程なし）
  engine/          同梱するエンジン
serve.py           ローカル開発用サーバー（COOP/COEP 付き）
tools/             開発補助
test/              単体テスト（node --test）
docs/              設計仕様書と実装計画
```
