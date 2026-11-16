"use client";

import { useEffect, useState } from "react";
import type { RoomStore } from "./room/store";

/** 部屋の共通時刻を一定間隔で読み直す。残り時間と演出の進み具合の計算に使う。 */
export function useClock(store: RoomStore, intervalMs: number): number {
  const [now, setNow] = useState(() => store.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(store.now()), intervalMs);
    return () => clearInterval(timer);
  }, [store, intervalMs]);
  return now;
}
