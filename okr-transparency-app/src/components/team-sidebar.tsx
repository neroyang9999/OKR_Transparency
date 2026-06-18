"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown, Search, UserRound } from "lucide-react";
import { hrefWithLang, t, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type TeamNavMember = {
  email: string;
  displayName: string;
  role: string;
};

export type TeamNavChild = {
  name: string;
  owner: string;
  color: string;
  members: TeamNavMember[];
};

export type TeamNavItem = {
  name: string;
  owner: string;
  color: string;
  members: TeamNavMember[];
  children: TeamNavChild[];
};

export function TeamSidebar({
  items,
  selectedTeam,
  selectedMemberEmail,
  lang
}: {
  items: TeamNavItem[];
  selectedTeam: string;
  selectedMemberEmail?: string;
  lang: Lang;
}) {
  const initialOpen = items
    .filter((item) =>
      item.name === selectedTeam ||
      item.members.some((member) => member.email === selectedMemberEmail) ||
      item.children.some((child) => child.name === selectedTeam || child.members.some((member) => member.email === selectedMemberEmail))
    )
    .map((item) => item.name);
  const [openTeams, setOpenTeams] = useOpenTeams(initialOpen);
  const [openMemberGroups, setOpenMemberGroups] = useOpenTeams(selectedMemberEmail ? [selectedTeam] : []);

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
            const hasNestedItems = item.children.length > 0 || item.members.length > 0;

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
                  {hasNestedItems && (
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

                {expanded && hasNestedItems && (
                  <div className="ml-6 mt-1 space-y-1 border-l border-slate-200 pl-4">
                    {item.members.length > 0 && (
                      <MemberList
                        teamName={item.name}
                        members={item.members}
                        selectedMemberEmail={selectedMemberEmail}
                        lang={lang}
                      />
                    )}
                    {item.children.map((child) => {
                      const selectedChild = selectedTeam === child.name;
                      const childMembersOpen = openMemberGroups.has(child.name);
                      return (
                        <div key={child.name}>
                          <div
                            className={cn(
                              "flex items-center rounded-md text-sm hover:bg-slate-50",
                              selectedChild && !selectedMemberEmail && "bg-blue-50 text-slate-950"
                            )}
                          >
                            <Link
                              href={hrefWithLang(`/?team=${encodeURIComponent(child.name)}`, lang)}
                              className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2"
                            >
                              <TeamAvatar name={child.name} color={child.color} selected={selectedChild && !selectedMemberEmail} />
                              <span className="min-w-0">
                                <span className="block truncate font-semibold">{child.name}</span>
                                <span className="block truncate text-xs text-muted-foreground">{child.owner}</span>
                              </span>
                            </Link>
                            {child.members.length > 0 && (
                              <button
                                type="button"
                                aria-label={`${childMembersOpen ? "Collapse" : "Expand"} ${child.name} members`}
                                aria-expanded={childMembersOpen}
                                onClick={() => setOpenMemberGroups((current) => {
                                  const next = new Set(current);
                                  if (next.has(child.name)) next.delete(child.name);
                                  else next.add(child.name);
                                  return next;
                                })}
                                className="mr-1 grid h-7 w-7 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-white hover:text-slate-700"
                              >
                                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !childMembersOpen && "-rotate-90")} />
                              </button>
                            )}
                          </div>
                          {childMembersOpen && (
                            <div className="ml-7 mt-1 space-y-1 border-l border-slate-100 pl-3">
                              <MemberList
                                teamName={child.name}
                                members={child.members}
                                selectedMemberEmail={selectedMemberEmail}
                                lang={lang}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
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

function MemberList({
  teamName,
  members,
  selectedMemberEmail,
  lang
}: {
  teamName: string;
  members: TeamNavMember[];
  selectedMemberEmail?: string;
  lang: Lang;
}) {
  return (
    <div className="space-y-1">
      {members.map((member) => {
        const selected = member.email === selectedMemberEmail;
        return (
          <Link
            key={`${teamName}-${member.email}`}
            href={hrefWithLang(`/?team=${encodeURIComponent(teamName)}&member=${encodeURIComponent(member.email)}`, lang)}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-1.5 text-xs hover:bg-slate-50",
              selected && "bg-blue-50 text-slate-950"
            )}
          >
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500">
              <UserRound className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium">{member.displayName}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{member.email}</span>
            </span>
          </Link>
        );
      })}
    </div>
  );
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
