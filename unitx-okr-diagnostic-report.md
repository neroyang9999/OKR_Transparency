# UnitX OKR 问题诊断与优化报告

生成日期：2026-06-08  
范围：基于 Google Drive 中可访问的历史 OKR、工程周报、Roadmap、创新流程、自主交付路线材料，以及公开 OKR 方法论资料。  
限制：`Engineering OKRs` 中引用的公司级 OKR 原始 Google Doc 链接当前返回 404，本报告使用 `工程团队周报+OKR定期更新` 中内嵌的公司级 OKR 摘录，并在相关结论处标注为“间接来源”。

## 1. 核心结论

1. 公司级 OKR 和工程 OKR 之间存在明显的口径断裂。公司级目标同时关注 booking、SAT、贡献毛利、自主交付、部署质量、产品线扩张，但工程团队 OKR 主要落在软件质量、5.x 推广、流程建设和智能相机，缺少对公司级北极星指标的清晰拆解关系。
2. 多个 KR 混合了结果、项目、动作和里程碑，导致完成度可以被“做了事情”而不是“业务结果变好”驱动。例如“完成 4 份流程规范并宣贯”“建立联动机制”“迁移代码库”“Perform FAE/SA enablement”更像 initiative 或交付物，不是严格的 Key Result。
3. 指标口径多处不清或中途变化，影响可比性和公信力。典型例子是现场问题指标在“所有设备”“已升级 5.x 的设备”“每台机器每季度 1.44 个问题”“季度总数不超过 10”之间切换，导致目标对象、分母、统计窗口不稳定。
4. 目标数量和层级过重，团队难以聚焦。工程、软件、AI、3D、QA、硬件各自都有大量 O/KR，其中不少是并列大项目，缺少统一优先级和资源约束视角。
5. 对 UnitX 当前阶段而言，OKR 应更聚焦“从项目制交付走向可规模化、自主交付、可复用产品平台”的转型。现有 OKR 已触及这个方向，但没有把客户验收、SI 自部署能力、FA/FR 稳定性、产品易用性、现场问题闭环放到同一个价值链中衡量。
6. OKR 开放程度不足的主要问题不是“文档看不到”，而是“跨团队依赖、指标口径、风险和资源取舍没有足够透明”。周报有进展同步，但 OKR 本身未形成统一的公开评分、解释、依赖和调整机制。

## 2. 业务与战略背景

### 2.1 已确认事实

从 Drive 材料看，UnitX/个元科技是一家面向工业质检的算法、软件、硬件一体化公司，核心场景包括：

- 工业视觉质检：EOL 生产线末端检测、外观缺陷检测、尺寸测量、OCR、QR/Barcode、标准后处理。
- 软硬一体产品：CorteX、OptiX、Prod、Central、Edge、IPC、工业相机、2.5D 相机、光源、控制器等。
- 算法核心指标：FA/FR，即 False Alarm 和 False Rejection，是客户验收、模型优化、产品可用性的关键指标。
- 交付形态：从传统工程/FAE 深度参与的项目部署，逐步转向系统集成商或服务团队自部署、自助交付。
- 关键客户/场景：震裕、NVT、光弘、CATL 反光电池壳、软包电池、手机外观、鸡蛋项目等。
- 组织协作对象：工程、产品、QA、服务、销售、供应链、解决方案、FAE、SI。

主要 Drive 证据：

- `2027 年“自主交付”阶段性目标与实施路径`：指出已部署机台 900+，scale 项目约 800，占比 86% 左右；但 5.x scale 项目占比很低，若只算部署中或已完成机台，5.x 占比不到 1%。材料同时指出服务团队从 3.x+V4 切到 5.x+V6 仍不适应，短期直接 self-serve 难度较高。
- `研发 Roadmap 2026`：列出平台基建、架构优化、新技术与架构、智能相机、IPC 降本、自动化性能检测、Prod 启动优化、Central 百台产线支持等方向。
- `UnitX Innovation Process/创新流程方案-UnitX-RD-PR-002-V1.1`：强调创新项目要围绕战略契合度、技术可行性、市场和商业潜力、资源可行性评估，并引入 Pod、IG0/IG1/IG2 机制。
- `工程团队周报+OKR定期更新`：反复出现 5.x 推广、现场问题、版本质量、智能相机、标准机、Workflow、QA 现场调研等主题。

### 2.2 从材料推断的业务阶段

UnitX 当前不是单纯的软件 SaaS 公司，也不是纯硬件设备公司，而是在经历从“项目交付驱动”到“产品平台驱动”的转型。这个阶段的 OKR 需要同时解决四个矛盾：

