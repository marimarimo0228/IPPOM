// ホストの端末が部屋の状態を進めるための処理。
// どれも「今の部屋データ → 差分」を返すだけで、書き込みは呼び出し側が行う。

import {
  ANSWER_MS,
  JUDGE_MIN_MS,
  JUDGE_MS,
  ODAI_MS,
  REVEAL_LEAD_MS,
  SEAT_COUNT,
} from "./constants";
import {
  assignSeats,
  bestOf,
  gradeFor,
  joinOrder,
  pickOdai,
  randomNpcVote,
  revealSchedule,
  type Rng,
} from "./logic";
import { isNpcSeat } from "./npc";
import type { Room, RoomPatch } from "./types";

export interface HostCtx {
  /** 有効なお題のID */
  odaiIds: readonly string[];
  rng: Rng;
  /** デバッグ用：合計点をこの値に固定する */
  debugTotal?: number | null;
}

function isValidVote(v: unknown): v is 0 | 1 | 2 {
  return v === 0 || v === 1 || v === 2;
}

/** 新しいラウンド（お題の表示）を始める差分。 */
function roundPatch(
  room: Room,
  order: string[],
  turn: number,
  attempt: 1 | 2,
  now: number,
  ctx: HostCtx,
  used: Record<string, true> = room.usedOdai,
): RoomPatch {
  const answererId = order[turn];
  const odai = pickOdai(ctx.odaiIds, used, ctx.rng);
  const patch: RoomPatch = {
    state: "ODAI",
    order,
    turn,
    attempt,
    round: room.round + 1,
    odaiId: odai.id,
    answererId,
    answer: null,
    noAnswer: false,
    votes: null,
    total: null,
    revealAt: null,
    deadline: now + ODAI_MS,
    seats: assignSeats(room.players, answererId, ctx.rng),
  };
  if (odai.reset) patch.usedOdai = { [odai.id]: true };
  else patch[`usedOdai/${odai.id}`] = true;
  return patch;
}

/** LOBBY → ODAI。回答者の順番を入室順で確定し、成績を空にする。 */
export function startGame(room: Room, now: number, ctx: HostCtx): RoomPatch | null {
  if (room.state !== "LOBBY") return null;
  const order = joinOrder(room.players);
  if (order.length === 0) return null;
  return { ...roundPatch(room, order, 0, 1, now, ctx), scores: null };
}

/** RESULT で押すボタン。1回目なら2回目へ、2回目なら成績発表へ。 */
export function advanceFromResult(room: Room, now: number, ctx: HostCtx): RoomPatch | null {
  if (room.state !== "RESULT" || !room.answererId) return null;
  if (room.attempt === 1) return roundPatch(room, room.order, room.turn, 2, now, ctx);
  return gradePatch(room, now);
}

function gradePatch(room: Room, now: number): RoomPatch {
  const id = room.answererId as string;
  const best = bestOf(room.scores[id]);
  const patch: RoomPatch = { state: "GRADE", deadline: null, revealAt: now + REVEAL_LEAD_MS };
  if (best !== null) {
    patch[`scores/${id}/best`] = best;
    patch[`scores/${id}/grade`] = gradeFor(best);
  }
  return patch;
}

/** GRADE で押すボタン。次の回答者へ交代、最後の人なら FINISHED へ。 */
export function advanceFromGrade(room: Room, now: number, ctx: HostCtx): RoomPatch | null {
  if (room.state !== "GRADE") return null;
  const nextTurn = room.turn + 1;
  if (nextTurn >= room.order.length) {
    return { state: "FINISHED", deadline: null, revealAt: null };
  }
  return roundPatch(room, room.order, nextTurn, 1, now, ctx);
}

/** FINISHED → LOBBY。成績は次の開始まで残す。 */
export function backToLobby(room: Room): RoomPatch | null {
  if (room.state !== "FINISHED") return null;
  return {
    state: "LOBBY",
    odaiId: null,
    answererId: null,
    answer: null,
    noAnswer: false,
    votes: null,
    total: null,
    deadline: null,
    revealAt: null,
  };
}

/** JUDGING を締めて REVEAL へ進む差分。押していない人間は0点、票のないNPCは乱数。 */
function closeJudging(room: Room, now: number, ctx: HostCtx): RoomPatch {
  const patch: RoomPatch = {};
  let total = 0;
  for (let seat = 0; seat < SEAT_COUNT; seat++) {
    let vote = room.votes[String(seat)];
    if (!isValidVote(vote)) {
      vote = isNpcSeat(room.seats[seat]) ? randomNpcVote(ctx.rng) : 0;
      patch[`votes/${seat}`] = vote;
    }
    total += vote;
  }
  if (typeof ctx.debugTotal === "number") total = ctx.debugTotal;
  return { ...patch, ...revealPatch(total, now) };
}

function revealPatch(total: number, now: number): RoomPatch {
  const revealAt = now + REVEAL_LEAD_MS;
  return {
    state: "REVEAL",
    total,
    revealAt,
    deadline: revealAt + revealSchedule(total).endAt,
  };
}

/**
 * 時間や入力に応じて自動で進む部分。進めることがなければ null。
 * ホストの端末が短い間隔で呼び続ける。
 */
export function hostStep(room: Room, now: number, ctx: HostCtx): RoomPatch | null {
  const due = room.deadline !== null && now >= room.deadline;
  switch (room.state) {
    case "ODAI":
      return due ? { state: "ANSWERING", deadline: now + ANSWER_MS } : null;

    case "ANSWERING":
      if (room.answer !== null) return { state: "JUDGING", deadline: now + JUDGE_MS };
      // 時間切れ：審査は飛ばし、0点の演出を見せてから RESULT へ。
      if (due) return { noAnswer: true, votes: null, ...revealPatch(0, now) };
      return null;

    case "JUDGING": {
      if (due) return closeJudging(room, now, ctx);
      const allIn = Array.from({ length: SEAT_COUNT }, (_, s) => room.votes[String(s)]).every(
        isValidVote,
      );
      const minAt = (room.deadline ?? now) - JUDGE_MS + JUDGE_MIN_MS;
      return allIn && now >= minAt ? closeJudging(room, now, ctx) : null;
    }

    case "REVEAL": {
      if (!due || !room.answererId) return null;
      const key = room.attempt === 1 ? "first" : "second";
      return {
        state: "RESULT",
        deadline: null,
        [`scores/${room.answererId}/${key}`]: room.total ?? 0,
      };
    }

    default:
      return null;
  }
}

/** まだ票のないNPC席の番号。 */
export function pendingNpcSeats(room: Room): number[] {
  const seats: number[] = [];
  for (let seat = 0; seat < SEAT_COUNT; seat++) {
    if (isNpcSeat(room.seats[seat]) && !isValidVote(room.votes[String(seat)])) seats.push(seat);
  }
  return seats;
}
