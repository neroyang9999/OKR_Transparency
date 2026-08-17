# Cloud Run 发布流程

这份文档是 OKR Transparency App 的生产发布 runbook。目标是把“最近已合并的 PR + 版本号”安全发布到 Cloud Run，并在切流前验证候选修订。

## 生产环境固定信息

- GCP project：`knowledge-base-496322`
- Cloud Run service：`okr-transparency-app`
- Region：`us-west1`
- Artifact Registry：`us-west1-docker.pkg.dev/knowledge-base-496322/unitx-internal/okr-transparency-app`
- 生产 URL：`https://okr-transparency-app-403984849396.us-west1.run.app/`
- 生产认证：IAP；测试账号通常为 `xinyang.yang@unitxlabs.com`
- 生产存储：Firestore

生产 OKR 数据不在镜像中。构建和切换镜像不会迁移、覆盖或删除 Firestore 数据。

## 发布前检查

在仓库根目录执行：

```powershell
git fetch origin
git log origin/main -12 --oneline --decorate
git status -sb
```

确认：

1. 最近要发布的 PR 已经合入 `origin/main`，记录合并提交 SHA。
2. 工作区中的本地演示数据、`.claude/`、压缩包等无关文件不会进入构建上下文。
3. `okr-transparency-app/package.json` 和 `package-lock.json` 版本一致。
4. 发布提交和 tag 已经存在于 GitHub；如果版本 bump 尚未推送，先完成版本提交和 tag，再部署。

版本发布文件只应包括：

- `okr-transparency-app/package.json`
- `okr-transparency-app/package-lock.json`
- `okr-transparency-app/CHANGELOG.md`

建议在发布提交前运行：

```powershell
cd .\okr-transparency-app
npm test
npm run lint
npm run build
```

## 不要直接运行 Terraform

本项目的 Terraform 配置没有远程 backend，state 是本地文件。若当前机器找不到部署机器上的 `terraform.tfstate` 和实际 `terraform.tfvars`，不要执行 `terraform apply`：空 state 会把已经存在的 Artifact Registry、Cloud Run、IAP、Secret 和 IAM 资源当成不存在，可能造成重复资源或配置漂移。

本次应用发布只需要构建镜像和更新 Cloud Run 修订，不需要 Terraform。

## 1. 准备干净主线

使用精确的合并提交构建，避免把本地未提交文件带进镜像。Cloud Shell 示例：

```bash
rm -rf /tmp/okr-release
git clone https://github.com/neroyang9999/OKR_Transparency.git /tmp/okr-release
cd /tmp/okr-release
git checkout <MERGE_COMMIT_SHA>
cd okr-transparency-app
git rev-parse HEAD
grep '"version"' package.json | head
```

`<MERGE_COMMIT_SHA>` 必须是已经合入 `main` 的提交，例如 `7eca76f`。

## 2. 确保 Cloud Shell 账号有效

Cloud Shell 可能显示已连接，但 gcloud 仍没有 active account。部署前检查：

```bash
gcloud auth list
gcloud config get-value account
```

如果没有 active account，而 `gcloud auth list` 能看到公司账号，选择它：

```bash
gcloud config set account xinyang.yang@unitxlabs.com
```

如果账号完全不存在，需要在 Cloud Shell 中完成交互式登录：

```bash
gcloud auth login xinyang.yang@unitxlabs.com
```

不要把 OAuth code、密码或 token 写入文档、命令历史或聊天记录。

## 3. 构建并推送镜像

tag 要同时包含版本、PR 范围和提交 SHA，便于追溯：

```bash
gcloud builds submit \
  --project=knowledge-base-496322 \
  --tag=us-west1-docker.pkg.dev/knowledge-base-496322/unitx-internal/okr-transparency-app:v082-pr20-7eca76f \
  .
```

记录输出中的：

- Cloud Build ID
- `STATUS: SUCCESS`
- 镜像 digest

构建上下文必须是 `okr-transparency-app`，不要从包含本地业务数据的上级目录构建。`.dockerignore` 应排除 `data`。

## 4. 创建 0 流量候选修订

```bash
gcloud run deploy okr-transparency-app \
  --project=knowledge-base-496322 \
  --region=us-west1 \
  --image=us-west1-docker.pkg.dev/knowledge-base-496322/unitx-internal/okr-transparency-app:v082-pr20-7eca76f \
  --revision-suffix=v082-pr20-7eca76f \
  --no-traffic \
  --tag=v082-pr20-7eca76f
```

命令成功后会返回候选 URL：

```text
https://v082-pr20-7eca76f---okr-transparency-app-exfisl5cna-uw.a.run.app
```

## 5. 候选冒烟验证

在已经登录 IAP 的浏览器中打开：

```text
https://v082-pr20-7eca76f---okr-transparency-app-exfisl5cna-uw.a.run.app/map?period=2026-q3
```

至少确认：

- 页头显示目标版本，例如 `v0.8.2`；
- 登录身份是预期账号；
- `/map?period=2026-q3` 能加载；
- Objective 数量、团队分组、个人 OKR 和进度数据正常；
- 没有 IAP 登录循环、500、空白页或 API 错误。

候选失败时停止，不要切流；修复后使用新的 tag 和 revision suffix 重做候选。

## 6. 切换 100% 生产流量

确认候选冒烟通过且 active account 有效后执行：

```bash
gcloud run services update-traffic okr-transparency-app \
  --project=knowledge-base-496322 \
  --region=us-west1 \
  --to-revisions=okr-transparency-app-v082-pr20-7eca76f=100
```

随后在生产 URL 上重新验证同一页面：

```text
https://okr-transparency-app-403984849396.us-west1.run.app/map?period=2026-q3
```

也可以检查流量归属：

```bash
gcloud run services describe okr-transparency-app \
  --project=knowledge-base-496322 \
  --region=us-west1 \
  --format='value(status.traffic)'
```

## 7. 回滚

保留上一版本 revision，不要立即删除。出现线上错误时，将流量切回已验证的 revision：

```bash
gcloud run services update-traffic okr-transparency-app \
  --project=knowledge-base-496322 \
  --region=us-west1 \
  --to-revisions=<PREVIOUS_REVISION>=100
```

例如 `okr-transparency-app-v081-pr18-02850ae` 是 `v0.8.1` 的回滚修订。

## 发布记录模板

每次发布至少记录：

```text
版本：vX.Y.Z
包含 PR：#...
主线提交：...
Cloud Build：...
镜像 digest：...
候选 revision：...
候选冒烟：通过 / 失败
生产 revision：...
生产流量：100%
回滚 revision：...
数据：Firestore 未迁移、未修改
```

