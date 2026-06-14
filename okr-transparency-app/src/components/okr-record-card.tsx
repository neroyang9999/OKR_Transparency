import Link from "next/link";
import { ArrowUpRight, CircleAlert, GitBranch } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfidenceBadge, Score, TypeBadge } from "@/components/okr-status";
import { hrefWithLang, t, translateText, type Lang } from "@/lib/i18n";
import type { OkrRecord } from "@/lib/okr/types";

export function OkrRecordCard({ record, compact = false, lang = "zh" }: { record: OkrRecord; compact?: boolean; lang?: Lang }) {
  return (
    <Card className="transition hover:border-slate-300 hover:shadow-sm">
      <CardContent className={compact ? "p-3" : "p-4"}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{record.okr_id}</Badge>
          <Badge tone={record.level === "Engineering" ? "blue" : "gray"}>{record.level}</Badge>
          <Badge tone="gray">{record.team}</Badge>
          <TypeBadge value={record.type} />
          <ConfidenceBadge value={record.confidence} />
        </div>
        <Link href={hrefWithLang(`/okr/${encodeURIComponent(record.okr_id)}`, lang)} className="group mt-3 block">
          <h3 className="text-sm font-semibold leading-5 text-slate-950 group-hover:text-blue-700">
            {translateText(record.kr || record.objective, lang)}
          </h3>
          {record.kr && (
            <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">{translateText(record.objective, lang)}</p>
          )}
        </Link>
        <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-3">
          <div>
            <span className="text-muted-foreground">{t(lang, "owner")}</span>
            <div className="mt-0.5 font-medium text-slate-800">{record.owner}</div>
          </div>
          <div>
            <span className="text-muted-foreground">{t(lang, "score")}</span>
            <div className="mt-0.5 font-medium text-slate-800"><Score value={record.score} /></div>
          </div>
          <div>
            <span className="text-muted-foreground">{t(lang, "updated")}</span>
            <div className="mt-0.5 font-medium text-slate-800">{record.last_update}</div>
          </div>
        </div>
        {!compact && (record.dependencies || record.risks || record.decisions_needed) && (
          <div className="mt-3 grid gap-2 text-xs md:grid-cols-3">
            {record.dependencies && <InfoLine icon={<GitBranch className="h-3.5 w-3.5" />} label={t(lang, "dependencies")} text={translateText(record.dependencies, lang)} />}
            {record.risks && <InfoLine icon={<CircleAlert className="h-3.5 w-3.5" />} label={t(lang, "risks")} text={translateText(record.risks, lang)} />}
            {record.decisions_needed && <InfoLine icon={<ArrowUpRight className="h-3.5 w-3.5" />} label={t(lang, "decisions")} text={translateText(record.decisions_needed, lang)} />}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function InfoLine({ icon, label, text }: { icon: React.ReactNode; label: string; text: string }) {
  return (
    <div className="rounded-md border border-border bg-slate-50 p-2">
      <div className="flex items-center gap-1.5 font-medium text-slate-700">
        {icon}
        {label}
      </div>
      <div className="mt-1 leading-4 text-muted-foreground">{text}</div>
    </div>
  );
}
