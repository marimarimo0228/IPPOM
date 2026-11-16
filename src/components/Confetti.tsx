import type { CSSProperties } from "react";

// 毎回同じ並びになる簡単な擬似乱数（描画のたびに形が変わらないようにする）。
function pseudo(i: number, salt: number) {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const COLORS = ["#ffd400", "#ffe45c", "#fff3a6", "#e6b800"];

/** 黄色い紙吹雪。div を CSS アニメーションで落とすだけ。 */
export default function Confetti({ count = 70 }: { count?: number }) {
  return (
    <div className="confetti-layer" aria-hidden>
      {Array.from({ length: count }, (_, i) => {
        const w = 6 + pseudo(i, 1) * 8;
        const style = {
          left: `${pseudo(i, 2) * 100}%`,
          width: `${w}px`,
          height: `${w * (0.4 + pseudo(i, 3) * 1.2)}px`,
          background: COLORS[i % COLORS.length],
          animationDuration: `${1.8 + pseudo(i, 4) * 1.6}s`,
          animationDelay: `${pseudo(i, 5) * 0.7}s`,
          "--drift": `${(pseudo(i, 6) - 0.5) * 30}vw`,
          "--spin": `${(pseudo(i, 7) - 0.5) * 1440}deg`,
        } as CSSProperties;
        return <span key={i} className="confetti-piece" style={style} />;
      })}
    </div>
  );
}
