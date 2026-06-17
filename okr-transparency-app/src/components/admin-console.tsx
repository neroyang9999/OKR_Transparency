"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { Activity, Search, Lock, LogOut, RotateCcw, Save, Settings, Shield, SlidersHorizontal, UserPlus, Users } from "lucide-react";
import type { AdminConfig, AdminEvent, AdminPeriod, AdminRole, AdminTeam, AdminUser } from "@/lib/admin/config";
import { cn } from "@/lib/utils";

type TabId = "overview" | "periods" | "teams" | "users" | "sync" | "settings";

const tabs: Array<{ id: TabId; label: string; icon: typeof Activity }> = [
  { id: "overview", label: "系统概览", icon: Activity },
  { id: "periods", label: "周期管理", icon: SlidersHorizontal },
  { id: "teams", label: "团队管理", icon: Users },
  { id: "users", label: "用户与角色", icon: Shield },
  { id: "sync", label: "同步与发布", icon: RotateCcw },
  { id: "settings", label: "系统设置", icon: Settings }
];

export function AdminConsole() {
  const { data: session } = useSession();
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState("");
  const [loginError, setLoginError] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const loadAdminData = useCallback(async () => {
    const [configResponse, eventsResponse] = await Promise.all([
      fetch("/api/admin/config"),
      fetch("/api/admin/events")
    ]);
    if (configResponse.ok) {
      const body = await configResponse.json() as { config: AdminConfig };
      setConfig(body.config);
    }
    if (eventsResponse.ok) {
      const body = await eventsResponse.json() as { events: AdminEvent[] };
      setEvents(body.events);
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
    await fetch("/api/admin/logout", { method: "POST" });
    await signOut({ redirect: false });
    setAuthenticated(false);
    setConfig(null);
    setEvents([]);
  }

  async function saveConfig() {
    if (!config) return;
    setBusy(true);
    const response = await fetch("/api/admin/config", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(config)
    });
    setBusy(false);
    if (!response.ok) {
      setMessage("保存失败");
      return;
    }
    const body = await response.json() as { config: AdminConfig };
    setConfig(body.config);
    setMessage("配置已保存");
    await loadAdminData();
  }

  async function runSync() {
    setBusy(true);
    const response = await fetch("/api/admin/sync", { method: "POST" });
    const body = await response.json().catch(() => ({})) as { error?: string; records?: unknown[] };
    setBusy(false);
    setMessage(response.ok ? `同步完成：${body.records?.length ?? 0} 条记录` : `同步失败：${body.error ?? "未知错误"}`);
    await loadAdminData();
  }

  async function rollback() {
    setBusy(true);
    const response = await fetch("/api/admin/rollback", { method: "POST" });
    const body = await response.json().catch(() => ({})) as { error?: string };
    setBusy(false);
    setMessage(response.ok ? "已回滚到上一版快照" : `回滚失败：${body.error ?? "没有可用备份"}`);
    await loadAdminData();
  }

  const completeness = useMemo(() => {
    if (!config) return 0;
    const checks = [
      config.periods.length > 0,
      config.teams.some((team) => team.enabled),
      Boolean(config.defaultTeam),
      Boolean(config.defaultPeriodId),
      config.users.length > 0
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [config]);

  if (loading) {
    return <AdminFrame><div className="rounded-lg border border-border bg-white p-8 text-sm text-slate-500">加载中...</div></AdminFrame>;
  }

  if (!authenticated || !config) {
    return (
      <AdminFrame>
        <div className="mx-auto mt-20 max-w-md rounded-lg border border-border bg-white p-6 shadow-subtle">
          <div className="grid h-11 w-11 place-items-center rounded-md bg-slate-950 text-white">
            <Lock className="h-5 w-5" />
          </div>
          <h1 className="mt-4 text-2xl font-semibold text-slate-950">OKR 管理后台</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">使用 Google 登录 super admin 账号进入后台；admin token 仅作为本地 emergency fallback。</p>
          <button
            type="button"
            onClick={() => void signIn("google")}
            className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-medium text-white hover:bg-slate-800"
          >
            使用 Google 登录
          </button>
          {session?.user?.email && (
            <div className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
              当前 Google 账号：{session.user.email}
            </div>
          )}
          <label className="mt-5 block">
            <span className="text-xs font-medium text-slate-500">Emergency admin token</span>
            <input
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void login();
              }}
              className="mt-1 h-10 w-full rounded-md border border-border px-3 text-sm outline-none focus:border-blue-400"
            />
          </label>
          {loginError && <div className="mt-3 text-sm text-rose-600">{loginError}</div>}
          <button
            type="button"
            onClick={login}
            disabled={busy || !token.trim()}
            className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-slate-300"
          >
            登录
          </button>
        </div>
      </AdminFrame>
    );
  }

  return (
    <AdminFrame>
      <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
        <aside className="rounded-lg border border-border bg-white p-3 shadow-subtle">
          <div className="px-3 py-2">
            <div className="text-sm font-semibold text-slate-950">OKR Admin</div>
            <div className="mt-1 text-xs text-muted-foreground">配置后台</div>
          </div>
          <nav className="mt-3 space-y-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex h-10 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-medium",
                    activeTab === tab.id ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
          <button
            type="button"
            onClick={logout}
            className="mt-4 flex h-10 w-full items-center gap-2 rounded-md px-3 text-sm font-medium text-slate-500 hover:bg-slate-50"
          >
            <LogOut className="h-4 w-4" />
            退出登录
          </button>
        </aside>

        <main className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-white px-5 py-4 shadow-subtle">
            <div>
              <h1 className="text-2xl font-semibold text-slate-950">{tabs.find((tab) => tab.id === activeTab)?.label}</h1>
              <div className="mt-1 text-sm text-muted-foreground">配置会写入本地 JSON；密钥仍由环境变量管理。</div>
            </div>
            <button
              type="button"
              onClick={saveConfig}
              disabled={busy}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-slate-300"
            >
              <Save className="h-4 w-4" />
              保存配置
            </button>
          </div>

          {message && <div className="mb-4 rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">{message}</div>}

          {activeTab === "overview" && <Overview config={config} events={events} completeness={completeness} />}
          {activeTab === "periods" && <PeriodConfig config={config} setConfig={setConfig} />}
          {activeTab === "teams" && <TeamConfig config={config} setConfig={setConfig} />}
          {activeTab === "users" && <UserRoleConfig config={config} setConfig={setConfig} />}
          {activeTab === "sync" && <SyncPanel events={events} busy={busy} onSync={runSync} onRollback={rollback} />}
          {activeTab === "settings" && <SettingsPanel config={config} setConfig={setConfig} />}
        </main>
      </div>
    </AdminFrame>
  );
}

function AdminFrame({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-slate-50 px-5 py-6">{children}</div>;
}

function Overview({ config, events, completeness }: { config: AdminConfig; events: AdminEvent[]; completeness: number }) {
  const lastSync = events.find((event) => event.type === "sync");
  const lastPublish = events.find((event) => event.type === "publish");
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Metric title="配置完整度" value={`${completeness}%`} />
      <Metric title="启用团队" value={String(config.teams.filter((team) => team.enabled).length)} />
      <Metric title="开放周期" value={String(config.periods.filter((period) => period.editable && !period.locked).length)} />
      <Metric title="授权用户" value={String(config.users.filter((user) => user.enabled).length)} />
      <EventList title="最近同步" event={lastSync} />
      <EventList title="最近发布" event={lastPublish} />
    </div>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-white p-5 shadow-subtle">
      <div className="text-sm text-muted-foreground">{title}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function EventList({ title, event }: { title: string; event?: AdminEvent }) {
  return (
    <div className="rounded-lg border border-border bg-white p-5 shadow-subtle md:col-span-2">
      <div className="text-sm font-semibold text-slate-950">{title}</div>
      <div className="mt-3 text-sm text-muted-foreground">{event ? `${event.createdAt.slice(0, 16)} · ${event.message}` : "暂无记录"}</div>
    </div>
  );
}

function PeriodConfig({ config, setConfig }: AdminSectionProps) {
  return (
    <Panel>
      <SelectField label="默认周期" value={config.defaultPeriodId} options={config.periods.map((period) => period.id)} onChange={(defaultPeriodId) => setConfig({ ...config, defaultPeriodId })} />
      {config.periods.map((period, index) => (
        <div key={period.id} className="grid gap-3 rounded-md border border-border p-4 md:grid-cols-3">
          <TextField label="ID" value={period.id} onChange={(id) => updatePeriod(config, setConfig, index, { id })} />
          <TextField label="中文标签" value={period.label} onChange={(label) => updatePeriod(config, setConfig, index, { label })} />
          <TextField label="短标签" value={period.shortLabel} onChange={(shortLabel) => updatePeriod(config, setConfig, index, { shortLabel })} />
          <TextField label="英文标签" value={period.labelEn} onChange={(labelEn) => updatePeriod(config, setConfig, index, { labelEn })} />
          <Checkbox label="开放编辑" checked={period.editable} onChange={(editable) => updatePeriod(config, setConfig, index, { editable })} />
          <Checkbox label="锁定周期" checked={period.locked} onChange={(locked) => updatePeriod(config, setConfig, index, { locked })} />
        </div>
      ))}
      <AddButton label="添加周期" onClick={() => setConfig({ ...config, periods: [...config.periods, { id: "new-period", label: "新周期", labelEn: "New period", shortLabel: "New", editable: true, locked: false }] })} />
    </Panel>
  );
}

function TeamConfig({ config, setConfig }: AdminSectionProps) {
  return (
    <Panel>
      <SelectField label="默认团队" value={config.defaultTeam} options={config.teams.map((team) => team.name)} onChange={(defaultTeam) => setConfig({ ...config, defaultTeam })} />
      {config.teams.map((team, index) => (
        <div key={`${team.name}-${index}`} className="grid gap-3 rounded-md border border-border p-4 md:grid-cols-3">
          <TextField label="团队" value={team.name} onChange={(name) => updateTeam(config, setConfig, index, { name })} />
          <TextField label="Owner" value={team.owner} onChange={(owner) => updateTeam(config, setConfig, index, { owner })} />
          <TextField label="父团队" value={team.parentTeam} onChange={(parentTeam) => updateTeam(config, setConfig, index, { parentTeam })} />
          <TextField label="颜色 class" value={team.color} onChange={(color) => updateTeam(config, setConfig, index, { color })} />
          <Checkbox label="启用" checked={team.enabled} onChange={(enabled) => updateTeam(config, setConfig, index, { enabled })} />
        </div>
      ))}
      <AddButton label="添加团队" onClick={() => setConfig({ ...config, teams: [...config.teams, { name: "New Team", owner: "Owner", parentTeam: "", color: "bg-slate-500", enabled: true }] })} />
    </Panel>
  );
}

function UserRoleConfig({ config, setConfig }: AdminSectionProps) {
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<AdminRole | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "enabled" | "disabled">("all");
  const normalizedQuery = query.trim().toLowerCase();
  const totalUsers = config.users.length;
  const enabledUsers = config.users.filter((user) => user.enabled).length;
  const roleCounts = {
    super_admin: config.users.filter((user) => user.role === "super_admin").length,
    team_leader: config.users.filter((user) => user.role === "team_leader").length,
    user: config.users.filter((user) => user.role === "user").length
  };
  const visibleUsers = config.users
    .map((user, index) => ({ user, index }))
    .filter(({ user }) => {
      const matchesQuery = !normalizedQuery || [user.email, user.displayName, user.role, ...user.teams, ...user.ownerAliases]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
      const matchesRole = roleFilter === "all" || user.role === roleFilter;
      const matchesStatus = statusFilter === "all" || (statusFilter === "enabled" ? user.enabled : !user.enabled);
      return matchesQuery && matchesRole && matchesStatus;
    });

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm text-muted-foreground">
          Google 登录后按邮箱匹配角色。建议只保留 2-3 个 super admin，team lead 按团队授权，普通用户按 owner alias 授权。
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <RoleMetric title="用户总数" value={String(totalUsers)} />
        <RoleMetric title="已启用" value={String(enabledUsers)} />
        <RoleMetric title="Super admin" value={String(roleCounts.super_admin)} />
        <RoleMetric title="Team lead" value={String(roleCounts.team_leader)} />
        <RoleMetric title="普通用户" value={String(roleCounts.user)} />
      </div>

      <Panel>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-[260px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="按用户名、邮箱、团队或 owner alias 搜索"
              className="h-9 w-full rounded-md border border-border pl-9 pr-3 text-sm outline-none focus:border-blue-400"
            />
          </label>
          <select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value as AdminRole | "all")}
            className="h-9 rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-blue-400"
          >
            <option value="all">全部角色</option>
            <option value="super_admin">super_admin</option>
            <option value="team_leader">team_leader</option>
            <option value="user">user</option>
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as "all" | "enabled" | "disabled")}
            className="h-9 rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-blue-400"
          >
            <option value="all">全部状态</option>
            <option value="enabled">已启用</option>
            <option value="disabled">已停用</option>
          </select>
          <button
            type="button"
            onClick={() => setConfig({ ...config, users: [...config.users, { email: "user@company.com", displayName: "New User", role: "user", teams: [config.defaultTeam], ownerAliases: ["New User"], enabled: true }] })}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700"
          >
            <UserPlus className="h-4 w-4" />
            添加用户
          </button>
        </div>

        <div className="text-sm text-muted-foreground">显示结果 {visibleUsers.length} / {totalUsers}</div>

        <div className="overflow-x-auto rounded-md border border-border">
          <div className="min-w-[920px]">
            <div className="grid grid-cols-[minmax(260px,1.35fr)_130px_minmax(150px,0.8fr)_minmax(190px,1fr)_110px] border-b border-border bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
              <div>用户</div>
              <div>角色</div>
              <div>团队</div>
              <div>Owner aliases</div>
              <div>状态</div>
            </div>
            {visibleUsers.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">没有匹配的用户</div>
            ) : visibleUsers.map(({ user, index }) => (
              <div key={`${user.email}-${index}`} className="grid grid-cols-[minmax(260px,1.35fr)_130px_minmax(150px,0.8fr)_minmax(190px,1fr)_110px] items-center gap-3 border-b border-border px-3 py-3 text-sm last:border-b-0">
                <div className="flex min-w-0 items-center gap-3">
                  <UserAvatar name={user.displayName || user.email} enabled={user.enabled} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <input
                      value={user.displayName}
                      onChange={(event) => updateUser(config, setConfig, index, { displayName: event.target.value })}
                      aria-label="显示名"
                      className="h-7 w-full rounded-md border border-transparent bg-transparent px-2 font-medium text-slate-900 outline-none hover:border-border focus:border-blue-400 focus:bg-white"
                    />
                    <input
                      value={user.email}
                      onChange={(event) => updateUser(config, setConfig, index, { email: event.target.value })}
                      aria-label="邮箱"
                      className="h-7 w-full rounded-md border border-transparent bg-transparent px-2 text-xs text-slate-500 outline-none hover:border-border focus:border-blue-400 focus:bg-white"
                    />
                  </div>
                </div>
                <select
                  value={user.role}
                  onChange={(event) => updateUser(config, setConfig, index, { role: event.target.value as AdminRole })}
                  aria-label="角色"
                  className="h-8 rounded-md border border-border bg-white px-2 text-sm outline-none focus:border-blue-400"
                >
                  <option value="super_admin">super_admin</option>
                  <option value="team_leader">team_leader</option>
                  <option value="user">user</option>
                </select>
                <input
                  value={user.teams.join(", ")}
                  onChange={(event) => updateUser(config, setConfig, index, { teams: splitList(event.target.value) })}
                  aria-label="团队"
                  className="h-8 rounded-md border border-border px-2 text-sm outline-none focus:border-blue-400"
                />
                <input
                  value={user.ownerAliases.join(", ")}
                  onChange={(event) => updateUser(config, setConfig, index, { ownerAliases: splitList(event.target.value) })}
                  aria-label="Owner aliases"
                  className="h-8 rounded-md border border-border px-2 text-sm outline-none focus:border-blue-400"
                />
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={user.enabled}
                    onChange={(event) => updateUser(config, setConfig, index, { enabled: event.target.checked })}
                    className="h-4 w-4 rounded border-border"
                  />
                  {user.enabled ? "活动" : "停用"}
                </label>
              </div>
            ))}
          </div>
        </div>
      </Panel>
    </div>
  );
}

