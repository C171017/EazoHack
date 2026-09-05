# 已确认技术选型

> 2026-09-05 implementation update: The user subsequently authorized scaffolding and local verification. Historical “documentation only / not started / stop for review” wording below describes the earlier handoff. See [current implementation status](07-scaffold-status.md); open decisions remain open.


核对日期：2026-09-05。以下基础栈与默认架构已获批准，适用于高亮输入、四路辅助和整书地图。D06/D09/D05 的演示深度、检索范围和触发策略仍待定；具体模型、服务商和托管未选择。

## 锁定组合

| 层 | 已确认选择 | 边界 |
| --- | --- | --- |
| 网页与服务端 | TypeScript + React + Next.js App Router 与 server Route Handlers | 一个项目容纳界面与服务端边界，不另建后端 |
| 原书阅读/提取 | PDF.js（`pdfjs-dist`） | 负责页面、文字层与提取；稳定锚点、选择恢复仍是应用责任 |
| 运行时校验 | Zod | 共享 route plan、锚点、图谱与四类 artifact schema；模型/provider 输出先校验再进入 UI/存储 |
| 整书图谱 | 共享 3D 坐标模型 + React/SVG 正交投影；自由 3D 与三个规范投影 | 已比较 CSS 3D、Canvas、WebGL 与 SVG，并实现有出处的九节点样本；React Flow 已移除。大图容量仍须验证，详见 09-3d-implementation.md |
| 模型边界 | 结构化模型路由 + 应用调度器 | 模型提出计划/数据，应用执行路线、状态和 provider；不采用 agent framework |
| 产物渲染 | React 组件 + SVG | 交互 UI 与概念图为受控数据驱动渲染；图片和来源路线保留独立 provider |
| 保存 | IndexedDB | 本机保存结构化数据和 Blob；不承诺云同步 |
| 样式 | Tailwind CSS + 少量定向自定义 CSS | 自定义 CSS 仅用于 PDF text layer、高亮与 SVG/三维投影集成等边界 |

Tailwind 取代 plain CSS 作为主样式方式，因为实现将主要由 AI 辅助完成，需要明确 token、组件和 variant 约束。这一变化不改变其余选型。模型不能生成运行时 Tailwind class；组件注册表中的 variant 负责所有可选外观，使样式可预编译、可审查、可测试。不要从模型或数据库字符串拼接 class。

PDF 和图谱组件在浏览器端，Route Handlers 保持服务端 provider/密钥边界。无需 agent framework、向量数据库、账户系统或云端任务队列。

## 四路实现要求

| 路线 | 已确认默认 | 仍待决定/验证 |
| --- | --- | --- |
| interactive_ui | LLM 输出经 Zod 校验的配置、解释、参数和组件组合，由注册表中已测试的 React 组件承载 | 示例主题、参数边界、方程依据和十小时覆盖深度；不执行模型代码或运行时 class |
| generated_image | 独立图片 provider、异步状态、预览和 Blob/持久资源保存 | 提供商、模型/权限、延迟、失败和演示深度 |
| concept_diagram | 受控节点/边/分组，经校验后由 React + SVG 渲染 | 关系依据、布局、编辑能力与演示深度；与整书三维图谱状态独立 |
| source_discovery | 独立检索 provider 与 Reference 校验 | 书内/外部范围、服务、引用核验与演示深度；模型凭记忆列书目不算检索 |

路由采用可返回路线数组的结构化契约；默认由模型提出、Zod 校验、应用调度器执行。组合路线拥有独立进度、局部失败和可重复保存。具体模型、fallback 规则、高亮后触发时机与用户覆盖方式仍待选。

## 未锁定项

PDF/整书提取方案见 [11-pdf-whole-book-analysis.md](11-pdf-whole-book-analysis.md)：PDF.js 保持阅读基础栈；先改善原生文字提取，再对确有需要的页面 OCR。pdfplumber、Mistral Document AI、Docling 是本次研究候选，不因写入文档而成为锁定依赖或部署服务。整书任务执行位置、持久执行机制与预算仍需选择。段落辅助接入见 [10-gemini-production.md](10-gemini-production.md)，其模型选择不自动决定整书分析服务。

不在本轮选择：编码模型版本、生产模型版本、服务提供商、图片 API、搜索服务、托管、外部来源范围、demo 书/大小、四路深度与活动语义。脚手架必须用明确标注的 mock 在无凭据条件下运行；真实 provider 未配置时报告 `not_configured`，不能暗示接通。

## 何时重新评估

3D 已获产品批准，但这不等于选定渲染库。实现前需单独验证节点规模、标签遮挡、投影切换、键盘导航、降低动态效果和低性能设备降级。若未来批准云同步、任意代码执行、多人协作或复杂格式，应单独重审安全、身份和存储方案。自由生成 HTML/JS 不属于当前默认架构；不得在脚手架中预留隐式执行入口。

## 实现初期验证

先验证目标 PDF 的文字顺序、选区/持久高亮、跨行跨页映射和五个出处，再验证单路/多路 RoutePlan、非法配置拒绝、注册表组件和四路独立错误状态。随后按已批准深度逐路预检真实服务；一个文本请求成功不能代表图片或搜索已接通。

## 3D 实现更新

当前已选择并实现 React/SVG 三维坐标投影，详见 [技术比较与实现边界](09-3d-implementation.md)。此前“渲染器待选”的记录描述语义确认时点；本轮不引入额外图形库。
