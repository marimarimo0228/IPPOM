"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { NAME_MAX, PASSPHRASE_MAX, PASSPHRASE_MIN } from "@/lib/game/constants";
import { enterRoom, joinErrorMessage, validateEntry } from "@/lib/room/session";
import { unlockSound } from "@/lib/sound";

export default function JoinForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = validateEntry(name, passphrase);
    if (problem) {
      setError(problem);
      return;
    }
    unlockSound();
    setError(null);
    setBusy(true);
    try {
      await enterRoom(name, passphrase);
    } catch (err) {
      // 満員、進行中、通信エラーなど
      setError(joinErrorMessage(err));
      setBusy(false);
      return;
    }
    // デバッグ用の ?total=7 などは、そのまま部屋の画面へ引き継ぐ。
    router.push(`/room${window.location.search}`);
  };

  const inputClass =
    "w-full border-2 border-white/30 bg-black px-3 py-3 text-lg font-bold text-white outline-none focus:border-ippon";

  return (
    <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm font-bold text-ippon">
        表示名（{NAME_MAX}文字まで）
        <input
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={NAME_MAX * 2}
          autoComplete="nickname"
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-bold text-ippon">
        部屋の合言葉（{PASSPHRASE_MIN}〜{PASSPHRASE_MAX}文字）
        <input
          className={inputClass}
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
        className="bg-ippon px-4 py-4 text-xl font-black text-ink active:translate-y-0.5 disabled:opacity-50"
      >
        {busy ? "接続中…" : "入室する"}
      </button>
    </form>
  );
}
