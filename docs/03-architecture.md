# 架构、数据流与出处锚点

已确认的是高亮输入、可组合的四路辅助及整书地图愿景；以下 schema、调度和实现方式为建议，不是已实现接口。

## 整书到图谱

1. 浏览器读取文件、计算文件指纹；PDF.js 逐页渲染与提取文字，保留页与文本片段映射。用户可先阅读。扫描/乱码/排版异常给出明确提示，不生成假结构。
2. 生成固定规范化文本、页内片段 ID、分块清单；按章节或长度分块，跨边界允许少量重叠但保留同一出处 ID。
3. 用户启动整书分析后，浏览器逐块提交到服务端；服务端调用模型返回概念候选、关系候选和已存在的片段 ID。每块结果单独校验并保存在本地，失败只重试该块。
4. 所有块完成后，把候选摘要分批合并、去重，再做跨章关系整理。合并仍保留原始出处；摘要再压缩时不丢弃覆盖清单。整书处理不等于一次请求塞进全部内容。
5. 校验节点和边的 ID、类型、引用与证据；计算布局并保存版本。展示“已处理 X/Y 块”；部分失败标明不完整。没有证据的边不发布为事实，也不强行把图接成一个连通分量。

建议仅承诺一个经过预检、可在预算内完整覆盖的短书演示；分块覆盖只代表文本进入了处理流程，不代表每个概念都已被准确提取。超出预检范围先提示不支持，不静默截断。暂不引入向量数据库：段落辅助以用户选文为主，相关段落/图邻居可补充上下文。书内或外部来源查找的范围另见 D09。

## 选文辅助：独立于整书流水线

1. 读者在原书划选并高亮文字，建立 Selection 与一个或多个 SourceAnchor（跨页选区不能压成单页）。冻结选文、周边背景及可选用户问题；空选区不路由，也不以当前节点替代。
2. 路由器读取选文及必要背景，生成 RoutePlan，包含一种或多种路线、理由、顺序/依赖。高亮即启动还是点击后启动由 D05 决定；建议先明确点击求助。
3. 为每路创建独立 RouteRun：interactive_ui、generated_image、concept_diagram、source_discovery。相互独立的路线可并发，有依赖则顺序执行；单路失败不丢弃其他结果。用户换选区后，旧结果仍绑定原 selectionId，不能挂到新段落。
4. 各路验证后分别展示：交互 UI 的行为/参数、图片产物、概念图结构、参考资料与支持关系。建议可独立保存或保存整组，并保留请求快照、路线来源和生成状态。
5. 保存先关联原文锚点，地图完成后可添加概念关联；地图尚未完成不阻塞求助。整书图谱与段落路由共享出处契约，拥有不同任务状态、重试和版本。

所有产物保留选文作为 grounding，标记书中依据、模型补充及未验证内容；这不要求每次执行来源查找。source_discovery 才主动寻找资料，其范围为待决值，未确认时不能自动启用外部搜索。引用结果记录定位/链接、摘录与支持关系；检索为空时显示无结果，不编造参考。

交互 UI 实时生成是确认意图。推荐窄主题的已验证渲染器承载 LLM 实时生成的内容、参数和界面组合；另一候选是生成代码并隔离运行，需另评估校验、资源限制与通信边界。推荐方案不构成对生成 UI 的否定。教学模拟须保存假设、方程/规则来源与验证状态；可操作性不等于模型正确。书文是分析资料，不作为执行指令。各路线的具体实现由 D06/D08 决定。

## 最小数据契约

字段是提案，可供后续实现 schema；ID 由应用分配，模型引用允许列表中的 ID。

