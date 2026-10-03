// 対局の流れ。画面とエンジンをつなぐ。
//
// 状態は phase で表す。
//   idle      … 起動中
//   human     … 自分の手番。駒を選んで指せる
//   thinking  … AIの手番。利きの表示は消す（盤面が読みにくくなるため）
//   over      … 終局。詰み、またはエンジンが指せなかった
//
// 自分の手番の流れ:
//   駒（または持ち駒）をタップ → 行き先を点滅表示 → タップで確定
//   → applyMove → 合法手を引き直す → AIの手番ならエンジンに指させる

import { createInitialPosition, boardIndex } from "./state.js";
import { boardToSfen, engineToSquare, squareToEngine } from "./coords.js";
import { countAttacks } from "./attack-map.js";
import { renderBoard } from "./board.js";
import { createEngine, guardCrossOriginIsolation } from "./usi-engine.js";
import { applyMove, destinationsFrom, enumerateLegalMoves, replayMoves, resolveMove } from "./moves.js";
import { parseKif } from "./kif-parser.js";

const HAND_LABELS = { P: "歩", L: "香", N: "桂", S: "銀", G: "金", B: "角", R: "飛" };
const HAND_ORDER = ["R", "B", "G", "S", "N", "L", "P"];

const ui = {
  board: document.getElementById("board"),
  turn: document.getElementById("turn"),
  depth: document.getElementById("depth"),
  handMine: document.getElementById("hand-mine"),
  handOpp: document.getElementById("hand-opp"),
  newGame: document.getElementById("new-game"),
  undo: document.getElementById("undo"),
  mode: document.getElementById("attack-mode"),
  message: document.getElementById("message"),
  kifFile: document.getElementById("kif-file"),
  kifUpto: document.getElementById("kif-upto"),
  kifUptoLabel: document.getElementById("kif-upto-label"),
  kifApply: document.getElementById("kif-apply"),
  kifStatus: document.getElementById("kif-status"),
  mySide: document.getElementById("my-side"),
};

let position = createInitialPosition();
let legalMoves = [];
let history = [];
let phase = "idle";
let selectedSquare = null;
let selectedHand = null;
let destinations = [];
let mySide = "w";
let engine = null;
let parsedKif = null;

const opponentOf = (side) => (side === "w" ? "b" : "w");
const sideName = (side) => (side === "w" ? "先手" : "後手");

function setMessage(text) {
  ui.message.textContent = text;
}

function clearSelection() {
  selectedSquare = null;
  selectedHand = null;
  destinations = [];
}

function destinationIndexes() {
  return destinations.map((square) => {
    const { column, rank } = engineToSquare(square);
    return boardIndex(column, rank);
  });
}

function selectedIndex() {
  if (!selectedSquare) return null;
  const { column, rank } = engineToSquare(selectedSquare);
  return boardIndex(column, rank);
}

function render() {
  // AIの手番中は利きの表示を消す
  const mode = phase === "thinking" ? "none" : ui.mode.value;
  renderBoard(ui.board, position, {
    attacks: countAttacks(position),
    mode,
    mySide,
    selected: selectedIndex(),
    destinations: destinationIndexes(),
  });
  renderHands();
  renderHeader();
}

function renderHeader() {
  const turn = position.turn === mySide ? "あなた" : "AI";
  const state =
    phase === "thinking" ? "AIが考えています…"
    : phase === "over" ? "終局"
    : phase === "human" ? "あなたの手番です"
    : "準備中";
  ui.turn.textContent = `${sideName(position.turn)} ${turn}／${state}`;
  ui.undo.disabled = history.length === 0 || phase === "thinking" || phase === "idle";
}

function renderHands() {
  renderHand(ui.handMine, position.hands[mySide], true);
  renderHand(ui.handOpp, position.hands[opponentOf(mySide)], false);
}

function renderHand(host, hand, clickable) {
  host.textContent = "";
  let any = false;
  for (const type of HAND_ORDER) {
    const count = hand[type] ?? 0;
    if (count === 0) continue;
    any = true;
    const el = document.createElement("button");
    el.type = "button";
    el.className = "hand-piece";
    if (clickable && phase === "human" && position.turn === mySide) {
      el.classList.add("clickable");
      if (selectedHand === type) el.classList.add("selected");
      el.addEventListener("click", () => onHandClick(type));
    } else {
      el.disabled = true;
    }
    el.textContent = `${HAND_LABELS[type]}${count > 1 ? `×${count}` : ""}`;
    host.appendChild(el);
  }
  if (!any) host.textContent = "持ち駒なし";
}

