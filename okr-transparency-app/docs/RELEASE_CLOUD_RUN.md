# Cloud Run 发布流程

这份文档是 OKR Transparency App 的生产发布 runbook。目标是把“最近已合并的 PR + 版本号”安全发布到 Cloud Run，并在切流前验证候选修订。

## 生产环境固定信息

- GCP project：`knowledge-base-496322`
- Cloud Run service：`okr-transparency-app`
- Region：`us-west1`
- Artifact Registry：`us-west1-docker.pkg.dev/knowledge-base-496322/unitx-internal/okr-transparency-app`
- 对外生产 URL：`https://okr-transparency.unitxlabs.com/`
- Cloud Run 原始 URL：`https://okr-transparency-app-403984849396.us-west1.run.app/`
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
4. 发布提交已经推送到 GitHub `main`。正式发布建议同时创建并推送匹配的 Git tag；tag 是追溯凭证，不是 Cloud Run 发布的技术前置条件。

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

## Terraform 与应用发布边界

当前 Terraform 配置没有声明 remote backend，因此 Terraform 默认使用执行机本地 state。若当前机器找不到与生产环境匹配的 `terraform.tfstate` 和 `terraform.tfvars`，不要执行 `terraform apply`：空 state 可能把已经存在的 Artifact Registry、Cloud Run、IAP、Secret 和 IAM 资源视为未创建，导致创建失败、重复资源或配置漂移。

本次代码发布采用 Cloud Build 构建镜像，再通过 Cloud Run 创建 0 流量候选修订、完成冒烟验证后切换流量，不需要 Terraform，也不会迁移、覆盖或删除 Firestore 数据。

镜像和流量分配归发布流程所有，Terraform 不再管这两个字段（`run.tf` 的 `lifecycle.ignore_changes`）。所以按本文档发布**不会**再产生 Terraform drift，也不需要在发布后手工去改 `terraform.tfvars`。

但要在切流后更新 `deploy/terraform/image_tag.auto.tfvars`，见第 7 节。它是「线上现在跑什么」的记录，不是控制开关 —— 改它不会部署任何东西。

以下变更仍应通过持有正确 state 的部署环境执行 Terraform：Cloud Run 服务配置、IAP、IAM、Secret、环境变量、扩缩容参数、Artifact Registry 和其他基础设施。

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

先替换下面 3 个变量，再执行后续命令。`VERSION_ID` 建议使用不含点号的短版本，例如 `v082`；`PR_ID` 写本次包含的 PR 范围，例如 `pr19-pr20`。

```bash
VERSION_ID="vXYZ"
PR_ID="prN"
MERGE_COMMIT_SHA="<MERGE_COMMIT_SHA>"
IMAGE_TAG="${VERSION_ID}-${PR_ID}-${MERGE_COMMIT_SHA}"
```

构建并推送：

```bash
gcloud builds submit \
  --project=knowledge-base-496322 \
  --config=cloudbuild.yaml \
  --substitutions=_TAG=${IMAGE_TAG} \
  .
```

`cloudbuild.yaml` 额外维护一个 `:deps-cache` tag：依赖层单独构建并推送，下一次构建在 `package-lock.json` 未变时复用它，跳过 `npm ci` 以及把 `node_modules` COPY 进 builder 阶段那一层。这个 tag 是构建缓存、不是发布产物，**不要**把它部署到 Cloud Run。

> 不要再用 `gcloud builds submit --tag=...`。那种形式没有缓存来源，每次从零构建全部层。

记录输出中的：

- Cloud Build ID
- `STATUS: SUCCESS`
- 镜像 digest

构建上下文必须是 `okr-transparency-app`，不要从包含本地业务数据的上级目录构建。`.dockerignore` 应排除 `data`。

想确认缓存是否命中，看 `build-deps` 这一步的耗时：命中在 10s 以内，未命中约 50s（`npm ci` 重跑）。

```bash
gcloud builds describe <BUILD_ID> \
  --project=knowledge-base-496322 \
  --format='table(steps[].id,steps[].timing.startTime,steps[].timing.endTime)'
```

`package-lock.json` 一变，`npm ci` 必然重跑，这是预期行为，不是缓存失效。

## 4. 创建 0 流量候选修订

```bash
gcloud run deploy okr-transparency-app \
  --project=knowledge-base-496322 \
  --region=us-west1 \
  --image=us-west1-docker.pkg.dev/knowledge-base-496322/unitx-internal/okr-transparency-app:${IMAGE_TAG} \
  --revision-suffix=${IMAGE_TAG} \
  --no-traffic \
  --tag=${IMAGE_TAG}
```

命令成功后会返回候选 URL，格式为：

```text
https://${IMAGE_TAG}---okr-transparency-app-exfisl5cna-uw.a.run.app
```

## 5. 候选冒烟验证

在已经登录 IAP 的浏览器中打开：

```text
https://${IMAGE_TAG}---okr-transparency-app-exfisl5cna-uw.a.run.app/map?period=2026-q3
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
  --to-revisions=okr-transparency-app-${IMAGE_TAG}=100
```

随后在对外生产 URL 上重新验证同一页面：

```text
https://okr-transparency.unitxlabs.com/map?period=2026-q3
```

也可以检查流量归属：

```bash
gcloud run services describe okr-transparency-app \
  --project=knowledge-base-496322 \
  --region=us-west1 \
  --format='value(status.traffic)'
```

## 7. 记录已部署的镜像 tag

切流成功后，把 `deploy/terraform/image_tag.auto.tfvars` 更新为本次的 tag 并提交：

```hcl
image_tag = "v085-pr25-pr28-693dcb8"
```

为什么要做这件事：

- 这是仓库里唯一一处记录「线上此刻跑的是哪个镜像」的地方，可 review、可查历史。`terraform.tfvars` 是 gitignore 的，只存在于某台机器上，谁都看不到。
- Terraform 自动加载 `*.auto.tfvars`，且它的优先级**高于** `terraform.tfvars`，所以这个纳管的值会覆盖部署机器上可能早已过期的本地值（`terraform.tfvars.example` 里的示例值是 `staging`）。
- 它只在 Terraform **首次创建**服务时被真正使用。既有服务的镜像由 `ignore_changes` 排除在外，所以改这个文件不会部署任何东西。

## 8. 回滚

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
image_tag.auto.tfvars：已更新为本次 tag
数据：Firestore 未迁移、未修改
```
