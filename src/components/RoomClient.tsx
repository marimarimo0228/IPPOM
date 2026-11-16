"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import GameView from "./GameView";
import GradeStage from "./GradeStage";
import Logo from "./Logo";
import { gradeLabel, odaiIds } from "@/lib/content";
import { MAX_HUMANS, ROUNDS_PER_ANSWERER, SEAT_COUNT } from "@/lib/game/constants";
import {
  advanceFromGrade,
  advanceFromResult,
  backToLobby,
  startGame,
  type HostCtx,
} from "@/lib/game/engine";
import { joinOrder } from "@/lib/game/logic";
import type { Room, RoomPatch } from "@/lib/game/types";
import { randomJudge, readDebugTotal, runHost } from "@/lib/room/host";
import { leaveRoom, resumeRoom } from "@/lib/room/session";
import type { RoomStore } from "@/lib/room/store";
import { useClock } from "@/lib/useClock";

const primaryButton =
  "w-full bg-ippon px-4 py-4 text-xl font-black text-ink active:translate-y-0.5 disabled:opacity-40";
const subButton = "w-full border-2 border-white/30 px-4 py-3 text-sm font-bold text-white/80";

export default function RoomClient() {
  const router = useRouter();
  const [store] = useState(resumeRoom);

  useEffect(() => {
    if (!store) router.replace("/");
  }, [store, router]);

  return store ? <RoomScreen store={store} /> : null;
}

