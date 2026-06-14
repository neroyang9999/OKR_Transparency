# 2026 Q3 Engineering OKR 重构草案

生成日期：2026-06-09  
输入来源：当前 `Engineering OKRs` Google Doc、历史 `unitx-okr-diagnostic-report.md`。  
边界：本草案不写回 Google Doc；`X/Y/Z` 需要用 Q2 实际数据、SAT 台账、现场问题台账、版本质量数据补齐。

## 1. 当前框架的核心问题

当前 Software OKR 的方向都重要，但层级混乱：

1. `Improve EOL software quality and reliability` 是软件平台质量主目标，可以作为 Objective。
2. `Reduce IPC BOM for EOL product` 不应该作为 Software 层面的并列 Objective。它是 EOL 平台商业化效率的一条 KR 或 initiative，应该挂在“降低单位交付成本 / 提升毛利”的上层目标下。
3. `Ensure a successful launch of smart camera` 是跨 Product、Hardware、Software、AI、Service 的产品上市目标，不应只放在 Software 下面，否则软件团队无法对完整 launch 结果负责。
4. 当前结构按团队和项目罗列，缺少从公司级结果到团队 KR 的拆解链路。下一层团队会继续拆成各自项目，导致关联性更弱。

建议改成：

```text
Company / Engineering Objective
  -> Engineering KR
    -> Team KR
      -> Initiative / Project
```

KR 写结果，initiative 写要做的事。IPC 降本、智能相机 launch、OptiX V6.1、Deflectometry、AI 架构验证都可以保留，但要放在正确层级。

## 2. 建议的 Q3 Engineering 顶层 OKR

### O1. 让 EOL 平台成为可规模化交付、可稳定升级的核心产品

战略意图：Q3 Engineering 的主线不是“做更多功能”，而是让 EOL/CorteX/OptiX/Prod/Central 这一套平台支持更多 SAT、更少现场质量风险、更低交付依赖。

| KR | 类型 | Owner | 指标定义 | 下一层拆解方向 |
|---|---|---|---|---|
| KR1. 新 EOL 软件 release 的现场逃逸 P0/P1/P2 降至每 release `X/Y/Z` 以内 | Committed | Software + QA | 统计 GA 后 30 天内 field reported 且 escaped QA 的 P0/P1/P2，按 release 归属 | Software: release gate；QA: 测试覆盖和逃逸分析；Service: 问题分级与反馈 |
| KR2. 新 EOL build 的 QA escaped Dev P0/P1/P2 降至每 release `X/Y/Z` 以内 | Committed | Software + QA | 统计 QA 在 release validation 阶段发现、应在 Dev 阶段发现的问题 | Software: 单元/集成测试；QA: 缺陷分类；Infra: CI 质量门禁 |
| KR3. 升级或新部署 EOL 项目首 30 天 P0=0，P1 <= `X`，P2 <= `Y` | Committed | Engineering + Service | 只统计完成部署并运行满 30 天的目标项目，分母为项目或产线清单 | Software: 稳定性；Hardware: 关键部件可靠性；Service: 现场问题闭环 |
| KR4. 目标 EOL 项目从 G2.1 到 G3.2 的中位周期降低 `X%` | Aspirational | Engineering + Service + Product | 以项目阶段台账为准，区分 pilot、scale、横展 | Product: 标准方案；Software: workflow/tooling；Service: 自主交付能力 |

建议 initiatives：

- EOL release quality gate 和 escaped defect 复盘机制。
- IPC freeze root cause fix。
- 主线版本升级风险清单和 rollback/playbook。
- QA 自动化覆盖关键 EOL workflow。
- Field issue taxonomy：分清软件、硬件、配置、算法、操作、环境。

### O2. 降低 EOL 单位交付成本，同时守住可靠性和现场体验

战略意图：IPC 降本很重要，但它不是一个孤立的软件目标。它应服务于 EOL 毛利、供应链可得性、现场稳定性和可部署性。

| KR | 类型 | Owner | 指标定义 | 下一层拆解方向 |
|---|---|---|---|---|
| KR1. 目标 EOL 标准配置 IPC BOM 成本降低 `X%`，且完成供应链可得性确认 | Committed | Product + Hardware + Software | 以批准的目标配置为基线，统计 BOM 成本变化 | Hardware: 替代选型；Software: 性能适配；Supply Chain: 供应和价格 |
| KR2. 降本配置通过 EOL 标准性能和稳定性门槛，关键场景吞吐、延迟、FA/FR 不低于基线 | Committed | Software + QA + AI | 固定测试集、固定版本、固定硬件配置，与原 IPC baseline 对比 | Software: 性能优化；QA: 长稳/压力测试；AI: 模型性能验证 |
| KR3. 降本配置在 `X` 个真实或准真实 EOL 场景完成验证，首 30 天无 P0/P1 | Committed | Engineering + Service | 场景应来自目标客户或标准方案，不只做实验室验证 | Service: 试点部署；Software: 现场问题闭环；Product: 场景选择 |
| KR4. 完成 IPC 选型/配置规则，使 FAE/Service 能独立选择标准 IPC 配置 | Aspirational | Product + Engineering | 输出可执行规则，并通过 `X` 次模拟或真实选型验证 | Product: 配置策略；Service: 使用反馈；Engineering: 边界条件 |

