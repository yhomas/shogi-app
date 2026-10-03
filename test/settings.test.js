import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultStrengthSettings,
  loadStrengthSettings,
  saveStrengthSettings,
} from "../public/js/settings.js";

test("既定は深さ指定・深さ10", () => {
  const s = defaultStrengthSettings({ hardwareConcurrency: 8, deviceMemory: 8 });
  assert.equal(s.mode, "depth");
  assert.equal(s.depth, 10);
  assert.equal(s.multiPv, 1);
});

test("スレッド数は端末に合わせて 1..8 に収まる", () => {
  assert.equal(defaultStrengthSettings({ hardwareConcurrency: 2 }).threads, 2);
  assert.equal(defaultStrengthSettings({ hardwareConcurrency: 16 }).threads, 8);
  assert.equal(defaultStrengthSettings({}).threads, 1);
  assert.equal(defaultStrengthSettings({ hardwareConcurrency: 0 }).threads, 1);
});

test("Hash は端末のメモリに応じて 16..256MB に収まる", () => {
  assert.equal(defaultStrengthSettings({ deviceMemory: 1 }).hashMb, 16);
  assert.equal(defaultStrengthSettings({ deviceMemory: 8 }).hashMb, 64);
  assert.equal(defaultStrengthSettings({ deviceMemory: 64 }).hashMb, 256);
  assert.equal(defaultStrengthSettings({}).hashMb, 64);
});

test("Elo 指定のときの既定値", () => {
  const s = defaultStrengthSettings({ hardwareConcurrency: 4 });
  assert.equal(s.elo, 1350);
  assert.equal(s.skill, 20);
});

test("壊れた保存値でも既定値に戻る", () => {
  // Node にも navigator があるので、端末情報は明示的に空で渡す
  const broken = { getItem: () => "{壊れたJSON", setItem() {} };
  assert.deepEqual(loadStrengthSettings(broken, {}), defaultStrengthSettings({}));
  const missing = { getItem: () => null, setItem() {} };
  assert.deepEqual(loadStrengthSettings(missing, {}), defaultStrengthSettings({}));
});

test("保存して読み戻せる（範囲外の値は丸める）", () => {
  let store = null;
  const s = { getItem: () => store, setItem: (_k, v) => { store = v; } };
  const settings = { mode: "elo", depth: 999, skill: 20, elo: 1500, threads: 999, hashMb: 99999, multiPv: 1 };
  saveStrengthSettings(settings, s);
  const loaded = loadStrengthSettings(s);
  assert.equal(loaded.mode, "elo");
  assert.equal(loaded.depth, 40);        // 上限
  assert.equal(loaded.threads, 8);       // 上限
  assert.equal(loaded.hashMb, 256);      // 上限
});

test("知らない mode は深さ指定として扱う", () => {
  let store = null;
  const s = { getItem: () => store, setItem: (_k, v) => { store = v; } };
  saveStrengthSettings({ mode: "なにか", depth: 5, threads: 2, hashMb: 32, multiPv: 1, skill: 20, elo: 1500 }, s);
  assert.equal(loadStrengthSettings(s).mode, "depth");
});
