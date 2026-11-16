"use client";

import dynamic from "next/dynamic";

// 部屋の画面はブラウザに保存した情報（プレイヤーIDなど）に依存するので、サーバーでは描画しない。
const RoomClient = dynamic(() => import("@/components/RoomClient"), { ssr: false });

export default function RoomPage() {
  return <RoomClient />;
}
