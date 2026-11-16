"use client";

import dynamic from "next/dynamic";

// スクリーン表示はブラウザ側の接続に依存するので、サーバーでは描画しない。
const ScreenClient = dynamic(() => import("@/components/ScreenClient"), { ssr: false });

export default function ScreenPage() {
  return <ScreenClient />;
}