function onHandClick(type) {
  if (phase !== "human" || position.turn !== mySide) return;
  const from = `${type}@`;
  const dests = destinationsFrom(legalMoves, from);
  if (dests.length === 0) return;
  selectedHand = type;
  selectedSquare = null;
  destinations = dests;
  render();
}

function onSquareClick(column, rank) {
  if (phase !== "human" || position.turn !== mySide) return;
  const square = squareToEngine(column, rank);

  // 点滅している行き先をタップした → 指す
  if (destinations.includes(square) && (selectedSquare || selectedHand)) {
    playHumanMove(selectedSquare ?? `${selectedHand}@`, square);
    return;
  }

  // 自分の駒をタップした → 選ぶ
  const piece = position.board[boardIndex(column, rank)];
  if (piece && piece.owner === mySide) {
    const dests = destinationsFrom(legalMoves, square);
    if (dests.length === 0) {
      clearSelection();
      render();
      return;
    }
    selectedSquare = square;
    selectedHand = null;
    destinations = dests;
    render();
    return;
  }

  clearSelection();
  render();
}

function playHumanMove(from, to) {
  const choice = resolveMove(legalMoves, from, to);
  if (!choice) {
    clearSelection();
    render();
    return;
  }
  let move = choice.move;
  if (choice.needsPromotionChoice) {
    // 成るか成らないかを本人に選んでもらう
    move = window.confirm("成りますか？") ? choice.promoted : choice.plain;
  }
  commitMove(move);
}

async function refreshLegalMoves() {
  legalMoves = await enumerateLegalMoves(engine, position);
}

async function commitMove(move) {
  history.push({ position, legalMoves });
  position = applyMove(position, move);
  clearSelection();
  try {
    await refreshLegalMoves();
  } catch (error) {
    phase = "over";
    setMessage(`合法手の取得で問題が起きました: ${error.message}`);
    render();
    return;
  }
  render();
  afterMove();
}

function afterMove() {
  if (legalMoves.length === 0) {
    finishWithMate();
    return;
  }
  if (position.turn === mySide) {
    phase = "human";
    render();
    return;
  }
  runEngineTurn();
}

function finishWithMate() {
  phase = "over";
  setMessage(position.turn === mySide ? "詰みました。あなたの負けです。" : "詰みました。あなたの勝ちです。");
  render();
}

async function runEngineTurn() {
  phase = "thinking";
  render();
  try {
    engine.setPositionSfen(boardToSfen(position));
    const bestmove = await engine.goDepth(Number(ui.depth.value));
    // 合法手が無い局面ではエンジンは「(none)」を返す（実測で確認）
    if (!bestmove || bestmove === "(none)") {
      phase = "over";
      setMessage("AIに指せる手がありません。あなたの勝ちです。");
      render();
      return;
    }
    history.push({ position, legalMoves });
    position = applyMove(position, bestmove);
    await refreshLegalMoves();
    phase = position.turn === mySide ? "human" : "thinking";
    render();
    if (legalMoves.length === 0) finishWithMate();
  } catch (error) {
    phase = "over";
    setMessage(`エンジンで問題が起きました: ${error.message}`);
    render();
  }
}

function undo() {
  // AIの手と自分の手を1手ずつ戻して、自分の手番に戻す
  while (history.length > 0) {
    const snapshot = history.pop();
    position = snapshot.position;
    legalMoves = snapshot.legalMoves;
    if (position.turn === mySide) break;
  }
  clearSelection();
  setMessage("");
  phase = position.turn === mySide ? "human" : "thinking";
  render();
  if (position.turn !== mySide) runEngineTurn();
}

async function newGame() {
  position = createInitialPosition();
  history = [];
  clearSelection();
  setMessage("");
  await refreshLegalMoves();
  if (position.turn === mySide) {
    phase = "human";
    render();
  } else {
    runEngineTurn();
  }
}

ui.board.addEventListener("click", (event) => {
  const squareEl = event.target.closest(".sq");
  if (!squareEl) return;
  const index = Number(squareEl.dataset.index);
  onSquareClick(9 - (index % 9), Math.floor(index / 9) + 1);
});

// ---- 棋譜（kif）の読み込み ----

function setKifStatus(text) {
  ui.kifStatus.textContent = text;
}

function updateKifLabel() {
  ui.kifUptoLabel.textContent = `${ui.kifUpto.value}手目`;
}

/** 指定した手数まで再生した局面を返す（合法手かどうかも見る）。 */
function kifPositionAt(upto) {
  return replayMoves(engine, parsedKif.startPosition, parsedKif.moves, upto);
}

