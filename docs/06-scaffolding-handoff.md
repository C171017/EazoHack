# 项目脚手架交接计划

> Latest delivery · 2026-09-05: inline artifact slots are now implemented in the main TXT reader, with persistent placement, collapse state and source-only copying. Earlier statements below that the right-side passage panel awaits migration are superseded for TXT. PDF remains separate. See [implementation and verification](18-inline-reader-implementation.md).

> 2026-09-05 D14 supersession：下文的 `assistance` 产物面板描述属于历史脚手架。最新产品布局要求产物通过 `ArtifactPlacement` 锚定并进入左侧原文阅读流；右侧保留地图。不要据旧目录说明继续扩展右侧结果面板。见 [内嵌产物决策](17-inline-reader-artifacts.md)。

> PDF 后续衔接（2026-09-05）：下文是初始脚手架任务，不再作为后来获授权的 PDF 四层处理之禁令。TXT 已交另一任务负责。继续 PDF/整书工作前阅读 [11-pdf-whole-book-analysis.md](11-pdf-whole-book-analysis.md)：全来源保留、先检查提取器再 OCR、阅读按需任务与全量分析分开、章节与证据回链。新说明是设计/测量记录，不是实现验收。

> 2026-09-05 implementation update: The user subsequently authorized scaffolding and local verification. Historical “documentation only / not started / stop for review” wording below describes the earlier handoff. See [current implementation status](07-scaffold-status.md); open decisions remain open.


状态：**文档获授权，脚手架未开始。** 本计划只定义下一步边界；不得据此声称真实模型、图片或搜索服务可用。

## 下一位实现者的起始任务

仅建立“可无凭据启动、以 mock 贯通”的项目骨架：Next.js App Router + TypeScript + Tailwind，加入共享 Zod schema、四路 provider 接口、应用调度器、IndexedDB repository 接口和静态双栏壳。不要接真实服务、不要选模型/供应商/托管、不要实现完整 PDF 阅读器或产品功能。完成后停在第一道门禁等待复核。

## 目录与模块边界

```text
src/
  app/
    page.tsx                         # 桌面工作台组合，不放领域逻辑
    api/route-plan/route.ts          # 结构化路由入口
    api/assist/[kind]/route.ts       # 四路调度入口；只调用 dispatcher
  features/
    reader/                          # PDF.js、文字层、Selection/SourceAnchor
    book-graph/                      # 当前 React Flow fixture；生产目标已由 D04/D12 改为 3D + 三个二维投影
    assistance/                      # 路由 UI、RouteRun 状态；历史右侧面板待迁移为 reader artifact slots
    artifacts/
      interactive-ui/               # 注册表组件与 config renderer
      generated-image/              # 图片状态/Blob 展示
      concept-diagram/               # 受控节点边 + React/SVG renderer
      source-discovery/              # Reference 展示与核验状态
    persistence/                     # IndexedDB repositories/migrations
  server/
    routing/                         # router adapter；只返回 RoutePlan
    dispatcher/                      # 状态、依赖、并发、取消、重试
    providers/                       # 接口、mock、未来真实 adapter
  shared/
    schemas/                         # Zod：anchor/selection/route/artifact/graph
    types/                           # 仅从 schema 推导或非运行时类型
    fixtures/                        # 版本化、明确标注 mock 的固定数据
  ui/
    components/                      # 通用已测试组件
    tokens/                          # Tailwind token 与有限 variant 映射
    styles/                          # PDF text layer/highlight/React Flow 定向 CSS
tests/
  unit/ contract/ fixtures/
```

`features` 不直接读取环境变量或调用外部服务；`server/providers` 不写客户端状态；`shared/schemas` 不依赖 React。整书分析与选文辅助是两条独立流程，只共享锚点、schema 与 provenance。

## 初始依赖

历史脚手架锁定的直接依赖类别：Next.js、React、React DOM、TypeScript、Tailwind CSS、`pdfjs-dist`、Zod、`@xyflow/react`。后续 D04/D12 已把生产整书地图改为 3D + 三个二维投影；`@xyflow/react` 仅描述现有 fixture，不再锁定生产地图实现。测试、lint、格式化、IndexedDB helper 与 3D renderer 的具体包/version 必须按当时兼容矩阵评估并记录，不因产品决定提前写死。不要安装 agent framework、向量数据库、云数据库、认证或任意代码执行依赖。

## 共享 schema 与接口