1. 客户现场效果高度依赖具体物料、光源、相机、算法、配置和 FAE 经验，但公司希望规模化复制。
2. 5.x/新平台具备战略价值，但存量现场仍大量存在 3.x/4.x/V4 组合，升级进度和现场可控性不足。
3. 智能相机、No-code Workflow、AI 自动标注、尺寸测量、反光场景等方向有产品化潜力，但很多仍处于技术验证或早期产品化阶段。
4. 公司级结果是 booking、SAT、贡献毛利、自主交付和质量，工程团队日常却容易落到版本、功能、流程、工具和技术债。

因此，UnitX 的 OKR 不应该只写“完成某功能”“发布某版本”“建立某流程”，而要让每条 KR 回答：这是否降低交付成本、提升客户验收确定性、提高 SI/FAE 独立部署能力、减少现场质量风险、提升产品复用率或贡献毛利。

## 3. 历史 OKR 整理

### 3.1 公司级可见 OKR 摘录

来源：`工程团队周报+OKR定期更新` 中内嵌的公司级 OKR。原始公司级文档链接当前不可访问。

| 周期 | Objective | Key Result 摘要 | Owner | 当前进展摘录 | 诊断标签 |
|---|---|---|---|---|---|
| 2026 Q2 | Achieve Sales and SAT Targets | Achieve $7.7M booking, NA $2.6M, AP $5.1M | Global Sales | NA 7%, AP 10.43% | 结果型, 但与工程拆解弱 |
| 2026 Q2 | Achieve Sales and SAT Targets | North Star: SAT 481 units AI-powered eyes | Global Service | AP 115, 25.6% | 北极星候选, 需定义 AI-powered eyes |
| 2026 Q2 | Operations Improvement: Achieve Break Even in 2027 | Achieve 2.87% contribution margin | Finance | TBD | 数据不可得 |
| 2026 Q2 | Operations Improvement | 30% scale units SI-self-deployed, G3.1 achieve FA/FR | AP Service | 5/43, 11.6% | 高价值, 但分母假设复杂 |
| 2026 Q2 | Operations Improvement | Reduce G2.1 to G3.2 time to 22 days median | AP Service | Pilot 30, Scale 20 | 高价值交付效率指标 |
| 2026 Q2 | Operations Improvement | No-code workflow UAT with 4 CV capabilities | SW Engineering | 0% | 里程碑型, 需转成客户可用性指标 |
| 2026 Q2 | Quality Improvement | Reduce field issues for upgraded CorteX deployments to 1.44 per machine per quarter | SW Engineering | 1.57, 0% | 口径争议, 需澄清分母 |
| 2026 Q2 | Quality Improvement | Supplier defect rate reduce 20% | Supply Chain | 空 | 与软硬一体强相关, 但工程联动弱 |
| 2026 Q2 | Market Expansion | Standard cell applications win 2 POs | AP Sales | 0% | 业务结果型 |
| 2026 Q2 | Market Expansion | Smart camera V2.0 deployed at 2 distinct customer applications | Product | 0% | 战略型, 依赖工程/产品/销售 |

### 3.2 Engineering OKRs 历史整理

来源：`Engineering OKRs`。

| 周期 | 团队 | Objective 摘要 | KR 类型 | 主要问题 |
|---|---|---|---|---|
| 2025 Q4 | Software Engineering | improve mainline version quality and efficiency | 发布、质量、效率 | 结果与动作混合, 部分 100% 完成但缺少业务后验 |
| 2025 Q4 | Software Engineering | improve issue resolution efficiency | 监控、远程解决、云推送、OPS 效率 | 方向正确, 但 KR 有 capability 和 adoption 混合 |
| 2025 Q4 | Software Engineering | enhance engineering capabilities | AP AI/2.5D、文档、客户意识 | 能力建设目标较泛 |
| 2025 Q4 | Hardware Engineering | OptiX V6.1 EVT | 成像差距、BOM、噪声、可用性 | 技术型 KR 较清晰, 但客户价值未串联 |
| 2025 Q4 | Hardware Engineering | Large FOV NPI | 部署、认证、测试覆盖 | 与市场验证强相关, 但客户来源风险未显性化 |
| 2025 Q4 | Advanced Technology | 3-shot/sample efficiency, SAM expansion | 技术突破 | 探索性强, 需声明 aspirational/learning |
| 2026 Q1 | Software Engineering | Main Line Quality and R&D Efficiency | 双周发布、工程驱动需求、Jira 效率 | 多个目标塞入一个 Objective |
| 2026 Q1 | Software Engineering | Quality Assessment System | 自动问题捕获、评分体系、OPS 主线化 | 高价值, 但结果口径未统一 |
| 2026 Q2 | Engineering Summary | 公司级链接到 Software、AI、3D、HW | 汇总型 | 是索引, 不是统一对齐机制 |

