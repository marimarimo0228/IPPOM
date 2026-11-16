"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { site } from "@/lib/content";
import {
  checkPassphrase,
  createGateToken,
  GATE_COOKIE,
  GATE_MAX_AGE_SEC,
  isClosed,
  readGateEnv,
} from "@/lib/gate";

export interface GateState {
  error: string | null;
}

/** 合言葉をサーバー側で照合し、正しければ署名付きの httpOnly Cookie を発行する。 */
export async function enterGate(_prev: GateState, formData: FormData): Promise<GateState> {
  const now = Date.now();
  if (isClosed(now)) return { error: site.closedText };

  const env = readGateEnv();
  if (!env) return { error: "サイトの設定が完了していません。" };

  const input = formData.get("passphrase");
  const ok = typeof input === "string" && (await checkPassphrase(input, env));
  if (!ok) {
    // 間違えたときは1秒待たせて、総当たりを遅くする。
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return { error: site.gate.wrong };
  }

  (await cookies()).set(GATE_COOKIE, await createGateToken(env, now), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: GATE_MAX_AGE_SEC,
  });
  redirect("/");
}
