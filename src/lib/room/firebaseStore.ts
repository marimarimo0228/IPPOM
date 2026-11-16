"use client";

import {
  child,
  get,
  onDisconnect,
  onValue,
  ref,
  remove,
  runTransaction,
  serverTimestamp,
  set,
  update,
  type DatabaseReference,
} from "firebase/database";
import { ensureSignedIn, getDb } from "../firebase";
import {
  ANSWER_MAX,
  MAX_HUMANS,
  ROOM_EMPTY_TTL_MS,
  ROOM_MAX_AGE_MS,
} from "../game/constants";
import { clampText, normalizePassphrase, normalizeRoom } from "../game/logic";
import type { Player, Room, RoomPatch } from "../game/types";
import type { RoomStore } from "./store";

export type JoinFailureReason = "full" | "in-progress";

/** 入室できなかった理由つきのエラー。 */
export class JoinFailure extends Error {
  constructor(readonly reason: JoinFailureReason) {
    super(reason);
    this.name = "JoinFailure";
  }
}

/** 合言葉から部屋のIDを作る。合言葉そのものはDBのキーにしない（SHA-256 でハッシュ化）。 */
export async function roomIdFor(passphrase: string): Promise<string> {
  const bytes = new TextEncoder().encode(
    `ippom-room:${normalizePassphrase(passphrase)}`,
  );
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

/**
 * 部屋を消してよいか。作成から3時間、または最後の人が抜けてから10分。
 * サーバー側の常駐処理がないので、次に誰かが同じ合言葉で入ろうとしたときに判定する。
 */
function isExpired(
  raw: Record<string, unknown>,
  players: Record<string, Player>,
  now: number,
): boolean {
  const list = Object.values(players).filter(
    (p) => p && typeof p.name === "string",
  );
  if (list.length === 0) return true;
  const createdAt = typeof raw.createdAt === "number" ? raw.createdAt : 0;
  if (now - createdAt > ROOM_MAX_AGE_MS) return true;
  if (list.some((p) => p.online)) return false;
  const lastLeft = Math.max(...list.map((p) => p.leftAt ?? createdAt));
  return now - lastLeft > ROOM_EMPTY_TTL_MS;
}

/** Firebase Realtime Database 上の部屋。全端末が同じデータを見る。 */
export class FirebaseRoomStore implements RoomStore {
  private room: Room | null = null;
  private listeners = new Set<() => void>();
  private cleanups: Array<() => void> = [];
  private offset = 0;
  private left = false;

  private constructor(
    readonly playerId: string,
    readonly passphrase: string,
    private readonly roomRef: DatabaseReference,
    /** 参加者ではない（スクリーン表示） */
    readonly spectator: boolean,
  ) {}

  /** 合言葉の部屋に入る。なければ作ってホストになる。満員・進行中なら JoinFailure。 */
  static async join(
    name: string,
    passphrase: string,
  ): Promise<FirebaseRoomStore> {
    const uid = await ensureSignedIn();
    const db = getDb();
    const roomRef = ref(db, `rooms/${await roomIdFor(passphrase)}`);
    const store = new FirebaseRoomStore(uid, passphrase.trim(), roomRef, false);
    await store.syncClock();

    let raw = (await get(roomRef)).val() as Record<string, unknown> | null;
    const players = (raw?.players ?? {}) as Record<string, Player>;

    // 期限切れの部屋は、次に誰かが入ろうとしたこの時点で消して作り直す。
    if (raw && isExpired(raw, players, store.now())) {
      await remove(roomRef);
      raw = null;
    }
    const inLobby =
      !raw || raw.state === "LOBBY" || typeof raw.state !== "string";

    const alreadyIn = Boolean(raw && players[uid]);
    if (
      raw &&
      typeof raw.state === "string" &&
      raw.state !== "LOBBY" &&
      !alreadyIn
    ) {
      throw new JoinFailure("in-progress");
    }

    // 人数の確認と追加を同時に行い、同時に入った7人目を確実に断る。
    const now = store.now();
    const result = await runTransaction(
      child(roomRef, "players"),
      (current: Record<string, Player> | null) => {
        const list: Record<string, Player> = {};
        for (const [id, p] of Object.entries(current ?? {})) {
          // 名前のない壊れた行と、ロビーで切断したままの人は席を空ける。
          if (!p || typeof p.name !== "string") continue;
          if (inLobby && !p.online && id !== uid) continue;
          list[id] = p;
        }
        if (list[uid]) {
          // 再接続：同じ席に戻る。
          list[uid] = { name, joinedAt: list[uid].joinedAt, online: true };
          return list;
        }
        if (Object.keys(list).length >= MAX_HUMANS) return undefined;
        list[uid] = { name, joinedAt: now, online: true };
        return list;
      },
    );
    if (!result.committed) throw new JoinFailure("full");

    // ここから先で失敗しても「つながったままの行」が残らないようにする。
    const mine = child(roomRef, `players/${uid}`);
    try {
      await onDisconnect(mine).update({
        online: false,
        leftAt: serverTimestamp(),
      });

      // 最初に入った人がホストになる。
      // すでにホストがいる部屋では書き込みを試みない（ルールで拒否されるため）。
      const hostRef = child(roomRef, "hostId");
      if (typeof raw?.hostId !== "string") {
        await runTransaction(hostRef, (current: string | null) =>
          current === null ? uid : undefined,
        ).catch(() => {
          // 同時に入った別の人が先にホストになった
        });
      }
      const hostId = (await get(hostRef)).val() as string | null;
      if (hostId === uid && typeof raw?.state !== "string") {
        await update(roomRef, {
          state: "LOBBY",
          createdAt: now,
          round: 0,
          turn: 0,
          attempt: 1,
          noAnswer: false,
        });
      }

      store.trackPresence();
      await store.listen();
      return store;
    } catch (error) {
      store.left = true;
      store.cleanups.forEach((stop) => stop());
      await onDisconnect(mine)
        .cancel()
        .catch(() => {});
      await (
        alreadyIn
          ? update(mine, { online: false, leftAt: serverTimestamp() })
          : remove(mine)
      ).catch(() => {});
      throw error;
    }
  }

  /** 参加者に数えずに部屋を見るだけ（スクリーン表示用）。部屋がまだなくても待ち続ける。 */
  static async watch(passphrase: string): Promise<FirebaseRoomStore> {
    const uid = await ensureSignedIn();
    const roomRef = ref(getDb(), `rooms/${await roomIdFor(passphrase)}`);
    const store = new FirebaseRoomStore(uid, passphrase.trim(), roomRef, true);
    await store.syncClock();
    await store.listen();
    return store;
  }

  get = () => this.room;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** サーバーの時刻に合わせた現在時刻。端末の時計がずれていても締切と演出がそろう。 */
  now() {
    return Date.now() + this.offset;
  }

  private syncClock(): Promise<void> {
    return new Promise((resolve) => {
      const stop = onValue(ref(getDb(), ".info/serverTimeOffset"), (snap) => {
        this.offset = typeof snap.val() === "number" ? snap.val() : 0;
        resolve();
      });
      this.cleanups.push(stop);
    });
  }

  /** 部屋データの購読を始め、最初のデータが届くまで待つ。 */
  private listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      const stop = onValue(
        this.roomRef,
        (snap) => {
          this.room = normalizeRoom(snap.val());
          this.listeners.forEach((l) => l());
          resolve();
        },
        reject,
      );
      this.cleanups.push(stop);
    });
  }

  /** 在室管理：つながっている間は online、切れたらサーバー側で自動的に false になる。 */
  private trackPresence() {
    const mine = child(this.roomRef, `players/${this.playerId}`);
    const stop = onValue(ref(getDb(), ".info/connected"), (snap) => {
      if (snap.val() !== true || this.left) return;
      void onDisconnect(mine)
        .update({ online: false, leftAt: serverTimestamp() })
        .then(() => {
          // 退出後や、部屋から外れたあとに自分の行を作り直さない。
          if (!this.left && this.room?.players[this.playerId])
            return update(mine, { online: true, leftAt: null });
        });
    });
    this.cleanups.push(stop);
  }

  async submitAnswer(text: string) {
    const room = this.room;
    if (!room || room.state !== "ANSWERING") return;
    if (room.answererId !== this.playerId || room.answer !== null) return;
    const answer = clampText(text, ANSWER_MAX);
    if (answer.length === 0) return;
    await set(child(this.roomRef, "answer"), answer);
  }

  async castVote(seat: number, points: 0 | 1 | 2) {
    const room = this.room;
    if (!room || room.state !== "JUDGING") return;
    if (room.seats[seat] !== this.playerId) return;
    if (room.votes[String(seat)] !== undefined) return;
    await set(child(this.roomRef, `votes/${seat}`), points);
  }

  async hostPatch(patch: RoomPatch) {
    if (!this.room || this.room.hostId !== this.playerId) return;
    await update(this.roomRef, patch);
  }

  async claimHost(offlineHostId: string) {
    // ほかの人が先に引き継いでいたら何もしない。
    // サーバーで確定するまで手元のデータを書き換えない（確定前にホストとして書き込むと拒否されるため）。
    await runTransaction(
      child(this.roomRef, "hostId"),
      (current: string | null) =>
        current === null || current === offlineHostId
          ? this.playerId
          : undefined,
      { applyLocally: false },
    );
  }

  async leave() {
    this.left = true;
    this.cleanups.forEach((stop) => stop());
    this.cleanups = [];
    const room = this.room;
    this.room = null;
    if (this.spectator || !room) return;

    const mine = child(this.roomRef, `players/${this.playerId}`);
    await onDisconnect(mine).cancel();
    const others = Object.keys(room.players).filter(
      (id) => id !== this.playerId,
    );
    if (others.length === 0) {
      // 最後の1人が抜けたら、部屋のデータ（回答を含む）を残さない。
      await remove(this.roomRef);
    } else if (room.state === "LOBBY" || room.state === "FINISHED") {
      await remove(mine);
    } else {
      // 進行中は席と成績を残し、切断と同じ扱いにする。
      await update(mine, { online: false, leftAt: serverTimestamp() });
    }
  }
}
