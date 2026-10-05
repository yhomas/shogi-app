"""ローカル動作確認用の簡易サーバー（Python 3 だけで動く。追加パッケージ不要）

COOP/COEP ヘッダーを付けるためだけのもの。これが無いとブラウザが
SharedArrayBuffer を無効にするので、将棋エンジンが起動しない。
"""

import functools
import http.server
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent / "public"
DEFAULT_PORT = 8000


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        # ローカル確認では、常に最新のファイルを読ませる（古い JS が使われるのを防ぐ）
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def log_message(self, format, *args):
        pass


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PORT
    try:
        server = http.server.ThreadingHTTPServer(
            ("127.0.0.1", port), functools.partial(Handler, directory=str(ROOT))
        )
    except OSError as exc:
        if exc.errno in (48, 98):  # macOS / Linux の「使用中」
            print(f"ポート {port} は既に使われています。")
            print(f"別のポートで試してください:  python3 serve.py {port + 1}")
            print("（同じアプリを別のウィンドウで開きっぱなしにしている場合は、そちらを閉じてください）")
        else:
            print(f"起動できませんでした: {exc}")
        raise SystemExit(1)
    print(f"ブラウザで開いてください:  http://127.0.0.1:{port}/")
    print("終了するには Ctrl+C を押してください。")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n停止しました。")


if __name__ == "__main__":
    main()
