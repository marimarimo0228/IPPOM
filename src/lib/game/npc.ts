// NPC審査員。名前はすべて架空。personality は段階4でLLMの採点に使う。

export interface Npc {
  id: string;
  name: string;
  icon: string;
  trait: string;
  personality: string;
}

export const NPCS: Npc[] = [
  {
    id: "gera",
    name: "ワライ・ゲラ美",
    icon: "😆",
    trait: "ゲラ",
    personality: "笑いの沸点が低く、少しでも面白ければ高い点を付ける。",
  },
  {
    id: "karakuchi",
    name: "シオ・カラ蔵",
    icon: "🧂",
    trait: "辛口",
    personality: "採点が厳しく、本当に感心したときだけ2点を付ける。",
  },
  {
    id: "surreal",
    name: "ナゾノ・ユメ彦",
    icon: "🌀",
    trait: "シュール好き",
    personality: "意味がありそうでない、不思議な回答を高く評価する。",
  },
  {
    id: "dajare",
    name: "ダジャ・レオ",
    icon: "🎺",
    trait: "ダジャレ好き",
    personality: "言葉遊びやダジャレが入っていると高い点を付ける。",
  },
  {
    id: "futsu",
    name: "ナカノ・フツ乃",
    icon: "🍵",
    trait: "ふつう",
    personality: "お題に合っていて分かりやすい回答を素直に評価する。",
  },
];

export const NPC_PREFIX = "npc:";

export function isNpcSeat(seat: string | undefined): boolean {
  return !!seat && seat.startsWith(NPC_PREFIX);
}

export function npcOfSeat(seat: string): Npc | undefined {
  return NPCS.find((n) => NPC_PREFIX + n.id === seat);
}
