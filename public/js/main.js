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
import { evaluate, loadItems, saveItems } from "./checklist.js";

const HAND_LABELS = { P: "歩", L: "香", N: "桂", S: "銀", G: "金", B: "角", R: "飛" };
const HAND_ORDER = ["R", "B", "G", "S", "N", "L", "P"];

// チェック項目の条件。仕様 4.4 の表と同じ。
const CONDITION_TYPES = [
  ["always", "いつも"],
  ["opponentMoved", "相手が何か動かした"],
  ["opponentMovedPiece", "相手が指定の駒を動かした"],
  ["opponentMovedFrom", "相手が指定のマスから動かした"],
  ["opponentMovedTo", "相手が指定のマスへ動かした"],
  ["opponentInCheck", "相手に王手をかけている"],
  ["myKingThreatened", "自分の玉が相手の利きに入っている"],
  ["myPieceAt", "自分の指定の駒が指定のマスにある"],
  ["handHasPiece", "自分の指定の駒が持ち駒にある"],
  ["handCountAtMost", "自分の持ち駒の総数が指定以下"],
  ["plyAtLeast", "指定の手数以上進んでいる"],
];

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
  checkPanel: document.getElementById("check-panel"),
  checkList: document.getElementById("check-list"),
  checkMove: document.getElementById("check-move"),
  checkPlay: document.getElementById("check-play"),
  checkCancel: document.getElementById("check-cancel"),
  itemText: document.getElementById("item-text"),
  itemCondition: document.getElementById("item-condition"),
  itemPiece: document.getElementById("item-piece"),
  itemSquares: document.getElementById("item-squares"),
  itemCount: document.getElementById("item-count"),
  itemPly: document.getElementById("item-ply"),
  itemPriority: document.getElementById("item-priority"),
  itemAdd: document.getElementById("item-add"),
  itemList: document.getElementById("item-list"),
  itemStatus: document.getElementById("item-status"),
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
let checkItems = [];
let confirmedMoves = new Set();
let lastMoveInfo = null;
let plyCount = 0;
let pendingMove = null;

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
  requestMoveConfirmation(move);
}

// ---- 指す前のチェック ----

function squareIndexOf(engineSquare) {
  const { column, rank } = engineToSquare(engineSquare);
  return boardIndex(column, rank);
}

/** 手を適用する前に作る、その手の情報。動かした駒の種類はこの時点でしか分からない。 */
function moveInfoFrom(move, beforePosition) {
  if (move.includes("@")) {
    const [letter, to] = move.split("@");
    return { raw: move, from: null, to, isDrop: true, type: letter.toUpperCase(), promoted: false };
  }
  const from = move.slice(0, 2);
  const to = move.slice(2, 4);
  const piece = beforePosition.board[squareIndexOf(from)] ?? null;
  return {
    raw: move,
    from,
    to,
    isDrop: false,
    type: piece ? piece.type : null,
    owner: piece ? piece.owner : null,
    promoted: piece ? piece.promoted : false,
  };
}

function buildContext() {
  return {
    position,
    lastMove: lastMoveInfo ? lastMoveInfo.raw : null,
    lastMoveInfo,
    ply: plyCount,
    mySide,
  };
}

function closeCheckPanel() {
  ui.checkPanel.hidden = true;
  ui.checkList.textContent = "";
  pendingMove = null;
}

function openCheckPanel(move, items) {
  pendingMove = move;
  ui.checkMove.textContent = `これから指す手: ${move}`;
  ui.checkList.textContent = "";

  for (const item of items) {
    const li = document.createElement("li");
    const label = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.addEventListener("change", () => {
      ui.checkPlay.disabled = ![...ui.checkList.querySelectorAll("input[type=checkbox]")].every((b) => b.checked);
    });
    const text = document.createElement("span");
    text.textContent = item.text;
    if (item.priority === "high") text.classList.add("high");
    label.append(box, text);
    li.appendChild(label);
    ui.checkList.appendChild(li);
  }

  ui.checkPlay.disabled = items.length > 0;
  ui.checkPanel.hidden = false;
  ui.checkPanel.scrollIntoView({ block: "nearest" });
}

/** 指す前に条件を評価する。出す項目が無ければそのまま指す。 */
function requestMoveConfirmation(move) {
  const key = `${boardToSfen(position)}|${move}`;
  const items = evaluate(checkItems, buildContext());

  if (items.length === 0 || confirmedMoves.has(key)) {
    commitMove(move);
    return;
  }
  openCheckPanel(move, items);
}

// ---- チェック項目の登録 ----

function setItemStatus(text) {
  ui.itemStatus.textContent = text;
}

