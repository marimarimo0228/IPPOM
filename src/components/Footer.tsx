import { formatDateJa, site } from "@/lib/content";

/** 全ページ共通の表記（非公式である旨、公開期間、制作者、素材のクレジット）。 */
export default function Footer() {
  const until = process.env.PUBLIC_UNTIL || "2026-12-31";
  return (
    <footer className="border-t border-white/10 px-4 py-5 text-center text-[11px] leading-relaxed text-white/50">
      <p>{site.disclaimer}</p>
      <p>{site.periodNote.replace("{date}", formatDateJa(until))}</p>
      <p className="mt-2">
        制作：{site.creator.name} ／ 連絡先：{site.creator.contact}
      </p>
      {site.credits.length > 0 && <p>素材：{site.credits.join("、")}</p>}
    </footer>
  );
}
