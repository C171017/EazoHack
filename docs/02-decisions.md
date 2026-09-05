# 决策登记

> 2026-09-05 implementation update: The user subsequently authorized scaffolding and local verification. Historical “documentation only / not started / stop for review” wording below describes the earlier handoff. See [current implementation status](07-scaffold-status.md); open decisions remain open.


## 已确认与变更

| 编号 | 状态 | 结论 |
| --- | --- | --- |
| D01 | 已确认，替代旧提案 | 阅读 → 高亮 → 路由到一种或多种辅助 → 探索 → 保存到段落/地图；不再以图谱选概念作为求助起点 |
| D04 | 已确认 | 当前默认使用 React Flow 2D；3D 不在脚手架范围 |
| D05 | 输入已确认；触发细节待决 | MVP 以左侧原书选中/高亮文字作为上下文。截图与周期采集在 MVP 外；节点/当前页不能替代选文 |
| D06 | 产品范围已确认；实现深度待决 | 路由器可组合实时生成交互 UI、生成图片、SVG/概念图/思维导图、来源查找四路；撤销此前 SVG-only 默认范围 |
| D08 | 基础栈与默认架构已确认 | TypeScript、React、Next.js App Router/Route Handlers、PDF.js（`pdfjs-dist`）、Zod、React Flow（`@xyflow/react`）2D、IndexedDB、React 组件 + SVG、Tailwind CSS；结构化模型路由 + 应用调度器，不引入 agent framework |
| D10 | 交互 UI 运行边界已确认 | LLM 输出经 Zod 校验的配置/组件组合；只允许已测试组件注册表与预编译 Tailwind 变体，不执行任意模型代码或运行时 class |

2026-09-05：用户明确授权更新文档并新增脚手架交接计划，未授权实现。四路意图、高亮输入、基础栈与受控交互 UI 是确认结果；不得重新降级为未确定愿景。

## 后续讨论顺序

| 顺序 / 编号 | 待决问题 | 建议及取舍 |
| --- | --- | --- |
| 1 / D06 | 十小时每路做到什么深度？ | 四路保留并演示组合；交互 UI 的配置驱动方式已定，主题数、图片是否现场生成、概念图编辑性和来源路线深度尚未批准 |
| 2 / D09 | 来源查找覆盖书内还是外部？ | 演示暂提议书内检索相关段落；若批准外部检索，再选服务、核验来源及处理失败。不能把“书内提案”写成已定范围 |
| 3 / D05 | 高亮后何时启动、如何组合/改选？ | 建议高亮后明确点击求助，显示路线理由并允许改选；规则、并发、数量、成本控制待定 |
| 4 / D02 | 示例书、节点和边语义？ | 短知识类书，概念节点、章节分组；小说/论证型书会改变图 schema |
| 5 / D03 | 首发文件和整书规模？ | 有文字层、排版简单的 PDF；TXT 有余量再加；不接受静默截断 |
| 6 / D07 | 活动指标、空间书签与映射？ | 主动事件计数，避免段落到多概念重复计量；不表示理解程度 |
| 7 / D11 | 模型版本、图片/检索服务及运行环境？ | 基础栈已锁；具体模型、服务商、图片 API、搜索服务和托管仍待后续决定与预检 |

每次确认追加：`日期 | D编号 | 状态 | 用户结论 | 影响文档`。当前没有选定具体模型、价格、外部检索范围、服务商或托管。文档更新已获授权；脚手架与实现尚未开始。

## Implementation authorization update

2026-09-05 | User authorized scaffolding, delegation, local dev and visual verification, limited to finalized decisions and neutral foundations for open parts. Republic source acquisition is complete; demo processing scale, graph semantics and full-book analysis remain unverified. No routing policy, providers, search scope, activity metric or hosting was selected.
