"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams, type ReadonlyURLSearchParams } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import { BarChart3, BriefcaseBusiness, GitBranch, Search, Users } from "lucide-react";
import { useAppIdentity } from "@/components/auth-provider";
import { APP_VERSION } from "@/lib/app-version";
import { hrefWithLang, normalizeLang, t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", id: "overview", labelKey: "overview", icon: BarChart3 },
  { href: "/my", id: "myActions", labelKey: "myActions", icon: BriefcaseBusiness },
  { href: "/map", id: "okrMap", labelKey: "okrMap", icon: GitBranch },
  { href: "/teams", id: "teams", labelKey: "teams", icon: Users },
  { href: "/search", id: "search", labelKey: "search", icon: Search }
] as const;

export function AppShell({
  children,
  active,
  hideNavigation = false,
  compactOnLaptop = false
}: {
  children: React.ReactNode;
  active: string;
  hideNavigation?: boolean;
  compactOnLaptop?: boolean;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const lang = normalizeLang(searchParams.get("lang") ?? undefined);
  const { data: session } = useSession();
  const identity = useAppIdentity();
  const currentEmail = identity.mode === "iap" ? identity.email : session?.user?.email;
  /** The header shares the page container: the map runs full-bleed, and a header still boxed at
   *  80rem would leave the logo and nav floating in the middle of a wide screen. */
  const containerWidth = active === "okrMap" ? "max-w-none" : "max-w-7xl";

  return (
    <div className={cn("min-h-screen", compactOnLaptop && "overview-laptop-compact")}>
      <header className="sticky top-0 z-20 border-b border-border bg-white/92 backdrop-blur">
        <div className={cn("mx-auto flex items-center justify-between gap-4 px-5 py-3 short:py-2", containerWidth)}>
          <Link href={hrefWithLang("/", lang)} className="flex items-center gap-3">
            <div className="flex h-9 w-11 items-center justify-center rounded-md bg-black px-1.5">
              <Image
                src="/unitx-x-logo.png"
                alt="UnitX"
                width={272}
                height={185}
                className="h-auto w-full object-contain"
                priority
              />
            </div>
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold leading-4">
                <span>{t(lang, "brandTitle")}</span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium leading-none text-slate-500">
                  v{APP_VERSION}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">{t(lang, "brandSubtitle")}</div>
            </div>
          </Link>
          <nav className="flex min-w-0 items-center gap-1">
            {!hideNavigation && (
              <>
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const label = t(lang, item.labelKey);
                  return (
                    <Link
                      key={item.href}
                      href={hrefWithLang(item.href, lang)}
                      className={cn(
                        "inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-950",
                        active === item.id && "bg-slate-950 text-white hover:bg-slate-950 hover:text-white"
                      )}
                      title={label}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="hidden lg:inline">{label}</span>
                    </Link>
                  );
                })}
                {currentEmail && identity.mode === "iap" ? (
                  <span
                    className="hidden h-9 max-w-44 items-center rounded-md px-3 text-xs font-medium text-slate-500 xl:inline-flex"
                    title={currentEmail}
                  >
                    <span className="truncate">{currentEmail}</span>
                  </span>
                ) : currentEmail ? (
                  <button
                    type="button"
                    onClick={() => void signOut()}
                    className="hidden h-9 max-w-44 items-center rounded-md px-3 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-950 xl:inline-flex"
                    title={currentEmail}
                  >
                    <span className="truncate">{currentEmail}</span>
                  </button>
                ) : identity.mode === "authjs" ? (
                  <button
                    type="button"
                    onClick={() => void signIn("google")}
                    className="hidden h-9 items-center rounded-md px-3 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-950 md:inline-flex"
                  >
                    登录
                  </button>
                ) : null}
              </>
            )}
            <LanguageToggle pathname={pathname} searchParams={searchParams} />
          </nav>
        </div>
      </header>
      <main className={cn("mx-auto px-5 py-6 short:py-4", containerWidth)}>{children}</main>
    </div>
  );
}

function LanguageToggle({
  pathname,
  searchParams
}: {
  pathname: string;
  searchParams: URLSearchParams | ReadonlyURLSearchParams;
}) {
  const currentLang = normalizeLang(searchParams.get("lang") ?? undefined);
  const hrefFor = (nextLang: "zh" | "en") => {
    const params = new URLSearchParams(searchParams.toString());
    if (nextLang === "en") params.set("lang", "en");
    else params.delete("lang");
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  return (
    <div
      className="ml-2 inline-flex h-9 shrink-0 items-center rounded-md border border-border bg-white p-0.5 text-xs font-medium shadow-subtle"
      aria-label={t(currentLang, "languageLabel")}
    >
      {(["zh", "en"] as const).map((lang) => (
        <Link
          key={lang}
          href={hrefFor(lang)}
          className={cn(
            "grid h-7 min-w-9 place-items-center rounded px-2 text-slate-600 hover:bg-slate-100 hover:text-slate-950",
            currentLang === lang && "bg-blue-50 text-blue-700"
          )}
          aria-current={currentLang === lang ? "true" : undefined}
        >
          {lang === "zh" ? t(currentLang, "chinese") : t(currentLang, "english")}
        </Link>
      ))}
    </div>
  );
}
