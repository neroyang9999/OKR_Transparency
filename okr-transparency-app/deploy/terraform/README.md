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
Terraform 之外。没有这一条，两边都认为自己拥有这两个字段，发布会让 Terraform 留着一个过期值。

**注意这是预防性的**：见下一节 —— Terraform 目前没有管理任何资源，所以此刻不存在会被兑现的漂移。
这一条是为了将来真的接管时不会踩上去。

`var.image_tag` 因此只在**首次创建**服务时被读取。`image_tag.auto.tfvars` 里跟踪的值是
「线上现在跑什么」的记录，由发布流程的最后一步更新，见 `docs/RELEASE_CLOUD_RUN.md`。

## 这套配置从未被应用过

**线上不是 Terraform 建的。** 2026-08-22 排查确认：

- 部署机器和 Cloud Shell 家目录里都**没有** `terraform.tfstate`、`terraform.tfvars`，
  连 `.terraform/` 都没有 —— 也就是说从来没执行过 `terraform init`；
- 项目里 5 个 GCS 桶中没有任何 tfstate；
- 实际用来建站的那批脚本**一个 terraform 字样都没有**，全部是 `gcloud run` / `gcloud secrets` /
  `gcloud iam` / `gcloud artifacts` 调用。它们原本只存在于一个 Cloud Shell 家目录里，
  现已抓取进仓库：`deploy/scripts/provisioning/`。产出当前生产配置的是 `okr_finish_prod.sh`。

所以不存在「state 丢了」的问题 —— 从来就没有 state。这套 `.tf` 文件是写好了但没走过的一条路。

一个可验证的推论：`run.tf` 会设的 `FIRESTORE_DATABASE_ID` 在线上服务上**不存在**（其余 8 个环境变量
都在）。配置往前改过，而那次改动从没落到线上。

### 因此 `terraform apply` 现在不能直接跑

空 state 下 apply 会试图**创建** Artifact Registry、Cloud Run 服务、Secret、服务账号 ——
这些都已经存在，多数会以 `ALREADY_EXISTS` 报错失败。它不会静默替换线上，但 IAM binding 这类
累加型资源可能在报错前成功几条，留下多余绑定。

要让 Terraform 接管现有资源，只有一条路：先 `terraform import` 把每个资源逐个导入，
`terraform plan` 显示 `No changes` 之后才算接管成功。这是一次性的工作量，取决于你是否打算
以后用 Terraform 管基础设施。

### 如果决定接管，state 后端一并配好

`versions.tf` 里有一个注释掉的 `backend "gcs"` 块。首次 `init` 之前就把它打开，
可以省掉以后再迁一次：

```powershell
gcloud storage buckets create gs://<BUCKET> --project=knowledge-base-496322 --location=us-west1 --uniform-bucket-level-access
gcloud storage buckets update gs://<BUCKET> --versioning
# 取消 versions.tf 中 backend 块的注释并填入桶名，然后：
terraform init
# 接着逐个 terraform import，直到 terraform plan 输出 No changes
```

同时建议把 `.terraform.lock.hcl` 纳入版本控制（目前在 gitignore 里），
否则不同机器 `init` 可能拉到不同的 provider 版本，plan 结果不可复现。

### 如果决定不接管

那就把「gcloud 脚本是唯一事实来源」这件事写明，并认真考虑删掉这批 `.tf` 文件。
留一份从未运行、也没人敢运行的配置是最差的状态 —— 它会让读代码的人（包括
写下这份文档之前的我）以为基础设施是被 IaC 管着的，并据此做出错误判断。

## Apply

> **不要执行 `terraform apply`。** 上一节说明了原因：这套配置从未被应用，空 state 会去创建已经存在的
> 资源。这里**不给** apply 的命令序列 —— 之前给了，而它是行不通的。
>
> 要接管现有资源，路径是 import，见上一节。日常发布请用 `docs/RELEASE_CLOUD_RUN.md`。

配置本身描述的目标状态（供 import 时对照）：Cloud Run 直连 IAP、`roles/run.invoker` 只授予 IAP
服务代理、把准确的 JWT audience 注入应用。`IAP_EXPECTED_AUDIENCE` 不能去掉 —— 缺少或无效的
IAP 签名 JWT 时应用会 fail closed。

已知配置与现实的差异（import 之前都要处理）：

| 配置声明 | 线上实际 |
| --- | --- |
| `run.tf` 设 `FIRESTORE_DATABASE_ID` | 服务上没有这个环境变量 |
| `google_project_iam_member.api_secret_accessor`（项目级） | `secretmanager.secretAccessor` 是**按 secret** 绑定的 |
| `secrets.tf` 用 `random_password` 生成密钥值 | 密钥由 `okr_finish_prod.sh` 创建；若 import，Terraform 会想轮换它们，而且值会明文进 state |

## Migrate data

**这一步在 2026 年 7 月已经做过了**，生产自那时起就在 Firestore 上。实际执行的是
`deploy/scripts/provisioning/okr_migrate_data.sh`。下面的命令保留是为了给**新环境**灌初始数据 ——
对着现有生产环境跑它会覆盖数据。

需要时，从 `okr-transparency-app` 用有 Firestore 写权限的凭证执行：

```powershell
$env:OKR_STORAGE = "firestore"
$env:FIRESTORE_PROJECT_ID = "knowledge-base-496322"
npm run migrate:firestore
```

Do not delete the local `data/` directory. Keep it as the rollback source until
the Cloud Run deployment has been validated.