建议 initiatives：

- IPC 降本替代方案评估。
- IPC freeze 根因修复和验证。
- IPC 选型工具或配置表更新。
- 标准 EOL benchmark：吞吐、延迟、GPU/CPU/memory、长稳、FA/FR。

### O3. 打通 Smart Camera 从工程样机到可销售、可交付产品的 launch 路径

战略意图：Smart Camera 不是单一软件 launch。它必须同时证明产品价值、软硬件可靠性、AI 能力、现场部署路径和销售/服务可支持性。

| KR | 类型 | Owner | 指标定义 | 下一层拆解方向 |
|---|---|---|---|---|
| KR1. Smart Camera 在 `X` 个目标客户应用完成 E2E 部署验证，并达到约定 FA/FR 或验收指标 | Committed | Product + Engineering | 必须是真实客户应用或明确销售目标应用 | Product: 场景定义；AI: 模型指标；Software: E2E workflow；Hardware: 设备稳定性 |
| KR2. Smart Camera launch readiness checklist 100% 完成，覆盖硬件、软件、AI、制造、文档、服务支持 | Committed | Product DRI | checklist 必须有单一 DRI 和验收标准 | Hardware: EVT/DVT/PVT；Software: release；Service: playbook；Supply Chain: 可供货 |
| KR3. FAE/Service 在无研发现场支持下完成 `X` 次 Smart Camera 标准部署演练或客户部署 | Aspirational | Service + Product + Engineering | 统计从开箱、配置、采图、训练/规则、验收到问题记录的完整流程 | Service: enablement；Software: 易用性；Product: 文档和模板 |
| KR4. Top launch blockers 在 Q3 结束前全部关闭或明确 Go/No-go 决策 | Committed | Product + Engineering | blockers 包括性能、稳定性、供应、客户场景、FA/FR、支持能力 | 各团队按 blocker 拆 initiative |

建议 initiatives：

- 分类/OCR E2E workflow。
- 目标客户数据集和验收标准冻结。
- Smart Camera 文档、安装、调试、诊断工具。
- Launch blocker review，每两周更新。

### O4. 验证下一代技术能否转化为 Q4/Q1 的产品化能力

战略意图：Advanced Technology 和 AI 架构验证不应和 committed 交付目标混在一起。Q3 的合理目标是明确哪些技术可以进入产品化，哪些继续探索，哪些停止。

| KR | 类型 | Owner | 指标定义 | 下一层拆解方向 |
|---|---|---|---|---|
| KR1. 下一代 AI 架构在 `X` 个固定客户场景上完成 baseline 对比，至少 `Y` 个场景达到或优于当前方案 FA/FR | Learning/Aspirational | AI | 固定数据、固定标注、固定评估协议 | AI: 模型；Product: 场景选择；Service: 数据闭环 |
| KR2. Deflectometry prototype 在目标场景完成技术可行性验证，并给出 Q4 Go/No-go 建议 | Learning | Advanced Tech + Hardware | 明确验证指标：成像、速度、稳定性、客户价值 | Hardware: 原型；Software: pipeline；Product: 应用场景 |
| KR3. OptiX V6.1 达到下一阶段 release/readiness 标准 | Committed | Hardware + Software | 标准应包括图像质量、可靠性、BOM、兼容性、部署反馈 | Hardware: EVT/DVT；Software: driver/integration；QA: validation |
| KR4. NA sales/solution efficiency 提升的关键技术包完成 `X` 个真实售前或方案场景验证 | Aspirational | NA Solution + Engineering | 以售前方案周期、演示成功率或可复用方案包衡量 | Solution: 场景；Engineering: 工具；Product: 标准包 |

建议 initiatives：

- AI 固定 benchmark 和失败原因 taxonomy。
- Deflectometry prototype milestone。
- OptiX V6.1 release readiness。
- NA solution demo package / standard application package。

## 3. Software 下一层拆解建议

Software 不建议继续写成三个互不相关的 Objective。建议拆成 3 个团队级 Objective，对齐上面的 Engineering O1/O2/O3。

