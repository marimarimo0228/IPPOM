"use client";

import { NAME_MAX, PASSPHRASE_MAX, PASSPHRASE_MIN } from "../game/constants";
import { charLength, clampText } from "../game/logic";
import { LocalRoomStore, type RoomStore } from "./store";

const PLAYER_ID_KEY = "ippom.playerId";
const SESSION_KEY = "ippom.session";

let current: RoomStore | null = null;

/** 再接続で同じ席に戻るための、ブラウザに保存するプレイヤーID。 */
function getPlayerId(): string {
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
  const p = charLength(passphrase.trim());
  if (p < PASSPHRASE_MIN || p > PASSPHRASE_MAX) {
    return `部屋の合言葉は${PASSPHRASE_MIN}〜${PASSPHRASE_MAX}文字で入力してください。`;
  }
  return null;
}

/** 入室する。段階1では必ず自分だけの部屋を新しく作る。 */
export function enterRoom(name: string, passphrase: string): RoomStore {
  const cleanName = clampText(name, NAME_MAX);
  const cleanPass = passphrase.trim();
  current = new LocalRoomStore(getPlayerId(), cleanName, cleanPass);
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ name: cleanName, passphrase: cleanPass }));
  } catch {
    // 保存できなくても、このタブの中では遊べる。
  }
  return current;
}

/** /room を開いたとき：入室済みならその部屋、再読み込み後なら入り直す。 */
export function resumeRoom(): RoomStore | null {
  if (current && current.get()) return current;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const { name, passphrase } = JSON.parse(raw) as { name: string; passphrase: string };
    if (validateEntry(name, passphrase)) return null;
    return enterRoom(name, passphrase);
  } catch {
    return null;
  }
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
