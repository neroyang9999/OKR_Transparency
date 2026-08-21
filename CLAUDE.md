# OKR Transparency — 协作约定

## 仓库结构

```
OKR专项/                      ← git 仓库根（不是 app 根）
├── okr-transparency-app/     ← Next.js 应用，几乎所有代码在这里
├── .worktrees/               ← 所有开发用的 worktree（未纳入版本控制）
└── CLAUDE.md
```

注意 git 仓库根比应用根高一层。`git status` 输出的路径都带 `okr-transparency-app/` 前缀，而在应用目录内执行的 pathspec 是相对当前目录的 —— 两者混用会得到空结果。

## 工作流铁律

**开发一律在 worktree 里进行，`main` 是只读镜像。**

`main` 工作树的唯一职责是回答"线上到底是什么样"。它只接受 `git pull --ff-only`，**永不编辑**。哪怕只改一行文案也开 worktree —— 一条规则比两条可靠。

### 开新任务

从**最新的 origin/main** 切，不要从本地 HEAD 切：

```bash
git fetch origin
git worktree add .worktrees/<任务名> -b <前缀>/<任务名> origin/main
```

分支前缀按发起方：`codex/`、`claude/`、`agent/`。

### 任务结束

PR 合并后**立刻**回收，不要留到下次：

```bash
git worktree remove --force .worktrees/<任务名>
git branch -d <前缀>/<任务名>
```

每个 worktree 有自己的 `node_modules` + `.next`，约 0.9–1.7 GB。10 个不清理就是 13 GB。

## 常用命令

在 `okr-transparency-app/` 下执行：

```bash
npm install
npm test          # vitest run --environment node src
npm run lint
npm run build
npm run dev
```

要在真实应用里验证某个行为，用种子脚本一条命令造场景，别手写 fixture：

```bash
npm run seed:local                                  # QA Team / yating li，一个已对齐 + 一个未对齐
node scripts/seed-local.mjs --team "AP OPS" --as zhicheng@unitxlabs.com
node scripts/seed-local.mjs --no-member-aligned     # 成员 Objective 全部未对齐
npm run seed:local:restore                          # 还原（务必执行）
```

它会写 `.env.local`（`OKR_DEV_BYPASS_AUTH` + file 存储）并打印该打开的 URL。身份从 `data/okr-admin-config.json` 反查，不用手填负责人和显示名。

技术栈：Next.js 16 / React 19 / TypeScript / Tailwind 3 / vitest。

## 已经踩过的坑

以下都是真实发生过的，别重复：

- **本地 main 落后 23 个提交没人发现。** 所有开发都在 worktree 里，主工作树从来没 pull 过，磁盘上是几个版本前的代码。在 `main` 目录下读代码前先 `git fetch && git status` 确认它是最新的，否则你会基于早已删除的文件推理。
- **在 main 里改了 828 行然后弃置。** 那些改动在 git 历史中完全不存在，还与后续上游改动冲突，堵住了 fast-forward。要么当场开 PR，要么当场丢弃。
- **同一件事出现两个分支副本**（`codex/action-center-draft` 与 `agent/action-center-workflow`）。开工前先 `git branch -a | grep <关键词>` 查有没有人在做。
- **删 worktree 前必须确认没有未合并工作。** 检查 `git -C <worktree> status --porcelain` 和 `git -C <worktree> rev-list --count origin/main..HEAD`，两者都为空/0 才能删。
- **手写本地 fixture 三次踩空。** `readDraft` 读 `data/okr-period-snapshots.json` 的优先级高于 `data/okr-snapshot.json`，只写后者会得到"0 个 Objective"；成员级记录必须同时带 `owner_email`（`filterDraftByOwner` 按邮箱判 scope）和与配置一致的 `owner` 显示名（按 ownerAliases 判归属），错一个就被静默过滤。用 `npm run seed:local`，别手写。
- **`data/okr-drafts.json` 和 `data/okr-period-snapshots.json` 列在 `.gitignore` 里却仍被跟踪**（先提交后加规则，gitignore 对已跟踪文件无效）。本地跑应用照样会把它们改脏，提交前务必 `git status -- data`。CI 有一步专门拦这个。
- **修"某功能拿不到数据"类 bug 时，先查谁消费这个返回值。** 数据一旦出现，所有依赖它的休眠代码会同时激活。真实案例：修好成员对齐候选后，一段一直是死代码的 `withDefaultAlignment` 被唤醒，开始自动预选对齐目标，导致又发一版。改前先 `grep` 消费点，并把它们列进验证清单。
- **验证时"没要求却发生的行为"是疑点，不是成功信号。** 上面那次自动预选，第一轮本地验证就看到了，却被当成"修复生效"的证据。

## 其他

- `okr-transparency-app/data/*.json` 是 `OKR_STORAGE=file` 模式下的数据存储。它们**已纳入版本控制**，本地跑应用会把它们改脏 —— 提交前确认这是你想要的改动，而不是随手跑出来的运行状态。
- 根目录 `.gitignore` 有 `/*.md` 规则（忽略根级 markdown 草稿）。本文件靠 `!CLAUDE.md` 例外才被跟踪，新增根级文档同样需要加例外。
- PR 会跑 CI（`.github/workflows/ci.yml`：`npm ci` / `test` / `lint` / `build`，外加一步检查 `data/` 下被跟踪文件未被改动）。本地不必再串行跑一遍全套，push 后看 PR 检查即可。
