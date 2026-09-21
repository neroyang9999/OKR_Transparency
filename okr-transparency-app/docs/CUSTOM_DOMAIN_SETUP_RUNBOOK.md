# Cloud Run 自定义子域名配置复盘与 Runbook

本文复盘 `okr-transparency.unitxlabs.com` 绑定到 Cloud Run 的实际过程，并提供一套人和 Agent 都能复用的操作规程。

适用场景：网站已部署在 Google Cloud Run，希望使用公司域名下的子域名访问；GCP 和 DNS 由不同人员管理。

## 1. 本次结果

| 项目 | 实际值 |
| --- | --- |
| GCP Project 名称 | `Knowledge Base` |
| GCP Project ID | `knowledge-base-496322` |
| Cloud Run Service | `okr-transparency-app` |
| Region | `us-west1` |
| Cloud Run 原始 URL | `https://okr-transparency-app-403984849396.us-west1.run.app/` |
| 自定义域名 | `https://okr-transparency.unitxlabs.com/` |
| DNS 根域名 | `unitxlabs.com` |
| 最终路由记录 | `okr-transparency CNAME ghs.googlehosted.com` |
| GCP 操作账号 | `xinyang.yang@unitxlabs.com` |
| DNS 管理方 | `unitxlabs.com` 的域名管理员 |

注意：`OKR-Transparency / okr-transparency` 和 `nero / gen-lang-client-0913302758` 的 Cloud Run Services 列表均为空。当前生产服务不在这两个项目中。

## 2. 一句话原理

先用 TXT 记录证明当前 Google 账号有权管理 `unitxlabs.com`，再让 Cloud Run 为 `okr-transparency.unitxlabs.com` 创建域名映射，最后用 GCP 生成的 CNAME 把该子域名路由到 Google，并由 Google 自动签发 HTTPS 证书。

```text
用户访问 https://okr-transparency.unitxlabs.com
  -> DNS 查询 okr-transparency.unitxlabs.com
  -> CNAME ghs.googlehosted.com
  -> Google 根据 Cloud Run Domain Mapping 找到 okr-transparency-app
  -> IAP / Cloud Run 返回网站
```

## 3. TXT 和 CNAME 分别做什么

| 记录 | 作用 | 本次 Name | 本次 Value |
| --- | --- | --- | --- |
| TXT | 验证根域名所有权 | `@`（即 `unitxlabs.com`） | `google-site-verification=<Search Console 生成值>` |
| CNAME | 把子域名路由到 Google | `okr-transparency` | `ghs.googlehosted.com` |

`@` 代表 DNS 根域名，所以 TXT 的 Name 是 `@`；`okr-transparency` 代表完整域名 `okr-transparency.unitxlabs.com`。

TXT 验证值必须由 Google Search Console 当次生成，不要从历史文档或聊天记录复制。最终 CNAME 也必须以 Cloud Run Domain Mapping 页面显示的 `resourceRecords` 为准；本次实际生成的是 `ghs.googlehosted.com`，但这不等于所有项目、区域和接入方案都固定使用该值。

## 4. 职责边界

本次有两个明确角色：

1. GCP 操作者：确认项目和服务、验证域名、创建 Domain Mapping、读取 GCP 生成的 DNS records、验证证书和网站。
2. DNS 管理员：在 `unitxlabs.com` DNS zone 中添加 GCP 指定的 TXT/CNAME/A/AAAA 记录。

如果 Agent 只能访问 GCP、不能访问 DNS 管理平台，就只能生成并交付 DNS 记录，不能声称 DNS 已修改。未经用户明确授权，不应修改或删除线上 DNS 记录。

## 5. 人类操作流程

### 5.1 先确认服务，不要只看项目名称

打开 Cloud Run Services：

`https://console.cloud.google.com/run/services?project=knowledge-base-496322`

确认：

- Project：`knowledge-base-496322`
- Service：`okr-transparency-app`
- Region：`us-west1`
- 原始 `run.app` URL 可访问

