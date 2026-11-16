import type { CSSProperties, ReactNode } from "react";
import { site } from "@/lib/content";

export type Finale =
  | { kind: "ippon" }
  | { kind: "score"; total: number; gradeLabel: string }
  | null;

interface Props {
  children: ReactNode;
  /** 点灯している枠の段数（0〜10） */
  lit: number;
  finale: Finale;
}

/**
 * 16:9 の回答カード。上に同心の長方形の枠を重ね、1点につき1段、外側から内側へ点灯する。
 * 各段の太さは短辺の5%なので、10段目でちょうど中心まで埋まる。
 */
export default function AnswerCard({ children, lit, finale }: Props) {
  return (
    <div className="answer-card relative w-full overflow-hidden border-2 border-ippon/60 bg-panel">
      <div className="absolute inset-0 flex items-center justify-center p-[7cqh] text-center">
        {children}
      </div>

      {Array.from({ length: lit }, (_, i) => (
        <div key={i} className="tier" style={{ "--tier": i } as CSSProperties} />
      ))}

      {/* 10点：段の境目が線に見えないよう、全面を黄色一色で覆ってから文字を出す */}
      {finale?.kind === "ippon" && (
        <div className="absolute inset-0 flex items-center justify-center bg-ippon">
          <span
            className="ippon-word font-black italic leading-none tracking-tighter text-ink"
            style={{ fontSize: "34cqh" }}
          >
            {site.ipponWord}
          </span>
        </div>
      )}

      {finale?.kind === "score" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="score-pop flex items-baseline border-ippon bg-ink font-black leading-none text-ippon"
            style={{ gap: "3cqh", padding: "3cqh 6cqh", borderWidth: "1cqh" }}
          >
            <span style={{ fontSize: "24cqh" }}>{finale.total}</span>
            <span style={{ fontSize: "13cqh" }}>{finale.gradeLabel}</span>
          </div>
        </div>
      )}
    </div>
  );
}