function renderItemList() {
  ui.itemList.textContent = "";
  if (checkItems.length === 0) {
    const li = document.createElement("li");
    li.textContent = "まだ登録されていません。";
    ui.itemList.appendChild(li);
    return;
  }

  for (const item of checkItems) {
    const li = document.createElement("li");

    const enabled = document.createElement("input");
    enabled.type = "checkbox";
    enabled.checked = item.enabled !== false;
    enabled.addEventListener("change", () => {
      item.enabled = enabled.checked;
      persistItems();
    });

    const text = document.createElement("span");
    text.textContent = `${item.text}（${conditionLabel(item.condition)}／優先度 ${item.priority ?? "normal"}）`;
    if (item.priority === "high") text.classList.add("high");

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "削除";
    remove.addEventListener("click", () => {
      checkItems = checkItems.filter((entry) => entry !== item);
      persistItems();
      renderItemList();
    });

    li.append(enabled, text, remove);
    ui.itemList.appendChild(li);
  }
}

function conditionLabel(condition) {
  const found = CONDITION_TYPES.find(([type]) => type === condition.type);
  const base = found ? found[1] : condition.type;
  const extras = [];
  if (condition.piece) extras.push(`piece=${condition.piece}`);
  if (condition.squares?.length) extras.push(`squares=${condition.squares.join(",")}`);
  if (condition.count !== undefined) extras.push(`count=${condition.count}`);
  if (condition.ply !== undefined) extras.push(`ply=${condition.ply}`);
  return extras.length ? `${base}（${extras.join(" ") }）` : base;
}

function persistItems() {
  saveItems(checkItems);
}

function addItem() {
  const text = ui.itemText.value.trim();
  if (text === "") {
    setItemStatus("確認する内容を入力してください。");
    return;
  }
  const condition = { type: ui.itemCondition.value };
  if (ui.itemPiece.value.trim()) condition.piece = ui.itemPiece.value.trim();
  const squares = ui.itemSquares.value.split(/[,\s、]+/).filter(Boolean);
  if (squares.length) condition.squares = squares;
  if (ui.itemCount.value !== "") condition.count = Number(ui.itemCount.value);
  if (ui.itemPly.value !== "") condition.ply = Number(ui.itemPly.value);

  checkItems.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text,
    condition,
    enabled: true,
    priority: ui.itemPriority.value,
  });
  persistItems();
  renderItemList();

  ui.itemText.value = "";
  ui.itemPiece.value = "";
  ui.itemSquares.value = "";
  ui.itemCount.value = "";
  ui.itemPly.value = "";
  setItemStatus(`追加しました: ${text}`);
}

async function refreshLegalMoves() {
  legalMoves = await enumerateLegalMoves(engine, position);
}

async function commitMove(move) {
  // 同じ局面で同じ手を二度確認しないように記録する
  confirmedMoves.add(`${boardToSfen(position)}|${move}`);
  const info = moveInfoFrom(move, position);
  history.push({ position, legalMoves, lastMoveInfo, plyCount });
  lastMoveInfo = info;
  position = applyMove(position, move);
  plyCount += 1;
  closeCheckPanel();
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
    const before = position;
    const info = moveInfoFrom(bestmove, before);
    history.push({ position: before, legalMoves, lastMoveInfo, plyCount });
    lastMoveInfo = info;
    position = applyMove(before, bestmove);
    plyCount += 1;
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
    lastMoveInfo = snapshot.lastMoveInfo ?? null;
    plyCount = snapshot.plyCount ?? 0;
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
  confirmedMoves = new Set();
  plyCount = 0;
  lastMoveInfo = null;
  clearSelection();
  closeCheckPanel();
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
  confirmedMoves = new Set();
  plyCount = upto;
  lastMoveInfo = upto > 0 ? moveInfoFrom(parsedKif.moves[upto - 1], replayed.previousPosition) : null;
  clearSelection();
  closeCheckPanel();
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

ui.checkPlay.addEventListener("click", () => {
  if (!pendingMove) return;
  const move = pendingMove;
  closeCheckPanel();
  commitMove(move);
});

ui.checkCancel.addEventListener("click", () => {
  closeCheckPanel();
  clearSelection();
  render();
});

ui.itemAdd.addEventListener("click", addItem);

function fillConditionSelect() {
  for (const [value, label] of CONDITION_TYPES) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    ui.itemCondition.appendChild(option);
  }
}

async function boot() {
  fillConditionSelect();
  checkItems = loadItems();
  renderItemList();

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
  get checkItems() { return checkItems; },
  get pendingMove() { return pendingMove; },
  get lastMoveInfo() { return lastMoveInfo; },
  addItem,
  renderItemList,
};
