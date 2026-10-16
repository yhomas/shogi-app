import test from "node:test";
import assert from "node:assert/strict";

import {
  SETTINGS_PREFIX,
  TRANSFER_APP,
  TRANSFER_VERSION,
  applyTransferText,
  checkTransferText,
  collectSettings,
  settingKeys,
  toTransferText,
  transferFileName,
} from "../public/js/transfer.js";

/** localStorage の代わり（Node には無いので、同じ形の入れ物を用意する）。 */
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

const SAMPLE = {
  [SETTINGS_PREFIX + "settings.v1"]: '{"mode":"depth","depth":12}',
  [SETTINGS_PREFIX + "checklist.v1"]: '[{"text":"王手を確認","condition":{"type":"always"},"enabled":true}]',
  [SETTINGS_PREFIX + "checklist.shown-groups.v1"]: '["序盤"]',
  [SETTINGS_PREFIX + "study-mode"]: "1",
  "other-app.value": "持って行かない",
};

test("設定の項目だけを、名前順に拾う", () => {
  const storage = fakeStorage(SAMPLE);
  assert.deepEqual(settingKeys(storage), [
    "shogi-app.checklist.shown-groups.v1",
    "shogi-app.checklist.v1",
    "shogi-app.settings.v1",
    "shogi-app.study-mode",
  ]);
  assert.deepEqual(settingKeys(fakeStorage({})), []);
});

test("書き出す中身に、アプリ名・版・日時と全部の設定が入る", () => {
  const storage = fakeStorage(SAMPLE);
  const now = new Date("2026-10-12T09:30:00+09:00");
  const data = collectSettings(storage, now);
  assert.equal(data.app, TRANSFER_APP);
  assert.equal(data.version, TRANSFER_VERSION);
  assert.equal(data.exportedAt, "2026-10-12T00:30:00.000Z");
  assert.equal(Object.keys(data.settings).length, 4);
  // 値は保存されている文字列のまま（形を変えない）
  assert.equal(data.settings["shogi-app.settings.v1"], SAMPLE["shogi-app.settings.v1"]);
  assert.equal(data.settings["other-app.value"], undefined);
});

test("書き出した文字は、そのまま読み込める JSON になる", () => {
  const storage = fakeStorage(SAMPLE);
  const text = toTransferText(storage, new Date("2026-10-12T09:30:00+09:00"));
  assert.ok(text.endsWith("\n"));
  const parsed = JSON.parse(text);
  assert.equal(parsed.app, TRANSFER_APP);
  assert.ok(checkTransferText(text).ok);
});

test("読み込めない中身は、理由を返して受け付けない", () => {
  assert.equal(checkTransferText("これはJSONではない").ok, false);
  assert.equal(checkTransferText("[]").ok, false);
  assert.equal(checkTransferText('{"app":"べつのアプリ","settings":{}}').ok, false);
  assert.equal(checkTransferText(`{"app":"${TRANSFER_APP}"}`).ok, false);
  assert.equal(checkTransferText(`{"app":"${TRANSFER_APP}","settings":{}}`).ok, false);
  // よそのアプリの項目しか無いときも読み込まない
  const other = `{"app":"${TRANSFER_APP}","settings":{"other-app.value":"1"}}`;
  assert.equal(checkTransferText(other).ok, false);
  assert.match(checkTransferText("{}").message, /このアプリの設定ではない/);
});

test("読み込むと、入っている項目だけ書く（無い項目は残す）", () => {
  const storage = fakeStorage({ "shogi-app.study-mode": "0" });
  const text = toTransferText(fakeStorage(SAMPLE));
  const result = applyTransferText(storage, text);
  assert.equal(result.ok, true);
  assert.equal(result.keys.length, 4);
  assert.equal(storage.getItem("shogi-app.study-mode"), "1");
  assert.equal(storage.getItem("shogi-app.settings.v1"), SAMPLE["shogi-app.settings.v1"]);
  // 元からあった項目は消さない
  storage.setItem("shogi-app.keepme", "x");
  applyTransferText(storage, `{"app":"${TRANSFER_APP}","settings":{"shogi-app.study-mode":"0"}}`);
  assert.equal(storage.getItem("shogi-app.keepme"), "x");
});

test("読み込めない中身では、何も書かない", () => {
  const storage = fakeStorage({ "shogi-app.study-mode": "0" });
  const result = applyTransferText(storage, "こわれた中身");
  assert.equal(result.ok, false);
  assert.equal(storage.getItem("shogi-app.study-mode"), "0");
});

test("ファイル名は日付入り", () => {
  assert.equal(
    transferFileName(new Date("2026-10-12T09:30:00+09:00")),
    "shogi-practice-settings-2026-10-12.json",
  );
  assert.equal(
    transferFileName(new Date("2026-01-05T09:30:00+09:00")),
    "shogi-practice-settings-2026-01-05.json",
  );
});
