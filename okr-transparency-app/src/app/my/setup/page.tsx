import Link from "next/link";
import { ArrowLeft, ArrowRight, BriefcaseBusiness, ShieldCheck, Target, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { LoginPanel } from "@/components/login-panel";
import { Badge } from "@/components/ui/badge";
import { buildMyKrEntryTeams, type MyKrEntryTeam } from "@/lib/action-center-entry";
import { getPageAccess } from "@/lib/admin/page-access";
import { hrefWithLang, normalizeLang, type Lang } from "@/lib/i18n";

export default async function MyKrSetupPage({
  searchParams
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const [query, pageAccess] = await Promise.all([searchParams, getPageAccess()]);
  const lang = normalizeLang(query.lang ?? pageAccess.adminConfig.settings.defaultLanguage);
  if (!pageAccess.access) {
    return (
      <AppShell active="myActions" hideNavigation>
        <LoginPanel variant={pageAccess.sessionUser ? "denied" : "login"} email={pageAccess.sessionUser?.email} />
      </AppShell>
    );
  }

  const { access, adminConfig } = pageAccess;
  const copy = copies[lang];
  const periodId = adminConfig.defaultPeriodId;
  const period = adminConfig.periods.find((item) => item.id === periodId);
  const teams = buildMyKrEntryTeams(adminConfig, access);
  const periodLocked = period?.status !== "active";

  return (
    <AppShell active="myActions">
      <Link href={hrefWithLang("/my", lang)} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-950">
        <ArrowLeft className="h-4 w-4" />{copy.back}
      </Link>

      <section className="mt-4 rounded-xl border border-blue-100 bg-gradient-to-br from-white via-white to-blue-50 px-5 py-5 shadow-subtle md:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-blue-700">
              <BriefcaseBusiness className="h-4 w-4" />{copy.eyebrow}
            </div>
            <h1 className="mt-2 text-2xl font-semibold text-slate-950">{copy.title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{copy.subtitle}</p>
          </div>
          <Badge tone="blue">{period?.shortLabel ?? periodId}</Badge>
        </div>
      </section>

      <div className="mt-5 flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-subtle">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
        <p>{copy.securityNote}</p>
      </div>

      <section className="mt-5 rounded-lg border border-border bg-white shadow-subtle">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-semibold text-slate-950">{copy.chooseTeam}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{copy.chooseTeamDescription}</p>
        </div>

        {periodLocked ? (
          <EmptyState title={copy.periodLocked} description={copy.periodLockedDescription} />
        ) : teams.length === 0 ? (
          <EmptyState title={copy.noTeam} description={copy.noTeamDescription} />
        ) : (
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {teams.map((team) => (
              <TeamEntryCard key={team.name} team={team} accessEmail={access.email} periodId={periodId} lang={lang} />
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}

function TeamEntryCard({ team, accessEmail, periodId, lang }: {
  team: MyKrEntryTeam;
  accessEmail: string;
  periodId: string;
  lang: Lang;
}) {
  const copy = copies[lang];
  const personal = team.scope === "personal";
  return (
    <article className="flex min-h-40 flex-col rounded-lg border border-border bg-slate-50/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className={`grid h-10 w-10 place-items-center rounded-md ${personal ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"}`}>
          {personal ? <Target className="h-5 w-5" /> : <Users className="h-5 w-5" />}
        </div>
        <Badge tone={personal ? "blue" : "gray"}>{personal ? copy.personalScope : copy.teamScope}</Badge>
      </div>
      <h3 className="mt-3 font-semibold text-slate-950">{team.name}</h3>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {personal ? copy.personalDescription : copy.teamDescription}
      </p>
      <Link
        href={editorHref(team, periodId, accessEmail, lang)}
        className="mt-auto inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-slate-950 px-3 text-sm font-medium text-white hover:bg-slate-800"
      >
        {personal ? copy.fillMyKr : copy.editTeamKr}<ArrowRight className="h-4 w-4" />
      </Link>
    </article>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="px-5 py-12 text-center">
      <div className="font-semibold text-slate-950">{title}</div>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function editorHref(team: MyKrEntryTeam, periodId: string, accessEmail: string, lang: Lang) {
  const params = new URLSearchParams({ team: team.name, period: periodId, mode: "edit" });
  if (team.scope === "personal") params.set("member", accessEmail);
  return hrefWithLang(`/?${params.toString()}`, lang);
}

const copies = {
  zh: {
    back: "返回我的行动",
    eyebrow: "KR 填写入口",
    title: "填写我的 KR",
    subtitle: "选择你要填写的团队，系统会把你带到对应的 KR 编辑界面。",
    securityNote: "这里只展示你有编辑权限的团队。个人入口会锁定为你的账号，避免误改或认领他人的 KR。",
    chooseTeam: "选择团队",
    chooseTeamDescription: "优先展示你本人所属的团队；管理角色还可以进入其管理范围内的团队编辑器。",
    personalScope: "我的团队",
    teamScope: "管理范围",
    personalDescription: "进入仅属于你的 KR 编辑范围。",
    teamDescription: "进入该团队的完整 OKR 编辑范围。",
    fillMyKr: "填写我的 KR",
    editTeamKr: "编辑团队 KR",
    periodLocked: "当前周期不可编辑",
    periodLockedDescription: "请切换到活动周期后再填写 KR。",
    noTeam: "没有可填写的团队",
    noTeamDescription: "请联系管理员先把你的账号加入对应团队。"
  },
  en: {
    back: "Back to My Actions",
    eyebrow: "KR entry",
    title: "Add my KRs",
    subtitle: "Choose a team to open the corresponding KR editor.",
    securityNote: "Only teams you can edit are shown. Personal entry is locked to your account to avoid changing or claiming someone else's KRs.",
    chooseTeam: "Choose a team",
    chooseTeamDescription: "Your assigned teams appear first; management roles can also open team editors within their scope.",
    personalScope: "My team",
    teamScope: "Managed scope",
    personalDescription: "Open the KR editing scope assigned only to you.",
    teamDescription: "Open the full OKR editor for this team.",
    fillMyKr: "Add my KRs",
    editTeamKr: "Edit team KRs",
    periodLocked: "The active period is not editable",
    periodLockedDescription: "Switch to an active period before adding KRs.",
    noTeam: "No editable teams",
    noTeamDescription: "Ask an administrator to add your account to the appropriate team first."
  }
} as const;
