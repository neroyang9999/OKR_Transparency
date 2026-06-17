"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { hrefWithLang, t, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type TeamNavItem = {
  name: string;
  owner: string;
  color: string;
  children: Array<{ name: string; owner: string; color: string }>;
};

export function TeamSidebar({
  items,
  selectedTeam,
  lang
}: {
  items: TeamNavItem[];
  selectedTeam: string;
  lang: Lang;
}) {
  const initialOpen = items
    .filter((item) => item.name === selectedTeam || item.children.some((child) => child.name === selectedTeam))
    .map((item) => item.name);
  const [openTeams, setOpenTeams] = useOpenTeams(initialOpen);

  return (
    <aside className="rounded-lg border border-border bg-white p-4 shadow-subtle">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input
          aria-label={t(lang, "searchTeam")}
          placeholder={t(lang, "searchTeam")}
          className="h-10 w-full rounded-md border border-border bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:bg-white"
        />
      </div>

      <div className="mt-5">
        <div className="px-2 text-sm font-medium text-slate-500">{t(lang, "teamOkrs")}</div>
        <div className="mt-2 space-y-1">
          {items.map((item) => {
            const selected = selectedTeam === item.name;
            const expanded = openTeams.has(item.name);

            return (
              <div key={item.name}>
                <div
                  className={cn(
                    "flex items-center rounded-md text-sm hover:bg-slate-50",
                    selected && "bg-blue-50 text-slate-950"
                  )}
                >
                  <Link
                    href={hrefWithLang(`/?team=${encodeURIComponent(item.name)}`, lang)}
                    className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5"
                  >
                    <span className={cn(
                      "relative z-10 grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold text-white shadow-sm ring-2 ring-white"
                    )}
                    style={{ backgroundColor: teamColor(item.color) }}>
                      {initials(item.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{item.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{item.owner}</span>
                    </span>
                  </Link>
                  {item.children.length > 0 && (
                    <button
                      type="button"
                      aria-label={`${expanded ? "Collapse" : "Expand"} ${item.name}`}
                      aria-expanded={expanded}
                      onClick={() => setOpenTeams((current) => {
                        const next = new Set(current);
                        if (next.has(item.name)) next.delete(item.name);
                        else next.add(item.name);
                        return next;
                      })}
                      className="mr-2 grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-white hover:text-slate-700"
                    >
                      <ChevronDown className={cn("h-4 w-4 transition-transform", !expanded && "-rotate-90")} />
                    </button>
                  )}
                </div>

                {expanded && item.children.length > 0 && (
                  <div className="ml-6 mt-1 space-y-1 border-l border-slate-200 pl-4">
                    {item.children.map((child) => {
                      const selectedChild = selectedTeam === child.name;
                      return (
                      <Link
                        key={child.name}
                        href={hrefWithLang(`/?team=${encodeURIComponent(child.name)}`, lang)}
                        className={cn(
                          "flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-slate-50",
                          selectedChild && "bg-blue-50 text-slate-950"
                        )}
                      >
                        <TeamAvatar name={child.name} color={child.color} selected={selectedChild} />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{child.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{child.owner}</span>
                        </span>
                      </Link>
                    );})}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

function useOpenTeams(initialOpen: string[]) {
  return useState<Set<string>>(() => new Set(initialOpen));
}

function TeamAvatar({ name, color, selected }: { name: string; color?: string; selected?: boolean }) {
  return (
    <span className={cn(
      "relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-semibold text-white shadow-sm ring-2 ring-white",
      selected && "ring-blue-100"
    )}
    style={{ backgroundColor: teamColor(color) }}>
      {initials(name)}
    </span>
  );
}

function teamColor(color?: string) {
  switch (color) {
    case "bg-emerald-500":
      return "#10b981";
    case "bg-violet-500":
      return "#8b5cf6";
    case "bg-amber-500":
      return "#f59e0b";
    case "bg-slate-500":
      return "#64748b";
    case "bg-blue-500":
    default:
      return "#3b82f6";
  }
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
