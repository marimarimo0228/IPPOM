"use client";

import { HOST_GRACE_MS } from "../game/constants";
import { hostStep, pendingNpcSeats, presenceStep, type HostCtx } from "../game/engine";
import { joinOrder, randomNpcVote } from "../game/logic";
import type { Room, RoomPatch } from "../game/types";
import type { RoomStore } from "./store";

/** NPC席の採点。席番号 → 点 を返す。段階4で /api/judge を呼ぶ実装に差し替える。 */
export type NpcJudge = (room: Room, seats: number[]) => Promise<Record<number, 0 | 1 | 2>>;

/** 乱数で採点するNPC。少し考えているような間を置く。 */
export const randomJudge: NpcJudge = async (_room, seats) => {
  await new Promise((resolve) => setTimeout(resolve, 600 + Math.random() * 900));
  const votes: Record<number, 0 | 1 | 2> = {};
  for (const seat of seats) votes[seat] = randomNpcVote(Math.random);
  return votes;
};

const TICK_MS = 100;

/**
 * ホストの端末で動かす進行役。自分がホストのときだけ、
 * 締切の経過や回答・票の到着を見て状態を進める。
 */
export function runHost(store: RoomStore, ctx: HostCtx, judge: NpcJudge): () => void {
  let busy = false;
  let judgedRound = -1;
  let stopped = false;
  let hostGoneSince: number | null = null;

  /** ホストが切断したままなら、入室順で最初の人が引き継ぐ。 */
  const watchHost = (room: Room) => {
    if (room.players[room.hostId]?.online) {
      hostGoneSince = null;
      return;
    }
    hostGoneSince ??= store.now();
    if (store.now() - hostGoneSince < HOST_GRACE_MS) return;
    if (joinOrder(room.players)[0] !== store.playerId) return;
    hostGoneSince = null;
    void store.claimHost(room.hostId).catch(() => {});
  };

  const tick = async () => {
    if (busy || stopped) return;
    const room = store.get();
    if (!room) return;
    if (room.hostId !== store.playerId) {
      watchHost(room);
      return;
    }

    if (room.state === "JUDGING" && judgedRound !== room.round) {
      judgedRound = room.round;
      void requestNpcVotes(room);
    }

    const now = store.now();
    const patch = presenceStep(room, now, ctx) ?? hostStep(room, now, ctx);
    if (!patch) return;
    busy = true;
    try {
      await store.hostPatch(patch);
    } catch {
      // 書き込みが通らなかったときは、次の周回で最新の状態からやり直す。
    } finally {
      busy = false;
    }
  };

  const requestNpcVotes = async (room: Room) => {
    const seats = pendingNpcSeats(room);
    if (seats.length === 0) return;
    let votes: Record<number, 0 | 1 | 2>;
    try {
      votes = await judge(room, seats);
    } catch {
      return; // 締切時に乱数で埋まる
    }
    const latest = store.get();
    if (stopped || !latest || latest.round !== room.round || latest.state !== "JUDGING") return;
    const patch: RoomPatch = {};
    for (const seat of pendingNpcSeats(latest)) {
      if (votes[seat] !== undefined) patch[`votes/${seat}`] = votes[seat];
    }
    if (Object.keys(patch).length > 0) await store.hostPatch(patch).catch(() => {});
  };

  const timer = setInterval(tick, TICK_MS);
  const unsubscribe = store.subscribe(() => void tick());
  void tick();

  return () => {
    stopped = true;
    clearInterval(timer);
    unsubscribe();
  };
}

/** デバッグ用：/room?total=7 のように合計点を固定する。開発時か NEXT_PUBLIC_DEBUG=1 のときだけ有効。 */
export function readDebugTotal(): number | null {
  const enabled =
    process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DEBUG === "1";
  if (!enabled || typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("total");
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return value >= 0 && value <= 10 ? value : null;
}