### 3.3 Software Engineering 2026 Q2 OKR

来源：`26年Q2 OKR` 和 `工程团队周报+OKR定期更新`。

| Objective | KR 摘要 | 当前进展摘录 | 诊断标签 |
|---|---|---|---|
| O1 提升主线代码质量并建立质量评估体系 | 已升级 Cortex 现场问题降低到每台 1.44 个 | 1.57, 0%；也曾记录 70% 或 45% | 口径不稳, 评分异常 |
| O1 | 修改引入 bug 率控制在 15% 内 | V5.29 13%, V5.30 27%, V5.31 等 | 结果型, 可保留, 需定义统计窗口 |
| O1 | 版本质量评分季度提升 10%, 月度报告 | 0%, 评分二轮调查后获取 | 数据滞后, 结果过晚 |
| O2 产品思维支持智能相机和自主交付 | 智能相机分类/OCR E2E, Q2 量产交付状态, 6 个 NA 数据集 | 2/6, 33% | 战略相关, 但范围过宽 |
| O2 | EOL No-code workflow UAT, 4 个 CV 功能 | 0%, PM 6 月确认计划 | 依赖未锁定, 风险高 |
| O2 | 工程主导产品 RRD 占比 30% | 4/16, 25% | 指标需解释 RRD 与质量 |
| O3 优化研发体系和协作流程 | 4 份流程规范发布宣贯 | 2, 50% | 交付物型, 需补运行效果指标 |
| O3 | 新部署项目 5.x 占比 30%+ | 26%, 86% | 结果型, 但 owner 跨团队 |
| O3 | 技术 roadmap 机制, 3 个里程碑 | 1, 33% | 机制型, 需补决策影响 |
| O3 | AI-driven R&D, 模块效率 3x | 50% | 指标较大胆, 需基线和样本 |

### 3.4 AI Team 2026 Q2 OKR

来源：`AI Team 2026 Q2 OKR`。

| Objective | KR 摘要 | 当前进展摘录 | 诊断标签 |
|---|---|---|---|
| O1 Improve feature brain and rules brain | 新网络架构解决 3 个最难部署, FA/FR 优于客户要求, 样本效率不弱于 4.x | 33%, 1 个震裕数据集优于 V4 baseline | 战略强, 但范围过大 |
| O1 | 单色训练泛化到多色验证, 3 个应用 | 55%, 目标应用变化中 | 需要学习型 OKR 标注 |
| O1 | filtering metrics 满足 20 个未解决 feature | 10%, 依赖产品输入 | 依赖未显性化 |
| O1 | 结构缺陷和分割网络在 1 个客户部署达成 FA/FR | 0%, Q2 unlikely due product focus shift | 周期不适配 |
| O2 | 自动标注建议解决 10 类缺陷 | 45%, 20+ 类缺陷测试 | 好指标, 需转为产品工作流指标 |
| O2 | 聚类工具提升 5 个网络 validation FA/FR 20% | 45% | 结果型较好, 需定义验证数据 |
| O3 | 5 个 deployment 收集 500k production data, 1:5 NG/OK | collection 60%, review 40%, ratio 不满足 | 数据源现实约束强 |
| O3 | cortex_dl/learn 重构到 pytorch lightning, 100% test coverage | 0%, deprioritized | 任务型且与 O3 价值链弱 |

### 3.5 3D/Advanced Technology 2026 Q2 OKR

来源：`2026-Q2-OKR`。

| Objective | KR 摘要 | 诊断 |
|---|---|---|
| O1 Production-ready Dimensional Toolbox | 27/27 UI capabilities, FAE/SA enablement, 10 use cases, subpixel repeatability | 区分 Must hit/Aspirational/Moonshot 是优秀实践；但工具数量仍偏 output，应增加客户自助完成率 |
| O2 CATL reflective battery case, OptiX RefleX | 100 2D fps, feature parity, 0.3s processing @65MP | 技术指标清晰；需补客户验收和部署门槛 |
| O3 plug insertion learning framework | 95% success rate on 3 plug tasks | 适合 aspirational；样本和任务定义需固化 |
| O4 isolate IP | IP repo, non-IP migration, engineer onboarding | 多为工程任务，不应作为高层 KR 除非目标是“贡献效率” |
| O5 Fusion/Stereo tested by AP solutions | AP station, 2-camera calibration, VRAM reduction | 技术/能力建设型，需声明 learning 或 platform capability |

