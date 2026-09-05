# 架构、数据流与出处锚点

> 2026-09-05 最新架构细化（待实现）：整书分析在叶节点校验后增加自底向上的 LM 聚合、自动层数提议与应用预算校验，保存版本化父子层级、子树范围和按需分块索引。浏览器仅加载/渲染当前缩放档位与视口所需集合，边、标签、缓存和过渡共同受限；不在手势中调用模型。详见 [多层节点契约](14-semantic-zoom-hierarchy.md)，其中聚合层级不等于 Y 轴语义层级。

> 2026-09-05 implementation update: The user subsequently authorized scaffolding and local verification. Historical “documentation only / not started / stop for review” wording below describes the earlier handoff. See [current implementation status](07-scaffold-status.md); open decisions remain open.


已确认的是高亮输入、可组合的四路辅助、整书地图愿景，以及结构化模型路由 + 应用调度器的默认架构。以下接口仍是待脚手架化的契约，不是已实现能力。

## 整书到图谱

方案、章节识别、提取时间与覆盖要求详见 [PDF 阅读、全文提取与整书图谱](11-pdf-whole-book-analysis.md)。全书转文字可行；直接 PDF 模型输入也是可选路径，不以“纯 PDF 不可接受”为前提。

1. 文件指纹绑定完整来源；PDF.js 按需渲染与准备文字，保留页与片段映射。整书任务独立遍历全部来源并复用匹配版本的页缓存；读者未访问的页面不能跳过。前言、索引、注释、图片和空白页均留在清单中，用户可先阅读。
2. 内嵌文字优先；间距或顺序异常先核对几何提取，再决定是否 OCR。缺少/损坏文字进入 OCR；可选 LM 整理保留原结果。建立版本化文字、片段 ID 与页位置。按内嵌大纲或经核验的标题分块；无目录时可按页/长度分块，重叠沿用同一出处 ID。
3. 用户启动整书分析后，应用按块调用模型返回概念、关系候选和已有证据片段 ID；也可通过支持的多模态 API 提交对应 PDF 页，引用仍须定位校验。每块独立校验/保存/重试。完整提取放在服务端或指定处理机是建议，执行位置、持久任务机制与 provider 尚待确定，不假设一个 HTTP 请求可无限运行。
4. 所有块完成后，把候选摘要分批合并、去重，再做跨章关系整理。合并仍保留原始出处；摘要再压缩时不丢弃覆盖清单。整书处理不等于一次请求塞进全部内容。
5. 校验节点和边的 ID、类型、引用与证据；计算布局并保存版本。展示“已处理 X/Y 块”；部分失败标明不完整。没有证据的边不发布为事实，也不强行把图接成一个连通分量。

6. 从通过校验的图生成受约束的三维空间：X 为主题疆域，Y 为具体细节→组织性结构，Z 为来源进度。X 的主题名称与位置按每本书动态生成，但只能遵守 [3D 整书地图契约](08-book-map-3d.md) 的覆盖、区分、证据和稳定性规则；Y 使用规范结构层级并允许书型化显示名称；Z 从 SourceAnchor 计算。三个二维投影必须读取同一组节点、边和坐标，不能维护各自的模型事实副本。

建议仅承诺一个经过预检、可在预算内完整覆盖的短书演示；分块覆盖只代表文本进入了处理流程，不代表每个概念都已被准确提取。超出预检范围先提示不支持，不静默截断。暂不引入向量数据库：段落辅助以用户选文为主，相关段落/图邻居可补充上下文。书内或外部来源查找的范围另见 D09。

## 选文辅助：独立于整书流水线

1. 读者在原书划选并高亮文字，建立 Selection 与一个或多个 SourceAnchor（跨页选区不能压成单页）。冻结选文、周边背景及可选用户问题；空选区不路由，也不以当前节点替代。
2. 路由器读取选文及必要背景，生成 RoutePlan，包含一种或多种路线、理由、顺序/依赖。高亮即启动还是点击后启动由 D05 决定；建议先明确点击求助。
3. 为每路创建独立 RouteRun：interactive_ui、generated_image、concept_diagram、source_discovery。相互独立的路线可并发，有依赖则顺序执行；单路失败不丢弃其他结果。用户换选区后，旧结果仍绑定原 selectionId，不能挂到新段落。
4. 各路验证后分别展示：交互 UI 的行为/参数、图片产物、概念图结构、参考资料与支持关系。建议可独立保存或保存整组，并保留请求快照、路线来源和生成状态。
5. 保存先关联原文锚点，地图完成后可添加概念关联；地图尚未完成不阻塞求助。整书图谱与段落路由共享出处契约，拥有不同任务状态、重试和版本。

