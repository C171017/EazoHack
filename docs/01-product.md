# 产品与交互

> 2026-09-05 latest scope: the four enhanced-reading methods are **Explanation, Diagram, Interactive panel, and Illustration**. Research briefs/source discovery are deferred. Iterate Explanation first, then Diagram; Three.js is a future option. This supersedes older product-scope lists below, not their runtime implementation history. See [confirmed method definitions](19-enhancement-methods.md).

> Latest delivery · 2026-09-05: inline artifact slots are now implemented in the main TXT reader, with persistent placement, collapse state and source-only copying. Earlier statements below that the right-side passage panel awaits migration are superseded for TXT. PDF remains separate. See [implementation and verification](18-inline-reader-implementation.md).

> 2026-09-05 最新产品布局：选文生成的图片、交互 UI、概念图及可保存来源卡片应锚定并插入左侧原文阅读流；右侧继续承载整书地图。当前右侧 passage panel 是待迁移的实现现状，不是最终布局。完整边界见 [左侧原文内嵌产物与文字布局决策](17-inline-reader-artifacts.md)。

> 2026-09-05 implementation update: The user subsequently authorized scaffolding and local verification. Historical “documentation only / not started / stop for review” wording below describes the earlier handoff. See [current implementation status](07-scaffold-status.md); open decisions remain open.


## 已确认的核心体验

桌面网页面向约 16:9 / 16:10 屏幕：左侧是接近 macOS Preview 感觉的原书阅读器；右侧是整本书的节点与关系网络，支持非线性探索。2026-09-05 用户确认当前接受纯文本与 PDF，并保留来源提供的全部内容，包括前言、索引、注释、附录及 PDF 的图片/空白页，不收窄为 Books I–X。其他格式不因此获得首发支持承诺。

阅读器按需准备页面，整书图谱则需独立覆盖全部来源；两者共享出处但不共享完成状态。PDF 可由支持的多模态接口直接处理，也可先提取为可定位文字；完整转换并非不可行。章节目录帮助分块，不能代替阅读实际内容。技术建议、实验和未定选择见 [PDF 与整书分析](11-pdf-whole-book-analysis.md)。

**MVP 上下文输入已确定为左侧原文的文字选择与高亮。** 读者正常阅读，遇到不理解的段落时划选它；路由机制使用选文决定提供一种或多种辅助，读者探索后保存产物，关联该段原文及地图上下文。没有选文时不能偷偷以节点或当前页替代输入。节点用于导航和回访，当前页/相邻段落可作为补充背景，不能覆盖用户的选择。

手动截图和周期自动采集均在 MVP 之外，不再是竞争输入方案。此前“选概念 → 回原文 → 请求解释”的图谱优先闭环已被此次确认替代。

## 四类辅助：2026-09-05 最新确认

| 类型 | 体验 | 实现边界 |
| --- | --- | --- |
| Explanation | 结构化文字解释，配合清晰的标题、段落、列表、表格与提示块 | 优先迭代；模型生成内容结构，应用负责样式 |
| Diagram | 纯代码可渲染的 SVG、概念关系图、时间线、流程图及图表 | 第二优先；正确关系与可读布局优先 |
| Interactive panel | 原文内嵌的交互界面、控件与模拟；以后可能扩展 Three.js 场景 | 保留 D10 经校验配置与已测试组件的运行边界；Three.js 尚未选定或实现 |
| Illustration | 图片模型生成的插图 | 独立图片模型与 inference provider |

Research brief/source discovery 暂缓，不再属于当前四类。出处锚定仍适用于所有产物；解释必须区分原文依据与模型补充。既有 runtime 路线、schema 和 provider 尚未随本次文档更新迁移。

所有产物锚定到左侧选文；右侧保留整书地图。同一选文可生成多种产物，各自保持进度、失败、重试、保存与折叠状态。原文不可被生成内容改写；复制与引用继续只使用规范来源文字。大型产物默认在选区结束处以块级卡片显示。

路由、触发时机、组合数量与用户改选仍待决定。教学模拟必须表达假设、变量含义和适用边界；代码可运行不等于机制正确。此次讨论没有授权执行任意模型 JavaScript 或加入 Three.js。

完整定义见 [四类辅助](19-enhancement-methods.md)；模型与提供商的候选、权重、来源及未验证项见 [模型研究](20-generation-model-research.md)。候选排名不是生产选型确认。

## 整书地图与活动层

整书地图已确定采用一个共享的三维空间，而不是独立复制事实的多张图。三个轴的产品语义固定为：X 是随书动态生成的主题疆域，Y 从具体细节走向组织性结构，Z 从书的开头走向结尾。系统可进入三个规范二维投影：X×Y 概念地图、X×Z 主题发展、Y×Z 结构发展。相反观察方向只是同一投影的反向，不另算新视图；自由三维视角用于空间总览和视图切换，不引入第四套语义。

“动态”受固定规则约束。X 始终回答“这是什么主题”，但每本书可生成约 3–7 个有出处、跨段落出现且彼此可区分的主题疆域；相近主题相邻，接受一个图谱版本后不因小幅重算随意翻转或换序。Y 始终回答“这是具体材料还是组织更多材料的结构”，可按书型把同一层级显示为场景→模式→主题、观察→机制→理论或例子→主张→框架。Z 只由可验证的章节、页码、段落和规范化来源位置计算，不把故事内部年代或历史年代混入阅读顺序。

整书地图必须区分“概念身份”和“出处中的概念出现”。例如“正义”可有一个共享身份，但在第 1、4、10 章分别有带 SourceAnchor 的出现节点；Z 坐标属于出现节点，身份把这些出现连接起来。位置用于组织和导航，不自行证明支持、反驳、定义、因果或发展关系；这些关系必须由有方向、有类型且带证据的边说明。完整规则见 [3D 整书地图契约](08-book-map-3d.md)。

缩小时展示探索过的区域、空间书签与活动强度。建议书签保存地图视口与原文位置，活动记录高亮求助、探索辅助、保存等主动事件。指标仍待 D07 决定：可试按段落统计事件并映射到概念，需避免一段关联多节点后重复夸大热度。色阶仅表示活动，不能将停留时间、点击或生成次数等同于理解。

## 2026-09-05 3D implementation update

The authorized canvas migration is now implemented with React/SVG projections of shared XYZ data, replacing the old React Flow fixture. See [renderer decision and delivered boundaries](09-3d-implementation.md). Historical renderer-pending statements above predate this implementation. Whole-book analysis, live providers and final relation taxonomy remain open.
