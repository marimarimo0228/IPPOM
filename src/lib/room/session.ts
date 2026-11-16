"use client";

import { firebaseEnabled } from "../firebase";
import { NAME_MAX, PASSPHRASE_MAX, PASSPHRASE_MIN } from "../game/constants";
import { charLength, clampText } from "../game/logic";
import { FirebaseRoomStore, JoinFailure } from "./firebaseStore";
import { LocalRoomStore, type RoomStore } from "./store";

const PLAYER_ID_KEY = "ippom.playerId";
const SESSION_KEY = "ippom.session";

let current: RoomStore | null = null;

/** ローカル部屋用のプレイヤーID。Firebase 版では匿名認証のユーザーIDを使う。 */
function getLocalPlayerId(): string {
  try {
    const saved = localStorage.getItem(PLAYER_ID_KEY);
    if (saved) return saved;
    const id = crypto.randomUUID();
    localStorage.setItem(PLAYER_ID_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export function validateEntry(name: string, passphrase: string): string | null {
  const n = charLength(name.trim());
  if (n === 0) return "表示名を入力してください。";
  if (n > NAME_MAX) return `表示名は${NAME_MAX}文字までです。`;
  return validatePassphrase(passphrase);
}

export function validatePassphrase(passphrase: string): string | null {
  const p = charLength(passphrase.trim());
  if (p < PASSPHRASE_MIN || p > PASSPHRASE_MAX) {
    return `部屋の合言葉は${PASSPHRASE_MIN}〜${PASSPHRASE_MAX}文字で入力してください。`;
  }
  return null;
}

/** 入室できなかったときに画面へ出す文。 */
export function joinErrorMessage(error: unknown): string {
  if (error instanceof JoinFailure) {
    return error.reason === "full"
      ? "満員です。"
      : "ゲームの進行中は入れません。ロビーに戻るまでお待ちください。";
  }
  return "部屋に接続できませんでした。通信状況を確認して、もう一度お試しください。";
}

/**
 * 入室する。Firebase の設定があれば合言葉の部屋に参加（なければ作成）し、
 * 設定がなければこのブラウザだけの部屋を作る。
 */
export async function enterRoom(name: string, passphrase: string): Promise<RoomStore> {
  const cleanName = clampText(name, NAME_MAX);
  const cleanPass = passphrase.trim();
  await current?.leave().catch(() => {});
  current = firebaseEnabled
    ? await FirebaseRoomStore.join(cleanName, cleanPass)
    : new LocalRoomStore(getLocalPlayerId(), cleanName, cleanPass);
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ name: cleanName, passphrase: cleanPass }));
  } catch {
    // 保存できなくても、このタブの中では遊べる。
  }
  return current;
}

/** /room を開いたとき：入室済みならその部屋、再読み込み後なら同じ名前と合言葉で入り直す。 */
export function resumeRoom(): Promise<RoomStore | null> {
  // 同時に2回呼ばれても、入室は1回だけにする。
  pendingResume ??= resumeOnce().finally(() => {
    pendingResume = null;
  });
  return pendingResume;
}

let pendingResume: Promise<RoomStore | null> | null = null;

async function resumeOnce(): Promise<RoomStore | null> {
  if (current && current.get()) return current;
  let saved: { name: string; passphrase: string };
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    saved = JSON.parse(raw);
  } catch {
    return null;
  }
  if (validateEntry(saved.name, saved.passphrase)) return null;
  return enterRoom(saved.name, saved.passphrase);
}

/** スクリーン表示用：参加者に数えずに部屋を見る。 */
export async function watchRoom(passphrase: string): Promise<RoomStore> {
  return FirebaseRoomStore.watch(passphrase.trim());
}

export async function leaveRoom(): Promise<void> {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // 無視してよい
  }
  const store = current;
  current = null;
  await store?.leave();
}
