// サイト全体の合言葉と公開期限。サーバー側（proxy と /gate の処理）だけで使う。
// 合言葉と署名用の鍵は環境変数から読み、コードには書かない。

export const GATE_COOKIE = "ippom_gate";
/** Cookie の有効期限（仮：30日） */
export const GATE_MAX_AGE_SEC = 30 * 24 * 60 * 60;

export interface GateEnv {
  passphrase: string;
  secret: string;
}

/** 合言葉と署名用の鍵。どちらかが未設定なら null。 */
export function readGateEnv(): GateEnv | null {
  const passphrase = process.env.SITE_PASSPHRASE;
  const secret = process.env.SESSION_SECRET;
  return passphrase && secret ? { passphrase, secret } : null;
}

/** 入力のゆれ（前後の空白、全角・半角）をならす。 */
export function normalizeSecret(value: string): string {
  return value.normalize("NFKC").trim();
}

const encoder = new TextEncoder();

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** 文字列を、長さや一致位置が処理時間に表れない形で比べる。 */
function safeEqual(a: string, b: string): boolean {
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** 入力された合言葉が正しいか。 */
export async function checkPassphrase(input: string, env: GateEnv): Promise<boolean> {
  // 鍵付きハッシュ同士を比べることで、長さの違いも漏らさない。
  const [a, b] = await Promise.all([
    hmacHex(env.secret, `pass:${normalizeSecret(input)}`),
    hmacHex(env.secret, `pass:${normalizeSecret(env.passphrase)}`),
  ]);
  return safeEqual(a, b);
}

/**
 * 通過済みを示す Cookie の値を作る。「期限.署名」の形。
 * 署名に合言葉も混ぜてあるので、合言葉を変えると以前の Cookie は無効になる。
 */
export async function createGateToken(env: GateEnv, now: number): Promise<string> {
  const expires = now + GATE_MAX_AGE_SEC * 1000;
  return `${expires}.${await hmacHex(env.secret, `gate:${expires}:${env.passphrase}`)}`;
}

export async function verifyGateToken(
  token: string | undefined,
  env: GateEnv,
  now: number,
): Promise<boolean> {
  if (!token) return false;
  const [expiresText, signature] = token.split(".");
  const expires = Number(expiresText);
  if (!signature || !Number.isFinite(expires) || expires < now) return false;
  return safeEqual(signature, await hmacHex(env.secret, `gate:${expires}:${env.passphrase}`));
}

/**
 * 公開が終了しているか。PUBLIC_UNTIL（例 2026-12-31）の日本時間の当日いっぱいまで公開。
 * 未設定、または形式が不正なら、終了していない扱い。
 */
export function isClosed(now: number, publicUntil = process.env.PUBLIC_UNTIL): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(publicUntil ?? "");
  if (!m) return false;
  // 日本時間（UTC+9）の翌日0時 = UTC の当日15時
  const end = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 15, 0, 0);
  return now >= end;
}
