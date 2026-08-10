"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CalendarRange,
  CheckCircle2,
  Download,
  GitCompare,
  History,
  Lock,
  LogOut,
  MessageSquareText,
  Plus,
  RotateCcw,
  Save,
  Search,
  Settings,
  Shield,
  Trash2,
  UserPlus,
  Users,
  X
} from "lucide-react";
import { useAppIdentity } from "@/components/auth-provider";
import type { AdminConfig, AdminEvent, AdminPeriod, AdminRole, AdminTeam, AdminUser } from "@/lib/admin/config";
import { getAdminRuntimeSummary, type VersionRecordChange } from "@/lib/admin/dashboard";
import type { UserFeedback } from "@/lib/feedback";
import type { SnapshotVersion } from "@/lib/okr/snapshot-versions";
import type { OkrRecord, OkrTreeResponse } from "@/lib/okr/types";
import { cn } from "@/lib/utils";

type TabId = "status" | "periods" | "organization" | "feedback" | "recovery";
type SystemInfo = { appVersion: string; storageMode: "file" | "firestore" };
type VersionDiff = {
  changes: VersionRecordChange[];
  restoreCount: number;
  removeCount: number;
  changeCount: number;
};

const tabs: Array<{ id: TabId; label: string; description: string; icon: typeof Activity }> = [
  { id: "status", label: "运行状态", description: "查看当前周期和待处理事项", icon: Activity },
  { id: "periods", label: "周期管理", description: "创建、启用和锁定周期", icon: CalendarRange },
  { id: "organization", label: "组织与权限", description: "维护团队、成员和有效权限", icon: Users },
  { id: "feedback", label: "用户反馈", description: "查看用户提交的问题和建议", icon: MessageSquareText },
  { id: "recovery", label: "审计与恢复", description: "追踪变更、比较版本和回滚", icon: History }
];

export function AdminConsole() {
  const { data: session } = useSession();
  const identity = useAppIdentity();
  const sessionEmail = identity.mode === "iap" ? identity.email : session?.user?.email;
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState("");
  const [loginError, setLoginError] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("status");
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [savedConfig, setSavedConfig] = useState<AdminConfig | null>(null);
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [versions, setVersions] = useState<SnapshotVersion[]>([]);
  const [records, setRecords] = useState<OkrRecord[]>([]);
  const [feedback, setFeedback] = useState<UserFeedback[]>([]);
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const showEmergencyToken = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ENABLE_ADMIN_TOKEN_LOGIN === "true";
  const dirty = Boolean(config && savedConfig && JSON.stringify(config) !== JSON.stringify(savedConfig));

  const loadAdminData = useCallback(async () => {
    const [configResponse, eventsResponse, versionsResponse, okrsResponse, feedbackResponse] = await Promise.all([
      fetch("/api/admin/config"),
      fetch("/api/admin/events"),
      fetch("/api/admin/versions"),
      fetch("/api/okrs"),
      fetch("/api/admin/feedback")
    ]);
    if (configResponse.ok) {
      const body = await configResponse.json() as { config: AdminConfig; system: SystemInfo };
      setConfig(body.config);
      setSavedConfig(structuredClone(body.config));
      setSystem(body.system);
    }
    if (eventsResponse.ok) {
      const body = await eventsResponse.json() as { events: AdminEvent[] };
      setEvents(body.events);
    }
    if (versionsResponse.ok) {
      const body = await versionsResponse.json() as { versions: SnapshotVersion[] };
      setVersions(body.versions);
    }
    if (okrsResponse.ok) {
      const body = await okrsResponse.json() as OkrTreeResponse;
      setRecords(body.records);
    }
    if (feedbackResponse.ok) {
      const body = await feedbackResponse.json() as { feedback: UserFeedback[] };
      setFeedback(body.feedback);
    }
  }, []);

  useEffect(() => {
    async function boot() {
      setLoading(true);
      const adminSession = await fetch("/api/admin/session").then((response) => response.json()) as { authenticated: boolean };
      setAuthenticated(adminSession.authenticated);
      if (adminSession.authenticated) await loadAdminData();
      setLoading(false);
    }
    void boot();
  }, [loadAdminData]);

  useEffect(() => {
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirty) return;
      event.preventDefault();
    }
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty]);

  async function login() {
    setBusy(true);
    setLoginError("");
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token })
    });
    setBusy(false);
    if (!response.ok) {
      setLoginError("Token 不正确");
      return;
    }
    setToken("");
    setAuthenticated(true);
    await loadAdminData();
  }

  async function logout() {
    if (identity.mode === "iap") return;
    if (dirty && !window.confirm("仍有未保存的修改，确认退出后台？")) return;
    await fetch("/api/admin/logout", { method: "POST" });
    await signOut({ redirect: false });
    setAuthenticated(false);
    setConfig(null);
    setSavedConfig(null);
    setEvents([]);
    setVersions([]);
    setRecords([]);
    setFeedback([]);
  }

  async function saveConfig() {
    if (!config || !savedConfig || !dirty) return;
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/admin/config", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ config, expectedRevision: savedConfig.revision })
    });
    const body = await response.json().catch(() => ({})) as { config?: AdminConfig; error?: string; errors?: string[]; code?: string };
    setBusy(false);
    if (!response.ok || !body.config) {
      setMessage({
        tone: "error",
        text: body.errors?.length ? body.errors.join("；") : body.error ?? "配置保存失败"
      });
      return;
    }
    setConfig(body.config);
    setSavedConfig(structuredClone(body.config));
    setMessage({ tone: "success", text: `配置已保存 · revision ${body.config.revision}` });
    await loadAdminData();
  }

  async function rollback(version: SnapshotVersion) {
    if (!window.confirm(`确认将 ${version.team} / ${version.periodId} 回滚到 ${formatDate(version.createdAt)}？其他团队不会受影响。`)) return;
    setBusy(true);
    const response = await fetch("/api/admin/rollback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ versionId: version.id })
    });
    const body = await response.json().catch(() => ({})) as { error?: string };
    setBusy(false);
    setMessage(response.ok
      ? { tone: "success", text: `已回滚 ${version.team} / ${version.periodId}` }
      : { tone: "error", text: `回滚失败：${body.error ?? "没有可用版本"}` });
    if (response.ok) await loadAdminData();
  }

  if (loading) return <AdminFrame><LoadingCard /></AdminFrame>;

  if (!authenticated || !config || !savedConfig) {
    return <AdminFrame><LoginPanel sessionEmail={sessionEmail} iapMode={identity.mode === "iap"} token={token} setToken={setToken} busy={busy} error={loginError} showEmergencyToken={showEmergencyToken} onLogin={login} /></AdminFrame>;
  }

  const currentTab = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

  return (
    <AdminFrame>
      <div className="mx-auto max-w-[1440px]">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-white px-5 py-4 shadow-subtle">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-slate-950">OKR 运行控制台</h1>
              <StatusBadge tone="neutral">v{system?.appVersion ?? "-"}</StatusBadge>
              <StatusBadge tone={system?.storageMode === "firestore" ? "green" : "amber"}>{system?.storageMode === "firestore" ? "Firestore" : "本地 JSON"}</StatusBadge>
              <StatusBadge tone="blue">{periodLabel(config, config.defaultPeriodId)}</StatusBadge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">确认运行状态、维护访问权限，并在出现问题时安全恢复。</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setSettingsOpen(true)} className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <Settings className="h-4 w-4" />高级设置
            </button>
            {identity.mode === "iap" ? (
              <span className="inline-flex h-9 max-w-64 items-center rounded-md px-3 text-sm text-slate-500" title={sessionEmail ?? undefined}>
                <span className="truncate">{sessionEmail ?? "公司账号已认证"}</span>
              </span>
            ) : (
              <button type="button" onClick={() => void logout()} className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-900">
                <LogOut className="h-4 w-4" />退出
              </button>
            )}
          </div>
        </header>

        {dirty && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="text-sm font-medium text-amber-900">有未保存的配置修改</div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => { setConfig(structuredClone(savedConfig)); setMessage(null); }} className="h-8 rounded-md px-3 text-sm text-amber-800 hover:bg-amber-100">放弃修改</button>
              <button type="button" onClick={() => void saveConfig()} disabled={busy} className="inline-flex h-8 items-center gap-2 rounded-md bg-amber-900 px-3 text-sm font-medium text-white disabled:opacity-50"><Save className="h-4 w-4" />保存修改</button>
            </div>
          </div>
        )}

        {message && <MessageBanner message={message} onClose={() => setMessage(null)} />}

        <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="h-fit rounded-xl border border-border bg-white p-3 shadow-subtle lg:sticky lg:top-5">
            <nav className="space-y-1">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={cn("w-full rounded-lg px-3 py-3 text-left transition-colors", activeTab === tab.id ? "bg-slate-950 text-white" : "text-slate-700 hover:bg-slate-50")}>
                    <span className="flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4" />{tab.label}</span>
                    <span className={cn("mt-1 block pl-6 text-xs leading-5", activeTab === tab.id ? "text-slate-300" : "text-slate-500")}>{tab.description}</span>
                  </button>
                );
              })}
            </nav>
          </aside>

          <main className="min-w-0">
            <div className="mb-4">
              <h2 className="text-2xl font-semibold text-slate-950">{currentTab.label}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{currentTab.description}</p>
            </div>
            {activeTab === "status" && <RuntimeStatus config={config} events={events} versions={versions} records={records} onNavigate={setActiveTab} />}
            {activeTab === "periods" && <PeriodManagement config={config} setConfig={setConfig} />}
            {activeTab === "organization" && <OrganizationAccess config={config} setConfig={setConfig} />}
            {activeTab === "feedback" && <FeedbackReview feedback={feedback} onFeedbackChange={setFeedback} />}
            {activeTab === "recovery" && <RecoveryAudit config={config} events={events} versions={versions} busy={busy} onRollback={rollback} />}
          </main>
        </div>
      </div>

      {settingsOpen && <SettingsDrawer config={config} setConfig={setConfig} system={system} onClose={() => setSettingsOpen(false)} />}
    </AdminFrame>
  );
}