### 3.6 QA 2026 OKR

来源：`2026 QA OKR`。

| Objective | KR 摘要 | 诊断 |
|---|---|---|
| O1 现场质量闭环 | 3 个版本现场跟测, 现场问题总数 <=10, 自动化主流程 2 小时, 复现率 90%+ | 和工程 O1 高度重叠, 可形成共同 OKR |
| O2 资源调度与性能稳定 | CI/CD 性能测试, 性能基线, 7x24 长稳监控 | 对规模化交付关键, 指标较好 |
| O3 自动化测试闭环与质量透明 | 质量数据仪表盘, 自动化覆盖率 80%, 失败用例到 bug 自动创建 | 方向正确, 需以缺陷逃逸/响应时间收口 |

## 4. 问题诊断

### P0: 公司级目标到团队 OKR 的传导不完整

证据：

- 公司级可见目标关注 booking、SAT 481 units、贡献毛利、SI-self-deployed、G2.1 到 G3.2 时间、标准机 PO、智能相机客户部署。
- 软件 OKR 主要关注现场问题、bug、质量评分、智能相机 E2E、Workflow、流程规范、5.x 占比、Roadmap、AI R&D。
- AI/3D/HW/QA OKR 各自有技术目标，但没有统一说明它们如何共同提升 SAT、SI 自部署、部署周期、毛利或 PO 转化。

影响：

- 团队可能都在努力，但管理层难以判断哪些工作真正驱动公司级目标。
- 跨团队资源争夺时，缺少一套共同优先级排序标准。
- 容易出现“团队 OKR 完成了，公司级目标没动”的情况。

建议：

- 公司级只保留 2 到 3 个最关键 Objective，例如：规模化 SAT、自主交付、质量与毛利。
- 每个团队 OKR 必须标注其映射的公司级 KR，并说明领先指标与滞后指标。
- 建立“公司 KR -> 价值链指标 -> 团队 KR -> initiative”的四层结构。

### P0: 关键指标口径不稳定

证据：

- 现场问题指标同时出现“季度现场问题总数 <=10”“已升级 CorteX 部署每台 1.44 个问题”“所有版本 P0/P1/P2 不超过 10”“更新到 4.x/5.x 后问题下降”等表述。
- `26年Q2 OKR` 的评论中已有内部疑问：1.44 的分子分母是什么、年度目标是否针对所有设备、是否只统计升级到 5.x 的设备。
- 周报里同一 KR 的完成度在不同周出现 45%、70%、0% 等口径，且 Actual 有时是百分比、有时是绝对数。

影响：

- 完成度不可比较，复盘会变成解释口径而非解决问题。
- 团队可能通过选择统计口径来影响评分。
- 现场问题和质量改进无法形成可信趋势。

建议：

- 对每个 KR 写入明确公式：分子、分母、统计窗口、排除项、数据源、更新频率、Owner。
- 将“质量结果”分为三类：存量版本质量、新版本发布质量、现场部署质量，不混在一个 KR。
- 现场问题建议按“每 100 台设备每季度 P0/P1/P2 数量”或“每条 SAT 产线首 30 天 P0/P1/P2 数量”稳定统计。

### P0: KR 与 Initiative 混用

证据：

- “完成不少于 4 份流程规范并宣贯”是交付物。
- “建立快速发布、服务、销售、供应链联动机制”是机制建设。
- “Migrate non-IP vision code into monorepo”是工程任务。
- “Perform FAE/SA enablement”是动作。
- “发布质量评估体系、输出月度报告”是流程输出。

影响：

- 团队会追求完成动作，而不是验证动作是否产生效果。
- OKR 失去“结果牵引”的作用，变成项目计划表。

建议：

- KR 写“结果变化”，initiative 写“要做的事”。
- 例如流程建设不应写“发布 4 份流程”，应写“重大变更 100% 进入 CCB, 关键项目里程碑延误因未走变更流程导致的比例降到 0”。
- Enablement 不应写“培训完成”，应写“受训 FAE 独立完成 3 个标准部署并通过验收”。

### P1: 目标过多, 聚焦不足

证据：

- Software Q2 有 3 个 Objective、10 个 KR，且覆盖质量、智能相机、自主交付、产品思维、流程、5.x 推广、Roadmap、AI R&D。
- AI Q2 有 3 个 Objective、8 个 KR，还包含多个大研发方向。
- 3D Q2 有 5 个 Objective、十多个 KR，覆盖尺寸测量、反光电池壳、机器人插接、IP 隔离、Fusion/Stereo。
- 研发 Roadmap 2026 中 Q2 单季列出大量平台、架构、新技术工作，其中智能相机基础功能开发估算 600 人天。

