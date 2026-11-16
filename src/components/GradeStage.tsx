"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import Confetti from "./Confetti";
import { gradeLabel } from "@/lib/content";
import { GRADE_HIGHLIGHT_MS, GRADE_STAMP_MS } from "@/lib/game/constants";
import type { Score } from "@/lib/game/types";
import { playSound } from "@/lib/sound";

interface Props {
  name: string;
  score: Score | undefined;
  /** 演出の開始からの経過ミリ秒（全端末で共通） */
  elapsed: number;
}

/**
 * 成績発表。1回目・2回目の点数 → 0.8秒後に高い方が光る → さらに0.8秒後にハンコ。
 * 秀は紙吹雪と派手な音、不可はハンコが傾いて低い音。
 */
export default function GradeStage({ name, score, elapsed }: Props) {
  const phase =
    elapsed >= GRADE_STAMP_MS ? 2 : elapsed >= GRADE_HIGHLIGHT_MS ? 1 : 0;
  const grade = score?.grade;
  const { first, second } = score ?? {};

  // ハンコが押された瞬間に1回だけ音を鳴らす（途中から見始めた端末では鳴らさない）。
  const lastPhase = useRef(phase);
  useEffect(() => {
    if (phase === 2 && lastPhase.current < 2) {
      playSound(
        grade === "S"
          ? "stampTop"
          : grade === "F" || !grade
            ? "stampFail"
            : "stamp",
      );
    }
    lastPhase.current = phase;
  }, [phase, grade]);

  const a = first ?? -1;
  const b = second ?? -1;
  const boxClass = (mine: number, other: number, exists: boolean) => {
    const base =
      "flex flex-1 flex-col items-center gap-1 border-4 px-3 py-6 transition-all duration-300 sm:py-10";
    if (phase === 0 || !exists) return `${base} border-white/30 text-white`;
    return mine >= other
      ? `${base} glow border-ippon bg-ippon text-ink`
      : `${base} border-white/10 text-white/30`;
  };

  return (
    <>
      <div
        className={`relative mx-auto w-full max-w-2xl ${phase === 2 ? "shake" : ""}`}
      >
        <p className="mb-4 text-center text-xl font-black sm:text-3xl">
          <span className="text-ippon">{name}</span> さんの成績
        </p>
        <div className="relative flex gap-3 sm:gap-6">
          <div className={boxClass(a, b, first !== undefined)}>
            <span className="text-sm font-bold sm:text-lg">1回目</span>
            <span className="text-6xl font-black leading-none sm:text-8xl">
              {first ?? "—"}
            </span>
          </div>
          <div className={boxClass(b, a, second !== undefined)}>
            <span className="text-sm font-bold sm:text-lg">2回目</span>
            <span className="text-6xl font-black leading-none sm:text-8xl">
              {second ?? "—"}
            </span>
          </div>

          {phase === 2 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div
                className={`stamp flex aspect-square h-[64%] sm:h-[94%] items-center justify-center rounded-full border-[6px] sm:border-[10px] bg-ink/90 font-black leading-none ${
                  grade === "F" || !grade
                    ? "border-ippon-dark text-ippon-dark"
                    : "border-ippon text-ippon"
                }`}
                style={
                  {
                    "--stamp-rot": grade === "F" || !grade ? "14deg" : "-6deg",
                    fontSize: !grade
                    ? "clamp(1.1rem, 4.5vw, 2.25rem)"
                    : grade === "F"
                      ? "clamp(2rem, 8vw, 4.25rem)"
                      : "clamp(3rem, 12vw, 6.5rem)",
                  } as CSSProperties
                }
              >
                {grade ? gradeLabel(grade) : "記録なし"}
              </div>
            </div>
          )}
        </div>
      </div>
      {phase === 2 && grade === "S" && <Confetti />}
    </>
  );
}
