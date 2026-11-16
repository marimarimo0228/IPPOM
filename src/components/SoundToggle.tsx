"use client";

import { useEffect, useSyncExternalStore } from "react";
import { isMuted, setMuted, subscribeMuted, unlockSound } from "@/lib/sound";

/** 常に右上に出すミュート切替。最初のタップで音を有効にする役目も持つ。 */
export default function SoundToggle() {
  const muted = useSyncExternalStore(subscribeMuted, isMuted, () => false);

  useEffect(() => {
    const unlock = () => unlockSound();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  return (
    <button
      type="button"
      onClick={() => {
        unlockSound();
        setMuted(!muted);
      }}
      aria-pressed={muted}
      aria-label={muted ? "音を出す" : "音を消す"}
      className="fixed right-3 top-3 z-50 rounded-full border border-ippon/60 bg-black/80 px-3 py-1.5 text-xs font-bold text-ippon"
    >
      {muted ? "🔇 音なし" : "🔊 音あり"}
    </button>
  );
}