项目显示名可能相似，必须以 Project ID 为准。不要因为存在名为 `OKR-Transparency` 的项目，就假定服务在该项目中。

### 5.2 打开 Domain Mappings

打开：

`https://console.cloud.google.com/run/domains?project=knowledge-base-496322`

点击 `Add mapping`，选择：

- Service：`okr-transparency-app (us-west1)`
- Base domain：`unitxlabs.com`

### 5.3 验证根域名所有权

如果 GCP 显示 `unitxlabs.com` 尚未验证：

1. 打开 Google Search Console 的域名验证页面。
2. 选择 DNS TXT 验证。
3. 将 Search Console 生成的完整 TXT 值交给 DNS 管理员。
4. DNS 管理员添加：

```text
Type: TXT
Name: @
Value: google-site-verification=<Google 当次生成值>
TTL: 默认
```

5. DNS 生效后，在 Search Console 点击 `Verify`。
6. 回到 Cloud Run Domain Mapping，点击 `Refresh`。

如果根域名已经在当前 Google 账号下验证，这一步可能自动跳过。域名验证通常绑定到验证它的 Google 账号；其他账号或 Service Account 要创建映射时，需要把它加入 verified owners。

### 5.4 创建子域名映射

验证成功后：

1. Verified domain 选择 `unitxlabs.com`。
2. Subdomain 填 `okr-transparency`。
3. 完整目标应显示为 `okr-transparency.unitxlabs.com`。
4. 点击 `Continue`。
5. 等待 GCP 创建映射并显示 DNS records。

### 5.5 将 GCP 生成的 DNS records 交给 DNS 管理员

本次 GCP 生成：

```text
Type: CNAME
Name: okr-transparency
Value: ghs.googlehosted.com
TTL: 默认
```

DNS 控制台有时把 Value 显示为 `ghs.googlehosted.com.`，末尾的点表示绝对域名；是否保留由 DNS 服务商界面决定。

必须完整转交 Cloud Run 显示的全部记录。若 GCP 返回 A、AAAA、CNAME 或额外 TXT，不得擅自删减或用“常见值”替代。

### 5.6 等待 DNS 和证书

- DNS 通常几分钟生效，也可能因 TTL 和注册商缓存需要数小时。
- Google 管理的 HTTPS 证书通常约 15 分钟签发，最长可能需要 24 小时。
- Cloud Run 页面可能先显示 `Loading` 或 `Waiting for certificate provisioning`。

等待期间不要重复创建同一域名的 mapping，也不要反复修改已正确的 CNAME。

### 5.7 验收

至少完成以下检查：

1. DNS：`okr-transparency.unitxlabs.com` 的 CNAME 正确指向 GCP 显示的目标。
2. Cloud Run：Domain Mapping 状态不再是错误或持续 provisioning。
3. HTTPS：浏览器访问 `https://okr-transparency.unitxlabs.com/` 无证书错误。
4. 认证：IAP 登录流程正常，登录身份符合预期。
5. 页面：`/` 和 `/map?period=2026-q3` 能加载，数据与原始 `run.app` URL 一致。
6. 日志：Cloud Run 最近请求无新增持续性 ERROR。

最终只对外传播 HTTPS URL，不使用 `http://` 作为正式入口。

## 6. Agent 执行规程

### 6.1 输入参数

Agent 开始前必须收集或读取以下值：

```text
PROJECT_ID
SERVICE_NAME
REGION
BASE_DOMAIN
SUBDOMAIN
FULL_DOMAIN
DNS_OWNER
GCP_ACCOUNT
```

本次对应：

```text
PROJECT_ID=knowledge-base-496322
SERVICE_NAME=okr-transparency-app
REGION=us-west1
BASE_DOMAIN=unitxlabs.com
SUBDOMAIN=okr-transparency
FULL_DOMAIN=okr-transparency.unitxlabs.com
DNS_OWNER=unitxlabs.com 域名管理员
GCP_ACCOUNT=xinyang.yang@unitxlabs.com
```

### 6.2 只读预检