function FeedbackReview({ feedback, onFeedbackChange }: { feedback: UserFeedback[]; onFeedbackChange: (feedback: UserFeedback[]) => void }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "completed">("open");
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const openCount = feedback.filter((item) => item.status === "open").length;
  const completedCount = feedback.length - openCount;
  const visibleFeedback = feedback.filter((item) => {
    const matchesStatus = statusFilter === "all" || item.status === statusFilter;
    const matchesQuery = !normalizedQuery || [item.message, item.userName, item.userEmail, item.page, item.completedBy ?? ""]
      .some((value) => value.toLowerCase().includes(normalizedQuery));
    return matchesStatus && matchesQuery;
  });

  async function updateStatus(item: UserFeedback, status: "open" | "completed") {
    setBusyId(item.id);
    setError("");
    try {
      const response = await fetch(`/api/admin/feedback/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status })
      });
      const body = await response.json() as { feedback?: UserFeedback; error?: string };
      if (!response.ok || !body.feedback) throw new Error(body.error || "更新反馈失败");
      onFeedbackChange(feedback.map((current) => current.id === item.id ? body.feedback! : current));
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "更新反馈失败");
    } finally {
      setBusyId("");
    }
  }

  async function removeFeedback(item: UserFeedback) {
    if (!window.confirm("删除后无法恢复，确认删除这条反馈？")) return;
    setBusyId(item.id);
    setError("");
    try {
      const response = await fetch(`/api/admin/feedback/${encodeURIComponent(item.id)}`, { method: "DELETE" });
      const body = await response.json() as { deleted?: boolean; error?: string };
      if (!response.ok || !body.deleted) throw new Error(body.error || "删除反馈失败");
      onFeedbackChange(feedback.filter((current) => current.id !== item.id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除反馈失败");
    } finally {
      setBusyId("");
    }
  }

  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-slate-950">反馈记录</h3>
          <p className="mt-1 text-sm text-muted-foreground">{openCount} 条待处理，{completedCount} 条已完成。</p>
        </div>
        <label className="relative block w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索内容、用户或页面" className="h-9 w-full rounded-md border border-border pl-9 pr-3 text-sm outline-none focus:border-blue-400" />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-2" aria-label="反馈状态筛选">
        {([
          ["open", "待处理", openCount],
          ["completed", "已完成", completedCount],
          ["all", "全部", feedback.length]
        ] as const).map(([value, label, count]) => (
          <button
            key={value}
            type="button"
            onClick={() => setStatusFilter(value)}
            className={cn(
              "inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium",
              statusFilter === value ? "border-slate-950 bg-slate-950 text-white" : "border-border bg-white text-slate-600 hover:bg-slate-50"
            )}
          >
            {label}<span className={cn("ml-2 text-xs", statusFilter === value ? "text-slate-300" : "text-slate-400")}>{count}</span>
          </button>
        ))}
      </div>

      {error && <div role="alert" className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

      <div className="mt-4 divide-y divide-border overflow-hidden rounded-lg border border-border">
        {visibleFeedback.map((item) => {
          const pageIsSafe = item.page.startsWith("/") && !item.page.startsWith("//");
          return (
            <article key={item.id} className={cn("px-4 py-4", item.status === "completed" && "bg-slate-50/70")}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-3">
                  <UserAvatar name={item.userName || item.userEmail} enabled />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-900">{item.userName || item.userEmail}</div>
                    <div className="truncate text-xs text-slate-500">{item.userEmail}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn("rounded-full px-2 py-1 text-xs font-medium", item.status === "completed" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800")}>
                    {item.status === "completed" ? "已完成" : "待处理"}
                  </span>
                  <time className="text-xs text-slate-500" dateTime={item.createdAt}>{formatDate(item.createdAt)}</time>
                </div>
              </div>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">{item.message}</p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-slate-500">
                  <div>来源页面：{pageIsSafe ? <a href={item.page} className="text-blue-700 hover:underline">{item.page}</a> : item.page}</div>
                  {item.status === "completed" && item.completedAt && (
                    <div className="mt-1">{item.completedBy || "管理员"} · {formatDate(item.completedAt)} 完成</div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => void updateStatus(item, item.status === "completed" ? "open" : "completed")}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {item.status === "completed" ? <RotateCcw className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    {item.status === "completed" ? "重新打开" : "标记完成"}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => void removeFeedback(item)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />删除
                  </button>
                </div>
              </div>
            </article>
          );
        })}
        {visibleFeedback.length === 0 && <EmptyState text={feedback.length === 0 ? "还没有用户反馈" : statusFilter === "open" ? "当前没有待处理反馈" : "没有匹配的反馈"} />}
      </div>
    </Panel>
  );
}

function RuntimeStatus({ config, events, versions, records, onNavigate }: { config: AdminConfig; events: AdminEvent[]; versions: SnapshotVersion[]; records: OkrRecord[]; onNavigate: (tab: TabId) => void }) {
  const summary = useMemo(() => getAdminRuntimeSummary(config, events, records), [config, events, records]);
  const activePeriod = config.periods.find((period) => period.id === summary.activePeriodId);
  return (
    <div className="space-y-4">
      <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <Panel className="bg-slate-950 text-white">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-sm text-slate-300">当前运行周期</div>
              <div className="mt-2 text-3xl font-semibold">{activePeriod?.shortLabel ?? summary.activePeriodId}</div>
              <div className="mt-2 text-sm text-slate-300">{activePeriod?.label}</div>
            </div>
            <StatusBadge tone="green">进行中</StatusBadge>
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <RuntimeMetric label="团队发布" value={`${summary.publishedTeamCount}/${summary.enabledTeamCount}`} />
            <RuntimeMetric label="最近发布" value={summary.lastPublishAt ? formatDate(summary.lastPublishAt) : "暂无"} />
            <RuntimeMetric label="可恢复版本" value={String(versions.length)} />
          </div>
        </Panel>
        <Panel>
          <div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-600" /><h3 className="font-semibold text-slate-950">数据健康</h3></div>
          <div className="mt-4 space-y-3">
            <HealthRow label="缺少负责人" value={summary.quality.missingOwnerCount} />
            <HealthRow label="超过 14 天未更新" value={summary.quality.staleCount} />
          </div>
        </Panel>
      </section>

      <Panel>
        <div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold text-slate-950">待处理事项</h3><p className="mt-1 text-sm text-muted-foreground">只显示需要管理员采取行动的问题。</p></div><StatusBadge tone={summary.attention.length ? "amber" : "green"}>{summary.attention.length ? `${summary.attention.length} 项` : "运行正常"}</StatusBadge></div>
        <div className="mt-4 divide-y divide-border rounded-lg border border-border">
          {summary.attention.length === 0 ? (
            <div className="flex items-center gap-3 px-4 py-5 text-sm text-slate-600"><CheckCircle2 className="h-5 w-5 text-emerald-600" />当前没有需要管理员处理的问题。</div>
          ) : summary.attention.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 items-start gap-3"><AlertTriangle className={cn("mt-0.5 h-4 w-4 shrink-0", item.level === "critical" ? "text-rose-600" : "text-amber-600")} /><div><div className="text-sm font-medium text-slate-900">{item.title}</div><div className="mt-1 text-xs text-slate-500">{item.description}</div></div></div>
              <button type="button" onClick={() => onNavigate(item.destination)} className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm font-medium text-blue-700 hover:bg-blue-50">处理<ArrowRight className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      </Panel>

      <Panel>
        <div className="flex items-center justify-between"><h3 className="font-semibold text-slate-950">最近变更</h3><button type="button" onClick={() => onNavigate("recovery")} className="text-sm font-medium text-blue-700 hover:underline">查看全部</button></div>
        <div className="mt-3 divide-y divide-border">
          {events.slice(0, 5).map((event) => <EventRow key={event.id} event={event} />)}
          {events.length === 0 && <EmptyState text="暂无操作记录" />}
        </div>
      </Panel>
    </div>
  );
}

function PeriodManagement({ config, setConfig }: AdminSectionProps) {
  function activatePeriod(period: AdminPeriod) {
    if (!window.confirm(`确认启用 ${period.shortLabel}？当前周期将自动锁定。`)) return;
    setConfig({
      ...config,
      defaultPeriodId: period.id,
      periods: config.periods.map((item) => ({ ...item, status: item.id === period.id ? "active" : item.status === "active" ? "locked" : item.status }))
    });
  }

  function setStatus(period: AdminPeriod, status: AdminPeriod["status"]) {
    if (period.status === "active") return;
    setConfig({ ...config, periods: config.periods.map((item) => item.id === period.id ? { ...item, status } : item) });
  }

  function addPeriod() {
    const id = `period-${Date.now().toString(36)}`;
    setConfig({ ...config, periods: [{ id, label: "新 OKR 周期", labelEn: "New OKR period", shortLabel: "New period", status: "planned" }, ...config.periods] });
  }

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold text-slate-950">周期状态</h3><p className="mt-1 text-sm text-muted-foreground">系统始终只有一个进行中的周期；旧周期锁定后不可编辑或发布。</p></div><button type="button" onClick={addPeriod} className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700"><Plus className="h-4 w-4" />创建周期</button></div>
      </Panel>
      <div className="space-y-3">
        {config.periods.map((period) => (
          <Panel key={period.id} className={period.status === "active" ? "border-blue-300 ring-1 ring-blue-100" : ""}>
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
              <TextField label="周期名称" value={period.label} onChange={(label) => updatePeriod(config, setConfig, period.id, { label })} />
              <TextField label="英文名称" value={period.labelEn} onChange={(labelEn) => updatePeriod(config, setConfig, period.id, { labelEn })} />
              <div className="flex items-center gap-2 lg:pb-0.5"><PeriodStatus status={period.status} /></div>
              <TextField label="短名称" value={period.shortLabel} onChange={(shortLabel) => updatePeriod(config, setConfig, period.id, { shortLabel })} />
              <div className="text-xs leading-5 text-slate-500">周期标识由系统自动维护；管理员只需要管理名称和运行状态。</div>
              <div className="flex flex-wrap justify-end gap-2">
                {period.status === "planned" && <button type="button" onClick={() => activatePeriod(period)} className="h-9 rounded-md bg-slate-950 px-3 text-sm font-medium text-white">设为当前周期</button>}
                {period.status === "planned" && <button type="button" onClick={() => setStatus(period, "locked")} className="h-9 rounded-md border border-border px-3 text-sm text-slate-700">锁定</button>}
                {period.status === "locked" && <button type="button" onClick={() => setStatus(period, "planned")} className="h-9 rounded-md border border-border px-3 text-sm text-slate-700">重新开放为计划</button>}
                {period.status === "active" && <span className="self-center text-xs text-slate-500">请先启用其他周期，再锁定当前周期。</span>}
              </div>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}

function OrganizationAccess({ config, setConfig }: AdminSectionProps) {
  const [mode, setMode] = useState<"teams" | "members">("teams");
  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border border-border bg-white p-1 shadow-subtle">
        <SegmentButton active={mode === "teams"} onClick={() => setMode("teams")}><Users className="h-4 w-4" />团队结构</SegmentButton>
        <SegmentButton active={mode === "members"} onClick={() => setMode("members")}><Shield className="h-4 w-4" />成员与权限</SegmentButton>
      </div>
      {mode === "teams" ? <TeamStructure config={config} setConfig={setConfig} /> : <MemberAccess config={config} setConfig={setConfig} />}
    </div>
  );
}

function TeamStructure({ config, setConfig }: AdminSectionProps) {
  const orderedTeams = useMemo(() => orderTeams(config.teams), [config.teams]);
  const [selectedId, setSelectedId] = useState(config.teams[0]?.id ?? "");
  const selected = config.teams.find((team) => team.id === selectedId) ?? config.teams[0];

  function addTeam() {
    const sequence = config.teams.length + 1;
    const team: AdminTeam = { id: `new-${Date.now().toString(36)}`, name: `New Team ${sequence}`, owner: "", parentTeam: "", color: "slate", enabled: true };
    setConfig({ ...config, teams: [...config.teams, team] });
    setSelectedId(team.id);
  }

  if (!selected) return <Panel><EmptyState text="暂无团队" /></Panel>;
  const isNew = selected.id.startsWith("new-");
  const ownerOptions = unique([selected.owner, ...config.users.filter((user) => user.enabled).map((user) => user.displayName)]).filter(Boolean);
  const parentOptions = config.teams.filter((team) => team.id !== selected.id && !isDescendant(config.teams, selected.name, team.name)).map((team) => team.name);

  return (
    <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      <Panel>
        <div className="flex items-center justify-between"><div><h3 className="font-semibold text-slate-950">团队层级</h3><p className="mt-1 text-xs text-slate-500">{config.teams.filter((team) => team.enabled).length} 个启用团队</p></div><button type="button" onClick={addTeam} className="grid h-8 w-8 place-items-center rounded-md border border-border text-slate-600 hover:bg-slate-50" aria-label="添加团队"><Plus className="h-4 w-4" /></button></div>
        <div className="mt-4 space-y-1">
          {orderedTeams.map(({ team, depth }) => (
            <button key={team.id} type="button" onClick={() => setSelectedId(team.id)} className={cn("flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm", selected.id === team.id ? "bg-slate-950 text-white" : "text-slate-700 hover:bg-slate-50")} style={{ paddingLeft: 12 + depth * 18 }}>
              <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", teamColorClass(team.color))} />
              <span className="min-w-0 flex-1 truncate">{team.name}</span>
              {!team.enabled && <span className="text-[10px] text-slate-400">停用</span>}
            </button>
          ))}
        </div>
      </Panel>

      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-semibold text-slate-950">{selected.name}</h3><p className="mt-1 text-sm text-muted-foreground">维护负责人、上级团队和展示状态。</p></div>{config.defaultTeam === selected.name ? <StatusBadge tone="blue">默认团队</StatusBadge> : <button type="button" onClick={() => setConfig({ ...config, defaultTeam: selected.name })} className="h-8 rounded-md border border-border px-3 text-xs font-medium text-slate-700">设为默认</button>}</div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <TextField label="团队名称" value={selected.name} disabled={!isNew} onChange={(name) => renameTeam(config, setConfig, selected.id, name)} hint={isNew ? "保存后名称将作为 OKR 团队标识。" : "现有团队名称关联已发布 OKR，不在后台直接重命名。"} />
          <SelectField label="负责人" value={selected.owner} options={ownerOptions} onChange={(owner) => updateTeam(config, setConfig, selected.id, { owner })} placeholder="选择负责人" />
          <SelectField label="上级团队" value={selected.parentTeam} options={parentOptions} onChange={(parentTeam) => updateTeam(config, setConfig, selected.id, { parentTeam })} placeholder="无上级团队" allowEmpty />
          <div><div className="text-xs font-medium text-slate-500">团队颜色</div><div className="mt-2 flex gap-2">{teamColors.map((color) => <button key={color} type="button" onClick={() => updateTeam(config, setConfig, selected.id, { color })} aria-label={`选择 ${color}`} className={cn("h-7 w-7 rounded-full ring-offset-2", teamColorClass(color), selected.color === color && "ring-2 ring-slate-950")} />)}</div></div>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <div><div className="text-sm font-medium text-slate-800">团队状态</div><div className="text-xs text-slate-500">停用后不再出现在编辑入口中，历史 OKR 保留。</div></div>
          <button type="button" onClick={() => updateTeam(config, setConfig, selected.id, { enabled: !selected.enabled })} className={cn("h-9 rounded-md px-3 text-sm font-medium", selected.enabled ? "border border-border text-slate-700" : "bg-emerald-600 text-white")}>{selected.enabled ? "停用团队" : "重新启用"}</button>
        </div>
      </Panel>
    </div>
  );
}

function MemberAccess({ config, setConfig }: AdminSectionProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(config.users.length > 0 ? 0 : null);
  const memberListRef = useRef<HTMLDivElement>(null);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleUsers = config.users.map((user, index) => ({ user, index })).filter(({ user }) => !normalizedQuery || [user.displayName, user.email, roleLabel(user.role), ...user.teams].join(" ").toLowerCase().includes(normalizedQuery));
  const selected = selectedIndex === null ? null : config.users[selectedIndex] ?? null;

  function addUser() {
    const user: AdminUser = { email: `new-user-${Date.now().toString(36)}@company.com`, displayName: "新成员", role: "user", teams: [config.defaultTeam], ownerAliases: [], enabled: true };
    setQuery("");
    setConfig({ ...config, users: [user, ...config.users] });
    setSelectedIndex(0);
    requestAnimationFrame(() => memberListRef.current?.scrollTo({ top: 0, behavior: "smooth" }));
  }

  function removeUser() {
    if (selectedIndex === null || !selected) return;
    if (selected.role === "super_admin" && selected.enabled && config.users.filter((user) => user.enabled && user.role === "super_admin").length <= 1) {
      window.alert("不能删除最后一名启用的系统管理员。请先授权另一名管理员。");
      return;
    }
    if (!window.confirm(`永久删除 ${selected.displayName || selected.email}？通常建议停用账号以保留审计关系。`)) return;
    setConfig({ ...config, users: config.users.filter((_, index) => index !== selectedIndex) });
    setSelectedIndex(null);
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
      <Panel>
        <div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold text-slate-950">成员</h3><p className="mt-1 text-xs text-slate-500">{config.users.filter((user) => user.enabled).length} / {config.users.length} 个账号启用</p></div><button type="button" onClick={addUser} className="inline-flex h-8 items-center gap-1 rounded-md bg-blue-600 px-2 text-xs font-medium text-white"><UserPlus className="h-4 w-4" />添加</button></div>
        <label className="relative mt-4 block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索姓名、邮箱、团队" className="h-9 w-full rounded-md border border-border pl-9 pr-3 text-sm outline-none focus:border-blue-400" /></label>
        <div ref={memberListRef} className="mt-3 max-h-[620px] space-y-1 overflow-y-auto">
          {visibleUsers.map(({ user, index }) => (
            <button key={`${user.email}-${index}`} type="button" onClick={() => setSelectedIndex(index)} className={cn("flex w-full items-center gap-3 rounded-md px-3 py-2 text-left", selectedIndex === index ? "bg-slate-950 text-white" : "hover:bg-slate-50")}>
              <UserAvatar name={user.displayName || user.email} enabled={user.enabled} />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{user.displayName}</span><span className={cn("block truncate text-xs", selectedIndex === index ? "text-slate-300" : "text-slate-500")}>{roleLabel(user.role)} · {user.teams.join("、") || "全部团队"}</span></span>
            </button>
          ))}
          {visibleUsers.length === 0 && <EmptyState text="没有匹配成员" />}
        </div>
      </Panel>

      {selected ? (
        <Panel>
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-semibold text-slate-950">成员权限</h3><p className="mt-1 text-sm text-muted-foreground">角色决定能力，团队决定作用范围。</p></div><StatusBadge tone={selected.enabled ? "green" : "neutral"}>{selected.enabled ? "已启用" : "已停用"}</StatusBadge></div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <TextField label="姓名" value={selected.displayName} onChange={(displayName) => updateUser(config, setConfig, selectedIndex!, { displayName })} />
            <TextField label="登录邮箱" value={selected.email} onChange={(email) => updateUser(config, setConfig, selectedIndex!, { email })} />
            <SelectField label="角色" value={selected.role} options={["super_admin", "team_leader", "user"]} optionLabel={(value) => roleLabel(value as AdminRole)} onChange={(role) => updateUser(config, setConfig, selectedIndex!, { role: role as AdminRole })} />
            <div><div className="text-xs font-medium text-slate-500">团队范围</div><div className="mt-2 flex flex-wrap gap-2">{config.teams.filter((team) => team.enabled).map((team) => { const checked = selected.teams.includes(team.name); return <button key={team.id} type="button" onClick={() => updateUser(config, setConfig, selectedIndex!, { teams: checked ? selected.teams.filter((name) => name !== team.name) : [...selected.teams, team.name] })} className={cn("rounded-full border px-3 py-1 text-xs", checked ? "border-blue-600 bg-blue-50 text-blue-700" : "border-border text-slate-600 hover:bg-slate-50")}>{team.name}</button>; })}</div></div>
          </div>
          <EffectiveAccess config={config} user={selected} />
          <details className="mt-5 rounded-lg border border-border p-4"><summary className="cursor-pointer text-sm font-medium text-slate-800">高级：Owner 匹配别名</summary><p className="mt-2 text-xs leading-5 text-slate-500">姓名和邮箱会自动加入匹配；仅在历史 OKR 使用其他 Owner 名称时补充。</p><input value={selected.ownerAliases.join(", ")} onChange={(event) => updateUser(config, setConfig, selectedIndex!, { ownerAliases: splitList(event.target.value) })} className="mt-3 h-9 w-full rounded-md border border-border px-3 text-sm outline-none focus:border-blue-400" /></details>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <button type="button" onClick={() => updateUser(config, setConfig, selectedIndex!, { enabled: !selected.enabled })} className={cn("h-9 rounded-md px-3 text-sm font-medium", selected.enabled ? "border border-border text-slate-700" : "bg-emerald-600 text-white")}>{selected.enabled ? "停用账号" : "重新启用"}</button>
            <button type="button" onClick={removeUser} className="h-9 rounded-md px-3 text-sm text-rose-600 hover:bg-rose-50">永久删除</button>
          </div>
        </Panel>
      ) : <Panel><EmptyState text="选择一个成员查看权限" /></Panel>}
    </div>
  );
}

function RecoveryAudit({ config, events, versions, busy, onRollback }: { config: AdminConfig; events: AdminEvent[]; versions: SnapshotVersion[]; busy: boolean; onRollback: (version: SnapshotVersion) => void }) {
  const [teamFilter, setTeamFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [eventFilter, setEventFilter] = useState("all");
  const [inspection, setInspection] = useState<{ version: SnapshotVersion; diff: VersionDiff } | null>(null);
  const [inspectBusy, setInspectBusy] = useState(false);
  const visibleVersions = versions.filter((version) => (teamFilter === "all" || version.team === teamFilter) && (periodFilter === "all" || version.periodId === periodFilter));
  const visibleEvents = events.filter((event) => eventFilter === "all" || event.type === eventFilter);

  async function inspectVersion(version: SnapshotVersion) {
    setInspectBusy(true);
    const response = await fetch(`/api/admin/versions/${encodeURIComponent(version.id)}`);
    const body = await response.json().catch(() => ({})) as { version?: SnapshotVersion; diff?: VersionDiff; error?: string };
    setInspectBusy(false);
    if (!response.ok || !body.version || !body.diff) {
      window.alert(body.error ?? "无法读取版本差异");
      return;
    }
    setInspection({ version: body.version, diff: body.diff });
  }

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold text-slate-950">版本恢复</h3><p className="mt-1 text-sm text-muted-foreground">先查看回滚会恢复、删除或修改哪些记录，再执行操作。</p></div>{config.settings.backupExportEnabled && <a href="/api/admin/backup" className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"><Download className="h-4 w-4" />导出完整备份</a>}</div>
        <div className="mt-4 flex flex-wrap gap-2"><FilterSelect value={teamFilter} onChange={setTeamFilter} options={["all", ...config.teams.map((team) => team.name)]} allLabel="全部团队" /><FilterSelect value={periodFilter} onChange={setPeriodFilter} options={["all", ...config.periods.map((period) => period.id)]} allLabel="全部周期" /></div>
        <div className="mt-4 overflow-hidden rounded-lg border border-border">
          {visibleVersions.slice(0, 30).map((version) => (
            <div key={version.id} className="grid items-center gap-3 border-t border-border px-4 py-3 text-sm first:border-t-0 md:grid-cols-[145px_160px_1fr_auto]">
              <span className="text-slate-500">{formatDate(version.createdAt)}</span><span className="font-medium text-slate-900">{version.team}</span><span className="text-slate-500">{periodLabel(config, version.periodId)} · {version.records.length} 条 · {version.actor}</span><button type="button" onClick={() => void inspectVersion(version)} disabled={inspectBusy} className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"><GitCompare className="h-4 w-4" />查看差异</button>
            </div>
          ))}
          {visibleVersions.length === 0 && <EmptyState text="当前筛选条件下没有可恢复版本" />}
        </div>
      </Panel>

      {inspection && <VersionInspection inspection={inspection} busy={busy} onClose={() => setInspection(null)} onRollback={() => onRollback(inspection.version)} />}

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold text-slate-950">操作记录</h3><p className="mt-1 text-sm text-muted-foreground">保留登录、配置、发布和回滚行为。</p></div><FilterSelect value={eventFilter} onChange={setEventFilter} options={["all", "config.update", "publish", "rollback", "login"]} allLabel="全部操作" /></div>
        <div className="mt-4 divide-y divide-border rounded-lg border border-border">{visibleEvents.slice(0, 50).map((event) => <EventRow key={event.id} event={event} />)}{visibleEvents.length === 0 && <EmptyState text="暂无操作记录" />}</div>
      </Panel>
    </div>
  );
}

function VersionInspection({ inspection, busy, onClose, onRollback }: { inspection: { version: SnapshotVersion; diff: VersionDiff }; busy: boolean; onClose: () => void; onRollback: () => void }) {
  const { version, diff } = inspection;
  return (
    <Panel className="border-blue-200 bg-blue-50/30">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-slate-950">回滚影响预览</h3><p className="mt-1 text-sm text-slate-600">{version.team} · {version.periodId} · {formatDate(version.createdAt)}</p></div><button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md hover:bg-white" aria-label="关闭"><X className="h-4 w-4" /></button></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3"><DiffMetric label="将恢复" value={diff.restoreCount} tone="green" /><DiffMetric label="将修改" value={diff.changeCount} tone="blue" /><DiffMetric label="将移除" value={diff.removeCount} tone="rose" /></div>
      <div className="mt-4 max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-white">
        {diff.changes.slice(0, 100).map((change) => <div key={`${change.kind}-${change.id}`} className="flex items-start gap-3 px-4 py-3 text-sm"><StatusBadge tone={change.kind === "remove" ? "rose" : change.kind === "restore" ? "green" : "blue"}>{change.kind === "remove" ? "移除" : change.kind === "restore" ? "恢复" : "修改"}</StatusBadge><div><div className="font-medium text-slate-900">{change.id} · {change.label}</div>{change.fields.length > 0 && <div className="mt-1 text-xs text-slate-500">字段：{change.fields.join("、")}</div>}</div></div>)}
        {diff.changes.length === 0 && <EmptyState text="该版本与当前数据没有差异" />}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">回滚只替换该团队在该周期的数据，其他团队不受影响。</p><button type="button" onClick={onRollback} disabled={busy || diff.changes.length === 0} className="inline-flex h-9 items-center gap-2 rounded-md bg-rose-600 px-3 text-sm font-medium text-white disabled:opacity-40"><RotateCcw className="h-4 w-4" />确认回滚此版本</button></div>
    </Panel>
  );
}

function SettingsDrawer({ config, setConfig, system, onClose }: AdminSectionProps & { system: SystemInfo | null; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30" role="dialog" aria-modal="true" aria-label="高级设置">
      <button type="button" className="min-w-0 flex-1" onClick={onClose} aria-label="关闭设置" />
      <div className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-semibold text-slate-950">高级设置</h2><p className="mt-1 text-sm text-muted-foreground">低频功能开关和只读运行信息。</p></div><button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md hover:bg-slate-50" aria-label="关闭"><X className="h-4 w-4" /></button></div>
        <div className="mt-6 space-y-5">
          <SelectField label="默认语言" value={config.settings.defaultLanguage} options={["zh", "en"]} optionLabel={(value) => value === "zh" ? "中文" : "English"} onChange={(defaultLanguage) => setConfig({ ...config, settings: { ...config.settings, defaultLanguage: defaultLanguage as "zh" | "en" } })} />
          <SettingToggle label="公开页显示编辑入口" description="有权限的用户会看到编辑入口。" checked={config.settings.showEditLinks} onChange={(showEditLinks) => setConfig({ ...config, settings: { ...config.settings, showEditLinks } })} />
          <SettingToggle label="允许周进度更新" description="负责人可以填写 actual、进度、风险和证据。" checked={config.settings.allowProgressNotes} onChange={(allowProgressNotes) => setConfig({ ...config, settings: { ...config.settings, allowProgressNotes } })} />
          <details className="rounded-lg border border-border p-4"><summary className="cursor-pointer text-sm font-medium text-slate-900">备份导出策略</summary><div className="mt-3"><SettingToggle label="允许管理员导出完整备份" description="导出包含配置、快照、草稿、进度记录和审计事件。" checked={config.settings.backupExportEnabled} onChange={(backupExportEnabled) => setConfig({ ...config, settings: { ...config.settings, backupExportEnabled } })} /></div></details>
          <div className="rounded-lg bg-slate-50 p-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">运行信息</div><dl className="mt-3 space-y-2 text-sm"><InfoRow label="应用版本" value={`v${system?.appVersion ?? "-"}`} /><InfoRow label="存储" value={system?.storageMode === "firestore" ? "Firestore" : "本地 JSON"} /><InfoRow label="配置 revision" value={String(config.revision)} /></dl><p className="mt-3 text-xs leading-5 text-slate-500">密钥、OAuth 和安全边界继续由环境变量与部署配置维护。</p></div>
        </div>
      </div>
    </div>
  );
}

function LoginPanel({ sessionEmail, iapMode, token, setToken, busy, error, showEmergencyToken, onLogin }: { sessionEmail?: string | null; iapMode: boolean; token: string; setToken: (value: string) => void; busy: boolean; error: string; showEmergencyToken: boolean; onLogin: () => void }) {
  return <div className="mx-auto mt-20 max-w-md rounded-xl border border-border bg-white p-7 shadow-subtle"><div className="grid h-11 w-11 place-items-center rounded-md bg-slate-950 text-white"><Lock className="h-5 w-5" /></div><h1 className="mt-4 text-2xl font-semibold text-slate-950">OKR 运行控制台</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">{iapMode ? "当前公司账号没有系统管理员权限，请联系其他管理员开通。" : "使用系统管理员账号进入；紧急 Token 只在本地或显式开启时显示。"}</p>{!iapMode && <button type="button" onClick={() => void signIn("google")} className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-medium text-white hover:bg-slate-800">使用 Google 登录</button>}{sessionEmail && <div className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">当前账号：{sessionEmail}</div>}{showEmergencyToken && <details className="mt-5 rounded-lg border border-border p-4"><summary className="cursor-pointer text-sm font-medium text-slate-700">紧急管理员 Token</summary><input type="password" value={token} onChange={(event) => setToken(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void onLogin(); }} className="mt-3 h-10 w-full rounded-md border border-border px-3 text-sm outline-none focus:border-blue-400" />{error && <div className="mt-2 text-sm text-rose-600">{error}</div>}<button type="button" onClick={onLogin} disabled={busy || !token.trim()} className="mt-3 h-9 w-full rounded-md bg-blue-600 text-sm font-medium text-white disabled:bg-slate-300">登录</button></details>}</div>;
}

function AdminFrame({ children }: { children: React.ReactNode }) { return <div className="min-h-screen bg-slate-50 px-4 py-5 sm:px-6">{children}</div>; }
function LoadingCard() { return <div className="mx-auto max-w-7xl rounded-lg border border-border bg-white p-8 text-sm text-slate-500">加载管理后台...</div>; }
function Panel({ children, className }: { children: React.ReactNode; className?: string }) { return <section className={cn("rounded-xl border border-border bg-white p-5 shadow-subtle", className)}>{children}</section>; }

function MessageBanner({ message, onClose }: { message: { tone: "success" | "error" | "info"; text: string }; onClose: () => void }) {
  return <div className={cn("mb-4 flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm", message.tone === "success" && "border-emerald-200 bg-emerald-50 text-emerald-800", message.tone === "error" && "border-rose-200 bg-rose-50 text-rose-800", message.tone === "info" && "border-blue-200 bg-blue-50 text-blue-800")}><span>{message.text}</span><button type="button" onClick={onClose} aria-label="关闭消息"><X className="h-4 w-4" /></button></div>;
}

function StatusBadge({ children, tone }: { children: React.ReactNode; tone: "neutral" | "green" | "amber" | "blue" | "rose" }) {
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-medium", tone === "neutral" && "bg-slate-100 text-slate-600", tone === "green" && "bg-emerald-100 text-emerald-700", tone === "amber" && "bg-amber-100 text-amber-800", tone === "blue" && "bg-blue-100 text-blue-700", tone === "rose" && "bg-rose-100 text-rose-700")}>{children}</span>;
}

function RuntimeMetric({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-white/10 px-3 py-3"><div className="text-xs text-slate-300">{label}</div><div className="mt-1 text-lg font-semibold">{value}</div></div>; }
function HealthRow({ label, value }: { label: string; value: number }) { return <div className="flex items-center justify-between gap-3"><span className="text-sm text-slate-600">{label}</span><StatusBadge tone={value > 0 ? "amber" : "green"}>{value}</StatusBadge></div>; }
function EventRow({ event }: { event: AdminEvent }) { return <div className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[145px_120px_1fr]"><span className="text-slate-500">{formatDate(event.createdAt)}</span><span className={event.status === "ok" ? "text-emerald-700" : "text-rose-700"}>{eventTypeLabel(event.type)}</span><span className="text-slate-800">{event.message}</span></div>; }
function EmptyState({ text }: { text: string }) { return <div className="px-4 py-8 text-center text-sm text-muted-foreground">{text}</div>; }
function PeriodStatus({ status }: { status: AdminPeriod["status"] }) { return <StatusBadge tone={status === "active" ? "green" : status === "locked" ? "neutral" : "blue"}>{status === "active" ? "进行中" : status === "locked" ? "已锁定" : "计划中"}</StatusBadge>; }
function DiffMetric({ label, value, tone }: { label: string; value: number; tone: "green" | "blue" | "rose" }) { return <div className="rounded-lg border border-border bg-white px-4 py-3"><div className="text-xs text-slate-500">{label}</div><div className={cn("mt-1 text-2xl font-semibold", tone === "green" && "text-emerald-700", tone === "blue" && "text-blue-700", tone === "rose" && "text-rose-700")}>{value}</div></div>; }

function TextField({ label, value, onChange, hint, disabled = false }: { label: string; value: string; onChange: (value: string) => void; hint?: string; disabled?: boolean }) { return <label className="block"><span className="text-xs font-medium text-slate-500">{label}</span><input value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-border px-3 text-sm outline-none focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-500" />{hint && <span className="mt-1 block text-xs leading-5 text-slate-500">{hint}</span>}</label>; }
function SelectField({ label, value, options, onChange, placeholder, allowEmpty = false, optionLabel }: { label: string; value: string; options: string[]; onChange: (value: string) => void; placeholder?: string; allowEmpty?: boolean; optionLabel?: (value: string) => string }) { return <label className="block"><span className="text-xs font-medium text-slate-500">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-blue-400">{allowEmpty && <option value="">{placeholder ?? "未选择"}</option>}{!allowEmpty && placeholder && !value && <option value="">{placeholder}</option>}{options.map((option) => <option key={option} value={option}>{optionLabel ? optionLabel(option) : option}</option>)}</select></label>; }
function FilterSelect({ value, onChange, options, allLabel }: { value: string; onChange: (value: string) => void; options: string[]; allLabel: string }) { return <select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-blue-400">{options.map((option) => <option key={option} value={option}>{option === "all" ? allLabel : option}</option>)}</select>; }
function SegmentButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" onClick={onClick} className={cn("inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium", active ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-50")}>{children}</button>; }
function SettingToggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) { return <label className="flex cursor-pointer items-start justify-between gap-4"><span><span className="block text-sm font-medium text-slate-900">{label}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span></span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-1 h-4 w-4 rounded border-border" /></label>; }
function InfoRow({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">{label}</dt><dd className="font-medium text-slate-800">{value}</dd></div>; }
function UserAvatar({ name, enabled }: { name: string; enabled: boolean }) { const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U"; return <div className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold text-white", enabled ? "bg-blue-600" : "bg-slate-300")}>{initials}</div>; }

function EffectiveAccess({ config, user }: { config: AdminConfig; user: AdminUser }) {
  const teams = user.role === "super_admin" ? config.teams.filter((team) => team.enabled).map((team) => team.name) : user.role === "team_leader" ? unique(user.teams.flatMap((team) => [team, ...descendantTeams(config.teams, team)])) : user.teams;
  const capability = user.role === "super_admin" ? "管理后台、编辑和发布所有团队" : user.role === "team_leader" ? "编辑并发布所选团队及其下级团队" : "仅编辑本人名下的 KR，不可发布";
  return <div className="mt-5 rounded-lg bg-slate-50 p-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">最终生效权限</div><div className="mt-2 text-sm font-medium text-slate-900">{capability}</div><div className="mt-2 text-xs leading-5 text-slate-500">范围：{teams.length ? teams.join("、") : "无团队范围"}</div></div>;
}

type AdminSectionProps = { config: AdminConfig; setConfig: (config: AdminConfig) => void };
const teamColors = ["blue", "emerald", "violet", "amber", "rose", "slate"];
function teamColorClass(color: string) { return ({ blue: "bg-blue-500", emerald: "bg-emerald-500", violet: "bg-violet-500", amber: "bg-amber-500", rose: "bg-rose-500", slate: "bg-slate-500" } as Record<string, string>)[color] ?? "bg-slate-500"; }
function roleLabel(role: AdminRole) { return role === "super_admin" ? "系统管理员" : role === "team_leader" ? "团队负责人" : "成员"; }
function eventTypeLabel(type: AdminEvent["type"]) { return type === "config.update" ? "配置更新" : type === "publish" ? "发布" : type === "rollback" ? "回滚" : "登录"; }
function periodLabel(config: AdminConfig, id: string) { return config.periods.find((period) => period.id === id)?.shortLabel ?? id; }
function formatDate(value: string) { if (!value) return "暂无"; const timestamp = Date.parse(value); return Number.isFinite(timestamp) ? new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(timestamp) : value.slice(0, 16); }
function splitList(value: string) { return value.split(",").map((item) => item.trim()).filter(Boolean); }
function unique(values: string[]) { return Array.from(new Set(values)); }
function updatePeriod(config: AdminConfig, setConfig: (config: AdminConfig) => void, id: string, patch: Partial<AdminPeriod>) { setConfig({ ...config, periods: config.periods.map((period) => period.id === id ? { ...period, ...patch } : period) }); }
function updateTeam(config: AdminConfig, setConfig: (config: AdminConfig) => void, id: string, patch: Partial<AdminTeam>) { setConfig({ ...config, teams: config.teams.map((team) => team.id === id ? { ...team, ...patch } : team) }); }
function updateUser(config: AdminConfig, setConfig: (config: AdminConfig) => void, index: number, patch: Partial<AdminUser>) { setConfig({ ...config, users: config.users.map((user, itemIndex) => itemIndex === index ? { ...user, ...patch } : user) }); }
function renameTeam(config: AdminConfig, setConfig: (config: AdminConfig) => void, id: string, name: string) { const previous = config.teams.find((team) => team.id === id)?.name ?? ""; setConfig({ ...config, defaultTeam: config.defaultTeam === previous ? name : config.defaultTeam, teams: config.teams.map((team) => team.id === id ? { ...team, name } : team.parentTeam === previous ? { ...team, parentTeam: name } : team), users: config.users.map((user) => ({ ...user, teams: user.teams.map((team) => team === previous ? name : team) })) }); }
function orderTeams(teams: AdminTeam[]) { const result: Array<{ team: AdminTeam; depth: number }> = []; const visited = new Set<string>(); function visit(parent: string, depth: number) { teams.filter((team) => team.parentTeam === parent && !visited.has(team.id)).forEach((team) => { visited.add(team.id); result.push({ team, depth }); visit(team.name, depth + 1); }); } visit("", 0); teams.filter((team) => !visited.has(team.id)).forEach((team) => result.push({ team, depth: 0 })); return result; }
function descendantTeams(teams: AdminTeam[], parent: string): string[] { const children = teams.filter((team) => team.parentTeam === parent); return children.flatMap((team) => [team.name, ...descendantTeams(teams, team.name)]); }
function isDescendant(teams: AdminTeam[], parent: string, candidate: string) { return descendantTeams(teams, parent).includes(candidate); }
