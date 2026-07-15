"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { usePathname, useSearchParams } from "next/navigation";
import { CheckCircle2, MessageSquareText, X } from "lucide-react";
import { useAppIdentity } from "@/components/auth-provider";
import { normalizeLang } from "@/lib/i18n";

const copy = {
  zh: {
    button: "反馈",
    title: "告诉我们你的想法",
    description: "问题、建议或使用感受都可以直接提交。",
    placeholder: "请描述你遇到的问题或建议……",
    context: "当前页面",
    cancel: "取消",
    submit: "提交反馈",
    submitting: "提交中…",
    success: "已收到，谢谢你的反馈。",
    login: "请先登录；若已登录，请联系管理员开通账号。",
    iapDenied: "当前公司账号未开通反馈权限，请联系管理员。",
    loginButton: "登录",
    failed: "提交失败，请稍后重试。"
  },
  en: {
    button: "Feedback",
    title: "Tell us what you think",
    description: "Share a problem, suggestion, or anything about your experience.",
    placeholder: "Describe the issue or suggestion…",
    context: "Current page",
    cancel: "Cancel",
    submit: "Submit feedback",
    submitting: "Submitting…",
    success: "Thanks — your feedback has been received.",
    login: "Please sign in. If you are signed in, ask an administrator to enable your account.",
    iapDenied: "Your company account is not enabled for feedback. Contact an administrator.",
    loginButton: "Sign in",
    failed: "Submission failed. Please try again later."
  }
} as const;

export function FeedbackWidget() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lang = normalizeLang(searchParams.get("lang") ?? undefined);
  const text = copy[lang];
  const identity = useAppIdentity();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ tone: "success" | "error"; text: string; login?: boolean } | null>(null);

  if (pathname.startsWith("/admin")) return null;

  async function submit() {
    if (!message.trim() || busy) return;
    setBusy(true);
    setStatus(null);
    const query = searchParams.toString();
    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, page: query ? `${pathname}?${query}` : pathname })
    });
    const body = await response.json().catch(() => ({})) as { error?: string };
    setBusy(false);

    if (response.status === 401) {
      setStatus({
        tone: "error",
        text: identity.mode === "iap" ? text.iapDenied : text.login,
        login: identity.mode === "authjs"
      });
      return;
    }
    if (!response.ok) {
      setStatus({ tone: "error", text: body.error ?? text.failed });
      return;
    }

    setMessage("");
    setStatus({ tone: "success", text: text.success });
  }

  function close() {
    setOpen(false);
    setStatus(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 inline-flex h-11 items-center gap-2 rounded-full bg-slate-950 px-4 text-sm font-medium text-white shadow-lg transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        <MessageSquareText className="h-4 w-4" />
        {text.button}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-end bg-slate-950/35 p-4 sm:place-items-center" role="dialog" aria-modal="true" aria-labelledby="feedback-title">
          <button type="button" className="absolute inset-0" onClick={close} aria-label={text.cancel} />
          <div className="relative w-full max-w-lg rounded-xl border border-border bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="feedback-title" className="text-lg font-semibold text-slate-950">{text.title}</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{text.description}</p>
              </div>
              <button type="button" onClick={close} className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-100" aria-label={text.cancel}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={2000}
              rows={6}
              autoFocus
              placeholder={text.placeholder}
              className="mt-4 w-full resize-y rounded-lg border border-border px-3 py-3 text-sm leading-6 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
            <div className="mt-1 flex items-center justify-between gap-3 text-xs text-slate-500">
              <span className="truncate">{text.context}：{pathname}</span>
              <span>{message.length}/2000</span>
            </div>

            {status && (
              <div className={`mt-4 rounded-lg px-3 py-3 text-sm ${status.tone === "success" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
                <div className="flex items-start gap-2">
                  {status.tone === "success" && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
                  <span>{status.text}</span>
                </div>
                {status.login && <button type="button" onClick={() => void signIn("google")} className="mt-2 font-medium underline">{text.loginButton}</button>}
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={close} className="h-9 rounded-md px-3 text-sm font-medium text-slate-600 hover:bg-slate-100">{text.cancel}</button>
              <button type="button" onClick={() => void submit()} disabled={busy || !message.trim()} className="h-9 rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-slate-300">
                {busy ? text.submitting : text.submit}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
