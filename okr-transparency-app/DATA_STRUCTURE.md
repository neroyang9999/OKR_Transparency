# OKR Transparency App 数据结构对接说明

本文面向需要对接、导入、排查或迁移 OKR 数据的同事。范围只覆盖当前 `okr-transparency-app` 的数据模型、存储文件、Firestore 映射和主要 API；不覆盖 UI 组件实现。

## 1. 总体数据流

```text
Page editor
  -> OkrDraft
  -> publish
  -> OkrSnapshot
  -> file storage: data/*.json
     or
     Firestore storage: okr* collections/documents
  -> API routes
  -> overview / team / map / detail / admin pages
```

关键点：

- OKR 由页面编辑器直接填写和维护，不再支持 Google Doc / CSV 导入。
- OKR 主数据是扁平数组：`parent_id` 只表示 Objective/KR 结构，`aligned_to_id` 只表示跨 Objective/团队对齐。
- 页面编辑会先写入 draft，publish 后生成新的 snapshot。
- `OKR_STORAGE=file` 时写本地 `data/*.json`；`OKR_STORAGE=firestore` 时写 Firestore。未显式设置时，本地默认为 `file`，Cloud Run 环境默认为 `firestore`。

## 2. 当前本地数据文件

目录：`data/`

| 文件 | 作用 | 当前状态 |
| --- | --- | --- |
| `okr-snapshot.json` | 当前已发布 OKR 快照，页面主读源 | 本地修复后 46 条 record，source=`snapshot` |
| `okr-period-snapshots.json` | 按 period 保存的已发布记录，用于跨季度/历史 period | 1 个 period |
| `okr-drafts.json` | 页面编辑草稿 | 1 份 draft |
| `okr-progress-notes.json` | 每周进度备注 | 3 条 note |
| `okr-snapshot-versions.json` | 按团队/周期保存发布前版本 | 首次新发布后生成 |
| `okr-admin-config.json` | period、team、用户、权限和设置 | 旧版 v1 可直接读取，管理员保存后写为 v2 |
| `okr-admin-events.json` | 管理操作审计事件 | 记录 login/config/publish/rollback |
| `okr-admin-rollback-snapshot.json` | 旧版全局 rollback 备份 | 仅兼容保留，新回滚不再读取 |
| `app-events.log` | 应用日志 | 存在 |

## 3. 主 OKR 记录：`OkrRecord`

代码定义：`src/lib/okr/types.ts`

字段说明：

| 字段 | 类型/枚举 | 含义 | 对接注意事项 |
| --- | --- | --- | --- |
| `okr_id` | string | 唯一 ID | 必填；不能重复；被 `parent_id` 引用 |
| `parent_id` | string | 结构父节点 ID | KR 指向所属 Objective；Objective 必须为空 |
| `level` | `Engineering` \| `Team` | 层级 | 当前代码枚举只接受这两个值 |
| `team` | string | 团队名 | 必填；应尽量与 admin config 的 team name 对齐 |
| `objective` | string | Objective 标题 | 必填；KR 行也会保留所属 objective |
| `kr` | string | KR 文本 | Objective/root 行通常为空；KR 行必填更清晰 |
| `type` | `Committed` \| `Aspirational` \| `Learning` | OKR 类型 | 必须是枚举值 |
| `owner` | string | 负责人 | 必填；用户权限会用 owner alias 做 scoped edit/publish |
| `baseline` | string | 基线 | 自由文本 |
| `target` | string | 目标 | 自由文本 |
| `actual` | string | 当前实际值 | 自由文本 |
| `score` | number \| null | 进度分数 | 空或 0 到 1；页面编辑中会与 0 到 100 的 progress 互转 |
| `confidence` | `Green` \| `Yellow` \| `Red` | 信心/状态 | Yellow/Red 建议填写 risk 或 decision |
| `dependencies` | string | 依赖 | 自由文本 |
| `risks` | string | 风险 | 用于 risky count 和展示 |
| `decisions_needed` | string | 需决策事项 | 用于 decisions needed count 和展示 |
| `source_doc_url` | string | 来源链接/标记 | 必填；页面编辑发布时为 `page-edit` |
| `last_update` | string | 最近更新时间 | 必填；建议 `YYYY-MM-DD` |
| `aligned_to_id` | string, optional | 可选对齐 ID | Objective 对齐的上级 Objective 或 KR；与结构父节点分离 |