| 实体 | 最小字段及约束 |
| --- | --- |
| Book | `id, fileHash, title, format, extractionVersion, pageCount?, createdAt`；指纹区分同名不同版本 |
| SourceAnchor | `id, bookId, fileHash, extractionVersion, locator, quote, prefix, suffix, resolution`；定位详见下表 |
| Chunk | `id, bookId, anchorIds, textHash, status, error?`；状态 pending/running/complete/failed |
| Node | `id, bookId, graphVersion, type, label, summary, anchorIds, position{x,y}`；概念至少一个有效出处 |
| Edge | `id, source, target, type, evidenceAnchorIds, rationale, provenance`；端点存在，关系方向按标签解释；`provenance=model_inferred` 明示推断 |
| Selection | `id, bookId, anchorIds, selectedText, contextSnapshot, createdAt`；必有非空选文，跨页可有多个锚点 |
| RoutePlan | `id, selectionId, routes[], reasonByRoute, trigger, routerVersion`；路线去重且可多选，规则及组合上限待决 |
| RouteRun | `id, planId, route, status, dependsOn[], error?, artifactIds[]`；独立 pending/running/complete/failed/cancelled |
| Artifact | `id, bookId, selectionId, routeRunId, nodeIds[], anchorIds, graphVersion?, kind, payload, provider?, modelLabel?, schemaVersion, createdAt, savedAt`；原文关联必有，节点可暂空，模型标识记录实际值 |
| Reference | `id, scope, anchorId?, url?, title, excerpt?, supportRelation, verificationStatus, retrievedAt`；书内需锚点，外部需实际来源链接；scope 选择受 D09 约束 |
| Bookmark | `id, bookId, graphVersion, viewport{x,y,zoom}, selectedNodeId?, readerAnchorId?, label` |
| ActivityEvent | `id, bookId, nodeId?, anchorId?, type, timestamp`；原始事件与派生强度分开，去重后统计 |
| AnalysisRun | `id, bookId, chunkIds, completedChunkIds, status, modelLabel, promptVersion`；支持覆盖检查与失败恢复 |

`Artifact.kind` 覆盖四类，不收窄成 SVG-only：

| kind | 建议 payload |
| --- | --- |
| interactive_ui | 界面描述/生成配置或隔离代码引用、参数、交互状态、假设、模型规则依据、validationStatus；保存后可恢复探索状态 |
| generated_image | 图片 Blob/持久资源引用、提示词、说明文字、生成信息；不能只保存会过期的临时 URL |
| concept_diagram | 节点/边或 SVG 描述、布局与图例；输出验证后渲染 |
| source_discovery | Reference ID 列表、检索范围/查询、支持或不支持的说明；原文锚点不等同于检索结果 |

产物可以共享 selectionId 组成一组。建议用 planId/routeRunId 去重保存，重试保留版本，避免重复事件。

| locator 类型 | 定义 |
| --- | --- |
| PDF | `pageIndex` 从 0 开始；`printedPageLabel?` 为展示标签；`startOffset/endOffset` 为该页规范化文字的 UTF-16 半开区间；`rects?` 为未旋转页面、左上原点的 0–1 归一化矩形 |
| TXT | `startOffset/endOffset` 为整份规范化文字 UTF-16 半开区间；可附段落 ID；不虚构 PDF 页码 |

规范化规则版本化：统一换行，保留段落标记；必须保存从规范化区间到 PDF text items 的映射。不可用 DOM 屏幕坐标作为唯一锚点。引文、前后文用于校验和重新匹配；模型提供片段 ID/引文，应用解析偏移量，不信任模型编造字符位置。

解析次序：核对文件和提取版本 → 校验偏移处引文 → 使用同页引文及前后文查找唯一匹配 → 无唯一匹配则 `resolution=page_only` 或 `unresolved`。PDF 可降级到准确页码和出处卡片，但界面必须显示“仅定位到页”；TXT 无匹配则未定位。高亮选文是核心功能，必须在支持的文件上完成可重复定位与显示；无法恢复时保留原选文并明确提示修复。仅页定位是错误降级，不算高亮验收通过。

图谱重生成形成新版本。保存产物仍引用旧的稳定出处，不凭同名概念自动迁移；首版建议冻结一个图版本，重分析需另存。自动布局不因活动变化重排，保证空间记忆。

## 边界与保存

浏览器负责文件、选文、高亮、渲染、图谱状态和本地保存；服务端负责整书分析、路由与四路服务适配/校验，密钥仅在服务端配置。启动分析会发送提取文本，段落辅助发送选文及明确界定的补充背景，页面应说明这些行为。外部检索仅在范围确认后接入，图片服务的数据处理条款也需接入时核对。本轮文档工作不需要凭据。

本地 IndexedDB 保存文件 Blob、锚点、图谱、产物和事件；刷新恢复，不承诺跨设备同步或永久存储。写入失败需显示未保存；演示前做导出备份，内容包括图、锚点、产物与书签，原书可凭指纹重新选择。用户删除一本书时连同本地关联记录删除；外部模型服务的数据处理条款需接入时另核对，不能声称端到端只在本机。
