import { site } from "@/lib/content";

/** 文字だけで組んだ独自のロゴ。画像素材は使わない。 */
export default function Logo({ size = "lg" }: { size?: "sm" | "lg" }) {
  const big = size === "lg";
  return (
    <div className={`inline-flex select-none flex-col items-center ${big ? "gap-2" : "gap-1"}`}>
      <span
        className={`-skew-x-6 bg-ippon font-black leading-none tracking-tight text-ink ${
          big ? "px-5 py-2 text-6xl sm:text-7xl" : "px-2 py-0.5 text-xl"
        }`}
      >
        {site.logoMain}
      </span>
      <span
        className={`font-black text-ippon ${big ? "text-2xl tracking-[0.5em] sm:text-3xl" : "text-[10px] tracking-[0.4em]"}`}
      >
        {site.logoSub}
      </span>
    </div>
  );
}