### 层级关系

树构建逻辑：

- Objective 的 `parent_id` 为空；KR 的 `parent_id` 指向所属 Objective。
- Objective 的跨团队对齐写在 `aligned_to_id`，可以指向上级 Objective 或 KR。
- 发布会检查重复 ID、缺失父节点、缺失对齐目标和循环引用。
- 即使遇到历史脏数据，`buildOkrTree` 也会把异常记录作为 root 展示，不再静默丢弃。

常见结构：

```text
Engineering/Team Objective
  -> Team Objective or KR
      -> KR
```

当前数据里也存在团队 objective 对齐到 Software objective 的情况，例如 Application/Integration 等团队的 objective 挂到 `SW-O1`。

## 4. 快照：`OkrSnapshot`

结构：

```ts
type OkrSnapshot = {
  version: 1;
  meta: SyncStatus;
  records: OkrRecord[];
};
```

`meta`：

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `status` | `ok` \| `error` \| `empty` | 当前快照状态 |
| `source` | `snapshot` | 快照来源；页面填写发布后写入 snapshot |
| `lastSyncedAt` | ISO datetime | 发布/rollback 时间；字段名沿用历史命名 |
| `message` | string | 状态说明 |
| `rowCount` | number | 记录数 |

本地文件：

- 当前快照：`data/okr-snapshot.json`
- 旧版 rollback 备份：`data/okr-admin-rollback-snapshot.json`（仅兼容保留）

Firestore：

- 当前快照：`okrSnapshots/current`
- 旧版 rollback 备份：`okrAdmin/rollbackSnapshot`（新版本使用 `okrSnapshotVersions`）

## 5. Period 快照

本地文件：`data/okr-period-snapshots.json`

结构：

```ts
{
  version: 1,
  periods: [
    {
      periodId: string,
      updatedAt: string,
      records: OkrRecord[]
    }
  ]
}
```

Firestore：

- `okrPeriodSnapshots/{periodId}`

用途：

- 保存不同季度/period 的发布记录。
- 当前周期由 `AdminConfig.defaultPeriodId` 唯一决定。
- publish draft 时会更新对应 period；如果是默认周期，还会同时更新当前 `okr-snapshot.json` / `okrSnapshots/current`。

## 6. 页面编辑草稿：`OkrDraft`

代码定义：`src/lib/okr/edit-types.ts`

本地文件：`data/okr-drafts.json`

Firestore：

- `okrDrafts/{periodId_team}`
- document id 由 `documentIdFromParts([periodId, team])` 生成，避免直接使用带空格或特殊字符的团队名。

结构：

```ts
type OkrDraft = {
  version: 1;
  team: string;
  periodId: string;
  updatedAt: string;
  objectives: EditableObjective[];
};
```

`EditableObjective`：

| 字段 | 含义 |
| --- | --- |
| `id` | objective ID，发布后成为 `OkrRecord.okr_id` |
| `periodId` | period |
| `team` | 团队 |
| `title` | Objective 标题 |
| `owner` | Objective owner |
| `type` | `Committed` / `Aspirational` / `Learning` |
| `confidence` | `Green` / `Yellow` / `Red` |
| `weight` | Objective 权重，0 到 100 |
| `progress` | 页面进度百分比，0 到 100 或 null |
| `alignedToId` | 对齐的上级 Objective/KR ID；发布后写入 `aligned_to_id` |
| `status` | `draft` / `published` / `locked` |
| `keyResults` | KR 列表 |

`EditableKr`：

