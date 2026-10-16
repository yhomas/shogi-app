// 盤面の状態を保存して、次に開いたときに復元する。
//
// 接頭辞を設定（`shogi-app.*`）と分けてある（`shogi-game.*`）。設定の持ち出し・読み込み
// では運ばない＝持ち出すのは「設定」だけ、盤面はその端末の続きを戻すためのもの。
//
// storage は引数で受け取る（`localStorage` を直接見ると Node からテストできないため）。

export const GAME_KEY = "shogi-game.v1";
export const GAME_VERSION = 1;

/** 保存する履歴の上限（長い対局でも storage を圧迫しないように、古いほうから落とす）。 */
export const HISTORY_LIMIT = 60;

/** 盤面として使える形かどうか。 */
function isValidPosition(position) {
  if (!position || typeof position !== "object") return false;
  if (!Array.isArray(position.board) || position.board.length !== 81) return false;
  if (!position.hands || typeof position.hands !== "object") return false;
  return position.turn === "w" || position.turn === "b";
}

/** 履歴の1件（局面と、その局面で使うもの）として使える形かどうか。 */
function isValidSnapshot(entry) {
  return Boolean(entry) && typeof entry === "object" && isValidPosition(entry.position);
}

function validSnapshots(list) {
  return (Array.isArray(list) ? list : []).filter(isValidSnapshot);
}

/** 盤面の状態として使える中身かどうか。 */
export function isValidGame(data) {
  if (!data || typeof data !== "object") return false;
  if (data.version !== GAME_VERSION) return false;
  if (!isValidPosition(data.position)) return false;
  if (data.mySide !== "w" && data.mySide !== "b") return false;
  if (data.legalMoves !== undefined && !Array.isArray(data.legalMoves)) return false;
  return true;
}

/**
 * 盤面の状態を保存する。保存できたら true。
 * 容量を超えるなどで保存できなくても、対局は続けられる（false を返すだけ）。
 */
export function saveGame(storage, state, now = new Date()) {
  const history = validSnapshots(state?.history).slice(-HISTORY_LIMIT);
  const redoStack = validSnapshots(state?.redoStack).slice(-HISTORY_LIMIT);
  const data = {
    version: GAME_VERSION,
    savedAt: now.toISOString(),
    mySide: state?.mySide === "b" ? "b" : "w",
    plyCount: Number(state?.plyCount) || 0,
    position: state?.position,
    legalMoves: Array.isArray(state?.legalMoves) ? state.legalMoves : [],
    lastMoveInfo: state?.lastMoveInfo ?? null,
    history,
    redoStack,
  };
  try {
    storage.setItem(GAME_KEY, JSON.stringify(data));
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * 保存されている盤面の状態を読む。無い・壊れている・版が違うときは null（新しい対局になる）。
 */
export function loadGame(storage) {
  let data;
  try {
    const raw = storage.getItem(GAME_KEY);
    if (!raw) return null;
    data = JSON.parse(raw);
  } catch (error) {
    return null;
  }
  if (!isValidGame(data)) return null;
  return {
    mySide: data.mySide,
    plyCount: Number(data.plyCount) || 0,
    position: data.position,
    legalMoves: Array.isArray(data.legalMoves) ? data.legalMoves : [],
    lastMoveInfo: data.lastMoveInfo ?? null,
    history: validSnapshots(data.history).slice(-HISTORY_LIMIT),
    redoStack: validSnapshots(data.redoStack).slice(-HISTORY_LIMIT),
    savedAt: typeof data.savedAt === "string" ? data.savedAt : null,
  };
}

/** 保存を消す（新しい対局を始めるときなどに使う）。 */
export function clearGame(storage) {
  try {
    storage.removeItem(GAME_KEY);
    return true;
  } catch (error) {
    return false;
  }
}

/** 続きがあるかどうか（復元したことを知らせるかどうかの判断に使う）。 */
export function hasProgress(game) {
  if (!game) return false;
  return game.plyCount > 0 || game.history.length > 0 || game.redoStack.length > 0;
}
