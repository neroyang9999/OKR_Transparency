# 生产环境实际是怎么建起来的

这些脚本是 `knowledge-base-496322` 里那套线上环境**唯一的**创建记录。它们原本只存在于一个
Cloud Shell 家目录里，不在版本控制内，于 2026-08-22 抓取进仓库。

抓取的原因：Cloud Shell 家目录在长期不活跃后会被 Google 回收。一旦回收，「线上的 IAP、
Secret、IAM 当初是怎么配起来的」就没有任何记录了。

## 重要：这是历史，不是 runbook

**不要直接运行这些脚本。** 它们是一次性的、按当时情况写的，其中几个指向已经废弃的项目或镜像
tag。日常发布请用 `docs/RELEASE_CLOUD_RUN.md`。

## 当前生产配置是哪个脚本产出的

**`okr_finish_prod.sh`。** 两条证据：

- 它是唯一带 `--iap` 的脚本；
- 它的环境变量清单和线上服务**完全一致** —— 包括**没有** `FIRESTORE_DATABASE_ID`。
  （`deploy_okr_app.sh` 和 `deploy_okr_to_kb_project.sh` 都会设这个变量，线上却没有，
  所以产出当前配置的不是它们。）

它做的事：确保服务账号存在 → 确保两个 secret 存在 → 给运行时 SA 授予 secret 访问 →
授予 Firestore/Datastore 访问 → 确保 Firestore 默认库 → 给 IAP 服务代理授予 invoke 权限 →
带 `--iap` 部署。

## 每个文件

| 文件 | 作用 |
| --- | --- |
| `check_okr_kb_project.sh` | 只读体检：项目、账单、IAM、API 状态、Cloud Run 服务、Artifact Registry、SA 与 secret |
| `okr_finish_prod.sh` | **产出当前生产配置的那个脚本**（见上） |
| `deploy_okr_to_kb_project.sh` | 完整部署到 knowledge-base：Firestore 存储 + `--set-secrets` + 专用 SA |
| `deploy_okr_smoke_kb.sh` | 冒烟版：file 存储 + `--set-secrets` + 专用 SA |
| `deploy_okr_minimal_kb.sh` | 最小版：file 存储，密钥现场生成后**用 `--set-env-vars` 传入**（见下方安全说明） |
| `okr_secretize.sh` | 把密钥从环境变量搬到 Secret Manager 引用 —— 上面那个弱做法的修正 |
| `okr_migrate_data.sh` | 一次性把 `data/*.json` 灌进 Firestore。**内嵌的数据载荷已在抓取时移除**，见文件内说明 |
| `deploy_okr_app.sh` | 更早的一次部署，目标是 **另一个项目** `gen-lang-client-0913302758`（已废弃） |

## 一条安全说明

`deploy_okr_minimal_kb.sh` 用 `--set-env-vars AUTH_SECRET=${AUTH_SECRET}` 传密钥。Cloud Run 的
环境变量对任何有 viewer 权限的人都可见，而 Secret Manager 引用不会。

**这不影响当前线上**：生产用的是 `--set-secrets`，已通过线上服务实际配置核实（`AUTH_SECRET` 和
`OKR_ADMIN_TOKEN` 都是 secret 引用）。而 `okr_secretize.sh` 的存在说明当时就发现并修掉了这个问题。
留在这里是为了完整记录，**不要照这个模式写新脚本**。

## 曾经有一套 Terraform 配置

`deploy/terraform/` 里曾有一套描述同一套基础设施的 Terraform 配置。它**从未被应用过一次** ——
任何机器和任何 GCS 桶里都不存在 `terraform.tfstate`，连 `.terraform/` 都没有。2026-08-22 删除。

删除的原因不是「Terraform 不好」，而是那份配置唯一在产生的作用是误导读者：它让人以为基础设施被
IaC 管着，并据此推断出一个并不存在的漂移风险。想接管现有资源需要逐个 `terraform import`，
而且它的 `secrets.tf` 会让生产密钥明文进 state —— 对一个几乎不变的内部工具不划算。

要考古的话在 git 历史里（删除提交的 message 记录了完整判断）。将来如果真的要用 Terraform，
更合理的做法是从零建新环境，而不是 import 这套。
