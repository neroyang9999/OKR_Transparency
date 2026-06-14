import Link from "next/link";
import Image from "next/image";
import { BarChart3, GitBranch, Search, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Overview", icon: BarChart3 },
  { href: "/map", label: "OKR Map", icon: GitBranch },
  { href: "/teams", label: "Teams", icon: Users },
  { href: "/search", label: "Search", icon: Search }
];

export function AppShell({ children, active }: { children: React.ReactNode; active: string }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border bg-white/92 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3">
          <Link href="/" className="flex items-center gap-3">
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
              <div className="text-sm font-semibold leading-4">Engineering OKR</div>
              <div className="text-xs text-muted-foreground">Transparency Hub</div>
            </div>
          </Link>
          <nav className="flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-950",
                    active === item.label && "bg-slate-950 text-white hover:bg-slate-950 hover:text-white"
                  )}
                  title={item.label}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-5 py-6">{children}</main>
    </div>
  );
}
