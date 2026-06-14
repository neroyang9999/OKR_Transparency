import { AppShell } from "@/components/app-shell";
import { OkrMap } from "@/components/okr-map";
import { getOkrTreeResponse } from "@/lib/okr/store";
import { normalizeLang, t } from "@/lib/i18n";

export default async function MapPage({
  searchParams
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const [params, data] = await Promise.all([searchParams, getOkrTreeResponse()]);
  const lang = normalizeLang(params.lang);

  return (
    <AppShell active="okrMap">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-slate-950">{t(lang, "mapTitle")}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {t(lang, "mapSubtitle")}
        </p>
      </div>
      <OkrMap tree={data.tree} lang={lang} />
    </AppShell>
  );
}
