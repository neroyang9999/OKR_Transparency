import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ConfidenceBadge, Score } from "@/components/okr-status";
import { hrefWithLang, t, translateText, type Lang } from "@/lib/i18n";
import type { OkrNode } from "@/lib/okr/types";

export function OkrMap({ tree, lang }: { tree: OkrNode[]; lang: Lang }) {
  if (tree.length === 0) {
    return <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{t(lang, "noOkrData")}</div>;
  }

  return (
    <div className="space-y-4">
      {tree.map((objective) => (
        <section key={objective.okr_id} className="rounded-lg border border-border bg-white shadow-subtle">
          <div className="border-b border-border px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="blue">{objective.okr_id}</Badge>
              <ConfidenceBadge value={objective.confidence} />
              <span className="text-xs text-muted-foreground">{t(lang, "score")} <Score value={objective.score} /></span>
            </div>
            <Link href={hrefWithLang(`/okr/${encodeURIComponent(objective.okr_id)}`, lang)} className="mt-2 block text-base font-semibold text-slate-950 hover:text-blue-700">
              {translateText(objective.objective, lang)}
            </Link>
          </div>
          <div className="grid gap-3 p-4 lg:grid-cols-2">
            {objective.children.map((kr) => (
              <div key={kr.okr_id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{kr.okr_id}</Badge>
                  <ConfidenceBadge value={kr.confidence} />
                </div>
                <Link href={hrefWithLang(`/okr/${encodeURIComponent(kr.okr_id)}`, lang)} className="mt-2 block text-sm font-semibold leading-5 text-slate-900 hover:text-blue-700">
                  {translateText(kr.kr || kr.objective, lang)}
                </Link>
                <div className="mt-3 space-y-2">
                  {kr.children.map((teamKr) => (
                    <Link
                      key={teamKr.okr_id}
                      href={hrefWithLang(`/okr/${encodeURIComponent(teamKr.okr_id)}`, lang)}
                      className="flex min-h-12 items-start gap-2 rounded-md border border-border bg-white p-2 text-xs hover:border-blue-200 hover:bg-blue-50"
                    >
                      <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="font-semibold text-slate-800">{teamKr.team}</span>
                        <span className="mx-1 text-muted-foreground">·</span>
                        <span className="text-slate-700">{translateText(teamKr.kr, lang)}</span>
                      </span>
                      <ConfidenceBadge value={teamKr.confidence} />
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
