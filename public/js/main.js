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
import { lastMoveMark } from "./last-move.js";
import { parseSquareInput } from "./square-input.js";
import { createEngine, guardCrossOriginIsolation } from "./usi-engine.js";
import { applyMove, destinationsFrom, enumerateLegalMoves, replayMoves, resolveMove } from "./moves.js";
import { parseKif } from "./kif-parser.js";
import { evaluate, loadItems, saveItems } from "./checklist.js";
import { loadStrengthSettings, saveStrengthSettings } from "./settings.js";

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
  showMine: document.getElementById("show-mine"),
  showOpp: document.getElementById("show-opp"),
  message: document.getElementById("message"),
  kifFile: document.getElementById("kif-file"),
  kifUpto: document.getElementById("kif-upto"),
  kifUptoLabel: document.getElementById("kif-upto-label"),
  kifApply: document.getElementById("kif-apply"),
  kifStatus: document.getElementById("kif-status"),
  kifClipboard: document.getElementById("kif-clipboard"),
  kifPasteWrap: document.getElementById("kif-paste-wrap"),
  kifPaste: document.getElementById("kif-paste"),
  kifPasteLoad: document.getElementById("kif-paste-load"),
  mySide: document.getElementById("my-side"),
  checkPanel: document.getElementById("check-panel"),
  checkList: document.getElementById("check-list"),
  checkMove: document.getElementById("check-move"),
  checkPlay: document.getElementById("check-play"),
  checkCancel: document.getElementById("check-cancel"),
  itemText: document.getElementById("item-text"),
  itemCondition: document.getElementById("item-condition"),
  itemHint: document.getElementById("item-hint"),
  itemPiece: document.getElementById("item-piece"),
  itemSquares: document.getElementById("item-squares"),
  itemCount: document.getElementById("item-count"),
  itemPly: document.getElementById("item-ply"),
  itemPriority: document.getElementById("item-priority"),
  itemAdd: document.getElementById("item-add"),
  itemList: document.getElementById("item-list"),
  itemStatus: document.getElementById("item-status"),
  modeDepth: document.getElementById("mode-depth"),
  modeElo: document.getElementById("mode-elo"),
  skill: document.getElementById("skill"),
  elo: document.getElementById("elo"),
  threads: document.getElementById("threads"),
  hashMb: document.getElementById("hash-mb"),
  multiPv: document.getElementById("multi-pv"),
  playMode: document.getElementById("play-mode"),
  settingsSave: document.getElementById("settings-save"),
  settingsStatus: document.getElementById("settings-status"),
  analysisPanel: document.getElementById("analysis-panel"),
  analysisSummary: document.getElementById("analysis-summary"),
  pvList: document.getElementById("pv-list"),
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
let settings = null;
let studyMode = false;
let analysisToken = 0;

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

/**
 * 最新の手の移動元・移動先（盤面のインデックス）。自分・相手を問わず、常に1手だけ。
 */
function lastMoveIndex() {
  const mark = lastMoveMark(lastMoveInfo);
  if (!mark) return null;
  const toIndex = (square) => {
    if (!square) return null;
    const { column, rank } = engineToSquare(square);
    return boardIndex(column, rank);
  };
  return { from: toIndex(mark.from), to: toIndex(mark.to), mine: mark.owner === mySide };
}

