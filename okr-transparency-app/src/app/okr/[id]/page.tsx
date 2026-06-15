import { redirect } from "next/navigation";
import { hrefWithLang, normalizeLang } from "@/lib/i18n";
import { readOkrSnapshot } from "@/lib/okr/store";

export default async function OkrDetailRedirectPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const [{ id }, query, snapshot] = await Promise.all([params, searchParams, readOkrSnapshot()]);
  const lang = normalizeLang(query.lang);
  const record = snapshot.records.find((item) => item.okr_id === decodeURIComponent(id));

  if (!record) redirect(hrefWithLang("/teams", lang));

  redirect(hrefWithLang(`/teams?team=${encodeURIComponent(record.team)}`, lang));
}
