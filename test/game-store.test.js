import test from "node:test";
import assert from "node:assert/strict";

import { createInitialPosition } from "../public/js/state.js";
import {
  GAME_KEY,
  GAME_VERSION,
  HISTORY_LIMIT,
  clearGame,
  hasProgress,
  loadGame,
  saveGame,
} from "../public/js/game-store.js";

/** localStorage の代わり。 */
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    key(index) {
      return [...map.keys()][index] ?? null;
    },
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
  };
}

/** 局面を少し進めた状態を作る（1手だけ動かす）。 */
function sampleState() {
  const position = createInitialPosition();
  const next = {
    ...position,
    board: position.board.slice(),
    hands: { w: { ...position.hands.w }, b: { ...position.hands.b } },
    turn: "b",
  };
  // ７七の歩を７六へ（盤の添字: (段-1)*9 + (9-筋)）
  const from = 6 * 9 + (9 - 7);
  const to = 5 * 9 + (9 - 7);
  next.board[to] = next.board[from];
  next.board[from] = null;
  const snapshot = { position, legalMoves: ["7g7f", "2g2f"], lastMoveInfo: null, plyCount: 0 };
  return {
    mySide: "w",
    plyCount: 1,
    position: next,
    legalMoves: ["3c3d", "8c8d"],
    lastMoveInfo: { from: "7g", to: "7f" },
    history: [snapshot],
    redoStack: [{ position: next, legalMoves: [], lastMoveInfo: null, plyCount: 1 }],
  };
}

test("保存して読み戻すと、同じ盤面・履歴・自分側が戻る", () => {
  const storage = fakeStorage();
  const state = sampleState();
  assert.equal(saveGame(storage, state), true);

  const game = loadGame(storage);
  assert.ok(game);
  assert.equal(game.mySide, "w");
  assert.equal(game.plyCount, 1);
  assert.equal(game.position.turn, "b");
  assert.deepEqual(game.legalMoves, ["3c3d", "8c8d"]);
  assert.deepEqual(game.lastMoveInfo, { from: "7g", to: "7f" });
  assert.equal(game.history.length, 1);
  assert.equal(game.redoStack.length, 1);
  // 局面そのものも同じ（駒の配置・持ち駒）
  assert.deepEqual(game.position.board, state.position.board);
  assert.deepEqual(game.position.hands, state.position.hands);
  assert.equal(hasProgress(game), true);
});

test("履歴が長いときは、新しいほうから上限までだけ保存する", () => {
  const storage = fakeStorage();
  const state = sampleState();
  const many = [];
  for (let index = 0; index < HISTORY_LIMIT + 10; index += 1) {
    many.push({ position: createInitialPosition(), legalMoves: [], lastMoveInfo: null, plyCount: index });
  }
  saveGame(storage, { ...state, history: many });
  const game = loadGame(storage);
  assert.equal(game.history.length, HISTORY_LIMIT);
  // 最後の1件は、いちばん新しいもの
  assert.equal(game.history[game.history.length - 1].plyCount, HISTORY_LIMIT + 9);
});

test("無い・壊れている・版が違う・盤がおかしいときは null", () => {
  assert.equal(loadGame(fakeStorage()), null);
  assert.equal(loadGame(fakeStorage({ [GAME_KEY]: "こわれた" })), null);
  assert.equal(loadGame(fakeStorage({ [GAME_KEY]: "null" })), null);
  const shortBoard = { ...sampleState().position, board: [null, null] };
  const bad = {
    version: GAME_VERSION,
    mySide: "w",
    position: shortBoard,
  };
  assert.equal(loadGame(fakeStorage({ [GAME_KEY]: JSON.stringify(bad) })), null);
  const oldVersion = { ...bad, version: GAME_VERSION + 1, position: sampleState().position };
  assert.equal(loadGame(fakeStorage({ [GAME_KEY]: JSON.stringify(oldVersion) })), null);
  const badSide = { version: GAME_VERSION, mySide: "x", position: sampleState().position };
  assert.equal(loadGame(fakeStorage({ [GAME_KEY]: JSON.stringify(badSide) })), null);
  // 壊れた履歴の1件は、黙って落として読む
  const withBadHistory = {
    version: GAME_VERSION,
    mySide: "w",
    position: sampleState().position,
    history: [{ position: { board: [null] } }, { position: sampleState().position, legalMoves: [] }],
  };
  const game = loadGame(fakeStorage({ [GAME_KEY]: JSON.stringify(withBadHistory) }));
  assert.equal(game.history.length, 1);
});

test("保存できない環境でも落ちない（容量オーバーなど）", () => {
  const storage = {
    getItem: () => null,
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
    removeItem: () => {},
  };
  assert.equal(saveGame(storage, sampleState()), false);
});

test("消せる", () => {
  const storage = fakeStorage();
  saveGame(storage, sampleState());
  assert.ok(loadGame(storage));
  assert.equal(clearGame(storage), true);
  assert.equal(loadGame(storage), null);
  assert.equal(hasProgress(null), false);
  // 進みが無いゲームでは、知らせない判定になる
  assert.equal(hasProgress({ plyCount: 0, history: [], redoStack: [] }), false);
});