影响：

- OKR 无法帮助团队做取舍，反而把所有重要项目都纳入。
- 当资源冲突时，团队会默认按紧急项目和老板关注度执行，OKR 变成记录而不是决策工具。

建议：

- 公司级每季度 2 到 3 个 Objective；团队级每季度 1 到 3 个 Objective，每个 2 到 4 个 KR。
- 技术团队的探索项可以进入 Roadmap 或 learning OKR，不要全部塞入季度 committed OKR。
- 每个 Objective 明确一句“本季度不做什么”，帮助资源取舍。

### P1: Committed、Aspirational、Learning 没有统一使用

证据：

- 3D/Advanced Technology OKR 明确使用 Must hit、Aspirational、Moonshot，并给出 0/30/70/100 评分锚点，这是较好的实践。
- 软件和 AI OKR 中，有很多明显探索型目标，如 AI-driven R&D 3x、结构缺陷客户部署、500k production data、单色到多色泛化，但没有统一声明是 committed、aspirational 还是 learning。
- AI Team May Update 中已经出现“very unlikely to be deployed to customer in Q2”“deprioritized”等情况，说明部分目标周期或类型设置不匹配。

影响：

- 团队不知道 70% 是成功还是失败。
- 探索型目标被当成承诺会制造压力和防御性解释。
- 承诺型目标被当成 aspirational 会降低执行严肃性。

建议：

- 每个 KR 必须标注 `Committed`、`Aspirational` 或 `Learning`。
- Committed 要求 100% 完成，未完成必须升级风险和复盘计划。
- Aspirational 可接受 60% 到 70% 的进展，但需说明保留到后续周期的条件。
- Learning 用于技术和市场不确定性高的问题，KR 应回答“本季度必须学会什么”，而不是承诺业务结果。

### P1: 开放程度不足体现在依赖和风险不透明

证据：

- 软件 OKR 对 Workflow UAT 写到“PM shall confirm the plan by end of June”，说明关键计划在周期内仍未锁定。
- AI OKR 多处依赖 Product 输入、Product focus shift、AP/NA 数据源、SAT'ed project 数据。
- 3D OKR 中 AP station 依赖相机 mount 设计和更高优任务；O4 的 KR1、KR2、KR3 需要串行发生。
- Roadmap 会议纪要中多次出现“需要产品定稿”“与 Di 对齐”“统计重点客户合同 FAFR”“资源竞争与依赖”等。

影响：

- OKR 表面上有 owner，但实际成败受跨团队依赖影响。
- 周期中才发现无法达成，会造成“解释型复盘”。
- 公开文档存在，但不等于决策透明。

建议：

- 每条 KR 增加 `Dependencies`、`Decision needed`、`Risk level`、`Escalation date`。
- 月度 check-in 不只更新进展，还必须更新依赖是否解除。
- 跨团队 KR 应设 joint owner 和 single DRI，避免“大家相关, 无人负责”。

### P1: UnitX 业务阶段要求 OKR 更贴近规模化交付, 但现有 OKR 仍偏内部产出

证据：

- 自主交付路线中明确 2027 年底目标是 SI 部署 80% 所有设备，并拆分 FAE 能力、横展、简单试点、有难度试点。
- 现状中 5.x scale 项目占比非常低，服务团队对 5.x+V6 不适应。
- Roadmap 与周报中大量工作指向产品易用性、Prod 启动、Workflow、sequence/cc、IPC、FA/FR、智能相机、算法适配。
- 但工程 OKR 中很多 KR 仍是功能、流程、版本、代码和工具指标。

影响：

- 可能优化了内部工程状态，但没有显著降低部署难度。
- 无法判断某项能力是否真的让 SI/FAE 更容易独立交付。

建议：

- 增加端到端价值链指标：从 G2.1 到 G3.2 的中位周期、首 30 天质量、FAE/SI 独立完成率、一次验收通过率、每条产线调试人天、标准方案复用率。
- 对技术平台目标增加业务检验：例如尺寸测量 toolbox 不是只看 27 个 UI capability，而是看 FAE 在无研发支持下完成 10 个标准用例的成功率和耗时。

## 5. OKR 优化建议

### 5.1 建立 UnitX 适配的 OKR 分层

建议使用四层结构：

