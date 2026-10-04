// 盤面に印を付ける「最新の手」を選ぶ。
//
// 自分・相手を問わず、常に最後に指された1手だけを返す（相手が指せば自分の印は消える）。
// 盤面や履歴そのものは知らず、手の情報（moveInfoFrom が作る形）だけを見る。

/** 手の情報として使えるか（持ち主がいて、少なくとも移動先か移動元がある）。 */
function usable(info) {
  if (!info || typeof info !== "object") return false;
  if (info.owner !== "w" && info.owner !== "b") return false;
  return typeof info.to === "string" && info.to !== "";
}

/**
 * 最新の手を、印を付けるための形にして返す。
 *
 * @param {object|null} info 最新の手の情報（lastMoveInfo）
 * @returns {{from: string|null, to: string, owner: "w"|"b"}|null} 手が無ければ null
 */
export function lastMoveMark(info) {
  if (!usable(info)) return null;
  return {
    from: typeof info.from === "string" && info.from !== "" ? info.from : null,
    to: info.to,
    owner: info.owner,
  };
}
