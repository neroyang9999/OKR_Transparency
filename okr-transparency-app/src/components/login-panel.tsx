"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn, signOut } from "next-auth/react";
import { LogIn } from "lucide-react";
import { normalizeLang } from "@/lib/i18n";

type LoginPanelProps = {
  variant: "login" | "denied";
  email?: string;
};

export function LoginPanel({ variant, email }: LoginPanelProps) {
  const searchParams = useSearchParams();
  const lang = normalizeLang(searchParams.get("lang") ?? undefined);
  const copy = copies[lang];
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    const result = await signIn("credentials", {
      username,
      password,
      redirect: false
    });

    setSubmitting(false);
    if (result?.error) {
      setError(copy.invalid);
      return;
    }

    window.location.reload();
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-180px)] max-w-md items-center">
      <div className="w-full rounded-lg border border-border bg-white p-6 shadow-subtle">
        <div className="mb-5 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-md bg-slate-950 text-white">
            <LogIn className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-950">
              {variant === "denied" ? copy.deniedTitle : copy.title}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {variant === "denied" && email
                ? copy.denied(email)
                : copy.subtitle}
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">{copy.username}</span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-border px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              autoComplete="username"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">{copy.password}</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-border px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              autoComplete="current-password"
            />
          </label>
          {error && <div className="text-sm text-rose-600">{error}</div>}
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {submitting ? copy.submitting : copy.submit}
          </button>
        </form>

        <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
          <button
            type="button"
            onClick={() => void signIn("google")}
            className="text-sm font-medium text-slate-600 hover:text-slate-950"
          >
            {copy.google}
          </button>
          {variant === "denied" && (
            <button
              type="button"
              onClick={() => void signOut()}
              className="text-sm font-medium text-slate-600 hover:text-slate-950"
            >
              {copy.signOut}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const copies = {
  zh: {
    title: "登录 Team OKR",
    deniedTitle: "账号无访问权限",
    subtitle: "请使用授权账号登录后查看 OKR",
    denied: (email: string) => `${email} 未配置 OKR 访问权限`,
    username: "账号",
    password: "密码",
    submit: "登录",
    submitting: "登录中...",
    invalid: "账号或密码不正确",
    google: "使用 Google 登录",
    signOut: "退出当前账号"
  },
  en: {
    title: "Sign in to Team OKR",
    deniedTitle: "Account not authorized",
    subtitle: "Sign in with an authorized account to view OKRs.",
    denied: (email: string) => `${email} is not configured for OKR access.`,
    username: "Username",
    password: "Password",
    submit: "Sign in",
    submitting: "Signing in...",
    invalid: "Incorrect username or password",
    google: "Sign in with Google",
    signOut: "Sign out"
  }
} as const;