所有产物保留选文作为 grounding，标记书中依据、模型补充及未验证内容；这不要求每次执行来源查找。source_discovery 才主动寻找资料，其范围为待决值，未确认时不能自动启用外部搜索。引用结果记录定位/链接、摘录与支持关系；检索为空时显示无结果，不编造参考。

交互 UI 实时生成是确认意图，且运行边界已经确定：模型只输出受版本控制的配置、内容、参数与组件组合；服务端以 Zod 校验，客户端只解析允许列表中的已测试 React 组件。组件 variant 映射到源码中预编译的 Tailwind class，模型不得提交 class 名、HTML、JavaScript 或表达式。教学模拟须保存假设、方程/规则来源与验证状态；可操作性不等于模型正确。书文是分析资料，不作为执行指令。

概念图采用同一受控数据驱动原则：模型输出节点、边、分组和可选注释，经 Zod 校验与引用完整性检查后，由 React 组件和 SVG 渲染。它与右侧 3D 整书地图共享视觉 token，但不共享运行状态，也不将段落图自动提升为整书事实。旧 React Flow fixture 已由 React/SVG 三维坐标投影替换；样本内容不代表全书分析。

## 路由与调度边界

服务端模型路由器只负责产生 `RoutePlan`；应用调度器负责许可路线、依赖排序、并发、取消、重试、状态迁移和 provider 调用。不要引入 agent framework，也不要让模型直接调用 provider、IndexedDB 或客户端组件。

每个 provider 实现相同的可替换边界：接收冻结的选文请求与路线专用参数，返回可校验的产物 payload 和 provenance。脚手架阶段以显式 `mock` 实现贯通四路；真实模型、图片和搜索 provider 保持未配置状态，不得由 mock 成功暗示真实服务已接通。

## 最小数据契约

字段是提案，可供后续实现 schema；ID 由应用分配，模型引用允许列表中的 ID。

| 实体 | 最小字段及约束 |
| --- | --- |
| Book | `id, fileHash, title, format, extractionVersion, pageCount?, createdAt`；指纹区分同名不同版本 |
| SourceAnchor | `id, bookId, fileHash, extractionVersion, locator, quote, prefix, suffix, resolution`；定位详见下表 |
| Chunk | `id, bookId, anchorIds, textHash, status, error?`；状态 pending/running/complete/failed |
| Node | `id, bookId, graphVersion, kind(identity|occurrence), type, label, summary, anchorIds, themeTerritoryIds, structuralLevel, position{x,y,z}, coordinateConfidence`；概念身份至少连接一个有出处的 occurrence；只有 occurrence 的 Z 可直接由来源位置确定 |
| Edge | `id, source, target, type, evidenceAnchorIds, rationale, provenance`；端点存在，关系方向按标签解释；`provenance=model_inferred` 明示推断 |
| ThemeTerritory | `id, bookId, graphVersion, label, summary, anchorIds, centroidX, coverage, confidence, orderLocked`；每书顶层通常 3–7 个，必须有跨片段证据且与其他顶层主题可区分 |
| Selection | `id, bookId, anchorIds, selectedText, contextSnapshot, createdAt`；必有非空选文，跨页可有多个锚点 |
| RoutePlan | `id, selectionId, routes[], reasonByRoute, trigger, routerVersion`；路线去重且可多选，规则及组合上限待决；服务端 Zod 校验 |
| RouteRun | `id, planId, route, status, dependsOn[], error?, artifactIds[]`；独立 pending/running/complete/failed/cancelled |
| Artifact | `id, bookId, selectionId, routeRunId, nodeIds[], anchorIds, graphVersion?, kind, payload, provider?, modelLabel?, schemaVersion, createdAt, savedAt`；原文关联必有，节点可暂空，模型标识记录实际值 |
| Reference | `id, scope, anchorId?, url?, title, excerpt?, supportRelation, verificationStatus, retrievedAt`；书内需锚点，外部需实际来源链接；scope 选择受 D09 约束 |
| Bookmark | `id, bookId, graphVersion, mapView{graphVersion,projection,yaw,pitch,x,y,zoom,sourceScope}, selectedNodeId?, readerAnchorId?, label` |
| ActivityEvent | `id, bookId, nodeId?, anchorId?, type, timestamp`；原始事件与派生强度分开，去重后统计 |
| AnalysisRun | `id, bookId, chunkIds, completedChunkIds, status, modelLabel, promptVersion`；支持覆盖检查与失败恢复 |

