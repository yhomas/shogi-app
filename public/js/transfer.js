// 設定を他の端末へ持ち出す（書き出し・読み込み）。
//
// `localStorage` の `shogi-app.` で始まる項目を、まとめて1つの JSON にする。
// 項目名を1つずつ並べずに接頭辞で拾うので、あとから設定が増えても持ち出し漏れが出ない。
//
// storage は引数で受け取る（`localStorage` を直接見ると Node からテストできないため）。

export const SETTINGS_PREFIX = "shogi-app.";
export const TRANSFER_APP = "shogi-practice-app";
export const TRANSFER_VERSION = 1;

/**
 * 保存されている設定の項目名（接頭辞の付いたもの全部）。
 * @param {Storage|{length: number, key: (i: number) => string|null}} storage
 * @returns {string[]}
 */
export function settingKeys(storage) {
  const keys = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (typeof key === "string" && key.startsWith(SETTINGS_PREFIX)) keys.push(key);
  }
  return keys.sort();
}

/**
 * 書き出す中身を作る。値は保存されている文字列のまま入れる（形を変えないので、そのまま戻せる）。
 * @param {Storage} storage
 * @param {Date} [now]
 */
export function collectSettings(storage, now = new Date()) {
  const settings = {};
  for (const key of settingKeys(storage)) settings[key] = storage.getItem(key);
  return {
    app: TRANSFER_APP,
    version: TRANSFER_VERSION,
    exportedAt: now.toISOString(),
    settings,
  };
}

/** 書き出す文字（読みやすいよう、字下げして並べる）。 */
export function toTransferText(storage, now = new Date()) {
  return `${JSON.stringify(collectSettings(storage, now), null, 2)}\n`;
}

/**
 * 読み込める中身かどうか調べる。
 * @param {string} text
 * @returns {{ok: true, entries: [string, string][]} | {ok: false, message: string}}
 */
export function checkTransferText(text) {
  let data;
  try {
    data = JSON.parse(String(text ?? ""));
  } catch (error) {
    return { ok: false, message: "読み込めませんでした（中身が設定の形になっていません）。" };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, message: "読み込めませんでした（中身が設定の形になっていません）。" };
  }
  if (data.app !== TRANSFER_APP) {
    return { ok: false, message: "このアプリの設定ではないようです。" };
  }
  if (!data.settings || typeof data.settings !== "object" || Array.isArray(data.settings)) {
    return { ok: false, message: "設定の中身が入っていません。" };
  }
  const entries = Object.entries(data.settings).filter(
    ([key, value]) => key.startsWith(SETTINGS_PREFIX) && typeof value === "string",
  );
  if (entries.length === 0) {
    return { ok: false, message: "読み込める設定が入っていませんでした。" };
  }
  return { ok: true, entries };
}

/**
 * 読み込んで storage に書く。入っている項目だけ書く（無い項目は今のまま残す）。
 * @param {Storage} storage
 * @param {string} text
 * @returns {{ok: true, keys: string[]} | {ok: false, message: string}}
 */
export function applyTransferText(storage, text) {
  const checked = checkTransferText(text);
  if (!checked.ok) return checked;
  for (const [key, value] of checked.entries) storage.setItem(key, value);
  return { ok: true, keys: checked.entries.map(([key]) => key) };
}

/** 書き出すファイルの名前。例: shogi-practice-settings-2026-10-12.json */
export function transferFileName(now = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `shogi-practice-settings-${stamp}.json`;
}
