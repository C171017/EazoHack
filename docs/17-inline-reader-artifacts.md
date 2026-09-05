# 左侧原文内嵌产物与文字布局决策

> Latest delivery · 2026-09-05: inline artifact slots are now implemented in the main TXT reader, with persistent placement, collapse state and source-only copying. Earlier statements below that the right-side passage panel awaits migration are superseded for TXT. PDF remains separate. See [implementation and verification](18-inline-reader-implementation.md).

状态：**2026-09-05 产品方向已确认，尚未实现。** 本文取代旧文档中“辅助结果主要显示在右侧可收起面板”的布局描述；当前代码仍是右侧 passage panel，不能把现状写成已交付的新设计。

## 最新交互结论

左侧不再只是静态原文阅读器，而是保留原文连续性的组合阅读流。用户选择并高亮一段文字后，`interactive_ui`、`generated_image` 与 `concept_diagram` 的结果应锚定到该 `Selection` / `SourceAnchor`，并在左侧原文中的对应位置出现。右侧继续承载整书地图、语义缩放、节点详情与出处导航，不作为段落辅助结果的长期主容器。`source_discovery` 的摘要或引用卡片也可使用相同锚点进入阅读流；其外部范围仍由 D09 决定。

产物的逻辑插入点是精确来源偏移，默认视觉位置为选区结束处附近。若选区结束在段落中间，渲染层可以把该段的原文字节点按既有 UTF-16 偏移切成前后两个来源片段，把产物作为二者之间的 React sibling/slot；不得把产物内容写进原始文本、改变文件 hash，或让复制原文时混入模型生成文字。大型图片、图表和交互面板默认以块级卡片插入；紧凑标注可使用行内形态。文字绕排或浮动只是可选视觉模式，不是默认交互。

同一选区可有多个产物。它们保持各自的 `RouteRun` 状态、失败、重试、交互状态与 provenance，并按稳定的应用分配顺序排列。折叠、删除或重新生成一个产物不能重绑其他产物，也不能更改原文锚点。用户切换选区后，旧产物仍留在原位置；保存和恢复必须重建相同的插入位置与状态。

## 渲染与数据边界

原文继续由原生 DOM 文字节点渲染。浏览器仍负责换行、复制、查找、屏幕阅读器语义和原生 Selection；现有 TXT/PDF 的 `SourceAnchor`、quote、prefix/suffix、版本与矩形校验仍是来源真值。产物由受控 React 组件、SVG 或持久图片资源渲染，并设置独立 landmark/figure 语义。跨产物划选时，应用只计算来源文字节点的偏移，产物 UI 不成为引用文本。

建议新增独立的 `ArtifactPlacement`（最终字段由实现时的 Zod schema 固化）：

| 字段 | 约束 |
| --- | --- |
| `artifactId`, `selectionId`, `anchorId` | 必须解析到同一本书及同一来源版本 |
| `offset` | 精确 UTF-16 来源偏移；通常为选区结束偏移 |
| `mode` | 首版仅需 `block_after_selection`；`inline_badge`、`float_start`、`float_end` 后续单独验收 |
| `order` | 同一锚点内稳定、唯一，不由模型自由指定任意坐标 |
| `collapsed` | 属于用户界面状态，不改变来源或产物内容 |

模型不能输出 DOM 坐标、CSS、Tailwind class 或可执行布局代码。应用把经过校验的产物绑定到经过校验的锚点，并决定合法插入位置。TXT 与 PDF 可共享 placement 语义，但 PDF 原页画布不可被改写；PDF 的内嵌产物应进入可重排阅读视图或相邻锚定层，而不是伪装成原 PDF 页面内容。

## Pretext 决策

**不把 `@chenglou/pretext` 作为整个左侧阅读器的基础渲染器。** 持续插入产物会让 DOM 重排，但 Pretext 不能定位任意 React 组件，也不能消除实际 DOM 插入产生的布局变化。若用它手工生成整本书的每一行，还需要重新实现原生选择、复制、可访问性、查找、字体加载差异、光标/范围几何和跨产物锚点；这会直接增加本产品最关键的来源准确性风险。

Pretext 可以保留为隔离、可替换的可选测量适配器，用于：

1. 在有证据表明固定 `contain-intrinsic-size` 导致明显滚动跳动时，预测 TXT 离屏块高度；不得在启动时无界测量整本书，且需与当前原生 DOM 路径做浏览器基准。
2. 为 SVG 概念图和整书地图测量多语言标签、换行和真实边界，替代按字符数估宽。
3. 仅在用户确认动态文字绕图片/任意障碍物、且原生 DOM/CSS 不能满足设计时，为该局部派生视图计算逐行宽度。

若试用，包版本必须精确锁定并隐藏在项目自己的 `text-metrics` 接口后；首版内嵌产物不依赖 Pretext，也不依赖第三方 `pretext-flow`。只有在真实代表性内容、字体加载完成、Chrome/Safari/Firefox 与基线设备上证明布局正确且交互无回归后，才可扩大使用范围。

## 实现顺序与验收

1. 扩展 artifact/resource schema 和 IndexedDB，使真实图片资源、交互状态与 `ArtifactPlacement` 可保存；保持 provider 可替换。
2. 把 TXT 阅读器改成来源片段与 artifact slot 的稳定序列；先支持选区后块级插入，不先做文字绕排。
3. 将生成触发/进度做成靠近高亮的上下文控制；结果完成后落入锚定 slot。右侧地图不因段落辅助而被覆盖。
4. 为 PDF 的重排文字视图设计同样的锚定位置；原页 Canvas/文字层与原始 PDF 保持不变。
5. 验证同段多产物、跨段/跨页选区、连续选择、折叠/删除/重试、刷新恢复、宽度变化、键盘与屏幕阅读器路径。

通过标准包括：原文 hash 不变；跨产物复制/选择得到的 quote 与来源切片完全一致；产物不会被当作书中原文；旧 artifact 在新选区后仍位于原锚点；插入、折叠与图片加载不丢阅读位置；没有选择时仍不能生成或挂载段落产物。
