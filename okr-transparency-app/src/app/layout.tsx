import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthProvider } from "@/components/auth-provider";
import { FeedbackWidget } from "@/components/feedback-widget";
import { getCurrentSessionUser } from "@/lib/admin/permissions";
import { isIapAuthenticationRequired } from "@/lib/iap-auth";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Team OKR Operating Hub",
  description: "Internal team OKR alignment and transparency dashboard",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" }
    ],
    shortcut: "/favicon.ico",
    apple: "/favicon-32x32.png"
  }
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const iapMode = isIapAuthenticationRequired();
  const iapUser = iapMode ? await getCurrentSessionUser() : null;

  return (
    <html lang="zh-CN">
      <body>
        <AuthProvider mode={iapMode ? "iap" : "authjs"} email={iapUser?.email}>
          {children}
          <Suspense fallback={null}><FeedbackWidget /></Suspense>
        </AuthProvider>
      </body>
    </html>
  );
}