/** 既定は「再現した局面の手番側を自分が指す」。 */
async function syncDefaultSide() {
  if (!parsedKif) return;
  const replayed = await kifPositionAt(Number(ui.kifUpto.value));
  if (replayed.invalidAtIndex === -1) ui.mySide.value = replayed.position.turn;
}

function loadKif(text) {
  parsedKif = parseKif(text);
  ui.kifUpto.max = String(parsedKif.moves.length);
  ui.kifUpto.value = String(parsedKif.moves.length);
  updateKifLabel();

  const parts = [`棋譜を読みました: ${parsedKif.moves.length}手`];
  if (parsedKif.result) parts.push(`終局: ${parsedKif.result}`);
  if (parsedKif.errors.length > 0) {
    const first = parsedKif.errors[0];
    parts.push(
      `読めない行が${parsedKif.errors.length}件あります（${first.line}行目: ${first.reason}）`,
    );
  }
  setKifStatus(parts.join("／"));
}

/** 2手先までのノード数。局面が本当に読めているかの確認に使う。 */
async function perftNodes(target, depth = 2) {
  try {
    engine.setPositionSfen(boardToSfen(target));
    return await engine.goPerft(depth);
  } catch (error) {
    return null;
  }
}

async function startFromKif() {
  if (!parsedKif) {
    setKifStatus("先に棋譜ファイルを選んでください。");
    return;
  }
  if (phase === "thinking") return;

  const upto = Number(ui.kifUpto.value);
  const replayed = await kifPositionAt(upto);
  if (replayed.invalidAtIndex !== -1) {
    setKifStatus(
      `${replayed.invalidAtIndex + 1}手目（${replayed.move}）がその局面の合法手にありません。棋譜を確認してください。`,
    );
    return;
  }

  // 局面が読めているかを確かめる。0 や取れない場合は始めない。
  const nodes = await perftNodes(replayed.position);
  if (nodes === null || nodes === 0) {
    setKifStatus(
      "この局面の2手先までのノード数が取れませんでした。別の局面で始めないよう、ここで中止します。",
    );
    return;
  }

  position = replayed.position;
  history = [];
  clearSelection();
  mySide = ui.mySide.value;
  setMessage("");
  await refreshLegalMoves();

  const sideText = mySide === "w" ? "先手" : "後手";
  setKifStatus(
    `${upto}手目から対局します（あなたは${sideText}／2手先までのノード数: ${nodes}）。`,
  );

  if (position.turn === mySide) {
    phase = legalMoves.length === 0 ? "over" : "human";
    render();
    if (phase === "over") finishWithMate();
  } else {
    runEngineTurn();
  }
}

ui.mode.addEventListener("change", render);
ui.newGame.addEventListener("click", () => {
  if (phase === "thinking") return;
  newGame();
});
ui.undo.addEventListener("click", undo);

ui.kifFile.addEventListener("change", async () => {
  const file = ui.kifFile.files?.[0];
  if (!file) return;
  try {
    loadKif(await file.text());
    await syncDefaultSide();
  } catch (error) {
    setKifStatus(`棋譜を読めませんでした: ${error.message}`);
  }
});

ui.kifUpto.addEventListener("input", updateKifLabel);
ui.kifUpto.addEventListener("change", () => {
  syncDefaultSide();
});

ui.mySide.addEventListener("change", () => {
  if (phase === "thinking") return;
  // 対局中でも自分の側を切り替えられるようにする
  mySide = ui.mySide.value;
  render();
  if (position.turn !== mySide && phase !== "over") runEngineTurn();
});

ui.kifApply.addEventListener("click", startFromKif);

async function boot() {
  const guard = guardCrossOriginIsolation();
  if (!guard.ok) {
    phase = "over";
    setMessage(guard.message);
    render();
    return;
  }
  try {
    engine = await createEngine({ threads: 1, hashMb: 64 });
  } catch (error) {
    phase = "over";
    setMessage(error.message);
    render();
    return;
  }
  await newGame();
}

boot();

// ブラウザでの動作確認用
window.__app = {
  get phase() { return phase; },
  get position() { return position; },
  get legalMoves() { return legalMoves; },
  get history() { return history; },
  get destinations() { return destinations; },
  onSquareClick,
  onHandClick,
  undo,
  newGame,
  loadKif,
  startFromKif,
  syncDefaultSide,
  get parsedKif() { return parsedKif; },
  get mySide() { return mySide; },
};
