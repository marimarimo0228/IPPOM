// サイト全体の保護。/gate と静的ファイル以外の、すべてのページと /api/* の前で動く。
// （Next.js 16 では Middleware が Proxy という名前になった）

import { NextResponse, type NextRequest } from "next/server";
import siteJson from "../content/site.json";
import { GATE_COOKIE, isClosed, readGateEnv, verifyGateToken } from "@/lib/gate";

const NOINDEX = { "X-Robots-Tag": "noindex, nofollow" };

/** 文字だけの最小のページ。公開終了時と設定ミスの時に、これ「だけ」を返す。 */
function plainPage(text: string, status: number): NextResponse {
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${siteJson.siteName}</title></head><body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0a0a;color:#ffd400;font-family:sans-serif;font-weight:900;font-size:1.5rem;text-align:center;padding:1rem">${text}</body></html>`;
  return new NextResponse(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...NOINDEX },
  });
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");
  const now = Date.now();

  // 公開期限を過ぎたら、合言葉が正しくても「公開は終了しました」だけを返す。
  if (isClosed(now)) {
    return isApi
      ? NextResponse.json({ error: siteJson.closedText }, { status: 410, headers: NOINDEX })
      : plainPage(siteJson.closedText, 410);
  }

  const env = readGateEnv();
  if (!env) {
    // 合言葉か署名用の鍵が未設定。開発中は保護なしで通し、本番では何も見せない。
    if (process.env.NODE_ENV !== "production") return NextResponse.next({ headers: NOINDEX });
    return isApi
      ? NextResponse.json({ error: "サイトの設定が完了していません" }, { status: 503, headers: NOINDEX })
      : plainPage("サイトの設定が完了していません", 503);
  }

  const passed = await verifyGateToken(request.cookies.get(GATE_COOKIE)?.value, env, now);

  if (pathname === "/gate") {
    // 通過済みなら合言葉の画面を出さずにトップへ。
    return passed
      ? NextResponse.redirect(new URL("/", request.url))
      : NextResponse.next({ headers: NOINDEX });
  }
  if (passed) return NextResponse.next({ headers: NOINDEX });

  // 未通過：API は 401、ページは /gate へ転送。
  return isApi
    ? NextResponse.json({ error: "合言葉が必要です" }, { status: 401, headers: NOINDEX })
    : NextResponse.redirect(new URL("/gate", request.url));
}

export const config = {
  // 静的ファイル（Next.js のビルド成果物、お題の画像、効果音、アイコン）は対象外。
  matcher: ["/((?!_next/static|_next/image|favicon.ico|odai/|sounds/).*)"],
};
