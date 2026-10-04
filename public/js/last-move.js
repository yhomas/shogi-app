// 直近の手を「自分の手」と「相手の手」に振り分ける。
//
// 盤面や履歴そのものは知らず、手の情報（moveInfoFrom が作る形）だけを見る。
// 表示側は、ここで選ばれた手の移動元・移動先のマスに印を付ける。

/** 手の情報として使えるか（持ち主がいて、少なくとも移動先か移動元がある）。 */
function usable(info) {
  if (!info || typeof info !== "object") return false;
  if (info.owner !== "w" && info.owner !== "b") return false;
  return typeof info.to === "string" && info.to !== "";
}

/**
 * 直近の手から、自分と相手の1手ずつを選ぶ。
 *
 * current は今の局面に至った手、previous はその前の手。
 * 片方しか無ければ片方だけ、同じ側の手が2つ来た場合は新しい方を採る。
 *
 * @param {{current?: object|null, previous?: object|null, mySide: "w"|"b"}} param
 * @returns {{mine: object|null, opp: object|null}}
 */
export function lastMoveMarks({ current = null, previous = null, mySide }) {
  const marks = { mine: null, opp: null };
  for (const info of [current, previous]) {
    if (!usable(info)) continue;
    const key = info.owner === mySide ? "mine" : "opp";
    if (!marks[key]) marks[key] = info;
  }
  return marks;
}