| 层级 | 作用 | 示例 |
|---|---|---|
| Company Objective | 公司最重要战略结果 | 让 UnitX 从项目制交付升级为规模化工业视觉平台 |
| Company KR | 业务结果 | SAT units、SI 自部署率、G2.1 到 G3.2 周期、贡献毛利、现场质量 |
| Team KR | 可控的领先指标 | 5.x 目标产线升级率、FA/FR 达标率、首 30 天 P0/P1/P2、FAE 独立部署通过率 |
| Initiative | 具体工作 | Workflow、QA 自动化、版本升级工具、AI 自动标注、Prod 启动优化 |

### 5.2 推荐的公司级 OKR 模板

Objective A: 将 UnitX 核心产品交付从工程驱动转为可规模化自部署

- KR1: Q2 内新增 SAT 的 AI-powered eyes 达到 X 台，其中标准方案或 SI/FAE 自部署占比达到 Y%。
- KR2: 简单试点项目 G2.1 到 G3.2 中位周期从 30 天降至 25 天，scale 项目中位周期降至 20 天。
- KR3: 通过 SI/FAE 独立完成并达到客户 FA/FR 的产线不少于 X 条。
- KR4: 新部署项目首 30 天 P0=0, P1 <= X, P2 <= Y。

Objective B: 提升 5.x/CorteX/OptiX 平台质量和升级 adoption

- KR1: 目标客户产线 5.x 升级覆盖率从 X% 提升到 Y%，并完成首 30 天质量跟踪。
- KR2: 升级后每 100 台设备每季度 P0/P1/P2 现场问题数降低 X%。
- KR3: 版本发布后 14 天内逃逸到现场的 P0/P1/P2 数不超过 X/Y/Z。
- KR4: 现场问题可复现率达到 90%，P0/P1 根因定位中位时间小于 24 小时。

Objective C: 打通智能相机和标准机的产品化路径

- KR1: 智能相机在 2 个真实客户应用中完成 E2E 部署验证，并达到合同或技术协议 FA/FR。
- KR2: 标准机在两个目标场景中完成方案对比，证明相对旧方法在部署时间或 FA/FR 上有明确改善。
- KR3: 形成可复用交付包，FAE 在无研发现场支持下完成至少 X 次部署演练。

### 5.3 KR 编写规范

每条 KR 必须包含：

- `Metric`: 指标名。
- `Formula`: 分子、分母、统计窗口。
- `Baseline`: 当前值。
- `Target`: 本周期目标值。
- `Data source`: Jira、BI、现场问题台账、版本质量报告、SAT 数据、FA/FR 验证表等。
- `Owner`: 单一 DRI。
- `Dependencies`: 关键依赖。
- `Type`: Committed, Aspirational, Learning。
- `Scoring`: 0/0.3/0.7/1.0 评分锚点。

禁止写法：

- “建立机制”
- “完成开发”
- “输出报告”
- “推进协作”
- “提升能力”
- “支持项目”

可接受写法：

- “新部署产线首 30 天 P1/P2 问题数从 X 降到 Y”
- “FAE 独立完成标准部署的比例达到 X%”
- “客户 FA/FR 达标产线数达到 X”
- “从 release build 到 GA 的中位时间从 X 天降到 Y 天”
- “因基础流程问题导致重新发版次数为 0”

### 5.4 公开透明和复盘机制

建议建立统一 OKR 公开页，字段包括：

| 字段                     | 说明                              |
| ---------------------- | ------------------------------- |
| Objective              | 一句话战略意图                         |
| KR                     | 结果指标                            |
| Type                   | Committed/Aspirational/Learning |
| Owner                  | DRI                             |
| Baseline/Target/Actual | 基线、目标、实际                        |
| Score                  | 0.0 到 1.0                       |
| Confidence             | Green/Yellow/Red                |
| Dependencies           | 跨团队依赖                           |
| Risks                  | 当前最大风险                          |
| Decisions needed       | 需要管理层或跨团队决策                     |
| Source link            | 数据源链接                           |
| Last update            | 更新时间                            |

月度 check-in 模板：

```markdown
## KR: [名称]
- Type:
- Baseline:
- Target:
- Actual:
- Score:
- Confidence:
- 本月变化:
- 最大偏差原因:
- 需要解除的依赖:
- 下月关键动作:
- 是否需要调整 KR 口径: 是/否, 原因:
```

季度复盘模板：

```markdown
## Objective: [名称]
- 最终得分:
- 哪些 KR 真正推动了业务结果:
- 哪些 KR 只是完成了动作但没有改变结果:
- 指标口径是否稳定:
- 下季度应保留、删除、合并或改写的目标:
- 对资源配置和跨团队协作的建议:
```

