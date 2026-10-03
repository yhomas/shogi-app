// エンジンの強さの設定と、端末ごとの差の吸収。
//
// `navigator` は直接見ない。hardwareConcurrency / deviceMemory は引数で受け取る。
// そうしないと Node からテストできないため。
//
// 端末差の扱い（仕様 4.1・リスク表）:
//   - スレッド数は 1〜8。コア数が多い端末でも上げすぎない（発熱と取り合いを避ける）。
//   - 置換表（Hash）は端末のメモリに応じて 16〜256MB。deviceMemory が取れない端末もあるので
//     取れないときは 64MB。上限を 256MB に抑えているのは、確保に失敗して起動できない事故を避けるため。

const STORAGE_KEY = "shogi-app.settings.v1";

const LIMITS = {
  depth: { min: 1, max: 30, fallback: 10 },
  skill: { min: 0, max: 20, fallback: 20 },
  elo: { min: 1320, max: 2850, fallback: 1500 },
  threads: { min: 1, max: 8, fallback: 1 },
  hashMb: { min: 16, max: 256, fallback: 64 },
  multiPv: { min: 1, max: 500, fallback: 1 },
};

const DEFAULT_HASH_MB = 64;
const HASH_PER_DEVICE_GB = 8;

function clamp(value, { min, max, fallback }) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

/**
 * 端末に合わせた既定の強さ設定。
 * @param {{hardwareConcurrency?: number, deviceMemory?: number}} [nav]
 */
export function defaultStrengthSettings(nav = {}) {
  const cores = clamp(nav.hardwareConcurrency, { min: 1, max: 8, fallback: 1 });
  const memoryGb = Number(nav.deviceMemory);
  const hashMb = Number.isFinite(memoryGb) && memoryGb > 0
    ? clamp(memoryGb * HASH_PER_DEVICE_GB, LIMITS.hashMb)
    : DEFAULT_HASH_MB;

  return {
    mode: "depth",
    depth: LIMITS.depth.fallback,
    skill: LIMITS.skill.fallback,
    elo: LIMITS.elo.fallback,
    threads: cores,
    hashMb,
    multiPv: LIMITS.multiPv.fallback,
  };
}

/** 読み込んだ値を、扱える範囲に収める。 */
function normalize(raw, fallback) {
  const settings = raw && typeof raw === "object" ? raw : {};
  return {
    mode: settings.mode === "elo" ? "elo" : "depth",
    depth: clamp(settings.depth, LIMITS.depth) || fallback.depth,
    skill: clamp(settings.skill ?? fallback.skill, LIMITS.skill),
    elo: clamp(settings.elo ?? fallback.elo, LIMITS.elo),
    threads: clamp(settings.threads ?? fallback.threads, LIMITS.threads),
    hashMb: clamp(settings.hashMb ?? fallback.hashMb, LIMITS.hashMb),
    multiPv: clamp(settings.multiPv ?? fallback.multiPv, LIMITS.multiPv),
  };
}

/**
 * 保存された設定を読む。壊れていても例外を投げず、端末に合わせた既定値に戻す。
 * @param {{getItem: Function}} [storage]
 * @param {object} [nav]
 */
export function loadStrengthSettings(storage = globalThis.localStorage, nav = globalThis.navigator ?? {}) {
  const fallback = defaultStrengthSettings(nav);
  if (!storage || typeof storage.getItem !== "function") return fallback;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    return normalize(JSON.parse(raw), fallback);
  } catch (error) {
    return fallback;
  }
}

/** 設定を保存する。保存できなくても例外を投げない。 */
export function saveStrengthSettings(settings, storage = globalThis.localStorage) {
  if (!storage || typeof storage.setItem !== "function") return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(normalize(settings, defaultStrengthSettings({}))));
  } catch (error) {
    // 容量超過など。保存できなくても対局は続けられる。
  }
}

export { LIMITS };
