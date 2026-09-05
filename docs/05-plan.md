# 十小时范围、演示与验收

> 2026-09-05 D14 最新布局：段落辅助结果应在左侧原文的对应锚点内嵌，右侧保留地图；现有 passage panel 待迁移。首版使用原生 DOM 的块级 artifact slot，不以全阅读器 Pretext 重写作为前置条件。详见 [内嵌产物决策](17-inline-reader-artifacts.md)。

> 2026-09-05 implementation: semantic zoom, bounded viewport loading and the Gemini-generated five-layer Republic hierarchy are now delivered locally. See [current implementation and verification](15-semantic-zoom-implementation.md). Earlier pending/paging notes below are historical; baseline-device benchmarks remain pending.

> 2026-09-05 新增后续验收：[多层节点与语义缩放](14-semantic-zoom-hierarchy.md)。需在 M1/M2 MacBook Air 和同档 Windows 集显笔记本测量有界视口渲染、捏合阈值往返过渡、密集子树加载及缓存；验证拖动不自动缩放、全部已接受叶节点仍可达。数量、阈值及性能通过值待实测定值；本轮仅文档更新。

> 2026-09-05 implementation update: The user subsequently authorized scaffolding and local verification. Historical “documentation only / not started / stop for review” wording below describes the earlier handoff. See [current implementation status](07-scaffold-status.md); open decisions remain open.


这是未来获准实现后的工程提案，本轮只更新文档。高亮输入、四路辅助、基础栈与配置驱动交互 UI 已确认；路由触发、每路深度、模型、示例书及来源查找范围待决。脚手架也尚未开始。

## 产品范围与待定演示深度

已确认核心：阅读 → 选择/高亮原文 → 路由到一种或多种辅助 → 探索 → 保存到段落/地图。四路均保留：交互 UI、生成图片、概念图、来源查找。十小时内每路做到现场、mock、预生成或仅状态骨架，必须在实施前明确，不在本文中静默削减。

| 部分 | 候选演示深度 | 未批准/未验证边界 |
| --- | --- | --- |
| 阅读与地图 | 一份可完整处理的短 PDF，约 15–30 概念；能选择、高亮、保存和回访段落 | demo 书、页数与提取量均待定；不承诺任意长书 |
| 交互 UI | 一种经过验证的教学组件组合，LLM 实时生成配置/解释并可操作、保存状态 | 主题数与业务规则待定；不运行模型代码 |
| 图片 | 一段选文对应一张图片，含预览、状态和保存 | 是否现场生成及 API/账号/延迟待定；占位图不能冒充生成 |
| 概念图 | 从选文生成小型受控关系图 | 编辑能力、布局和主题深度待定 |
| 来源查找 | 返回可核对的书内段落或外部资料 | 书内/外部仍待 D09；外部需重新预算搜索和核验 |
| 组合与回访 | 同一高亮路由到至少两种辅助，并在左侧对应选文处按稳定顺序内嵌、独立状态/保存 | 组合上限、并发和 route override 待定 |

高亮不是条件增量；支持的 PDF 必须能形成稳定选文锚点。2026-09-05 用户确认 TXT 与 PDF 均为当前输入，并授权 PDF 四层文字处理；因此旧的“TXT 有余量再加”和“OCR 排除”不再适用。全部来源内容保留，整书图未完成不得阻止段落辅助。复杂双栏/公式质量、语言范围、任意长书与完整分析预算仍需验证。EPUB/DOCX、截图/周期采集、模型生成可执行代码、登录/协作/云同步不在本次扩展内。PDF 全量提取、独立分析任务与衔接验收见 [11-pdf-whole-book-analysis.md](11-pdf-whole-book-analysis.md)。

## 10 小时分配（建议）

