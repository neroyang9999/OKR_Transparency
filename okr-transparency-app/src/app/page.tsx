import Link from "next/link";
import {
  CircleDot,
  FileText,
  Users
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PeriodSwitcher } from "@/components/period-switcher";
import { TeamSidebar, type TeamNavItem } from "@/components/team-sidebar";
import { ConfidenceBadge, Score, TypeBadge } from "@/components/okr-status";
import { Badge } from "@/components/ui/badge";
import type { OkrRecord } from "@/lib/okr/types";
import { getOkrTreeResponse } from "@/lib/okr/store";
import { normalizePeriod } from "@/lib/periods";
import { cn } from "@/lib/utils";

const softwareChildTeams = [
  { name: "Application Team", owner: "Application Lead" },
  { name: "Integration Team", owner: "Integration Lead" },
  { name: "QA Team", owner: "QA Lead" },
  { name: "Platform Team", owner: "Platform Lead" },
  { name: "Algorithm Team", owner: "Algorithm Lead" },
  { name: "TPM Team", owner: "TPM Lead" }
];

const hardwareChildTeams = [
  { name: "Optics Team", owner: "Optics Lead" }
];

const teamNav: TeamNavItem[] = [
  {
    name: "Software",
    owner: "Software Lead",
    color: "bg-blue-500",
    children: softwareChildTeams
  },
  { name: "Hardware", owner: "Hardware Lead", color: "bg-emerald-500", children: hardwareChildTeams },
  { name: "Advanced Technology", owner: "Advanced Tech Lead", color: "bg-violet-500", children: [] },
  { name: "AP OPS", owner: "AP OPS Lead", color: "bg-amber-500", children: [] }
];

