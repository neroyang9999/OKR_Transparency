# OKR Transparency App Terraform

Target project: `knowledge-base-496322`.

This deploys the Next.js OKR app to Cloud Run, stores app secrets in Secret
Manager, grants the runtime service account Firestore access, and binds IAP
access to `domain:unitxlabs.com` by default. It also enables Cloud Translation
and grants the runtime service account `roles/cloudtranslate.user` so OKR text
can be translated without storing a service-account key in the application.

## One-time setup

1. Select the project:

   ```powershell
   gcloud config set project knowledge-base-496322
   ```

2. Configure the OAuth consent screen for IAP:

   `APIs & Services -> OAuth consent screen`

   Use Internal user type, app name `OKR Transparency App`, and a UnitX support
   email. Save through the scopes step.

3. Create Firestore Native mode in this project if it does not already exist.

## Build and push

From `okr-transparency-app`:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\scripts\push-image.ps1 -Tag staging
```

## 职责边界：Terraform 管什么，发布流程管什么

| 归属 | 内容 |
| --- | --- |
| Terraform | Cloud Run 服务的形状：IAP、Secret、IAM、扩缩容、环境变量、Artifact Registry |
| 发布流程 | 线上跑哪个镜像、流量怎么在 revision 之间分配 |

`run.tf` 用 `lifecycle.ignore_changes` 把 `template[0].containers[0].image` 和 `traffic` 排除在
Terraform 之外。没有这一条时两边都认为自己拥有这两个字段，发布会让 Terraform 留着一个过期值，
下一次 apply 就会用那个旧 tag 建一个新 revision、并把流量全切给它 —— 静默回滚生产。

`var.image_tag` 因此只在**首次创建**服务时被读取。`image_tag.auto.tfvars` 里跟踪的值是
「线上现在跑什么」的记录，由发布流程的最后一步更新，见 `docs/RELEASE_CLOUD_RUN.md`。

## State 后端

`versions.tf` 里有一个注释掉的 `backend "gcs"` 块。当前 state 是本地的：只有最后执行过 apply 的
那台机器能继续 apply，`terraform.tfstate` 又在 gitignore 里，所以没人能 review 生产配置，
而那台机器一旦丢失，全新的 `init` 会从空 state 开始，试图创建已经存在的资源。

启用步骤（必须在持有当前 state 的机器上执行）：

```powershell
gcloud storage buckets create gs://<BUCKET> --project=knowledge-base-496322 --location=us-west1 --uniform-bucket-level-access
gcloud storage buckets update gs://<BUCKET> --versioning
copy terraform.tfstate terraform.tfstate.before-backend-migration
# 取消 versions.tf 中 backend 块的注释并填入桶名，然后：
terraform init -migrate-state
```

`init -migrate-state` 只是把 state 文件复制进桶里，不调用任何会改动基础设施的 GCP API，
因此不会影响正在运行的服务。

迁移完成后建议把 `.terraform.lock.hcl` 也纳入版本控制（目前在 gitignore 里），
否则不同机器 `init` 可能拉到不同的 provider 版本，plan 结果因此不可复现。

## Apply

> **重要：只允许在持有生产 `terraform.tfstate` 和实际 `terraform.tfvars` 的部署机器上执行。**
>
> 当前机器缺少与生产匹配的 state 或 tfvars 时，禁止执行 `terraform apply`。先找到 state 所在的部署环境；代码发布本身请按 `docs/RELEASE_CLOUD_RUN.md` 的 Cloud Build + Cloud Run 候选流程执行。
>
> **先读 plan 再 apply。** 在 `ignore_changes` 落地后的第一次 apply 尤其要看：state 已经和现实错开
> 一段时间了，那一次可能想改动一些别的东西。验收标准是 plan 里**没有** `containers[0].image`
> 和 `traffic` 的变更，理想情况是整体 `No changes`。

```powershell
cd .\deploy\terraform
copy terraform.tfvars.example terraform.tfvars
terraform init
terraform apply
```

Terraform enables Cloud Run direct IAP, grants `roles/run.invoker` only to the
IAP service agent, and injects the exact expected JWT audience into the app.
Do not remove `IAP_EXPECTED_AUDIENCE`; the app fails closed when a signed IAP
JWT is missing or invalid.

## Migrate data

Before production cutover, run from `okr-transparency-app` with credentials that
can write Firestore:

```powershell
$env:OKR_STORAGE = "firestore"
$env:FIRESTORE_PROJECT_ID = "knowledge-base-496322"
npm run migrate:firestore
```

Do not delete the local `data/` directory. Keep it as the rollback source until
the Cloud Run deployment has been validated.
