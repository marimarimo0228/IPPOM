import {
  AFTER_IPPON_MS,
  AFTER_SCORE_MS,
  FINALE_GAP_IPPON_MS,
  FINALE_GAP_MS,
  NPC_RANDOM_WEIGHTS,
  SEAT_COUNT,
  TAME_FROM,
  TAME_MS,
  TIER_INTERVAL_MS,
} from "./constants";
import { NPCS, NPC_PREFIX } from "./npc";
import type { GradeKey, Player, Room, RoomPatch, Score } from "./types";

export type Rng = () => number;

/** 点数（0〜10）から成績を決める。9〜10 秀、8 優、7 良、6 可、0〜5 不可。 */
export function gradeFor(points: number): GradeKey {
  if (points >= 9) return "S";
  if (points === 8) return "A";
  if (points === 7) return "B";
  if (points === 6) return "C";
  return "F";
}

/** 2回のうち高い方。無効になった回（undefined）は数えない。両方なければ null。 */
export function bestOf(score: Score | undefined): number | null {
  const values = [score?.first, score?.second].filter(
    (v): v is number => typeof v === "number",
  );
  return values.length === 0 ? null : Math.max(...values);
}

/** 入室順（同時刻ならID順）に並べた、オンラインのプレイヤーID。 */
export function joinOrder(players: Record<string, Player>): string[] {
  return Object.entries(players)
    .filter(([, p]) => p.online)
    .sort(([aId, a], [bId, b]) => a.joinedAt - b.joinedAt || aId.localeCompare(bId))
    .map(([id]) => id);
}

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** 審査員5席を決める。回答者以外の人間が先に座り、残りをNPCが埋める。 */
export function assignSeats(
  players: Record<string, Player>,
  answererId: string,
  rng: Rng,
): string[] {
  const humans = joinOrder(players)
    .filter((id) => id !== answererId)
    .slice(0, SEAT_COUNT);
  const npcs = shuffle(NPCS, rng).map((n) => NPC_PREFIX + n.id);
  return [...humans, ...npcs].slice(0, SEAT_COUNT);
}

/** まだ出していないお題から1つ選ぶ。使い切っていたら全体から選び直す（reset = true）。 */
export function pickOdai(
  odaiIds: readonly string[],
  used: Record<string, true>,
  rng: Rng,
): { id: string; reset: boolean } {
  if (odaiIds.length === 0) throw new Error("有効なお題がありません");
  const fresh = odaiIds.filter((id) => !used[id]);
  const pool = fresh.length > 0 ? fresh : odaiIds;
  return { id: pool[Math.floor(rng() * pool.length)], reset: fresh.length === 0 };
}

/** NPCの乱数採点（0点50%、1点30%、2点20%）。 */
export function randomNpcVote(rng: Rng): 0 | 1 | 2 {
  const r = rng();
  if (r < NPC_RANDOM_WEIGHTS[0]) return 0;
  if (r < NPC_RANDOM_WEIGHTS[0] + NPC_RANDOM_WEIGHTS[1]) return 1;
  return 2;
}

export interface RevealSchedule {
  /** 各段が点灯する時刻（演出開始からのミリ秒）。長さ = 合計点 */
  tierTimes: number[];
  /** 点数表示、または IPPOM 演出が始まる時刻 */
  finaleAt: number;
  /** RESULT へ進む時刻 */
  endAt: number;
}

/**
 * 枠の演出の時間割。0.35秒間隔で1段ずつ、6点以上は最後の1段の前で0.8秒止める。
 * 全端末が同じ合計点と開始時刻からこれを計算するので、タイミングがそろう。
 */
export function revealSchedule(total: number): RevealSchedule {
  const tierTimes: number[] = [];
  for (let i = 0; i < total; i++) {
    const isLast = i === total - 1;
    tierTimes.push(i * TIER_INTERVAL_MS + (isLast && total >= TAME_FROM ? TAME_MS : 0));
  }
  const lastAt = tierTimes.length > 0 ? tierTimes[tierTimes.length - 1] : 0;
  const ippon = total >= 10;
  const finaleAt = lastAt + (ippon ? FINALE_GAP_IPPON_MS : FINALE_GAP_MS);
  return { tierTimes, finaleAt, endAt: finaleAt + (ippon ? AFTER_IPPON_MS : AFTER_SCORE_MS) };
}

/** 文字数を数える（絵文字なども1文字として数える）。 */
export function charLength(text: string): number {
  return Array.from(text).length;
}

/** 前後の空白と改行を落とし、最大文字数で切る。 */
export function clampText(text: string, max: number): string {
  return Array.from(text.replace(/\s+/g, " ").trim()).slice(0, max).join("");
}

/** 差分を当てた新しい部屋データを返す（元のデータは変えない）。 */
export function applyPatch(room: Room, patch: RoomPatch): Room {
  const next = structuredClone(room) as unknown as Record<string, unknown>;
  for (const [path, value] of Object.entries(patch)) {
    const keys = path.split("/");
    let node = next;
    for (const key of keys.slice(0, -1)) {
      if (typeof node[key] !== "object" || node[key] === null) node[key] = {};
      node = node[key] as Record<string, unknown>;
    }
    const last = keys[keys.length - 1];
    if (value === null && keys.length > 1) delete node[last];
    else node[last] = structuredClone(value);
  }
  const fixed = next as unknown as Room;
  // Firebase は空のオブジェクトや null を保持しないので、読む側が困らない形にそろえる。
  fixed.votes ??= {};
  fixed.scores ??= {};
  fixed.usedOdai ??= {};
  fixed.players ??= {};
  fixed.seats ??= [];
  fixed.order ??= [];
  return fixed;
}