## 6. 示例改写

### 示例 1: 现场问题质量目标

原始意图：通过升级 4.x/5.x 降低 Cortex 现场问题。

现有问题：1.44 per machine per quarter 的统计对象和分母不稳定，且与季度总数 <=10 混用。

建议改写：

Objective: 让 5.x/CorteX 升级成为可被服务团队放心推广的稳定版本。

- KR1 Committed: 目标升级产线清单中，完成 5.x 升级并运行满 30 天的产线达到 X 条，数据源为升级台账。
- KR2 Committed: 升级后首 30 天每 100 台设备 P0/P1/P2 现场问题数不超过 0/3/10，分母为运行满 30 天的升级设备数。
- KR3 Aspirational: 对比升级前同类产线，P1/P2 问题率下降 30%，数据源为现场问题台账。
- KR4 Committed: 每个 P0/P1 问题在 24 小时内完成根因归类，48 小时内给出规避或修复方案。

### 示例 2: No-code Workflow

原始意图：EOL 产品通过 no-code workflow UAT，具备 4 个 CV 功能。

现有问题：像功能验收清单，不能直接说明是否支持自主交付。

建议改写：

Objective: 让 EOL 标准检测能力进入 FAE/SI 可自助配置阶段。

- KR1 Committed: 选定 2 个标准 EOL 场景，FAE 在无研发现场支持下使用 no-code workflow 完成配置并通过内部 UAT。
- KR2 Committed: 四类 CV 能力在标准测试集上全部达到预设 FA/FR 或精度门槛。
- KR3 Aspirational: 标准配置耗时相比研发参与方案降低 40%。
- KR4 Learning: 识别并量化阻碍 SI 自部署的 Top 5 工作流缺口，形成下季度产品 backlog。

### 示例 3: 工程主导产品需求

原始意图：工程主导产品 RRD 占比达到 30%。

现有问题：只看比例不看价值，可能鼓励提更多需求，而非解决关键客户问题。

建议改写：

Objective: 让工程从被动接需求转为主动推动高价值产品化能力。

- KR1 Committed: 工程提出并进入 ranking 的需求中，至少 X 个明确绑定公司级自主交付或质量指标。
- KR2 Committed: 工程主导需求上线后，至少 2 个在真实部署中证明减少 FAE/研发介入时间或降低现场问题。
- KR3 Aspirational: 工程主导需求贡献的新部署项目占比达到 30%，并公开每个需求的业务假设和验证结果。

### 示例 4: 流程规范建设

原始意图：完成 4 份研发流程规范并公司级宣贯。

现有问题：发布流程不等于流程有效。

建议改写：

Objective: 降低跨团队变更和研发流程不清导致的交付风险。

- KR1 Committed: 所有中高风险软件、硬件、客户需求变更 100% 进入 CCB 或对应 Jira 流程。
- KR2 Committed: 因未走变更流程导致的客户承诺变更、版本返工或现场阻塞事件为 0。
- KR3 Committed: 关键项目里程碑评审覆盖率达到 100%，每次评审记录 owner、deadline、acceptance criteria。
- KR4 Aspirational: 高风险变更从提出到决策的中位时间小于 X 天。

### 示例 5: AI 新架构

原始意图：新网络架构解决 3 个最难部署，FA/FR 优于客户要求。

现有问题：研究、产品化、客户部署混在一个季度 KR，且场景选择变化。

建议改写：

Objective: 验证下一代 AI 架构能否显著提升复杂外观缺陷的样本效率和 FA/FR。

- KR1 Learning: 在震裕、NVT 和 1 个待定场景上完成固定数据集、固定标注、固定评估协议的 baseline。
- KR2 Aspirational: 新架构在至少 2 个场景上相对 4.x baseline 达到同等或更优 FA/FR，且训练样本数不高于 baseline。
- KR3 Learning: 输出不可达场景和失败原因分类，包括数据质量、成像、模型、标注、产品工作流。
- KR4 Committed: 明确下季度是否进入产品化或客户试点的 Go/No-go 结论。

### 示例 6: AI 数据集建设

原始意图：5 个 deployment 收集 500k production data, 1:5 NG/OK reviewed labels。

现有问题：NG/OK 比例受真实产线分布影响，不完全可控。

建议改写：

Objective: 建立可支撑 AI 评估和迭代的数据闭环。

