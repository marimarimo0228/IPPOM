import type { Metadata, Viewport } from "next";
import Footer from "@/components/Footer";
import SoundToggle from "@/components/SoundToggle";
import { site } from "@/lib/content";
import "./globals.css";

export const metadata: Metadata = {
  title: site.siteName,
  description: site.disclaimer,
  // 検索結果に出さない
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a0a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <SoundToggle />
        <div className="flex flex-1 flex-col">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
