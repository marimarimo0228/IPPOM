import { ANSWER_MAX } from "../game/constants";
import { applyPatch, clampText } from "../game/logic";
import type { Room, RoomPatch } from "../game/types";

/**
 * 部屋の共有データへの窓口。画面とホスト進行はこのインターフェースだけを使う。
 * 段階1はメモリ内（LocalRoomStore）、段階2で Firebase 版に差し替える。
 */
export interface RoomStore {
  readonly playerId: string;
  /** 表示用の部屋の合言葉 */
  readonly passphrase: string;
  /** 最新の部屋データ。変更がない限り同じ参照を返す */
  get(): Room | null;
  subscribe(listener: () => void): () => void;
  /** 全端末で共通の現在時刻（ミリ秒） */
  now(): number;
  /** 回答者：回答を送信する（1回だけ） */
  submitAnswer(text: string): Promise<void>;
  /** 審査員：自分の席の票を入れる（変更不可） */
  castVote(seat: number, points: 0 | 1 | 2): Promise<void>;
  /** ホスト：状態を進める差分を書き込む */
  hostPatch(patch: RoomPatch): Promise<void>;
  leave(): Promise<void>;
}

/** 1台のブラウザの中だけで完結する部屋。 */
export class LocalRoomStore implements RoomStore {
  private room: Room | null;
  private listeners = new Set<() => void>();

  constructor(
    readonly playerId: string,
    name: string,
    readonly passphrase: string,
  ) {
    const now = Date.now();
    this.room = {
      state: "LOBBY",
      hostId: playerId,
      createdAt: now,
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
      players: { [playerId]: { name, joinedAt: now, online: true } },
      seats: [],
      votes: {},
      scores: {},
      usedOdai: {},
    };
  }

  get = () => this.room;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  now() {
    return Date.now();
  }

  private write(patch: RoomPatch) {
    if (!this.room) return;
    this.room = applyPatch(this.room, patch);
    this.listeners.forEach((l) => l());
  }

  async submitAnswer(text: string) {
    const room = this.room;
    if (!room || room.state !== "ANSWERING") return;
    if (room.answererId !== this.playerId || room.answer !== null) return;
    const answer = clampText(text, ANSWER_MAX);
    if (answer.length === 0) return;
    this.write({ answer });
  }

  async castVote(seat: number, points: 0 | 1 | 2) {
    const room = this.room;
    if (!room || room.state !== "JUDGING") return;
    if (room.seats[seat] !== this.playerId) return;
    if (room.votes[String(seat)] !== undefined) return;
    this.write({ [`votes/${seat}`]: points });
  }

  async hostPatch(patch: RoomPatch) {
    if (!this.room || this.room.hostId !== this.playerId) return;
    this.write(patch);
  }

  async leave() {
    // 最後の1人が抜けるので、部屋ごと消す。
    this.room = null;
    this.listeners.forEach((l) => l());
  }
}