### Software O1. 提升 EOL release 质量，减少 escaped defects

| KR | 对齐 Engineering KR | 指标 |
|---|---|---|
| KR1. 每个 GA release 后 30 天 field escaped P0/P1/P2 <= `X/Y/Z` | Eng O1 KR1 | field issue 台账 |
| KR2. QA escaped Dev P0/P1/P2 <= `X/Y/Z` | Eng O1 KR2 | QA bug taxonomy |
| KR3. P0/P1 root cause classification 24 小时内完成率 100% | Eng O1 KR3 | Jira / incident review |
| KR4. release blocker reopen rate <= `X%` | Eng O1 KR1 | Jira release report |

Initiatives：

- EOL release gate。
- Critical path 自动化测试。
- IPC freeze root cause fix。
- 问题分级和 root cause template。

### Software O2. 支持 EOL 成本下降和标准配置可用

| KR | 对齐 Engineering KR | 指标 |
|---|---|---|
| KR1. 降本 IPC 配置在标准 EOL benchmark 上达到性能基线 | Eng O2 KR2 | benchmark report |
| KR2. 降本配置长稳测试通过 `X` 小时，无 P0/P1 | Eng O2 KR2/KR3 | QA stability test |
| KR3. IPC freeze 在目标配置上复现率降为 0 或有明确规避方案 | Eng O2 KR3 | issue closure |
| KR4. IPC 配置规则覆盖 `X` 个标准 EOL 场景 | Eng O2 KR4 | config matrix |

Initiatives：

- IPC performance profiling。
- GPU/CPU/memory 资源边界测试。
- 标准配置矩阵。
- freeze issue fix and validation。

### Software O3. 支持 Smart Camera E2E launch readiness

| KR | 对齐 Engineering KR | 指标 |
|---|---|---|
| KR1. 分类/OCR 等目标 E2E workflow 在目标场景通过 UAT | Eng O3 KR1 | UAT report |
| KR2. Smart Camera 软件安装、配置、诊断流程支持 FAE 独立部署 | Eng O3 KR3 | deployment rehearsal |
| KR3. launch blocker 中软件 owner 项 100% 关闭或给出 Go/No-go 风险说明 | Eng O3 KR4 | blocker list |
| KR4. 客户验证版本的问题修复 SLA 达到 `X` | Eng O3 KR1/KR4 | Jira / field feedback |

Initiatives：

- Smart Camera workflow。
- 诊断和日志工具。
- 安装/配置体验。
- launch blocker review。

## 4. Hardware 下一层拆解建议

### Hardware O1. 让 OptiX V6.1 达到可进入下一阶段的产品 readiness

| KR | 对齐 Engineering KR | 指标 |
|---|---|---|
| KR1. OptiX V6.1 完成阶段性验证，关键图像质量指标达到 baseline 或目标值 | Eng O4 KR3 | validation report |
| KR2. 关键可靠性问题关闭率 100%，无 P0 blocker | Eng O4 KR3 | issue tracker |
| KR3. 与 EOL/Smart Camera 相关的兼容性验证完成 | Eng O1/O3 | compatibility matrix |

### Hardware O2. 支持 EOL 成本下降和 Smart Camera launch

| KR | 对齐 Engineering KR | 指标 |
|---|---|---|
| KR1. 降本 IPC 或硬件配置完成可靠性和供应风险评估 | Eng O2 KR1 | BOM / supply review |
| KR2. Smart Camera 硬件 launch checklist 100% 完成 | Eng O3 KR2 | readiness checklist |
| KR3. Deflectometry prototype 达到 Q3 验证目标并给出 Go/No-go | Eng O4 KR2 | prototype report |

## 5. AI / Advanced Technology 下一层拆解建议

### AI O1. 用固定 benchmark 判断下一代架构是否可产品化

| KR | 对齐 Engineering KR | 指标 |
|---|---|---|
| KR1. 固定 `X` 个客户场景的数据、标注、评估协议 | Eng O4 KR1 | benchmark spec |
| KR2. 至少 `Y` 个场景 FA/FR 达到或优于当前 baseline | Eng O4 KR1 | evaluation report |
| KR3. 失败场景完成原因分类和下季度建议 | Eng O4 KR1 | Go/No-go memo |

### AI O2. 支持 Smart Camera 目标场景 E2E 验证

| KR | 对齐 Engineering KR | 指标 |
|---|---|---|
| KR1. 目标客户应用 FA/FR 达到验收门槛 | Eng O3 KR1 | customer validation |
| KR2. 数据集和模型版本可追溯率 100% | Eng O3 KR1/O4 KR1 | model report |
| KR3. launch blockers 中 AI owner 项全部关闭或明确风险 | Eng O3 KR4 | blocker list |

