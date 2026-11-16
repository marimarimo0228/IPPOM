"use client";

import { useEffect, useState, type FormEvent } from "react";
import Logo from "./Logo";
import { RoomScreen } from "./RoomClient";
import { firebaseEnabled } from "@/lib/firebase";
import { PASSPHRASE_MAX } from "@/lib/game/constants";
import { joinErrorMessage, validatePassphrase, watchRoom } from "@/lib/room/session";
import type { RoomStore } from "@/lib/room/store";
import { unlockSound } from "@/lib/sound";

const SCREEN_KEY = "ippom.screen";

/**
 * 発表用のスクリーン表示。部屋の合言葉を入れて接続するだけで、操作ボタンはない。
 * 参加者にも審査員にも数えない（6人の枠を使わない）。
 */
export default function ScreenClient() {
  const [passphrase, setPassphrase] = useState("");
  const [store, setStore] = useState<RoomStore | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const connect = async (value: string) => {
    setError(null);
    setBusy(true);
    try {
      const next = await watchRoom(value);
      try {
        sessionStorage.setItem(SCREEN_KEY, value);
      } catch {
        // 保存できなくても表示はできる
      }
      setStore(next);
    } catch (err) {
      setError(joinErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  // 再読み込みしたときは、同じ部屋につなぎ直す。
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = sessionStorage.getItem(SCREEN_KEY);
    } catch {
      saved = null;
    }
    if (!saved || !firebaseEnabled) return;
    let alive = true;
    watchRoom(saved)
      .then((next) => {
        if (alive) setStore(next);
        else void next.leave();
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (store) return <RoomScreen store={store} />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const problem = validatePassphrase(passphrase);
    if (problem) {
      setError(problem);
      return;
    }
    unlockSound();
    void connect(passphrase.trim());
  };

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-6 px-4 py-12">
      <Logo />
      <h1 className="text-xl font-black text-ippon">スクリーン表示</h1>
      {firebaseEnabled ? (
        <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm font-bold text-ippon">
            部屋の合言葉
            <input
              className="w-full border-2 border-white/30 bg-black px-3 py-3 text-lg font-bold text-white outline-none focus:border-ippon"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              maxLength={PASSPHRASE_MAX * 2}
              autoComplete="off"
              required
            />
          </label>
          {error && (
            <p role="alert" className="text-sm font-bold text-red-400">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="bg-ippon px-4 py-4 text-xl font-black text-ink disabled:opacity-50"
          >
            {busy ? "接続中…" : "接続する"}
          </button>
          <p className="text-xs leading-relaxed text-white/60">
            プロジェクターにつないだPCで開く画面です。参加人数には数えません。効果音はこの画面から鳴ります。
          </p>
        </form>
      ) : (
        <p className="text-center text-sm leading-relaxed text-white/70">
          スクリーン表示には Firebase の設定が必要です。README の手順で環境変数を設定してください。
        </p>
      )}
    </main>
  );
}
