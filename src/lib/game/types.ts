export type RoomState =
  | "LOBBY"
  | "ODAI"
  | "ANSWERING"
  | "JUDGING"
  | "REVEAL"
  | "RESULT"
  | "GRADE"
  | "FINISHED";

/** 成績の内部キー。表示する文字（秀・優…）は content/site.json にある。 */
export type GradeKey = "S" | "A" | "B" | "C" | "F";

export interface Player {
  name: string;
  joinedAt: number;
  online: boolean;
  /** 切断した時刻。つながっている間はない */
  leftAt?: number;
}

export interface Score {
  first?: number;
  second?: number;
  best?: number;
  grade?: GradeKey;
}

/** 部屋の共有データ。仕様書8章の「データの形」に対応する。 */
export interface Room {
  state: RoomState;
  hostId: string;
  createdAt: number;
  /** 回答者の順番（開始時に確定） */
  order: string[];
  /** 何人目の回答者か（0始まり） */
  turn: number;
  attempt: 1 | 2;
  /** 通し番号。ラウンドが始まるたびに1増える */
  round: number;
  odaiId: string | null;
  answererId: string | null;
  answer: string | null;
  /** 時間切れで回答がなかった */
  noAnswer: boolean;
  /** 現在の状態の締切時刻 */
  deadline: number | null;
  /** 演出（枠・成績発表）の開始時刻 */
  revealAt: number | null;
  total: number | null;
  players: Record<string, Player>;
  /** 審査員5席。playerId か "npc:<id>" */
  seats: string[];
  /** 切断でNPCに置き換えた席 → 元のプレイヤーID。再接続したら戻す */
  benched: Record<string, string>;
  /** 席番号 → 点 */
  votes: Record<string, number>;
  scores: Record<string, Score>;
  usedOdai: Record<string, true>;
  /** この部屋で /api/judge を呼んだ回数（上限の判定用） */
  judgeCount: number;
}

/**
 * 部屋データへの差分。キーは "state" や "votes/3" のようなパス、値が null なら削除。
 * Firebase Realtime Database の update() にそのまま渡せる形にしてある。
 */
export type RoomPatch = Record<string, unknown>;

export type Odai =
  | { id: string; type: "text"; text: string; enabled: boolean }
  | {
      id: string;
      type: "image";
      text: string;
      image: string;
      alt: string;
      credit: string;
      enabled: boolean;
    };