## 6. QA 下一层拆解建议

### QA O1. 建立 EOL release 和现场质量的可度量闭环

| KR | 对齐 Engineering KR | 指标 |
|---|---|---|
| KR1. EOL critical path 自动化覆盖率达到 `X%` | Eng O1 KR1/KR2 | automation report |
| KR2. 每个 escaped defect 都完成漏测原因分类 | Eng O1 KR1/KR2 | escaped defect review |
| KR3. 降本 IPC 配置完成性能、长稳、压力测试 | Eng O2 KR2 | benchmark / stability report |
| KR4. Smart Camera launch validation checklist 中 QA owner 项 100% 完成 | Eng O3 KR2 | readiness checklist |

## 7. Product / Service 下一层拆解建议

### Product O1. 把跨团队项目变成可验收的产品结果

| KR | 对齐 Engineering KR | 指标 |
|---|---|---|
| KR1. EOL 目标项目、Smart Camera 目标应用、IPC 降本目标配置在 Q3 前两周冻结 | Eng O1/O2/O3 | target list |
| KR2. 每个跨团队 KR 都有验收标准、数据源和 single DRI | 全部 | OKR dashboard |
| KR3. launch blocker 和 Go/No-go 决策按双周节奏更新 | Eng O3/O4 | blocker review |

### Service O1. 验证产品能力是否真的降低现场依赖

| KR | 对齐 Engineering KR | 指标 |
|---|---|---|
| KR1. 目标 EOL 项目 G2.1 到 G3.2 中位周期降低 `X%` | Eng O1 KR4 | project stage data |
| KR2. FAE/Service 独立完成 Smart Camera 或 EOL 标准部署 `X` 次 | Eng O3 KR3 / Eng O1 KR4 | deployment record |
| KR3. 首 30 天现场问题全部按 SLA 关闭或有规避方案 | Eng O1 KR3 | field issue tracker |

## 8. OKR Dashboard 字段

为了方便继续拆到下一层，每条 KR 应统一填写这些字段：

| 字段 | 说明 |
|---|---|
| Parent Objective | 上层 Objective |
| KR | 结果指标，不写动作 |
| Type | Committed / Aspirational / Learning |
| Formula | 分子、分母、统计窗口 |
| Baseline | 当前值 |
| Target | Q3 目标 |
| Data source | Jira、SAT 台账、现场问题台账、benchmark、UAT、FA/FR 报告 |
| DRI | 单一负责人 |
| Contributors | 相关团队 |
| Dependencies | 跨团队依赖 |
| Initiatives | 具体项目或动作 |
| Confidence | Green / Yellow / Red |
| Score | 0.0 / 0.3 / 0.7 / 1.0 |

## 9. 建议先补齐的数据

1. Q2 每个 EOL release 的 field escaped P0/P1/P2 数量。
2. Q2 每个 EOL release 的 QA escaped Dev P0/P1/P2 数量。
3. IPC freeze issue 的发生场景、配置、版本、复现路径和当前状态。
4. IPC 降本目标配置、基线配置、BOM 差额、供应链风险。
5. Smart Camera Q3 目标客户应用清单和验收标准。
6. OptiX V6.1、Deflectometry、AI 架构验证的 Q3 Go/No-go 标准。
7. G2.1 到 G3.2 的项目台账和 Q2 baseline。

## 10. 推荐最终呈现格式

建议 Google Doc 中只放顶层 OKR 和团队拆解入口，不把所有 initiative 堆在同一层：

```markdown
# 2026 Q3 Engineering OKRs

## O1. 让 EOL 平台成为可规模化交付、可稳定升级的核心产品
- KR1 ...
- KR2 ...
- KR3 ...
- KR4 ...

## O2. 降低 EOL 单位交付成本，同时守住可靠性和现场体验
- KR1 ...
- KR2 ...
- KR3 ...
- KR4 ...

## O3. 打通 Smart Camera 从工程样机到可销售、可交付产品的 launch 路径
- KR1 ...
- KR2 ...
- KR3 ...
- KR4 ...

## O4. 验证下一代技术能否转化为 Q4/Q1 的产品化能力
- KR1 ...
- KR2 ...
- KR3 ...
- KR4 ...

## Team-level OKR links
- Software
- Hardware
- AI / Advanced Technology
- QA
- Product / Service
```

这版结构的好处是：顶层看的是 Engineering 对公司结果的贡献，下一层团队可以按相同 KR 拆自己的可控指标，IPC 降本也不会再作为软件团队孤立目标出现。
