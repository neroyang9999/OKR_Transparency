import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { OkrRecordCard } from "@/components/okr-record-card";
import { Badge } from "@/components/ui/badge";
import { getOkrTreeResponse } from "@/lib/okr/store";

export default async function TeamsPage({
  searchParams
}: {
  searchParams: Promise<{ team?: string }>;
}) {
  const [{ team }, data] = await Promise.all([searchParams, getOkrTreeResponse()]);
  const selectedTeam = team ?? "All";
  const records = selectedTeam === "All" ? data.records : data.records.filter((record) => record.team === selectedTeam);

  return (
    <AppShell active="Teams">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-slate-950">Team View</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          按团队查看 Team-level OKR，以及它们对齐到 Engineering 顶层目标的状态。
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <TeamFilter label="All" selected={selectedTeam === "All"} />
        {data.stats.teams.map((teamName) => (
          <TeamFilter key={teamName} label={teamName} selected={selectedTeam === teamName} />
        ))}
      </div>

      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{records.length} records</div>
        <Badge tone="gray">{selectedTeam}</Badge>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        {records.map((record) => <OkrRecordCard key={record.okr_id} record={record} />)}
      </div>
    </AppShell>
  );
}

function TeamFilter({ label, selected }: { label: string; selected: boolean }) {
  const href = label === "All" ? "/teams" : `/teams?team=${encodeURIComponent(label)}`;
  return (
    <Link
      href={href}
      className={selected
        ? "rounded-md bg-slate-950 px-3 py-1.5 text-sm font-medium text-white"
        : "rounded-md border border-border bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"}
    >
      {label}
    </Link>
  );
}