| 字段 | 含义 |
| --- | --- |
| `id` | KR ID，发布后成为 `OkrRecord.okr_id` |
| `title` | KR 文本，发布后写入 `kr` |
| `owner` | KR owner |
| `baseline` | 基线 |
| `target` | 目标 |
| `actual` | 实际值 |
| `progress` | 页面进度百分比，发布时除以 100 写入 `score` |
| `confidence` | 状态 |
| `weight` | KR 权重；同一 objective 下要求合计约 100 |
| `risks` | 风险 |
| `decisionsNeeded` | 需决策事项 |

发布转换规则：

- Objective 发布为一条 `OkrRecord`，`kr` 为空。
- KR 发布为一条 child `OkrRecord`，`parent_id=objective.id`。
- Objective 的 `parent_id` 为空，跨团队对齐写入 `aligned_to_id`。
- Draft 的 `progress` 使用 0 到 100；发布后的 `score` 使用 0 到 1。
- 如果 Objective progress 为空，会根据 KR progress 加权计算。
- 页面编辑发布后的 `source_doc_url` 为 `page-edit`。

## 7. 进度备注：`ProgressNote`

代码定义：`src/lib/okr/progress-notes.ts`

本地文件：`data/okr-progress-notes.json`

Firestore：

- `okrProgressNotes/{periodId_team_objectiveId_weekStart}`
- `okrSnapshotVersions/{versionId}`

结构：

```ts
type ProgressNote = {
  team: string;
  periodId: string;
  objectiveId: string;
  weekStart: string;
  summary: string;
  status: "Green" | "Yellow" | "Red";
  risks: string;
  nextSteps: string;
  actual: string;
  progress: number | null;
  evidenceUrl: string;
  updatedBy: string;
  updatedAt: string;
};
```

对接注意事项：

- `summary` 必填。
- 在 KR 详情中保存周进展时，`actual`、`progress`、`status` 和 `risks` 会同步更新已发布 KR 当前状态。
- `weekStart` 默认为当前日期所在周的周一，格式 `YYYY-MM-DD`。
- 同一个 `team + periodId + objectiveId + weekStart` 写入时会覆盖同周旧 note。
- 旧版 v1 的 `note` 字段会自动迁移为 v2 的 `summary`。

## 8. 管理配置：`AdminConfig`

代码定义：`src/lib/admin/config.ts`

本地文件：`data/okr-admin-config.json`

Firestore：

- `okrAdmin/config`

结构：

```ts
type AdminConfig = {
  version: 2;
  revision: number;
  defaultPeriodId: string;
  periods: AdminPeriod[];
  defaultTeam: string;
  teams: AdminTeam[];
  users: AdminUser[];
  settings: {
    defaultLanguage: "zh" | "en";
    showEditLinks: boolean;
    allowProgressNotes: boolean;
    backupExportEnabled: boolean;
  };
};
```

核心子结构：

| 结构 | 关键字段 | 用途 |
| --- | --- | --- |
| `AdminPeriod` | `id`, `label`, `status` | `planned` / `active` / `locked`，同时只允许一个 active period |
| `AdminTeam` | `id`, `name`, `owner`, `parentTeam`, `color`, `enabled` | 控制团队列表、负责人、层级和显示；`id` 不在 UI 中编辑 |
| `AdminUser` | `email`, `displayName`, `role`, `teams`, `ownerAliases`, `enabled` | Google OAuth 后的主要权限来源 |

兼容与并发规则：

- 读取 v1 时会把 `editable/locked` 迁移成单一 `status`，把旧 Tailwind color class 迁移成颜色 token，并忽略已不参与授权的 legacy `permissions`。
- 兼容迁移只发生在内存中；管理员明确保存后才会写入 v2。
- `revision` 每次成功保存加 1；PUT 请求携带 `expectedRevision`，过期 revision 返回 `409 CONFIG_CONFLICT`。
- 用户的姓名和邮箱会自动加入 owner alias，历史别名仍可在高级设置补充。

角色：

- `super_admin`: 管理配置、发布、rollback 等全权限。
- `team_leader`: 可编辑/发布自己负责的 teams。
- `user`: 只能编辑 owner 匹配其 `ownerAliases` 的 OKR/KR。

当前本地配置：

- period：默认周期为 active，历史周期为 locked，新周期先进入 planned。
- team：10 个 enabled team。
- user：42 个 enabled user。