function render() {
  syncAttackToggles();
  // AIの手番中は利きの表示を消す
  const mode = phase === "thinking" ? "none" : attackMode();
  renderBoard(ui.board, position, {
    attacks: countAttacks(position),
    mode,
    mySide,
    selected: selectedIndex(),
    destinations: destinationIndexes(),
    lastMove: lastMoveIndex(),
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
    // 打つ手は動かした駒が盤上に無いので、持ち主は「その時点の手番」から決める。
    // ここが抜けていると owner が undefined になり、最後の手の表示（lastMoveMark）と
    // チェック項目の「相手が指定の駒を動かした」が、打ち手だけ働かなくなる。
    return {
      raw: move,
      from: null,
      to,
      isDrop: true,
      type: letter.toUpperCase(),
      owner: beforePosition.turn,
      promoted: false,
    };
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

/** 進行中の検討を打ち切る。エンジンは1つなので、着手の前に必ず止める。 */
function cancelAnalysis() {
  analysisToken += 1; // 進行中の検討結果を捨てる
  if (engine) engine.stop();
}

/** 指す前に条件を評価する。出す項目が無ければそのまま指す。 */
function requestMoveConfirmation(move) {
  // 検討（go depth）が走っていると bestmove の受け取りが混ざるので止める
  cancelAnalysis();
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
    const priorityLabel = { high: "高", normal: "中", low: "低" }[item.priority ?? "normal"] ?? "中";
    text.textContent = `${item.text}（${conditionLabel(item.condition)}／優先度 ${priorityLabel}）`;
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
  if (condition.piece) extras.push(`駒: ${pieceLabel(condition.piece)}`);
  if (condition.squares?.length) extras.push(`マス: ${condition.squares.join(" ")}`);
  if (condition.count !== undefined) extras.push(`持ち駒: ${condition.count}以下`);
  if (condition.ply !== undefined) extras.push(`手数: ${condition.ply}以上`);
  return extras.length ? `${base}（${extras.join(" / ")}）` : base;
}

function persistItems() {
  saveItems(checkItems);
}

const PIECE_LABELS = {
  pawn: "歩", lance: "香", knight: "桂", silver: "銀",
  gold: "金", bishop: "角", rook: "飛車", king: "玉",
};

/** 「rook,bishop」→「飛車と角」 */
function pieceLabel(spec) {
  return String(spec ?? "")
    .split(/[_,、\s]+/)
    .filter(Boolean)
    .map((name) => PIECE_LABELS[name] ?? name)
    .join("と");
}

// 条件ごとに、使う入力欄と説明。関係ない欄は隠して、何を入れればよいか分かるようにする。
const CONDITION_FIELDS = {
  always: { fields: [], hint: "いつも出します（指定は不要です）。" },
  opponentMoved: { fields: [], hint: "相手が何か動かしたときに出します（指定は不要です）。" },
  opponentMovedPiece: { fields: ["piece"], hint: "相手が動かした駒が「駒」に一致するときに出します。" },
  opponentMovedFrom: { fields: ["squares"], hint: "相手が動かした駒の移動元が「マス」のときに出します。" },
  opponentMovedTo: { fields: ["squares"], hint: "相手が動かした駒の移動先が「マス」のときに出します。" },
  opponentInCheck: { fields: [], hint: "自分が相手に王手をかけているときに出します（指定は不要です）。" },
  myKingThreatened: { fields: [], hint: "自分の玉が相手の利きに入っているときに出します（指定は不要です）。" },
  myPieceAt: { fields: ["piece", "squares"], hint: "自分の指定の駒が指定のマスにあるときに出します。「駒」と「マス」を指定します。" },
  handHasPiece: { fields: ["piece"], hint: "自分の指定の駒が持ち駒にあるときに出します。" },
  handCountAtMost: { fields: ["count"], hint: "自分の持ち駒の合計が「数」以下のときに出します。" },
  plyAtLeast: { fields: ["ply"], hint: "「手数」以上に進んでいるときに出します。" },
};

/** 条件に合わせて入力欄を出し分ける。 */
function updateConditionFields() {
  const found = CONDITION_FIELDS[ui.itemCondition.value];
  const fields = found ? found.fields : ["piece", "squares", "count", "ply"];
  for (const el of document.querySelectorAll("[data-field]")) {
    el.hidden = !fields.includes(el.dataset.field);
  }
  ui.itemHint.textContent = found ? found.hint : "";
}

ui.itemCondition.addEventListener("change", updateConditionFields);
// 登録の条件は起動時に並べられるので、パネルを開いた時点でも出し分けをやり直す
{
  const host = ui.itemCondition.closest("details");
  if (host) host.addEventListener("toggle", updateConditionFields);
}

// ---- 棋譜の読み込み（ファイル・クリップボード・貼り付け） ----

/** 読み込んだ棋譜のテキストを、ファイルと同じ道に流す。 */
function loadKifText(text, source) {
  const trimmed = String(text ?? "").trim();
  if (trimmed === "") {
    ui.kifStatus.textContent = `${source}に棋譜のテキストがありませんでした。`;
    return;
  }
  ui.kifStatus.textContent = `${source}から読み込んでいます…`;
  loadKif(trimmed);
}

/** クリップボードを直接読めないとき、貼り付け欄を出す。 */
function revealPaste(message) {
  if (ui.kifPasteWrap) {
    ui.kifPasteWrap.hidden = false;
    ui.kifPasteWrap.open = true;
  }
  ui.kifStatus.textContent = message;
}

if (ui.kifClipboard) {
  ui.kifClipboard.addEventListener("click", async () => {
    if (!navigator.clipboard || typeof navigator.clipboard.readText !== "function") {
      revealPaste("このブラウザではクリップボードを直接読めません。下の欄に貼り付けてください。");
      return;
    }
    try {
      const text = await navigator.clipboard.readText();
      loadKifText(text, "クリップボード");
    } catch (error) {
      revealPaste("クリップボードを読めませんでした。ブラウザの許可が必要です。下の欄に貼り付けてください。");
    }
  });
}

if (ui.kifPasteLoad) {
  ui.kifPasteLoad.addEventListener("click", () => {
    loadKifText(ui.kifPaste.value, "貼り付けた内容");
  });
}

// ---- 利きの表示の切り替え ----
//
// 自分の利きは自分の持ち駒の近く、相手の利きは相手の持ち駒の近くのチェックボックスで
// 切り替える。1回の操作で済むようにするため。

/** チェックボックスの状態から、表示モードを決める。 */
function attackMode() {
  const mine = Boolean(ui.showMine && ui.showMine.checked);
  const opp = Boolean(ui.showOpp && ui.showOpp.checked);
  if (mine && opp) return "both";
  if (mine) return "mine";
  if (opp) return "opp";
  return "none";
}

// 設定の読み込みなどで select の値が変わったとき、チェックボックス側へ反映する。
// 自分で触ったときは select の方を合わせるので、ここで上書きされることはない。
let lastModeValue = null;

function syncAttackToggles() {
  if (!ui.mode) return;
  if (ui.mode.value === lastModeValue) return;
  lastModeValue = ui.mode.value;
  if (ui.showMine) ui.showMine.checked = lastModeValue === "both" || lastModeValue === "mine";
  if (ui.showOpp) ui.showOpp.checked = lastModeValue === "both" || lastModeValue === "opp";
}

/** チェックボックスを触ったら、すぐ画面に反映し、設定にも書く。 */
function onAttackToggle() {
  if (ui.mode) {
    ui.mode.value = attackMode();
    lastModeValue = ui.mode.value;
    ui.mode.dispatchEvent(new Event("change"));
  }
  render();
}

if (ui.showMine) ui.showMine.addEventListener("change", onAttackToggle);
if (ui.showOpp) ui.showOpp.addEventListener("change", onAttackToggle);

function addItem() {
  const text = ui.itemText.value.trim();
  if (text === "") {
    setItemStatus("確認する内容を入力してください。");
    return;
  }
  const condition = { type: ui.itemCondition.value };
  if (ui.itemPiece.value.trim()) condition.piece = ui.itemPiece.value.trim();
  const rawSquares = ui.itemSquares.value.split(/[,\s、]+/).filter(Boolean);
  const squares = [];
  const badSquares = [];
  for (const entry of rawSquares) {
    const parsed = parseSquareInput(entry);
    if (parsed) squares.push(parsed);
    else badSquares.push(entry);
  }
  if (badSquares.length > 0) {
    setItemStatus(`マスの書き方が分かりません: ${badSquares.join("、")}（例: ７六 または c4）`);
    return;
  }
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
    maybeAnalyze();
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
    applyStrengthSettings();
    engine.setPositionSfen(boardToSfen(position));
    const bestmove = await searchBestMove();
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
    else maybeAnalyze();
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
  // 確認パネルを開いたまま戻すと、古い手を今の局面に対して指してしまう
  closeCheckPanel();
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

// ---- 強さの設定と検討モード ----

const ELO_MOVETIME_MS = 1000;
const STUDY_MULTI_PV = 5;

function setSettingsStatus(text) {
  ui.settingsStatus.textContent = text;
}

/** 画面の入力から設定を読む。 */
function readSettings() {
  return {
    mode: ui.modeElo.checked ? "elo" : "depth",
    depth: Number(ui.depth.value),
    skill: Number(ui.skill.value),
    elo: Number(ui.elo.value),
    threads: Number(ui.threads.value),
    hashMb: Number(ui.hashMb.value),
    multiPv: Number(ui.multiPv.value),
  };
}

/** 設定を画面に反映する。 */
function writeSettings() {
  ui.modeDepth.checked = settings.mode === "depth";
  ui.modeElo.checked = settings.mode === "elo";
  ui.depth.value = String(settings.depth);
  ui.skill.value = String(settings.skill);
  ui.elo.value = String(settings.elo);
  ui.threads.value = String(settings.threads);
  ui.hashMb.value = String(settings.hashMb);
  ui.multiPv.value = String(settings.multiPv);
  ui.playMode.value = studyMode ? "study" : "practice";
  ui.pvList.textContent = "";
  ui.analysisPanel.hidden = !studyMode;
  if (!studyMode) ui.analysisSummary.textContent = "";
}

/** エンジンに強さの設定を送る。深さ指定と Elo 指定は同時に有効にしない。 */
function applyStrengthSettings() {
  if (!engine || !settings) return;
  engine.setOption("Threads", settings.threads);
  engine.setOption("Hash", settings.hashMb);
  engine.setOption("MultiPV", studyMode ? STUDY_MULTI_PV : settings.multiPv);
  if (settings.mode === "elo") {
    engine.setOption("UCI_LimitStrength", "true");
    engine.setOption("UCI_Elo", settings.elo);
  } else {
    engine.setOption("UCI_LimitStrength", "false");
    engine.setOption("Skill Level", settings.skill);
  }
}

/** AI に指させる。深さ指定なら go depth、Elo 指定なら時間制限つき。 */
async function searchBestMove() {
  if (settings.mode === "elo") return engine.goMovetime(ELO_MOVETIME_MS);
  return engine.goDepth(settings.depth);
}

function formatScore(cp, sign) {
  const value = (cp * sign) / 100;
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}

function renderAnalysis(found, maxDepth) {
  const entries = [...found.values()].sort((a, b) => a.multipv - b.multipv).slice(0, STUDY_MULTI_PV);
  ui.pvList.textContent = "";

  if (entries.length === 0) {
    ui.analysisSummary.textContent = "候補手を取得できませんでした。";
    return;
  }

  // エンジンは手番側から見た値を返すので、先手から見た値に直して出す
  const sign = position.turn === "w" ? 1 : -1;
  ui.analysisSummary.textContent = `読みの深さ ${maxDepth}／評価値は先手から見た値`;

  for (const entry of entries) {
    const li = document.createElement("li");
    let score;
    if (entry.mate !== null && entry.mate !== undefined) {
      const mate = entry.mate * sign;
      score = mate > 0 ? `詰み${mate}手` : `詰まされる（${Math.abs(mate)}手）`;
    } else if (entry.cp === null) {
      score = "—";
    } else {
      score = formatScore(entry.cp, sign);
    }
    li.textContent = `${score}：${entry.pv.slice(0, 8).join(" ")}`;
    ui.pvList.appendChild(li);
  }
}

/** 検討モードのときだけ、今の局面を読ませて評価値と候補手を出す。 */
async function analyze() {
  if (!studyMode || !engine || !settings) return;
  const token = (analysisToken += 1);
  const found = new Map();
  let maxDepth = 0;

  const unsubscribe = engine.subscribe((line) => {
    if (!line.startsWith("info ")) return;
    const pvMatch = line.match(/\bpv (.+)$/);
    if (!pvMatch) return;
    const multipv = Number(line.match(/\bmultipv (\d+)/)?.[1] ?? 1);
    const depth = Number(line.match(/\bdepth (\d+)/)?.[1] ?? 0);
    const cpMatch = line.match(/\bscore cp (-?\d+)/);
    const mateMatch = line.match(/\bscore mate (-?\d+)/);
    maxDepth = Math.max(maxDepth, depth);
    found.set(multipv, {
      multipv,
      cp: cpMatch ? Number(cpMatch[1]) : null,
      mate: mateMatch ? Number(mateMatch[1]) : null,
      pv: pvMatch[1].trim().split(/\s+/),
    });
  });

  applyStrengthSettings();
  engine.setPositionSfen(boardToSfen(position));
  try {
    await engine.goDepth(settings.depth);
  } catch (error) {
    unsubscribe();
    ui.analysisSummary.textContent = `検討できませんでした: ${error.message}`;
    return;
  }
  unsubscribe();

  // 新しい検討が始まっていたら、古い結果は捨てる
  if (token !== analysisToken) return;
  renderAnalysis(found, maxDepth);
}

function maybeAnalyze() {
  if (studyMode && phase !== "thinking" && phase !== "idle") analyze();
}

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

const STUDY_MODE_KEY = "shogi-app.study-mode";

function loadStudyMode() {
  try {
    return localStorage.getItem(STUDY_MODE_KEY) === "1";
  } catch (error) {
    return false;
  }
}

function saveStudyMode() {
  try {
    localStorage.setItem(STUDY_MODE_KEY, studyMode ? "1" : "0");
  } catch (error) {
    // 保存できなくても続ける
  }
}

ui.settingsSave.addEventListener("click", () => {
  settings = readSettings();
  saveStrengthSettings(settings);
  studyMode = ui.playMode.value === "study";
  saveStudyMode();
  writeSettings();
  setSettingsStatus("設定を保存しました。");
  applyStrengthSettings();
  maybeAnalyze();
});

ui.playMode.addEventListener("change", () => {
  studyMode = ui.playMode.value === "study";
  saveStudyMode();
  writeSettings();
  setSettingsStatus(
    studyMode ? "検討モードにしました（評価値と候補手を出します）。" : "練習モードにしました（評価値は出しません）。",
  );
  maybeAnalyze();
});

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

  settings = loadStrengthSettings();
  studyMode = loadStudyMode();
  writeSettings();
  setSettingsStatus("");

  const guard = guardCrossOriginIsolation();
  if (!guard.ok) {
    phase = "over";
    setMessage(guard.message);
    render();
    return;
  }
  try {
    engine = await createEngine({ threads: settings.threads, hashMb: settings.hashMb });
  } catch (error) {
    phase = "over";
    setMessage(
      `${error.message} 直らないときは、public/engine/ に stockfish.js・stockfish.wasm・stockfish.worker.js の3つが揃っているかを確認してください。`,
    );
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
  get settings() { return settings; },
  get studyMode() { return studyMode; },
  get analysisSummary() { return ui.analysisSummary.textContent; },
  analyze,
  addItem,
  renderItemList,
};