`Artifact.kind` 覆盖四类，不收窄成 SVG-only：

| kind | 建议 payload |
| --- | --- |
| interactive_ui | 版本化组件配置、参数、交互状态、假设、规则依据、validationStatus；只允许注册表组件和 variant，不含代码或 Tailwind class |
| generated_image | 图片 Blob/持久资源引用、提示词、说明文字、生成信息；不能只保存会过期的临时 URL |
| concept_diagram | 版本化节点/边/分组、布局提示与图例；应用校验后以 React + SVG 渲染 |
| source_discovery | Reference ID 列表、检索范围/查询、支持或不支持的说明；原文锚点不等同于检索结果 |

产物可以共享 selectionId 组成一组。建议用 planId/routeRunId 去重保存，重试保留版本，避免重复事件。

| locator 类型 | 定义 |
| --- | --- |
| PDF | `pageIndex` 从 0 开始；`printedPageLabel?` 为展示标签；`startOffset/endOffset` 为该页规范化文字的 UTF-16 半开区间；`rects?` 为未旋转页面、左上原点的 0–1 归一化矩形 |
| TXT | `startOffset/endOffset` 为整份规范化文字 UTF-16 半开区间；可附段落 ID；不虚构 PDF 页码 |

规范化规则版本化：统一换行，保留段落标记；必须保存从规范化区间到 PDF text items 的映射。不可用 DOM 屏幕坐标作为唯一锚点。引文、前后文用于校验和重新匹配；模型提供片段 ID/引文，应用解析偏移量，不信任模型编造字符位置。

解析次序：核对文件和提取版本 → 校验偏移处引文 → 使用同页引文及前后文查找唯一匹配 → 无唯一匹配则 `resolution=page_only` 或 `unresolved`。PDF 可降级到准确页码和出处卡片，但界面必须显示“仅定位到页”；TXT 无匹配则未定位。高亮选文是核心功能，必须在支持的文件上完成可重复定位与显示；无法恢复时保留原选文并明确提示修复。仅页定位是错误降级，不算高亮验收通过。

图谱重生成形成新版本。保存产物仍引用旧的稳定出处，不凭同名概念自动迁移；首版建议冻结一个图版本，重分析需另存。接受一个图版本后，主题顺序、轴方向和主要坐标不因活动变化或小幅增量分析重排，保证空间记忆。若重分析确需改变主题疆域，应形成新版本并显示变化，而不是静默旋转、翻转或换序。

## 边界与保存

浏览器负责文件、选文、高亮、渲染、图谱状态和本地保存；Next.js Route Handlers 负责整书分析、结构化路由、调度入口与四路 provider 适配/校验，密钥仅在服务端配置。启动分析会发送提取文本，段落辅助发送选文及明确界定的补充背景，页面应说明这些行为。外部检索仅在范围确认后接入，图片服务的数据处理条款也需接入时核对。本轮文档工作不需要凭据。

本地 IndexedDB 保存文件 Blob、锚点、图谱、产物和事件；刷新恢复，不承诺跨设备同步或永久存储。写入失败需显示未保存；演示前做导出备份，内容包括图、锚点、产物与书签，原书可凭指纹重新选择。用户删除一本书时连同本地关联记录删除；外部模型服务的数据处理条款需接入时另核对，不能声称端到端只在本机。

当前 GraphSchema 将 identity 与 occurrence 分表，锚点存于 graph.anchors，版本由 graphVersion 统一约束。当前 TXT 路径验证 Z=首个精确锚点偏移/sourceLength，Y=structuralLevel。来源、图与旧视口的迁移边界见 [实现记录](09-3d-implementation.md)。
