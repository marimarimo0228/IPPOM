"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import AnswerCard, { type Finale } from "./AnswerCard";
import Confetti from "./Confetti";
import { findOdai, gradeLabel, site } from "@/lib/content";
import { ANSWER_MAX, ANSWER_MS, JUDGE_MS, SEAT_COUNT } from "@/lib/game/constants";
import { charLength, gradeFor, revealSchedule } from "@/lib/game/logic";
import { isNpcSeat, npcOfSeat } from "@/lib/game/npc";
import type { Odai, Room } from "@/lib/game/types";
import type { RoomStore } from "@/lib/room/store";
import { playSound } from "@/lib/sound";

interface Props {
  store: RoomStore;
  room: Room;
  now: number;
  /** RESULT のときに出すホストのボタンなど */
  children?: ReactNode;
}

/** お題の表示から結果まで（ODAI / ANSWERING / JUDGING / REVEAL / RESULT）。 */
export default function GameView({ store, room, now, children }: Props) {
  const odai = findOdai(room.odaiId);
  const me = store.playerId;
  const isAnswerer = room.answererId === me;
  const mySeat = room.seats.indexOf(me);
  const answererName = room.answererId ? (room.players[room.answererId]?.name ?? "？") : "";
  const showing = room.state === "REVEAL" || room.state === "RESULT";

  // 枠の演出：全端末が同じ開始時刻と合計点から、今どこまで点灯しているかを計算する。
  const total = room.total ?? 0;
  const schedule = revealSchedule(total);
  const elapsed = room.state === "RESULT" ? Infinity : now - (room.revealAt ?? now);
  const lit = showing ? schedule.tierTimes.filter((t) => elapsed >= t).length : 0;
  const finaleOn = showing && elapsed >= schedule.finaleAt;
  const isIppon = total >= 10;
  const finale: Finale = !finaleOn
    ? null
    : isIppon
      ? { kind: "ippon" }
      : { kind: "score", total, gradeLabel: gradeLabel(gradeFor(total)) };

  const remaining =
    room.deadline !== null && (room.state === "ANSWERING" || room.state === "JUDGING")
      ? Math.max(0, room.deadline - now)
      : null;

  let cardText: ReactNode;
  if (room.state === "ODAI") {
    cardText = <span className="font-black text-ippon" style={{ fontSize: "14cqh" }}>お題</span>;
  } else if (room.state === "ANSWERING") {
    cardText = (
      <span className="font-black text-white/50" style={{ fontSize: "10cqh" }}>
        {isAnswerer ? "あなたの番です" : site.thinkingText}
      </span>
    );
  } else if (room.noAnswer) {
    cardText = (
      <span className="font-black text-white/40" style={{ fontSize: "13cqh" }}>
        {site.noAnswerText}
      </span>
    );
  } else {
    cardText = (
      <span className="break-all font-black leading-tight" style={{ fontSize: "11cqh" }}>
        {room.answer}
      </span>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <p className="text-center text-sm font-bold text-white/80">
        回答者 <span className="text-lg font-black text-ippon">{answererName}</span>
        <span className="ml-2 bg-ippon px-2 py-0.5 text-xs font-black text-ink">
          {room.attempt}回目
        </span>
      </p>

      {odai && <OdaiPanel odai={odai} />}

      {remaining !== null && (
        <Timer remaining={remaining} full={room.state === "ANSWERING" ? ANSWER_MS : JUDGE_MS} />
      )}

      {/* 回答者の入力欄は、スクロールせずに届くようカードより上に置く */}
      {room.state === "ANSWERING" && isAnswerer && <AnswerForm store={store} />}

      {/* 画面の高さに収まるよう、カードの幅を高さからも制限する */}
      <div className="mx-auto w-full" style={{ maxWidth: "min(48rem, 80dvh)" }}>
        <AnswerCard lit={lit} finale={finale}>
          {cardText}
        </AnswerCard>
      </div>

      {showing && <RevealSound lit={lit} finaleOn={finaleOn} isIppon={isIppon} />}
      {room.state === "REVEAL" && finaleOn && isIppon && (
        <>
          <div className="flash" aria-hidden />
          <Confetti />
        </>
      )}

      {/* 枠や点数で回答が隠れるので、カードの下にも出しておく */}
      {showing && (
        <p className="text-center text-sm text-white/60">
          {room.noAnswer ? site.noAnswerText : `「${room.answer}」`}
        </p>
      )}

      {room.state === "JUDGING" && mySeat >= 0 && (
        <VoteButtons store={store} seat={mySeat} chosen={room.votes[String(mySeat)]} />
      )}
      {room.state === "JUDGING" && mySeat < 0 && (
        <p className="py-2 text-center text-sm font-bold text-white/70">審査中…</p>
      )}

      {room.state === "RESULT" && (
        <div className="mx-auto flex w-full max-w-xl flex-col gap-3">
          <p className="text-center text-2xl font-black">
            {room.attempt}回目：<span className="text-4xl text-ippon">{total}</span> 点
            <span className="ml-3 text-ippon">{gradeLabel(gradeFor(total))}</span>
          </p>
          <Seats room={room} showVotes />
          {children}
        </div>
      )}

      {room.state !== "RESULT" && (
        <div className="mx-auto w-full max-w-xl">
          <Seats room={room} showVotes={false} />
        </div>
      )}
    </section>
  );
}

/** 枠が1段点くたびの音と、最後の音。途中から見始めた端末では過去の分を鳴らさない。 */
function RevealSound({
  lit,
  finaleOn,
  isIppon,
}: {
  lit: number;
  finaleOn: boolean;
  isIppon: boolean;
}) {
  const last = useRef({ lit, finaleOn });
  useEffect(() => {
    if (lit > last.current.lit) playSound("tick", lit);
    if (finaleOn && !last.current.finaleOn) playSound(isIppon ? "ippon" : "oshii");
    last.current = { lit, finaleOn };
  }, [lit, finaleOn, isIppon]);
  return null;
}

function OdaiPanel({ odai }: { odai: Odai }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-2 border-l-8 border-ippon bg-panel px-4 py-3">
      {odai.type === "image" && (
        <figure className="w-full">
          {/* 画像は枠内に収め、切り抜かない */}
          <div className="relative mx-auto aspect-video w-full max-w-md bg-black">
            <Image
              src={odai.image}
              alt={odai.alt}
              fill
              sizes="(max-width: 768px) 100vw, 448px"
              className="object-contain"
              priority
            />
          </div>
          <figcaption className="mt-1 text-right text-[10px] text-white/40">
            {odai.credit}
          </figcaption>
        </figure>
      )}
      <p className="text-center text-lg font-black leading-snug sm:text-2xl">{odai.text}</p>
    </div>
  );
}

