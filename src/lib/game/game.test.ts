import { describe, expect, it } from "vitest";
import { ANSWER_MS, JUDGE_MIN_MS, JUDGE_MS, ODAI_MS } from "./constants";
import {
  advanceFromGrade,
  advanceFromResult,
  backToLobby,
  hostStep,
  startGame,
  type HostCtx,
} from "./engine";
import {
  applyPatch,
  assignSeats,
  bestOf,
  clampText,
  gradeFor,
  normalizePassphrase,
  normalizeRoom,
  pickOdai,
  randomNpcVote,
  revealSchedule,
} from "./logic";
import { isNpcSeat } from "./npc";
import type { Room } from "./types";

function seededRng(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function lobby(names: string[]): Room {
  const players: Room["players"] = {};
  names.forEach((name, i) => {
    players[`p${i + 1}`] = { name, joinedAt: 1000 + i, online: true };
  });
  return {
    state: "LOBBY",
    hostId: "p1",
    createdAt: 0,
    order: [],
    turn: 0,
    attempt: 1,
    round: 0,
    odaiId: null,
    answererId: null,
    answer: null,
    noAnswer: false,
    deadline: null,
    revealAt: null,
    total: null,
    players,
    seats: [],
    votes: {},
    scores: {},
    usedOdai: {},
  };
}

const ODAI_IDS = ["o1", "o2", "o3", "o4", "o5"];

/** 1ラウンドを最後（RESULT）まで進める。votes を渡すとその票で、null なら時間切れ。 */
function playRound(room: Room, ctx: HostCtx, now: number, votes: number[] | null) {
  let r = room;
  let t = now;
  const step = () => {
    const patch = hostStep(r, t, ctx);
    if (patch) r = applyPatch(r, patch);
    return patch;
  };
  t += ODAI_MS;
  step();
  expect(r.state).toBe("ANSWERING");
  if (votes) {
    r = applyPatch(r, { answer: "テスト回答" });
    step();
    expect(r.state).toBe("JUDGING");
    votes.forEach((v, seat) => {
      r = applyPatch(r, { [`votes/${seat}`]: v });
    });
    t += JUDGE_MIN_MS;
    step();
  } else {
    t += ANSWER_MS;
    step();
  }
  expect(r.state).toBe("REVEAL");
  t = r.deadline as number;
  step();
  expect(r.state).toBe("RESULT");
  return { room: r, now: t };
}

describe("成績", () => {
  it("点数から成績を決める", () => {
    expect([0, 5, 6, 7, 8, 9, 10].map(gradeFor)).toEqual(["F", "F", "C", "B", "A", "S", "S"]);
  });

  it("高い方の点数を使い、無効の回は数えない", () => {
    expect(bestOf({ first: 3, second: 8 })).toBe(8);
    expect(bestOf({ first: 7 })).toBe(7);
    expect(bestOf({})).toBeNull();
    expect(bestOf(undefined)).toBeNull();
  });
});

describe("枠の演出の時間割", () => {
  it("0点は段がなく、1.5秒後に終わる", () => {
    const s = revealSchedule(0);
    expect(s.tierTimes).toEqual([]);
    expect(s.endAt - s.finaleAt).toBe(1500);
  });

  it("5点は0.35秒間隔で溜めなし", () => {
    expect(revealSchedule(5).tierTimes).toEqual([0, 350, 700, 1050, 1400]);
  });

  it("6点以上は最後の1段の前で0.8秒止まる", () => {
    const t = revealSchedule(6).tierTimes;
    expect(t.slice(0, 5)).toEqual([0, 350, 700, 1050, 1400]);
    expect(t[5]).toBe(1750 + 800);
  });

  it("10点は10段で、2.5秒後に終わる", () => {
    const s = revealSchedule(10);
    expect(s.tierTimes).toHaveLength(10);
    expect(s.endAt - s.finaleAt).toBe(2500);
  });
});

describe("席・お題・NPC", () => {
  it("1人なら審査員5席はすべてNPC", () => {
    const seats = assignSeats(lobby(["A"]).players, "p1", seededRng());
    expect(seats).toHaveLength(5);
    expect(seats.every(isNpcSeat)).toBe(true);
    expect(new Set(seats).size).toBe(5);
  });

  it("3人なら回答者以外の2人が座り、残り3席がNPC", () => {
    const seats = assignSeats(lobby(["A", "B", "C"]).players, "p2", seededRng());
    expect(seats.slice(0, 2)).toEqual(["p1", "p3"]);
    expect(seats.slice(2).every(isNpcSeat)).toBe(true);
  });

  it("6人ならNPCはいない", () => {
    const seats = assignSeats(lobby(["A", "B", "C", "D", "E", "F"]).players, "p1", seededRng());
    expect(seats).toEqual(["p2", "p3", "p4", "p5", "p6"]);
  });

  it("お題は使い切るまで重複しない", () => {
    const rng = seededRng(7);
    const used: Record<string, true> = {};
    for (let i = 0; i < ODAI_IDS.length; i++) {
      const { id, reset } = pickOdai(ODAI_IDS, used, rng);
      expect(reset).toBe(false);
      expect(used[id]).toBeUndefined();
      used[id] = true;
    }
    expect(pickOdai(ODAI_IDS, used, rng).reset).toBe(true);
  });

  it("乱数採点は0〜2を重みどおりに返す", () => {
    expect(randomNpcVote(() => 0.1)).toBe(0);
    expect(randomNpcVote(() => 0.6)).toBe(1);
    expect(randomNpcVote(() => 0.9)).toBe(2);
  });

  it("文字数を切りそろえる", () => {
    expect(clampText("  あい\nう  ", 10)).toBe("あい う");
    expect(clampText("あ".repeat(50), 40)).toHaveLength(40);
  });
});

describe("進行", () => {
  it("1人で2ラウンド行い、高い方で成績が付いて終了する", () => {
    const ctx: HostCtx = { odaiIds: ODAI_IDS, rng: seededRng(3) };
    let room = lobby(["A"]);
    room = applyPatch(room, startGame(room, 0, ctx)!);
    expect(room.state).toBe("ODAI");
    expect(room.order).toEqual(["p1"]);
    expect(room.attempt).toBe(1);
    const firstOdai = room.odaiId;

    let played = playRound(room, ctx, 0, [1, 1, 1, 1, 1]);
    room = played.room;
    expect(room.scores.p1.first).toBe(5);

    room = applyPatch(room, advanceFromResult(room, played.now, ctx)!);
    expect(room.state).toBe("ODAI");
    expect(room.attempt).toBe(2);
    expect(room.odaiId).not.toBe(firstOdai);
    expect(room.votes).toEqual({});

    played = playRound(room, ctx, played.now, [2, 2, 2, 1, 1]);
    room = played.room;
    expect(room.scores.p1.second).toBe(8);

    room = applyPatch(room, advanceFromResult(room, played.now, ctx)!);
    expect(room.state).toBe("GRADE");
    expect(room.scores.p1).toMatchObject({ best: 8, grade: "A" });

    room = applyPatch(room, advanceFromGrade(room, played.now, ctx)!);
    expect(room.state).toBe("FINISHED");
    room = applyPatch(room, backToLobby(room)!);
    expect(room.state).toBe("LOBBY");
  });

  it("3人なら2ラウンドごとに入室順で交代する", () => {
    const ctx: HostCtx = { odaiIds: ODAI_IDS, rng: seededRng(5) };
    let room = lobby(["A", "B", "C"]);
    let now = 0;
    room = applyPatch(room, startGame(room, now, ctx)!);
    const answerers: string[] = [];
    while (room.state !== "FINISHED") {
      answerers.push(room.answererId as string);
      expect(room.seats).not.toContain(room.answererId);
      const played = playRound(room, ctx, now, [1, 0, 1, 0, 1]);
      room = played.room;
      now = played.now;
      room = applyPatch(room, advanceFromResult(room, now, ctx)!);
      if (room.state === "GRADE") room = applyPatch(room, advanceFromGrade(room, now, ctx)!);
    }
    expect(answerers).toEqual(["p1", "p1", "p2", "p2", "p3", "p3"]);
    expect(Object.keys(room.scores).sort()).toEqual(["p1", "p2", "p3"]);
  });

  it("時間切れは審査を飛ばして0点になる", () => {
    const ctx: HostCtx = { odaiIds: ODAI_IDS, rng: seededRng(9) };
    let room = lobby(["A"]);
    room = applyPatch(room, startGame(room, 0, ctx)!);
    const played = playRound(room, ctx, 0, null);
    expect(played.room.noAnswer).toBe(true);
    expect(played.room.total).toBe(0);
    expect(played.room.scores.p1.first).toBe(0);
  });

  it("全員の票がそろっても最短時間までは締めない", () => {
    const ctx: HostCtx = { odaiIds: ODAI_IDS, rng: seededRng(2) };
    let room = lobby(["A"]);
    room = applyPatch(room, startGame(room, 0, ctx)!);
    room = applyPatch(room, hostStep(room, ODAI_MS, ctx)!);
    room = applyPatch(room, { answer: "回答" });
    room = applyPatch(room, hostStep(room, ODAI_MS + 10, ctx)!);
    for (let s = 0; s < 5; s++) room = applyPatch(room, { [`votes/${s}`]: 2 });
    expect(hostStep(room, ODAI_MS + 20, ctx)).toBeNull();
    const closed = applyPatch(room, hostStep(room, ODAI_MS + 10 + JUDGE_MIN_MS, ctx)!);
    expect(closed.state).toBe("REVEAL");
    expect(closed.total).toBe(10);
  });

  it("締切までに票がなければ、NPC席は乱数で埋まる", () => {
    const ctx: HostCtx = { odaiIds: ODAI_IDS, rng: seededRng(4) };
    let room = lobby(["A"]);
    room = applyPatch(room, startGame(room, 0, ctx)!);
    room = applyPatch(room, hostStep(room, ODAI_MS, ctx)!);
    room = applyPatch(room, { answer: "回答" });
    room = applyPatch(room, hostStep(room, ODAI_MS, ctx)!);
    room = applyPatch(room, hostStep(room, ODAI_MS + JUDGE_MS, ctx)!);
    expect(room.state).toBe("REVEAL");
    expect(Object.keys(room.votes)).toHaveLength(5);
    const sum = Object.values(room.votes).reduce((a, b) => a + b, 0);
    expect(room.total).toBe(sum);
  });

  it("デバッグ用の指定で合計点を固定できる", () => {
    const ctx: HostCtx = { odaiIds: ODAI_IDS, rng: seededRng(6), debugTotal: 10 };
    let room = lobby(["A"]);
    room = applyPatch(room, startGame(room, 0, ctx)!);
    const played = playRound(room, ctx, 0, [0, 0, 0, 0, 0]);
    expect(played.room.total).toBe(10);
  });
});

describe("Firebase のデータの整形", () => {
  it("欠けた項目を補い、配列で返ってきた票も読める", () => {
    const room = normalizeRoom({
      state: "JUDGING",
      hostId: "p1",
      players: { p1: { name: "A", joinedAt: 1, online: true } },
      seats: { 0: "p2", 1: "npc:gera" },
      votes: [2, null, 1],
    });
    expect(room).not.toBeNull();
    expect(room!.seats).toEqual(["p2", "npc:gera"]);
    expect(room!.votes).toEqual({ "0": 2, "2": 1 });
    expect(room!.scores).toEqual({});
    expect(room!.answer).toBeNull();
    expect(room!.attempt).toBe(1);
  });

  it("state がまだないデータは部屋として扱わない", () => {
    expect(normalizeRoom({ players: {} })).toBeNull();
    expect(normalizeRoom(null)).toBeNull();
  });

  it("合言葉は全角・半角と前後の空白をならす", () => {
    expect(normalizePassphrase("  ＡＢＣ１２３ ")).toBe("ABC123");
  });
});