function RoomScreen({ store }: { store: RoomStore }) {
  const router = useRouter();
  const room = useSyncExternalStore(store.subscribe, store.get, () => null);
  const now = useClock(store, 50);
  const [ctx] = useState<HostCtx>(() => ({
    odaiIds,
    rng: Math.random,
    debugTotal: readDebugTotal(),
  }));

  // 自分がホストのあいだだけ、状態を進める役を引き受ける。
  useEffect(() => runHost(store, ctx, randomJudge), [store, ctx]);

  if (!room) return null;

  const isHost = room.hostId === store.playerId;
  const act = (make: (room: Room, now: number, ctx: HostCtx) => RoomPatch | null) => {
    const latest = store.get();
    if (!latest) return;
    const patch = make(latest, store.now(), ctx);
    if (patch) void store.hostPatch(patch);
  };
  const leave = async () => {
    await leaveRoom();
    router.push("/");
  };

  const answererName = room.answererId ? (room.players[room.answererId]?.name ?? "？") : "";
  const isLastAnswerer = room.turn + 1 >= room.order.length;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-3 pb-8 pt-3">
      <header className="flex items-center gap-3 pr-24">
        <Logo size="sm" />
        {typeof ctx.debugTotal === "number" && (
          <span className="border border-red-400 px-2 py-0.5 text-[11px] font-bold text-red-300">
            デバッグ：合計点を{ctx.debugTotal}に固定中
          </span>
        )}
      </header>

      {room.state === "LOBBY" && (
        <Lobby
          room={room}
          store={store}
          isHost={isHost}
          onStart={() => act(startGame)}
          onLeave={leave}
        />
      )}

      {(room.state === "ODAI" ||
        room.state === "ANSWERING" ||
        room.state === "JUDGING" ||
        room.state === "REVEAL" ||
        room.state === "RESULT") && (
        <GameView key={room.round} store={store} room={room} now={now}>
          {room.state === "RESULT" &&
            (isHost ? (
              <button className={primaryButton} onClick={() => act(advanceFromResult)}>
                {room.attempt < ROUNDS_PER_ANSWERER ? "2回目へ" : "成績発表へ"}
              </button>
            ) : (
              <WaitingForHost />
            ))}
        </GameView>
      )}

      {room.state === "GRADE" && room.answererId && (
        <section className="flex flex-1 flex-col justify-center gap-8 py-6">
          <GradeStage
            key={room.answererId}
            name={answererName}
            score={room.scores[room.answererId]}
            elapsed={now - (room.revealAt ?? now)}
          />
          <div className="mx-auto w-full max-w-sm">
            {isHost ? (
              <button className={primaryButton} onClick={() => act(advanceFromGrade)}>
                {isLastAnswerer ? "全員の成績を見る" : "次の回答者へ"}
              </button>
            ) : (
              <WaitingForHost />
            )}
          </div>
        </section>
      )}

      {room.state === "FINISHED" && (
        <section className="mx-auto flex w-full max-w-xl flex-col gap-5 py-6">
          <h2 className="text-center text-2xl font-black text-ippon">成績一覧</h2>
          <table className="w-full border-collapse text-center">
            <thead>
              <tr className="border-b-2 border-ippon text-sm text-ippon">
                <th className="py-2 text-left">回答者</th>
                <th>1回目</th>
                <th>2回目</th>
                <th>成績</th>
              </tr>
            </thead>
            <tbody>
              {room.order.map((id) => {
                const s = room.scores[id];
                return (
                  <tr key={id} className="border-b border-white/15 text-lg font-bold">
                    <td className="py-3 text-left">{room.players[id]?.name ?? "？"}</td>
                    <td>{s?.first ?? "—"}</td>
                    <td>{s?.second ?? "—"}</td>
                    <td className="text-2xl font-black text-ippon">
                      {s?.grade ? gradeLabel(s.grade) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {isHost ? (
            <button className={primaryButton} onClick={() => act(backToLobby)}>
              ロビーへ戻る
            </button>
          ) : (
            <WaitingForHost />
          )}
          <button className={subButton} onClick={leave}>
            退出する
          </button>
        </section>
      )}
    </main>
  );
}

function WaitingForHost() {
  return <p className="py-3 text-center text-sm text-white/60">ホストの操作を待っています…</p>;
}

function Lobby({
  room,
  store,
  isHost,
  onStart,
  onLeave,
}: {
  room: Room;
  store: RoomStore;
  isHost: boolean;
  onStart: () => void;
  onLeave: () => void;
}) {
  const order = joinOrder(room.players);
  const judges = order.slice(1, 1 + SEAT_COUNT);
  const needed = order.length * ROUNDS_PER_ANSWERER;

  return (
    <section className="mx-auto flex w-full max-w-xl flex-col gap-5 py-4">
      <div className="border-2 border-ippon p-4 text-center">
        <p className="text-xs font-bold text-ippon">部屋の合言葉</p>
        <p className="break-all text-2xl font-black">{store.passphrase}</p>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-black text-ippon">
          参加者（{order.length}／{MAX_HUMANS}人）
        </h2>
        <ul className="flex flex-col gap-1">
          {order.map((id, i) => (
            <li key={id} className="flex items-center gap-2 bg-panel px-3 py-2 font-bold">
              <span className="text-white/50">{i + 1}</span>
              <span className="flex-1">{room.players[id].name}</span>
              {id === store.playerId && <span className="text-xs text-white/50">あなた</span>}
              {id === room.hostId && (
                <span className="bg-ippon px-1.5 text-xs font-black text-ink">ホスト</span>
              )}
              {i === 0 && <span className="text-xs text-ippon">最初の回答者</span>}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-black text-ippon">審査員席（最初のラウンド）</h2>
        <ul className="grid grid-cols-5 gap-1.5">
          {Array.from({ length: SEAT_COUNT }, (_, seat) => {
            const id = judges[seat];
            return (
              <li
                key={seat}
                className="flex flex-col items-center gap-1 bg-panel px-1 py-3 text-center text-xs font-bold"
              >
                <span className="text-2xl">{id ? "🙂" : "🤖"}</span>
                <span className="break-all">{id ? room.players[id].name : "NPC"}</span>
              </li>
            );
          })}
        </ul>
        <p className="mt-1 text-xs text-white/50">人間が座らない席は NPC（🤖）が埋めます。</p>
      </div>

      {isHost && needed > odaiIds.length && (
        <p role="alert" className="border border-red-400 p-3 text-sm font-bold text-red-300">
          お題が足りません（必要 {needed} 件、登録 {odaiIds.length} 件）。途中から同じお題が出ます。
        </p>
      )}

      {isHost ? (
        <button className={primaryButton} onClick={onStart}>
          開始
        </button>
      ) : (
        <WaitingForHost />
      )}
      <button className={subButton} onClick={onLeave}>
        退出する
      </button>
    </section>
  );
}
