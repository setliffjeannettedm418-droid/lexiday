import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "词序 Lexiday · 考研英语",
  description: "考研英语词汇测试、熟词僻义与智能复习",
  manifest: "/manifest.webmanifest",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>
  );
}
