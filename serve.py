import functools
import http.server
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent / "public"


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        super().end_headers()

    def log_message(self, format, *args):
        pass


if __name__ == "__main__":
    http.server.ThreadingHTTPServer(
        ("127.0.0.1", 8000), functools.partial(Handler, directory=str(ROOT))
    ).serve_forever()