- `SourceAnchorSchema`、`SelectionSchema`：文件指纹、提取版本、一个或多个定位器、quote/prefix/suffix 和解析状态。
- `RoutePlanSchema`：固定 route enum、数组可多选、每路理由、依赖与触发快照。
- `RouteRunSchema`：独立状态机 `pending/running/complete/failed/cancelled`，含 error 与 artifactIds。
- `ArtifactSchema`：以 kind 作为 discriminated union；始终绑定 selectionId/anchorIds，nodeIds 可空。
- `ArtifactPlacementSchema`：绑定 artifact/selection/anchor 与精确来源 offset；应用控制合法 mode/order，模型不能提供任意坐标或样式。
- `InteractiveUiConfigSchema`：schemaVersion、允许的 component key、受限 props、内容、假设和 validationStatus；明确拒绝 code/html/script/className。
- `ConceptDiagramSchema`：受限节点/边/分组、引用与布局提示；检查端点、ID、数量和文本长度。
- `ReferenceSchema` 与 `GraphSchema`：区分书内 anchor、外部 URL、支持关系、验证状态与生成推断。

建议 provider 形状：`Provider<I, O>.run(input, context): Promise<ProviderResult<O>>`，结果包含 payload、provenance、timing 和可分类错误。`MockProvider` 必须返回 `provider: "mock"`，界面显示 Mock 标签。真实 adapter 未配置时返回 `not_configured`，不可回落成貌似真实的成功。

## Tailwind 与组件约束

在主题中定义颜色、间距、圆角、字体、阴影和状态语义；组件通过有限的 `variant/size/state` 映射使用静态 class。交互 UI 注册表只暴露例如 `ExplanationCard`、`ParameterSlider`、`ComparisonTable`、`SimplePlot`、`StepSequence` 等经过测试的组件键。模型输出只引用键和受限 props；不接收 Tailwind 字符串。定向 CSS 只用于 PDF text layer/选区覆盖、React Flow 层叠和 SVG/画布集成，并在文件顶部注明原因。

## Fixture 与 mock 边界

提供一份小型、可再分发的文本型 PDF fixture，或在确定许可前使用程序化测试页；另提供一组明确写有 `fixture/mock` provenance 的 selection、route plan、四类 artifact、部分失败与非法配置。mock 用来验证状态和契约，不算模型质量、图片生成或检索验收。真实 provider、凭据、网络与 demo 书不属于首个脚手架任务。

## 分阶段任务与验收门禁

1. **骨架门禁**：无凭据启动；双栏壳可见；四路 mock 可单独/组合进入独立状态；typecheck、lint、schema contract tests 通过；源码不存在任意代码执行入口或动态 Tailwind class。完成后停下复核。
2. **阅读门禁**：PDF.js 文字层可选择；跨行/重复引文/刷新恢复；空选区不能路由；跨页保留多个 anchor。
3. **调度门禁**：RoutePlan 校验，多路依赖/并发/取消/重试正确；selection 切换不串产物；一路失败不影响其他路线。
4. **渲染门禁**：交互 UI 只由注册表配置渲染且边界参数有测试；概念图引用/端点校验后由 React + SVG 渲染；产物在左侧正确锚定，原文选择、复制与偏移不包含产物内容。
5. **保存门禁**：IndexedDB 可恢复多种 artifact、交互状态、锚点、图视口和书签；写入失败可见；地图未完成仍可保存。
6. **真实集成门禁**：仅在模型、图片、搜索范围和服务商获批后逐路接入；分别记录权限、延迟、失败和真实/预生成状态。
7. **演示门禁**：按 `05-plan.md` 明确四路各自深度与状态，验证桌面尺寸、出处、重启恢复和三分钟闭环。

## 明确留待决定

来源查找是仅书内还是含外部；模型/图片/搜索供应商与具体版本；路由触发时机、用户覆盖方式、组合上限与执行顺序；demo 书与规模；四路各自十小时深度与“活动”语义；部署/托管。任何一项未定时使用可见的 mock/未配置状态，不替用户做产品决定。

## 2026-09-05 3D implementation update

The authorized canvas migration is now implemented with React/SVG projections of shared XYZ data, replacing the old React Flow fixture. See [renderer decision and delivered boundaries](09-3d-implementation.md). Historical renderer-pending statements above predate this implementation. Whole-book analysis, live providers and final relation taxonomy remain open.