- KR1 Committed: 从至少 5 个客户场景接入生产数据采集链路，并记录场景、设备、版本、缺陷类别元数据。
- KR2 Committed: 完成不少于 X 张人工 reviewed 图片，其中每个目标场景至少 Y 张。
- KR3 Aspirational: 对目标缺陷类别，NG/OK 评估集达到可用于 FA/FR 对比的最低样本门槛。
- KR4 Committed: 每次模型评估报告可追溯到数据版本、标注版本和训练配置。

### 示例 7: 3D 尺寸测量 Toolbox

原始意图：完成 production-ready Dimensional Toolbox。

现有优点：已区分 Must hit/Aspirational/Moonshot，并有评分锚点。

建议加强：

Objective: 让尺寸测量成为客户和 FAE 可自助完成的标准能力。

- KR1 Committed: 10 个预定义客户用例中，FAE 使用 UI 独立完成 8 个并通过验收。
- KR2 Committed: 目标数据集上 repeatability <=1 px，且测量报告可复现。
- KR3 Aspirational: UI capability 覆盖 27/27 项，其中至少 19 项被真实用例使用。
- KR4 Committed: 完成 NA 和 AP enablement 后，每区至少 2 名 FAE 通过实操认证。

### 示例 8: 5.x 推广联动机制

原始意图：服务、销售、供应链联动，最新 5.x 新部署占比 30%。

现有问题：目标跨团队，机制和结果混写。

建议改写：

Objective: 让 5.x 成为新部署项目默认优先方案。

- KR1 Committed: 新部署项目中 5.x 方案评估覆盖率达到 100%，未采用必须记录原因。
- KR2 Committed: 符合 5.x 条件的新部署项目 adoption rate 达到 30%。
- KR3 Committed: 5.x 项目启动前完成服务、销售、供应链、工程共同 readiness checklist，覆盖率 100%。
- KR4 Aspirational: 5.x 新部署项目首 30 天 P0/P1 为 0，P2 不超过 X。

## 7. 需要公司内部补充确认的问题

1. 公司级 OKR 原文是否仍有效，是否可恢复访问权限。
2. `AI-powered eyes` 的定义：是设备、相机、产线、检测点位，还是 SAT 单元。
3. SAT、G2.1、G3.2、FA/FR、scale、pilot、横展、简单试点、有难度试点的统一定义。
4. 现场问题统计口径：设备范围、版本范围、时间窗口、问题等级、重复问题处理方式。
5. 5.x adoption 的目标对象：所有新部署、符合条件的新部署、升级项目，还是 scale 项目。
6. 工程主导 RRD 的定义、分母、价值验证方式。
7. 质量评分模型的数据源、评分公式、是否可按月更新。
8. 对智能相机、标准机、No-code Workflow 的本季度承诺边界：内部 UAT、客户试点、SAT、PO 转化分别是哪一级。

## 8. 公开 OKR 方法论对照

本报告采用以下公开方法论原则：

- Atlassian OKR Play 建议每个周期定义 1 到 3 个 Objective，每个 Objective 配 3 到 5 个 Key Results，并按月评分、分析和总结进展。
- Atlassian OKR Guide 强调 Objective 应简洁、鼓舞、易记，Key Result 应是少量、及时可测的结果指标；常见错误是把 actions 当成 key results。
- What Matters 的 Google OKR Playbook 强调需要区分 committed 和 aspirational OKRs；committed 目标应期望 1.0，aspirational 平均期望约 0.7。
- What Matters 对 committed/aspirational 的说明强调：必须在周期开始时声明目标类型，避免团队把承诺目标当作弹性目标，或把探索目标当成硬承诺。

参考链接：

- Atlassian OKR Play: https://www.atlassian.com/team-playbook/plays/okrs
- Atlassian OKR Guide: https://www.atlassian.com/agile/agile-at-scale/okr
- What Matters: Google OKR Playbook: https://www.whatmatters.com/resources/google-okr-playbook
- What Matters: Committed and Aspirational OKRs: https://www.whatmatters.com/okrs-explained/committed-and-aspirational-okrs

## 9. 建议的下一步

1. 先召开 60 分钟 OKR 口径校准会，只解决定义问题，不讨论项目细节。
2. 选 2026 Q2 中 3 条争议最大的 KR 做试点改写：现场问题、No-code Workflow、5.x adoption。
3. 建立统一 OKR dashboard，不要求工具复杂，但要求字段完整、每周或每月可更新。
4. 下个季度开始强制区分 KR 和 initiative，并给每条 KR 写公式、数据源和类型。
5. 把公司级“规模化交付价值链”作为主线，把软件、硬件、AI、QA、服务、产品的 OKR 都挂到同一张价值链上。

