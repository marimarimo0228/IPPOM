// 仕様書で「仮」とされた値と、演出のタイミング。調整はここだけで行う。

export const MAX_HUMANS = 6;
export const SEAT_COUNT = 5;
export const ROUNDS_PER_ANSWERER = 2;

export const NAME_MAX = 10;
export const PASSPHRASE_MIN = 4;
export const PASSPHRASE_MAX = 20;
export const ANSWER_MAX = 40;

export const ODAI_MS = 3_000;
export const ANSWER_MS = 60_000;
export const JUDGE_MS = 8_000;
/** 全員の票がそろっても、回答を読む時間としてこれだけは JUDGING にとどまる（仮）。 */
export const JUDGE_MIN_MS = 2_500;

/** 回答者の切断は、一瞬の通信切れで無効にならないよう、これだけ待ってから扱う（仮）。 */
export const ANSWERER_GRACE_MS = 5_000;
/** ホストの切断は、これだけ続いたら次の人が引き継ぐ（仮）。 */
export const HOST_GRACE_MS = 3_000;
/** 最後の人が抜けてから部屋を消すまで（仮）。 */
export const ROOM_EMPTY_TTL_MS = 10 * 60_000;
/** 作成から部屋を消すまで（仮）。 */
export const ROOM_MAX_AGE_MS = 3 * 60 * 60_000;

/** 状態を書き込んでから演出を始めるまでの猶予。全端末に届くのを待つ。 */
export const REVEAL_LEAD_MS = 600;
export const TIER_INTERVAL_MS = 350;
/** 6点以上のとき、最後の1段の前に追加で止める時間。 */
export const TAME_MS = 800;
export const TAME_FROM = 6;
/** 最後の段が点灯してから結果表示までの間。 */
export const FINALE_GAP_MS = 400;
export const FINALE_GAP_IPPON_MS = 200;
export const AFTER_IPPON_MS = 2_500;
export const AFTER_SCORE_MS = 1_500;

/** 成績発表：点数表示 → 高い方が光る → ハンコ。 */
export const GRADE_HIGHLIGHT_MS = 800;
export const GRADE_STAMP_MS = 1_600;

/** 1部屋あたりの /api/judge の呼び出し上限（仮）。超えたら乱数採点。 */
export const JUDGE_LIMIT = 50;

/**
 * NPCの乱数採点の重み（0点・1点・2点）。
 * 1人あたりの平均は 0×0.25 + 1×0.45 + 2×0.30 = 1.05 点（当初の 0.5/0.3/0.2 の平均 0.7 点の1.5倍）。
 */
export const NPC_RANDOM_WEIGHTS = [0.25, 0.45, 0.3] as const;