先确认当前账号、项目和服务：

```bash
gcloud auth list
gcloud config get-value account
gcloud run services describe okr-transparency-app \
  --project=knowledge-base-496322 \
  --region=us-west1 \
  --format='yaml(metadata.name,status.url,status.conditions,status.traffic)'
```

成功标准：服务存在、区域正确、原始 URL 可访问。若服务不存在，停止；不要在名称相似的项目中自动创建替代服务。

### 6.3 检查域名验证与现有映射

```bash
gcloud domains list-user-verified

gcloud beta run domain-mappings describe \
  --domain=okr-transparency.unitxlabs.com \
  --project=knowledge-base-496322 \
  --region=us-west1 \
  --format='yaml(metadata.name,spec.routeName,status.conditions,status.resourceRecords)'
```

判断规则：

- Domain Mapping 已存在：读取并验证，不重复创建。
- Mapping 不存在但根域名已验证：创建 mapping。
- 根域名未验证：生成 Search Console 验证流程并暂停在 DNS TXT 交接处。

### 6.4 创建映射

优先使用 GCP Console，因为首次 Search Console 域名验证是交互流程。根域名已验证时，也可以执行：

```bash
gcloud beta run domain-mappings create \
  --service=okr-transparency-app \
  --domain=okr-transparency.unitxlabs.com \
  --project=knowledge-base-496322 \
  --region=us-west1
```

创建后再次 `describe`，只把 `status.resourceRecords` 中实际返回的记录交给 DNS 管理员。

### 6.5 DNS 验证命令

Windows PowerShell：

```powershell
Resolve-DnsName -Server 8.8.8.8 `
  -Name 'okr-transparency.unitxlabs.com' `
  -Type CNAME
```

Linux/macOS：

```bash
dig @8.8.8.8 CNAME okr-transparency.unitxlabs.com +short
```

本次预期输出：

```text
ghs.googlehosted.com.
```

只看到本地 DNS 正确还不够；优先使用公共解析器或 Google Admin Toolbox 再确认一次。

### 6.6 HTTPS 和应用验证

```bash
curl -I https://okr-transparency.unitxlabs.com/
```

对于 IAP 保护的网站，未登录请求返回 Google 登录相关的 `302` 可以是正常结果；不能把 `302` 一概判为失败。仍需在已登录浏览器中验证页面、身份和核心数据。

### 6.7 Agent 的停止条件

遇到以下情况必须暂停并报告，不要自行扩大权限：

- Google 要求用户重新登录、输入密码、完成 MFA 或 CAPTCHA。
- 需要由另一位管理员修改 DNS。
- Cloud Run 返回的 records 与文档中的历史值不同。
- 目标域名已经映射到其他项目或服务。
- 需要删除或覆盖现有 DNS/mapping。
- 证书等待超过 24 小时。
- 新域名能打开但 IAP、API、Firestore 或核心页面异常。

Agent 的完成证据至少应包括：项目和服务、Domain Mapping、公共 DNS 结果、HTTPS/认证行为、页面冒烟结果和检查时间。

## 7. 常见误区与本次教训

### 误区 1：直接把 `run.app` URL 填进 CNAME Value

不要这样做。Cloud Run 的自定义域名必须先建立 Domain Mapping，再使用 GCP 生成的记录。域名系统只负责把请求送到 Google，Domain Mapping 才负责让 Google 把该 Host 路由到正确服务。

### 误区 2：看到常见值就直接填写 `ghs.googlehosted.com`

本次它恰好是 GCP 实际生成的值，但正确方法仍然是读取当前 mapping 的 `resourceRecords`。Agent 不得把经验值冒充实时结果。

### 误区 3：把 TXT 和 CNAME 当成二选一

两者解决不同问题。TXT 用于域名所有权验证，CNAME 用于请求路由。首次配置通常先 TXT、再 CNAME；根域名已经验证时可能只需要路由记录。

### 误区 4：把 Name 填成完整域名

多数 DNS 管理平台的 zone 已经是 `unitxlabs.com`：

