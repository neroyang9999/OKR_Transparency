import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Engineering OKR Transparency",
  description: "Internal Engineering OKR alignment and transparency dashboard"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