export default async function HomePage({
  searchParams
}: {
  searchParams: Promise<{ team?: string; period?: string }>;
}) {
  const [{ team, period }, data] = await Promise.all([searchParams, getOkrTreeResponse()]);
  const selectedTeam = normalizeTeam(team);
  const selectedPeriod = normalizePeriod(period);
  const selectedRecords = data.records.filter((record) => record.team === selectedTeam);
  const recordById = new Map(data.records.map((record) => [record.okr_id, record]));
  const rootObjectives = selectedRecords.filter((record) => {
    const parent = record.parent_id ? recordById.get(record.parent_id) : null;
    return !parent || parent.team !== selectedTeam;
  });
  const selectedNavItem = teamNav.find((item) => item.name === selectedTeam);
  const childTeamNames = new Set(selectedNavItem?.children.map((child) => child.name) ?? []);
  const childTeams = childTeamNames.size > 0
    ? data.records.filter((record) => childTeamNames.has(record.team) && isTeamRoot(record, recordById))
    : [];

  return (
    <AppShell active="Overview">
      <div className="grid min-h-[calc(100vh-104px)] gap-5 lg:grid-cols-[300px_1fr]">
        <TeamSidebar items={teamNav} selectedTeam={selectedTeam} />

        <section className="min-w-0">
          <div className="mb-4 flex flex-col gap-3 rounded-lg border border-border bg-white px-5 py-4 shadow-subtle md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <TeamAvatar name={selectedTeam} size="lg" />
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-semibold text-slate-950">{selectedTeam} OKR</h1>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span>2026 Q3</span>
                  <span>·</span>
                  <span>{selectedRecords.length} records</span>
                  <span>·</span>
                  <span>{data.meta.source} source</span>
                </div>
              </div>
            </div>
            <PeriodSwitcher selectedPeriod={selectedPeriod} selectedTeam={selectedTeam} />
          </div>

          {rootObjectives.length === 0 ? (
            <EmptyTeam />
          ) : (
            <div className="overflow-hidden rounded-lg border border-border bg-white shadow-subtle">
              {rootObjectives.map((objective, index) => (
                <ObjectiveBlock
                  key={objective.okr_id}
                  index={index}
                  objective={objective}
                  records={data.records}
                />
              ))}

              {childTeams.length > 0 && (
                <div className="border-t border-border bg-slate-50 px-6 py-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <Users className="h-4 w-4 text-blue-500" />
                    {selectedTeam} 下级团队
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {childTeams.map((child) => (
                      <Link
                        key={child.okr_id}
                        href={`/?team=${encodeURIComponent(child.team)}`}
                        className="rounded-md border border-border bg-white p-3 hover:border-blue-200 hover:bg-blue-50"
                      >
                        <div className="flex items-center gap-3">
                          <TeamAvatar name={child.team} />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-slate-900">{child.team}</div>
                            <div className="mt-1 truncate text-xs text-muted-foreground">{child.objective}</div>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function ObjectiveBlock({
  index,
  objective,
  records
}: {
  index: number;
  objective: OkrRecord;
  records: OkrRecord[];
}) {
  const children = records.filter((record) => record.parent_id === objective.okr_id);
  const progress = objective.score === null ? 0 : Math.round(objective.score * 100);

  return (
    <article className={cn("relative px-6 py-6", index > 0 && "border-t border-border")}>
      <div className="grid gap-4 md:grid-cols-[72px_1fr]">
        <div className="relative hidden md:block">
          <div className="absolute left-8 top-8 h-[calc(100%-32px)] w-px bg-slate-200" />
          <div className="relative z-10 grid h-12 w-12 place-items-center rounded-full bg-blue-500 text-lg font-semibold text-white shadow-sm">
            O{index + 1}
          </div>
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{objective.owner}</span>
            <TypeBadge value={objective.type} />
            <ConfidenceBadge value={objective.confidence} />
            <span>Score <Score value={objective.score} /></span>
          </div>
          <Link
            href={`/okr/${encodeURIComponent(objective.okr_id)}`}
            className="mt-2 block text-xl font-semibold leading-8 text-slate-950 hover:text-blue-700"
          >
            目标：{objective.objective}
          </Link>
          <div className="mt-3 h-2 max-w-3xl overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-blue-500" style={{ width: `${progress}%` }} />
          </div>

          <div className="mt-5 space-y-3 border-y border-border py-3">
            {children.filter((record) => record.kr).map((kr) => (
              <KRRow key={kr.okr_id} kr={kr} />
            ))}
          </div>

          <div className="mt-5 flex gap-3 rounded-md bg-slate-50 p-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-slate-500 shadow-subtle">
              <FileText className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900">进度记录</div>
              <div className="mt-1 text-sm leading-5 text-muted-foreground">
                {objective.risks || objective.decisions_needed || "当前没有高风险记录，等待下一次 check-in 更新。"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function KRRow({ kr }: { kr: OkrRecord }) {
  const progress = kr.score === null ? 0 : Math.round(kr.score * 100);
  const tone = kr.confidence === "Green" ? "bg-emerald-400" : kr.confidence === "Red" ? "bg-rose-400" : "bg-blue-400";

  return (
    <Link
      href={`/okr/${encodeURIComponent(kr.okr_id)}`}
      className="block rounded-md border border-transparent px-3 py-3 transition hover:border-blue-100 hover:bg-slate-50"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <CircleDot className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
          <span className="text-sm font-semibold leading-6 text-slate-900">{kr.kr}</span>
        </div>
        <Badge
          className="shrink-0"
          tone={kr.confidence === "Green" ? "green" : kr.confidence === "Red" ? "red" : "yellow"}
        >
          {progress}%
        </Badge>
      </div>
      <div className="mt-3 pl-7">
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div className={cn("h-full rounded-full", tone)} style={{ width: `${progress}%` }} />
        </div>
      </div>
    </Link>
  );
}

function TeamAvatar({ name, size = "sm" }: { name: string; size?: "sm" | "lg" }) {
  return (
    <span className={cn(
      "grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 font-semibold text-white",
      size === "lg" ? "h-12 w-12 text-base" : "h-8 w-8 text-xs"
    )}>
      {initials(name)}
    </span>
  );
}

function EmptyTeam() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-white p-10 text-center text-sm text-muted-foreground">
      当前团队还没有 OKR 数据。
    </div>
  );
}

function normalizeTeam(team?: string) {
  const allowed = new Set([
    "Software",
    ...softwareChildTeams.map((child) => child.name),
    "Hardware",
    ...hardwareChildTeams.map((child) => child.name),
    "Advanced Technology",
    "AP OPS"
  ]);
  return team && allowed.has(team) ? team : "Software";
}

function isTeamRoot(record: OkrRecord, recordById: Map<string, OkrRecord>) {
  const parent = record.parent_id ? recordById.get(record.parent_id) : null;
  return !parent || parent.team !== record.team;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
