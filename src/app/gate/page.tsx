import GateForm from "./GateForm";
import Logo from "@/components/Logo";
import { site } from "@/lib/content";

/** サイト全体の合言葉を入れる画面。ここを通るまで、ほかのページも API も使えない。 */
export default function GatePage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center gap-6 px-4 py-12">
      <Logo />
      <h1 className="text-lg font-black">{site.gate.title}</h1>

      <div className="w-full max-w-sm border-l-8 border-ippon bg-panel px-4 py-3">
        <p className="font-bold text-ippon">{site.gate.hint}</p>
        <p className="mt-1 text-xl font-black">{site.gate.hintDetail}</p>
        <p className="mt-2 text-xs leading-relaxed text-white/60">{site.gate.reason}</p>
      </div>

      <GateForm />

      <p className="max-w-sm text-center text-xs leading-relaxed text-white/60">
        {site.disclaimer}
      </p>
    </main>
  );
}