function Timer({ remaining, full }: { remaining: number; full: number }) {
  const seconds = Math.ceil(remaining / 1000);
  return (
    <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
      <div className="h-2 flex-1 bg-white/15">
        <div
          className="h-full bg-ippon"
          style={{ width: `${Math.min(100, (remaining / full) * 100)}%` }}
        />
      </div>
      <span
        className={`w-12 text-right text-2xl font-black tabular-nums ${
          seconds <= 5 ? "text-red-400" : "text-ippon"
        }`}
        aria-label={`残り${seconds}秒`}
      >
        {seconds}
      </span>
    </div>
  );
}

function AnswerForm({ store }: { store: RoomStore }) {
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  const count = charLength(text);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (sent || text.trim().length === 0 || count > ANSWER_MAX) return;
    setSent(true);
    void store.submitAnswer(text);
  };

  return (
    <form onSubmit={submit} className="mx-auto flex w-full max-w-xl flex-col gap-2">
      <textarea
        className="w-full resize-none border-2 border-ippon bg-black px-3 py-3 text-xl font-bold text-white outline-none"
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value.replace(/\n/g, ""))}
        onKeyDown={(e) => {
          // Enter で送信。日本語入力の変換確定の Enter では送信しない。
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="回答を入力（送信は1回だけ）"
        disabled={sent}
        autoFocus
      />
      <div className="flex items-center gap-3">
        <span
          className={`text-sm font-bold tabular-nums ${
            count > ANSWER_MAX ? "text-red-400" : "text-white/60"
          }`}
        >
          {count}／{ANSWER_MAX}文字
        </span>
        <button
          type="submit"
          disabled={sent || text.trim().length === 0 || count > ANSWER_MAX}
          className="flex-1 bg-ippon px-4 py-3 text-xl font-black text-ink disabled:opacity-40"
        >
          回答する
        </button>
      </div>
    </form>
  );
}

function VoteButtons({
  store,
  seat,
  chosen,
}: {
  store: RoomStore;
  seat: number;
  chosen: number | undefined;
}) {
  const done = chosen !== undefined;
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-2">
      <div className="grid grid-cols-3 gap-2">
        {([0, 1, 2] as const).map((points) => (
          <button
            key={points}
            type="button"
            disabled={done}
            onClick={() => void store.castVote(seat, points)}
            className={`py-5 text-3xl font-black ${
              chosen === points
                ? "bg-ippon text-ink"
                : "border-2 border-ippon text-ippon disabled:border-white/15 disabled:text-white/25"
            }`}
          >
            {points}点
          </button>
        ))}
      </div>
      <p className="text-center text-xs text-white/50">
        {done ? "投票しました（変更はできません）" : "選ぶと変更できません"}
      </p>
    </div>
  );
}

/** 審査員5席。NPCにはロボットの印を付ける。点は結果のときだけ見せる。 */
function Seats({ room, showVotes }: { room: Room; showVotes: boolean }) {
  return (
    <ul className="grid grid-cols-5 gap-1.5">
      {Array.from({ length: SEAT_COUNT }, (_, seat) => {
        const id = room.seats[seat];
        const npc = isNpcSeat(id) ? npcOfSeat(id) : undefined;
        const name = npc ? npc.name : (room.players[id]?.name ?? "—");
        const vote = room.votes[String(seat)];
        const voted = vote !== undefined;
        return (
          <li
            key={seat}
            className="flex flex-col items-center gap-0.5 bg-panel px-1 py-2 text-center"
          >
            <span className="text-xl leading-none">
              {npc ? npc.icon : "🙂"}
              {isNpcSeat(id) && <span className="ml-0.5 text-xs" title="NPC">🤖</span>}
            </span>
            <span className="break-all text-[10px] font-bold leading-tight text-white/80">
              {name}
            </span>
            {npc && <span className="text-[9px] text-white/40">{npc.trait}</span>}
            {showVotes ? (
              <span className="text-lg font-black text-ippon">{room.noAnswer ? "—" : `${vote ?? 0}点`}</span>
            ) : (
              room.state === "JUDGING" && (
                <span className={`text-[10px] font-bold ${voted ? "text-ippon" : "text-white/30"}`}>
                  {voted ? "投票済" : "…"}
                </span>
              )
            )}
          </li>
        );
      })}
    </ul>
  );
}
