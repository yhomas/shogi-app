#!/usr/bin/env bash
# COOP/COEP ヘッダーが実際に付いているかを確認する。
# このアプリは両方のヘッダーが無いとエンジン（SharedArrayBuffer を使う）が起動しない。
#
# 使い方: tools/check-headers.sh [URL]
#   例: tools/check-headers.sh http://127.0.0.1:8000/index.html
#       tools/check-headers.sh https://<project-id>.web.app/index.html
set -u

url="${1:-http://127.0.0.1:8000/index.html}"

headers=$(curl -sSI --max-time 10 "$url") || {
  echo "NG: $url に接続できません" >&2
  exit 1
}

rc=0
check() {
  if printf '%s\n' "$headers" | grep -qi "$1"; then
    echo "OK  $2"
  else
    echo "NG  $2" >&2
    rc=1
  fi
}

check "cross-origin-embedder-policy: require-corp" "Cross-Origin-Embedder-Policy: require-corp"
check "cross-origin-opener-policy: same-origin"   "Cross-Origin-Opener-Policy: same-origin"

[ "$rc" -eq 0 ] && echo "cross-origin isolated になる条件を満たしています" || echo "エンジンは起動しません" >&2
exit "$rc"
