# 决策登记

> 2026-09-05 implementation update: The user subsequently authorized scaffolding and local verification. Historical “documentation only / not started / stop for review” wording below describes the earlier handoff. See [current implementation status](07-scaffold-status.md); open decisions remain open.


## 已确认与变更

| 编号 | 状态 | 结论 |
| --- | --- | --- |
| D01 | 已确认，替代旧提案 | 阅读 → 高亮 → 路由到一种或多种辅助 → 探索 → 保存到段落/地图；不再以图谱选概念作为求助起点 |
| D03 | 输入/来源范围已确认；处理规模与部署待验证 | 当前接受纯文本与 PDF，全部随附内容保留。PDF 四层文字处理已获实现授权；阅读按需处理不能代替全量分析。详见 11-pdf-whole-book-analysis.md |
| D04 | 已确认，替代 2D 默认 | 整书地图采用共享 3D 空间及三个规范二维投影：X×Y、X×Z、Y×Z；相反方向不另算视图，自由 3D 只用于总览与投影切换。当前使用 React/SVG 三维坐标投影与有出处的编辑样本；不代表整书分析已完成 |
| D05 | 输入已确认；触发细节待决 | MVP 以左侧原书选中/高亮文字作为上下文。截图与周期采集在 MVP 外；节点/当前页不能替代选文 |
| D06 | 产品范围已确认；实现深度待决 | 路由器可组合实时生成交互 UI、生成图片、SVG/概念图/思维导图、来源查找四路；撤销此前 SVG-only 默认范围 |
| D08 | 基础栈已确认；有界地图渲染器已实现 | TypeScript、React、Next.js App Router/Route Handlers、PDF.js（`pdfjs-dist`）、Zod、IndexedDB、React 组件 + SVG、Tailwind CSS；结构化模型路由 + 应用调度器，不引入 agent framework。本轮授权下经比较选用 React/SVG 三维坐标投影并移除 `@xyflow/react`；大图容量仍待验证 |
| D10 | 交互 UI 运行边界已确认 | LLM 输出经 Zod 校验的配置/组件组合；只允许已测试组件注册表与预编译 Tailwind 变体，不执行任意模型代码或运行时 class |
| D12 | 已确认 | 3D 坐标采用受约束动态语义：X=每书 3–7 个经证据支持的主题疆域；Y=具体细节→组织性结构；Z=可验证的来源进度。必须区分概念身份与带出处、带 Z 坐标的概念出现；位置不代替有类型、有证据的关系边 |
| D13 | 已实现并完成本地验证；基线设备性能待测 | 捏合缩放按阈值在叶节点与多层概括节点间连续转换；按视口加载并设显示上限；取消拖动自动缩放。LM 自底向上生成层级并自动提议深度，应用按实测预算校验。基线为 M1/M2 MacBook Air 与同档 Windows 集显笔记本，详见 [层级契约](14-semantic-zoom-hierarchy.md) |

2026-09-05：用户明确授权更新文档并新增脚手架交接计划，未授权实现。四路意图、高亮输入、基础栈与受控交互 UI 是确认结果；不得重新降级为未确定愿景。

## 后续讨论顺序

| 顺序 / 编号 | 待决问题 | 建议及取舍 |
| --- | --- | --- |
| 1 / D06 | 十小时每路做到什么深度？ | 四路保留并演示组合；交互 UI 的配置驱动方式已定，主题数、图片是否现场生成、概念图编辑性和来源路线深度尚未批准 |
| 2 / D09 | 来源查找覆盖书内还是外部？ | 演示暂提议书内检索相关段落；若批准外部检索，再选服务、核验来源及处理失败。不能把“书内提案”写成已定范围 |
| 3 / D05 | 高亮后何时启动、如何组合/改选？ | 建议高亮后明确点击求助，显示路线理由并允许改选；规则、并发、数量、成本控制待定 |
| 4 / D02 | 示例书、关系类型与 3D 渲染技术？ | 轴和投影已由 D04/D12 确认；仍需确定演示书、关系类型允许表、主题提取阈值与生产渲染器 |
| 5 / D03 | 整书处理预算、质量门槛与执行位置？ | TXT/PDF 与完整来源范围已确认；OCR/全文分析 provider、执行机、并发和规模仍待选/验证；不接受静默截断 |
| 6 / D07 | 活动指标、空间书签与映射？ | 主动事件计数，避免段落到多概念重复计量；不表示理解程度 |
| 7 / D11 | 模型版本、图片/检索服务及运行环境？ | 基础栈已锁；具体模型、服务商、图片 API、搜索服务和托管仍待后续决定与预检 |

每次确认追加：`日期 | D编号 | 状态 | 用户结论 | 影响文档`。当前没有选定具体模型、价格、外部检索范围、服务商或托管。文档更新已获授权；脚手架与实现尚未开始。

2026-09-05 | D04/D12 | 已确认 | 用户选择 3D 整书地图和排名第一的受约束动态轴方案：主题疆域 × 具体细节到组织性结构 × 来源进度；只保留 X×Y、X×Z、Y×Z 三个规范二维投影 | `README.md`、`docs/01-product.md`、`docs/02-decisions.md`、`docs/03-architecture.md`、`docs/04-stack.md`、`docs/05-plan.md`、`docs/06-scaffolding-handoff.md`、`docs/07-scaffold-status.md`、`docs/08-book-map-3d.md`

## Implementation authorization update

2026-09-05 | D03 documentation clarification | 用户要求记录 PDF 与整书分析讨论。TXT/PDF 全来源与 PDF 四层处理是既有确认；独立全量任务、章节分块、证据合并为方案说明，服务端执行和工具 shortlist 仍为建议。已记录本地提取测量，纠正“粘连文字必然需要 OCR”和“整书转换不现实”的假设；本文不宣称整书分析已交付。详见 [11-pdf-whole-book-analysis.md](11-pdf-whole-book-analysis.md)。

2026-09-05 | User authorized scaffolding, delegation, local dev and visual verification, limited to finalized decisions and neutral foundations for open parts. Republic source acquisition is complete; demo processing scale, graph semantics and full-book analysis remain unverified. No routing policy, providers, search scope, activity metric or hosting was selected.

2026-09-05 | D04/D08/D12 implementation | User authorized renderer evaluation and implementation using PoliMap meetings as reference. Selected React/SVG orthographic 3D projection; delivered source-backed editorial sample, camera/projection controls and checkpoint migration. See [implementation record](09-3d-implementation.md). Whole-book analysis and providers remain open.

2026-09-05 | D13 | 设计确认，文档更新 | 用户要求先记录多层节点、捏合阈值、可逆聚合过渡、按视口加载与显示上限；取消拖动自动缩放；整书分析由 LM 自底向上生成概括并自动决定合适层数，实际性能由应用预算和基线设备测量约束 | `docs/14-semantic-zoom-hierarchy.md` 及产品空间、架构、分析、验收与 README 交叉引用。

2026-09-05 | D13 implementation | User authorized UI/loading first, followed by Gemini hierarchy refinement, a live run and local review. Delivered five layers over all 288 accepted leaves, bounded subtree/detail loading, reversible pinch thresholds and stable zoom during drag. Tests/build and local browser checks passed; M1/M2 and Windows device benchmarks remain pending. See [implementation record](15-semantic-zoom-implementation.md).
