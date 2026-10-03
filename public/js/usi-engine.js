// 同梱した将棋エンジン（Fairy-Stockfish の WebAssembly 版）を操る。
//
// 実測で確認したこと（仕様 2.3、附録C）:
//   - このエンジンは pthread でビルドされているため、SharedArrayBuffer が要る。
//     つまり COOP/COEP ヘッダーが無い配信では起動しない。guardCrossOriginIsolation で先に弾く。
//   - 出力は addMessageListener で受け取る。Stockfish オブジェクトの print を差し替えても
//     受け取れない（実測で確認済み）。
//   - コマンドは postMessage で送る。ワーカー側が cmd:"custom" を onCustomMessage に渡し、
//     エンジンの入力になる。
//   - 「usi」ではなく「uci」を送る。「usiok」ではなく「uciok」が返る。
//   - Protocol という option は無いので送らない。
//   - 読みの深さは go depth N、絞った強さは UCI_LimitStrength + UCI_Elo。

/** 同梱エンジンの場所。usi-engine.js からの相対なので、置き場所が変わっても解決できる。 */
export const DEFAULT_ENGINE_URL = new URL("../engine/stockfish.js", import.meta.url).href;

const INIT_TIMEOUT_MS = 30000;
const SEARCH_TIMEOUT_MS = 180000;

/**
 * このページが cross-origin isolated かどうかを調べる。
 * 偽なら、エンジンを読み込む前に理由の分かるメッセージを返す。
 * （これが無いと、原因不明のまま固まる）
 * @returns {{ok: boolean, message: string}}
 */
export function guardCrossOriginIsolation() {
  const isolated = typeof self !== "undefined" && self.crossOriginIsolated === true;
  if (isolated) return { ok: true, message: "" };
  return {
    ok: false,
    message:
      "このアプリのエンジンは COOP/COEP ヘッダーが無いと起動できません。" +
      "ローカルで試すときは python3 serve.py を使ってください" +
      "（python3 -m http.server ではヘッダーが付きません）。" +
      "配信先では Cross-Origin-Embedder-Policy: require-corp と " +
      "Cross-Origin-Opener-Policy: same-origin を付けてください。",
  };
}

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// エンジンの出力行を、待っている人と購読者に配る。
function createLineRouter() {
  const listeners = new Set();
  const waiters = new Set();

  return {
    emit(line) {
      for (const listener of listeners) listener(line);
      for (const waiter of [...waiters]) {
        if (waiter.match(line)) {
          waiters.delete(waiter);
          waiter.resolve(line);
        }
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    // 送信の前に登録してから待つこと（先に送ると取りこぼす）
    waitFor(match) {
      return new Promise((resolve) => waiters.add({ match, resolve }));
    },
  };
}

let scriptPromise = null;

function loadEngineScript(url) {
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = url;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`エンジンのファイルを読み込めませんでした: ${url}`));
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

/**
 * エンジンを起動して、コマンドを送れる状態にする。
 * `uci` → `uciok` を待ち、将棋のバリアントとスレッド数・置換表を設定し、`readyok` まで待つ。
 * @param {{url?: string, onLine?: (line: string) => void, threads?: number, hashMb?: number, multiPv?: number}} [options]
 * @returns {Promise<{
 *   idName: string,
 *   setOption: (name: string, value: string|number) => void,
 *   isReady: () => Promise<void>,
 *   setPositionSfen: (sfen: string) => void,
 *   setPositionMoves: (moves: string[]) => void,
 *   goDepth: (depth: number) => Promise<string>,
 *   stop: () => void,
 *   quit: () => void,
 * }>}
 */
export async function createEngine({ url = DEFAULT_ENGINE_URL, onLine, threads, hashMb, multiPv } = {}) {
  const guard = guardCrossOriginIsolation();
  if (!guard.ok) throw new Error(guard.message);

  const router = createLineRouter();
  if (typeof onLine === "function") router.subscribe(onLine);

  await loadEngineScript(url);

  if (typeof globalThis.Stockfish !== "function") {
    throw new Error(`エンジンの本体（Stockfish）が見つかりません: ${url}`);
  }

  const module = await withTimeout(
    globalThis.Stockfish(),
    INIT_TIMEOUT_MS,
    "エンジンの初期化が終わりませんでした。COOP/COEP ヘッダーと回線を確認してください。",
  );
  module.addMessageListener((line) => router.emit(line));

  const send = (command) => module.postMessage(command);

  // 識別名を取り出すために uci を送る
  const idLine = router.waitFor((line) => line.startsWith("id name "));
  const uciOk = router.waitFor((line) => line.trim() === "uciok");
  send("uci");
  await withTimeout(uciOk, INIT_TIMEOUT_MS, "エンジンが uciok を返しませんでした。");
  const idName = (await idLine).replace(/^id name\s*/, "");

  const setOption = (name, value) => send(`setoption name ${name} value ${value}`);

  // 将棋を指させる。Threads と Hash は端末に合わせて呼び出し側が決める。
  setOption("UCI_Variant", "shogi");
  if (threads) setOption("Threads", threads);
  if (hashMb) setOption("Hash", hashMb);
  if (multiPv) setOption("MultiPV", multiPv);

  const isReady = async () => {
    const ready = router.waitFor((line) => line.trim() === "readyok");
    send("isready");
    await withTimeout(ready, INIT_TIMEOUT_MS, "エンジンが readyok を返しませんでした。");
  };
  await isReady();

  return {
    idName,
    setOption,
    isReady,
    setPositionSfen(sfen) {
      send(`position fen ${sfen}`);
    },
    setPositionMoves(moves) {
      send(`position startpos moves ${moves.join(" ")}`);
    },
    // 読みの深さを指定して指させる。bestmove の手を返す。
    async goDepth(depth) {
      const bestmove = router.waitFor((line) => line.startsWith("bestmove"));
      send(`go depth ${depth}`);
      const line = await withTimeout(
        bestmove,
        SEARCH_TIMEOUT_MS,
        `エンジンが深さ${depth}の手を返しませんでした。`,
      );
      return line.split(/\s+/)[1] ?? "";
    },
    stop() {
      send("stop");
    },
    quit() {
      send("quit");
      if (typeof module.terminate === "function") module.terminate();
    },
  };
}
