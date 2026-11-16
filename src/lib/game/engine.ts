// ホストの端末が部屋の状態を進めるための処理。
// どれも「今の部屋データ → 差分」を返すだけで、書き込みは呼び出し側が行う。

import {
  ANSWERER_GRACE_MS,
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
import { isNpcSeat, NPC_PREFIX, NPCS } from "./npc";
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
    benched: null,
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
  return nextAnswererPatch(room, now, ctx);
}

function isOnline(room: Room, id: string | null | undefined): boolean {
  return !!id && room.players[id]?.online === true;
}

/** 次の回答者へ。切断している人は飛ばし、残っていなければ FINISHED。 */
function nextAnswererPatch(room: Room, now: number, ctx: HostCtx): RoomPatch {
  for (let turn = room.turn + 1; turn < room.order.length; turn++) {
    if (isOnline(room, room.order[turn])) return roundPatch(room, room.order, turn, 1, now, ctx);
  }
  return { state: "FINISHED", deadline: null, revealAt: null };
}

/**
 * 切断への対応。ホストの端末が hostStep より先に呼ぶ。
 * - 回答者が切断：そのラウンドを無効にして次へ（1回目なら成績なし、2回目なら1回目の点で成績発表）。
 * - 審査員が切断：その席をNPCに置き換える。再接続したら人間に戻す。
 */
export function presenceStep(room: Room, now: number, ctx: HostCtx): RoomPatch | null {
  if (room.state !== "ODAI" && room.state !== "ANSWERING" && room.state !== "JUDGING") return null;

  const answerer = room.answererId ? room.players[room.answererId] : undefined;
  if (!answerer?.online) {
    const goneFor = now - (answerer?.leftAt ?? 0);
    if (goneFor >= ANSWERER_GRACE_MS) {
      if (room.attempt === 2) {
        return { ...gradePatch(room, now), answer: null, votes: null, total: null };
      }
      return nextAnswererPatch(room, now, ctx);
    }
  }

  const patch: RoomPatch = {};
  const taken = new Set(room.seats);
  for (let seat = 0; seat < SEAT_COUNT; seat++) {
    const id = room.seats[seat];
    const hasVote = isValidVote(room.votes[String(seat)]);
    if (!id) continue;
    if (!isNpcSeat(id) && !isOnline(room, id)) {
      const npc = NPCS.map((n) => NPC_PREFIX + n.id).find((s) => !taken.has(s));
      if (!npc) continue;
      taken.add(npc);
      patch[`seats/${seat}`] = npc;
      patch[`benched/${seat}`] = id;
      // 審査の途中で置き換わった席は、その場で乱数採点する。
      if (room.state === "JUDGING" && !hasVote) patch[`votes/${seat}`] = randomNpcVote(ctx.rng);
    } else if (isNpcSeat(id) && isOnline(room, room.benched[String(seat)]) && !hasVote) {
      patch[`seats/${seat}`] = room.benched[String(seat)];
      patch[`benched/${seat}`] = null;
    }
  }

  // ラウンドの開始時に切断していて席がなかった人が、審査の前に戻ってきたらNPCと交代する。
  if (room.state !== "JUDGING") {
    const seated = new Set(
      Array.from({ length: SEAT_COUNT }, (_, seat) =>
        (patch[`seats/${seat}`] as string | undefined) ?? room.seats[seat],
      ),
    );
    const waiting = room.order.filter(
      (id) => id !== room.answererId && isOnline(room, id) && !seated.has(id),
    );
    for (let seat = SEAT_COUNT - 1; seat >= 0 && waiting.length > 0; seat--) {
      const untouched = patch[`seats/${seat}`] === undefined;
      if (untouched && isNpcSeat(room.seats[seat]) && !room.benched[String(seat)]) {
        patch[`seats/${seat}`] = waiting.shift();
      }
    }
  }
  return Object.keys(patch).length > 0 ? patch : null;
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