## 9. 管理事件：`AdminEvent`

本地文件：`data/okr-admin-events.json`

Firestore：

- `okrAdminEvents/{eventId}`

结构：

```ts
type AdminEvent = {
  id: string;
  type: "login" | "config.update" | "publish" | "rollback";
  actor: string;
  message: string;
  createdAt: string;
  status: "ok" | "error";
  details?: string[];
};
```

本地 file 模式最多保留最近 200 条事件。

## 10. 主要 API 和数据读写

| API | 方法 | 主要数据 | 说明 |
| --- | --- | --- | --- |
| `/api/okrs` | GET | `OkrTreeResponse` | 返回 meta、records、tree、stats；需要 API access |
| `/api/search` | GET | OKR search result | 搜索 OKR |
| `/api/okrs/[id]` | GET | lineage/detail | 单条 OKR 详情及上下游 |
| `/api/okrs/draft` | GET/POST | `OkrDraft` | 读写团队草稿 |
| `/api/okrs/publish` | POST | `OkrSnapshot` | 发布草稿到 period/current snapshot |
| `/api/progress-notes` | GET/POST | `ProgressNote` | 读写每周进展备注 |
| `/api/admin/config` | GET/PUT | `AdminConfig` | 读写管理配置 |
| `/api/admin/events` | GET | `AdminEvent[]` | 读取管理事件 |
| `/api/admin/rollback` | POST | `SnapshotVersion` | 按 versionId 回滚指定团队和周期 |
| `/api/admin/versions` | GET | `SnapshotVersion[]` | 查看团队/周期版本历史 |
| `/api/admin/versions/[id]` | GET | version + diff | 比较目标版本与当前团队/周期记录 |
| `/api/admin/backup` | GET | JSON backup | 导出配置、快照、草稿、进度和版本 |

## 11. 对接建议

### 如果同事要提供 OKR 数据

请直接通过页面编辑器录入，或者先由管理员在页面中创建 draft，再由对应 team lead / owner 补全。系统不再接受 Google Doc 或 CSV 作为导入源。

### 如果同事要接后端/数据库

按 Firestore 映射对齐即可：

```text
okrAdmin/config
okrAdmin/rollbackSnapshot  # legacy only
okrSnapshots/current
okrPeriodSnapshots/{periodId}
okrDrafts/{periodId_team}
okrProgressNotes/{periodId_team_objectiveId_weekStart}
okrAdminEvents/{eventId}
```

注意 `okrDrafts` 和 `okrProgressNotes` 的 document id 不是业务字段本身直接拼接，而是通过 `documentIdFromParts` 生成。

### 如果同事要改页面编辑逻辑

需要同时理解两套结构：

- 页面编辑态：`OkrDraft` / `EditableObjective` / `EditableKr`，progress 是 0 到 100。
- 发布态：`OkrSnapshot` / `OkrRecord`，score 是 0 到 1。

不要直接把 draft 当成 snapshot 写入；必须走 `draftToRecords` 和 validation。

### 如果同事要补权限

优先改 `AdminConfig.users`：

- 团队负责人用 `role=team_leader`，配置 `teams`。
- 普通成员用 `role=user`，配置 `ownerAliases`。
- `ownerAliases` 要和 OKR 数据里的 `owner` 能匹配，否则 owner-scoped edit/publish 会找不到对应记录。

## 12. 当前对接注意事项

- `AdminTeam.id` 已作为后台稳定标识；`OkrRecord.team` 和用户 `teams` 仍以名称对接，因此现有团队名称不允许在后台直接重命名，新团队在首次保存前可调整名称。
- `score` 和 `progress` 单位不同：snapshot 是 0-1，draft/UI/周进展是 0-100。
- File 模式下多个 JSON 文件是应用状态，不是源文档；批量修复应使用 `repair:okr-graph` / `migrate:alignment-edges`，常规更新走页面/API。
- 每次发布和 KR 状态更新都会写入 `okrSnapshotVersions`，回滚按团队和周期合并，不覆盖其他团队。