function RoleMetric({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-white px-4 py-3 shadow-subtle">
      <div className="text-sm text-muted-foreground">{title}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function UserAvatar({ name, enabled }: { name: string; enabled: boolean }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";

  return (
    <div className={cn(
      "grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold text-white",
      enabled ? "bg-blue-600" : "bg-slate-300"
    )}>
      {initials}
    </div>
  );
}

function SyncPanel({ events, busy, onSync, onRollback }: { events: AdminEvent[]; busy: boolean; onSync: () => void; onRollback: () => void }) {
  return (
    <Panel>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onSync} disabled={busy} className="inline-flex h-9 items-center rounded-md bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-slate-300">手动同步</button>
        <button type="button" onClick={onRollback} disabled={busy} className="inline-flex h-9 items-center rounded-md border border-border bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:text-slate-300">回滚上一版</button>
      </div>
      <div className="overflow-hidden rounded-md border border-border">
        {events.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">暂无事件</div>
        ) : events.slice(0, 20).map((event) => (
          <div key={event.id} className="grid gap-2 border-t border-border px-4 py-3 text-sm first:border-t-0 md:grid-cols-[150px_120px_1fr]">
            <span className="text-slate-500">{event.createdAt.slice(0, 16)}</span>
            <span className={event.status === "ok" ? "text-emerald-600" : "text-rose-600"}>{event.type}</span>
            <span className="text-slate-800">{event.message}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function SettingsPanel({ config, setConfig }: AdminSectionProps) {
  return (
    <Panel>
      <SelectField label="默认语言" value={config.settings.defaultLanguage} options={["zh", "en"]} onChange={(defaultLanguage) => setConfig({ ...config, settings: { ...config.settings, defaultLanguage: defaultLanguage as "zh" | "en" } })} />
      <Checkbox label="公开页显示编辑入口" checked={config.settings.showEditLinks} onChange={(showEditLinks) => setConfig({ ...config, settings: { ...config.settings, showEditLinks } })} />
      <Checkbox label="允许进度记录" checked={config.settings.allowProgressNotes} onChange={(allowProgressNotes) => setConfig({ ...config, settings: { ...config.settings, allowProgressNotes } })} />
      <Checkbox label="允许备份导出" checked={config.settings.backupExportEnabled} onChange={(backupExportEnabled) => setConfig({ ...config, settings: { ...config.settings, backupExportEnabled } })} />
    </Panel>
  );
}

type AdminSectionProps = {
  config: AdminConfig;
  setConfig: (config: AdminConfig) => void;
};

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="space-y-4 rounded-lg border border-border bg-white p-5 shadow-subtle">{children}</div>;
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-border px-3 text-sm outline-none focus:border-blue-400" />
    </label>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-border px-3 text-sm outline-none focus:border-blue-400">
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-slate-700">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 rounded border-border" />
      {label}
    </label>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="h-9 rounded-md border border-dashed border-border px-3 text-sm font-medium text-slate-600 hover:bg-slate-50">{label}</button>;
}

function updatePeriod(config: AdminConfig, setConfig: (config: AdminConfig) => void, index: number, patch: Partial<AdminPeriod>) {
  setConfig({ ...config, periods: config.periods.map((period, itemIndex) => itemIndex === index ? { ...period, ...patch } : period) });
}

function updateTeam(config: AdminConfig, setConfig: (config: AdminConfig) => void, index: number, patch: Partial<AdminTeam>) {
  setConfig({ ...config, teams: config.teams.map((team, itemIndex) => itemIndex === index ? { ...team, ...patch } : team) });
}

function updateUser(config: AdminConfig, setConfig: (config: AdminConfig) => void, index: number, patch: Partial<AdminUser>) {
  setConfig({ ...config, users: config.users.map((user, itemIndex) => itemIndex === index ? { ...user, ...patch } : user) });
}

function splitList(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}