- `@` 表示 `unitxlabs.com`
- `okr-transparency` 表示 `okr-transparency.unitxlabs.com`

但不同服务商界面不同，应以其字段提示为准，避免最终变成 `okr-transparency.unitxlabs.com.unitxlabs.com`。

### 误区 5：以为创建 GCP mapping 就完成了

完成链路是：Mapping 创建成功、DNS 生效、证书签发、HTTPS 可访问、认证与应用冒烟通过。任一项缺失都不能宣称完成。

### 误区 6：为了项目整洁立即迁移已上线服务

自定义域名配置不要求迁移项目。当前生产服务仍在 `knowledge-base-496322`。跨项目迁移是重新部署，并需要重新核对 Artifact Registry、Service Account、IAM、Secret Manager、Firestore、IAP/OAuth、域名和回滚路径；不要与域名接入混为一次操作。

## 8. 故障排查

| 现象 | 检查 | 处理 |
| --- | --- | --- |
| Search Console 验证失败 | TXT 是否加在根域名、值是否完整、公共 DNS 是否可见 | 修正 TXT，等待 TTL 后重试 |
| Cloud Run 一直 `Loading` | CNAME 是否匹配 `resourceRecords`、根域名是否 verified | 先等满 24 小时，再按官方步骤排查 |
| DNS 正确但 HTTPS 失败 | Certificate provisioning 状态、是否存在 CDN/代理拦截 | 等待证书；检查第三方 CDN/HTTPS 强制策略 |
| 自定义域名打开错误服务 | Mapping 的 `spec.routeName`、项目和区域 | 修正 mapping；不要只改 DNS |
| 出现 Google 登录循环 | IAP、OAuth callback、自定义域名/audience 配置 | 检查认证配置和授权域名 |
| `run.app` 正常但自定义域名失败 | DNS、mapping、证书 | 按 DNS -> mapping -> certificate 顺序定位 |

## 9. 回滚原则

新增子域名映射通常不影响原始 `run.app` URL，因此原始 URL 是最直接的应急入口。

如果自定义域名上线后出现问题：

1. 保留 Cloud Run 服务和原始 `run.app` URL。
2. 记录当前 mapping 与 DNS 值。
3. 经用户和 DNS 管理员确认后，恢复旧 CNAME/路由或移除新记录。
4. 如需删除 Domain Mapping，先确认线上流量已经切走。
5. 不要删除 TXT、CNAME、mapping 或旧服务，除非用户明确确认目标和影响。

## 10. 后续架构建议

本次使用的是 Cloud Run Domain Mapping。Google 当前将它标记为 Preview，并明确提示存在延迟限制、不推荐用于要求较高的生产服务。当前方案已能工作，不应为了“架构更漂亮”立即改造；如果未来需要 Cloud Armor、CDN、自管 TLS 策略、路径路由或更正式的生产 SLA，应评估 Global External Application Load Balancer。

## 11. 官方参考

- [Cloud Run：Mapping custom domains](https://docs.cloud.google.com/run/docs/mapping-custom-domains)
- [Cloud Run：Troubleshoot custom domain certificate provisioning](https://docs.cloud.google.com/run/docs/troubleshooting#custom-domain-stuck-while-provisioning-certificate)
- [Google Admin Toolbox Dig](https://toolbox.googleapps.com/apps/dig/)
- [Google Search Console](https://search.google.com/search-console/welcome)

## 12. 复盘结论

本次最关键的经验不是某个固定的 CNAME 值，而是正确的责任与证据链：

```text
确认真实 Project/Service
  -> 验证根域名所有权
  -> 创建 Cloud Run Domain Mapping
  -> 读取 GCP 实际 resourceRecords
  -> DNS 管理员添加记录
  -> 验证公共 DNS
  -> 等待 Google 证书
  -> 验证 HTTPS、IAP、页面和日志
```

只要保留这条证据链，其他 Cloud Run 网站接入公司子域名时，人和 Agent 都可以按同一方法安全复用。