| 时间 | 工作 | 出口条件 / 处理 |
| --- | --- | --- |
| 0:00–0:30 | 确认每路深度、触发/改选、来源范围、示例书与预算 | 形成四路状态表；未定服务用 mock，不暗示真实接通 |
| 0:30–1:30 | 脚手架、共享 Zod schema、Tailwind token/组件壳、mock provider | 无凭据启动；非法 route/config 被拒绝；没有任意代码/class 入口 |
| 1:30–2:45 | PDF 阅读、文字层、选择/高亮与稳定锚点 | 跨行、重复引文、刷新恢复通过；失败不能退回节点优先 |
| 2:45–3:45 | 整书分块、覆盖状态与 3D 坐标/三投影最小路径 | 完整/部分状态真实；X 主题、Y 结构层级、Z 出处位置可解释；地图失败不阻塞选文辅助。若一小时不足，缩小节点规模而不退回未声明的 2D 产品设计 |
| 3:45–4:30 | 结构化路由、应用调度器、单路/组合任务 | selectionId 不串；一路失败不覆盖其他产物 |
| 4:30–5:30 | 交互 UI 配置 → 注册表组件 → 状态保存 | 至少一个经验证组件组合可操作；假设/边界可见 |
| 5:30–6:15 | 数据驱动概念图 | Zod 与引用校验通过，React + SVG 可读并关联选文 |
| 6:15–7:00 | 图片路线 | 按预先批准深度接真实 provider 或明确 mock/预生成；Blob/错误状态可保存 |
| 7:00–7:45 | 来源路线 | 按批准的书内/外部范围实现；空结果不编造，mock 不冒充检索 |
| 7:45–8:45 | IndexedDB 多产物保存、书签与活动层 | 独立保存/恢复；地图未完成仍可保存选文产物 |
| 8:45–10:00 | 全流程验收、修复、重启和彩排 | 报告四路各自现场/mock/预生成/未实现状态；不把托管计入默认预算 |

这是紧预算提案，不是十小时必达保证。若外部搜索、全部市场模型或多个图片风格都要求深入实现，需要增加时间或明确降低每路深度；不能靠文档删除已确认路线。

## 降级与未完成说明

优先缩减动效、图规模和每路主题广度；保留已确认的 TXT/PDF 范围、全部来源、选择/高亮、稳定锚点、四路契约、组合状态与保存闭环。整书图可预处理并明确标注；部分分析不得冒充全部覆盖。某路服务不可用时展示失败/重试；预生成或 mock 只能按真实状态标注，不算现场路线已通过。

若 2:45 高亮仍失败，优先修复或更换支持文件；若 4:30 路由未通过，暂停产物扩展解决上下文绑定；若 8:45 保存失败，停止新增能力。不得把出处真实性、模拟正确性或真实检索换成外观演示。

## 约三分钟演示

1. 展示左侧正常阅读、右侧整书网络，说明图谱覆盖和现场/预生成状态。
2. 在原书选择并高亮不理解的段落，按最终触发方式启动辅助。
3. 展示同一选文的交互 UI + 概念图组合出现在左侧对应段落，操作参数并分别保存；说明配置经过校验且没有执行模型代码。
4. 快速展示图片与来源路线，明确每路是现场、mock、预生成还是未实现，以及来源范围。
5. 从活动/书签总览回到原高亮，重开多个产物；刷新验证锚点与状态没有丢失。

## 验收清单

| 检查 | 通过标准 |
| --- | --- |
| 桌面 | 1440×900 / 1920×1080 下可读可选，原书与图谱缩放独立 |
| 高亮输入 | 原书选文准确传入路由；跨行/跨页及重复引文不串段；刷新恢复；无选文不拿节点替代 |
| 内嵌产物 | 图片、交互 UI、概念图按 SourceAnchor/来源偏移进入左侧；同段多产物顺序稳定；折叠、删除、失败、刷新和宽度变化不改写来源或丢阅读位置；跨产物选择仍解析为精确原文 quote |
| 配置安全 | 未注册组件、非法参数、任意代码字段和运行时 Tailwind class 均被 schema/注册表拒绝 |
| 整书地图 | 完成清单后才标 complete；五个出处和三条关系抽查无错页/编造依据；同一数据在 X×Y、X×Z、Y×Z 投影间身份和坐标一致；主题/结构位置有理由，Z 可回到准确出处 |
| 路由 | 有单路与至少两路组合案例；无效路线拒绝；切换选区后旧结果仍指向旧选文 |
| 交互 UI | 配置生成路径可见；控件改变状态；假设、范围和验证状态明确；边界参数有测试 |
| 图片 | 按批准深度准确显示真实/mock/预生成/未配置；保存与失败状态不假冒成功 |
| 概念图 | 由选文产生受控关系结构，标签可读，生成推断与书文区分 |
| 来源查找 | 按批准范围实际检索；可核对支持关系；空结果诚实显示；mock 不算检索 |
| 组合故障 | 一路超时不覆盖其他产物；重试不重复保存；调用遵守最终触发策略 |
| 保存与活动 | 产物始终关联高亮段落；地图未就绪仍可保存；书签恢复；事件不称理解度 |

当前没有脚手架、代码、性能数据或测试结果。四路深度必须由后续决定显式填写，不能以十小时压力改写产品范围。

## 2026-09-05 3D implementation update

The authorized canvas migration is now implemented with React/SVG projections of shared XYZ data, replacing the old React Flow fixture. See [renderer decision and delivered boundaries](09-3d-implementation.md). Historical renderer-pending statements above predate this implementation. Whole-book analysis, live providers and final relation taxonomy remain open.
