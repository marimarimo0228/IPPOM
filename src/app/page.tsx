import JoinForm from "@/components/JoinForm";
import Logo from "@/components/Logo";

export default function TopPage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center gap-8 px-4 py-12">
      <h1>
        <Logo />
      </h1>
      <JoinForm />
      <section className="w-full max-w-sm border border-white/15 p-4 text-sm leading-relaxed text-white/80">
        <h2 className="mb-2 font-black text-ippon">遊び方</h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>同じ合言葉を入れた人が同じ部屋に集まります（最大6人）。</li>
          <li>1人が回答者になり、お題に1回だけ回答します。</li>
          <li>ほかの人は審査員になり、0点・1点・2点を付けます。足りない席はNPCが座ります。</li>
          <li>審査員5人の合計が10点なら「IPPOM」です。</li>
          <li>1人2回ずつ回答し、高い方の点数で成績が決まります。</li>
        </ol>
      </section>
    </main>
  );
}
