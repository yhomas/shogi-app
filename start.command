#!/bin/sh
# ダブルクリックで起動する用（macOS）。黒い画面が出たら、閉じずにそのままにしてください。
# 終了するときは黒い画面で Ctrl+C を押すか、ウィンドウを閉じてください。
cd "$(dirname "$0")" || exit 1
PORT=8000
( sleep 1; open "http://127.0.0.1:$PORT/" ) &
python3 serve.py "$PORT"
