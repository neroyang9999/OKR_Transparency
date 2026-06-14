import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { OkrRecordCard } from "@/components/okr-record-card";
import { ConfidenceBadge, Score, TypeBadge } from "@/components/okr-status";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { readOkrSnapshot } from "@/lib/okr/store";
import { findOkrLineage } from "@/lib/okr/tree";

export default async function OkrDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, snapshot] = await Promise.all([params, readOkrSnapshot()]);
  const lineage = findOkrLineage(snapshot.records, decodeURIComponent(id));

  if (!lineage) {
    return (
      <AppShell active="">
        <div className="rounded-lg border border-border bg-white p-8 text-center text-sm text-muted-foreground">OKR not found.</div>
      </AppShell>
    );
  }

  const { current, ancestors, descendants } = lineage;

  return (
    <AppShell active="">
      <Link href="/map" className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950">
        <ArrowLeft className="h-4 w-4" />
        Back to map
      </Link>

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <section>
          <div className="rounded-lg border border-border bg-white p-5 shadow-subtle">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{current.okr_id}</Badge>
              <Badge tone={current.level === "Engineering" ? "blue" : "gray"}>{current.level}</Badge>
              <Badge>{current.team}</Badge>
              <TypeBadge value={current.type} />
              <ConfidenceBadge value={current.confidence} />
            </div>
            <h1 className="mt-4 text-2xl font-semibold leading-8 text-slate-950">{current.kr || current.objective}</h1>
            {current.kr && <p className="mt-3 text-sm leading-6 text-muted-foreground">{current.objective}</p>}
            <div className="mt-4 grid gap-3 text-sm md:grid-cols-4">
              <Meta label="Owner" value={current.owner} />
              <Meta label="Score" value={<Score value={current.score} />} />
              <Meta label="Updated" value={current.last_update} />
              <Meta label="Parent" value={current.parent_id || "Root"} />
            </div>
            <a
              href={current.source_doc_url}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Source doc
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <DetailBox title="Baseline" value={current.baseline} />
            <DetailBox title="Target" value={current.target} />
            <DetailBox title="Actual" value={current.actual || "Not updated"} />
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <DetailBox title="Dependencies" value={current.dependencies || "None listed"} />
            <DetailBox title="Risks" value={current.risks || "None listed"} />
            <DetailBox title="Decisions Needed" value={current.decisions_needed || "None listed"} />
          </div>
        </section>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <div className="text-sm font-semibold">Alignment Path</div>
            </CardHeader>
            <CardContent className="space-y-2">
              {ancestors.length === 0 && <div className="text-sm text-muted-foreground">This is a root OKR.</div>}
              {ancestors.map((record) => (
                <Link key={record.okr_id} href={`/okr/${encodeURIComponent(record.okr_id)}`} className="block rounded-md border border-border p-2 text-xs hover:bg-slate-50">
                  <div className="font-semibold text-slate-800">{record.okr_id}</div>
                  <div className="mt-1 text-muted-foreground">{record.kr || record.objective}</div>
                </Link>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="text-sm font-semibold">Aligned Children</div>
            </CardHeader>
            <CardContent className="space-y-2">
              {descendants.length === 0 && <div className="text-sm text-muted-foreground">No downstream OKRs yet.</div>}
              {descendants.slice(0, 5).map((record) => <OkrRecordCard key={record.okr_id} record={record} compact />)}
            </CardContent>
          </Card>
        </aside>
      </div>
    </AppShell>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-slate-50 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-medium text-slate-900">{value}</div>
    </div>
  );
}

function DetailBox({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardHeader>
        <div className="text-sm font-semibold">{title}</div>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-6 text-slate-700">{value}</p>
      </CardContent>
    </Card>
  );
}
