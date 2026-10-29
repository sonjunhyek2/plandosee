import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "플랜두씨 다이어리 — 내 계획과 실제를 담는 다이어리",
  description: "계획(Plan), 실제 실행(Do), 돌아보기(See)를 기록하고 다음 계획으로 이어가는 다이어리",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="min-h-screen antialiased selection:bg-blue-100 selection:text-blue-900">
        {children}
      </body>
    </html>
  );
}

