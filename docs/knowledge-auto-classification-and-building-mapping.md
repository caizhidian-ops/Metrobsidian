# 本地文件自动筛选、知识聚类与 3D 建筑映射方案

> 状态：设计提案（待评审）
> 适用仓库：`3d-anything`
> 目标版本：知识分类 AI Agent / 知识聚类 P0-P1
> 日期：2026-08-28

## 1. 目标与产品边界

用户选择一个或多个本地文件夹后，系统应当：

1. 以只读方式扫描文件，不擅自移动、删除或覆盖原文件。
2. 解析 Markdown、TXT、PDF、DOCX、PPTX、XLSX 等格式。
3. 去重、过滤低信息文件并生成统一的知识文档表示。
4. 优先判断文档是否属于已有主题/建筑。
5. 对无法归入已有主题的文档做语义聚类，发现新主题。
6. 为每篇文档生成“主建筑 + 次级建筑/标签 + 置信度 + 理由”。
7. 由用户确认、修改或拒绝分类建议。
8. 确认后立即把知识逻辑映射到对应 3D 建筑；只有确认的新主题才创建新建筑。
9. 将用户的纠正作为后续分类依据，使分类逐渐贴合个人习惯。

首版的“映射”是数据库/清单中的逻辑映射，不是物理移动文件。这样可以做到原文件零破坏、同一文档映射到多栋建筑，也能随时撤销。后续可增加显式的“整理本地文件夹”操作，但必须单独确认并提供预览与回滚记录。

## 2. 与现有仓库的关系

### 2.1 已有产品意图

- `PLAN.md` 已把“知识分类 AI Agent”和“知识聚类”列为待实现模块。
- 开发文档要求：AI 识别主题、判断是否为新主题；已有主题追加到建筑，新主题创建新建筑。
- `content/demo-knowledge-base/建筑映射.md` 明确映射不是一对一：一个知识文件可带多个标签，并展示到多栋建筑。

### 2.2 当前实现缺口

`apps/city/src/city/config/knowledge.ts` 当前行为是：

- 通过 `import.meta.glob` 在构建期读取固定目录下的 Markdown。
- 通过顶层文件夹名和 `BUILDING_BY_FOLDER` 决定建筑。
- 未实现文档解析服务、向量化、语义分类、聚类、置信度、新主题判定或用户纠正学习。
- 文档编辑覆盖保存在浏览器 `localStorage`，不是可共享的持久化知识数据。
- 浏览器网页不能无权限地持续读取任意本地文件夹，因此需要本地桌面服务/伴随服务，不能只改 Three.js 前端。

结论：不应继续扩展静态 `import.meta.glob` 作为正式知识入口。它可以保留为演示数据兜底，正式入口应改为本地知识服务 API。

## 3. 开源方案调研结论

目前不需要自研聚类算法。成熟开源组件足以组成完整管线，自研部分只负责产品编排、状态机、建筑映射和用户反馈闭环。

| 环节 | 候选 | 结论 | 采用理由 / 不采用理由 |
| --- | --- | --- | --- |
| 多格式解析 | [Docling](https://github.com/docling-project/docling) | **采用** | MIT；可本地运行；统一解析 PDF、DOCX、PPTX、XLSX、Markdown、HTML、图片等，并保留表格、阅读顺序和来源结构。 |
| 文档向量 | [BGE-M3 / FlagEmbedding](https://github.com/FlagOpen/FlagEmbedding) | **采用** | 适合中英混合；支持 100+ 语言、最长 8192 tokens，可在本地运行；可与现有 RAG 向量复用。 |
| 无监督主题发现 | [BERTopic](https://github.com/MaartenGr/BERTopic) | **采用** | 模块化组合 embedding、UMAP、HDBSCAN、c-TF-IDF；支持引导、半监督、层级主题和增量方案，容易解释主题。 |
| 已知主题的个性化分类 | [SetFit](https://github.com/huggingface/setfit) | **第二阶段采用** | 用户积累少量确认样本后，用小样本训练稳定分类器；支持多语言与多标签，推理成本低。 |
| RAG 入库与检索 | [RAGFlow](https://github.com/infiniflow/ragflow) | **继续复用，但不充当聚类器** | 擅长解析、切块、索引、检索和引用；分类结果可写入 metadata。它不是本方案的主题发现引擎。 |
| 备选主题模型 | [Top2Vec](https://github.com/ddangelov/top2vec) | 暂不采用 | 一体化 PoC 简单，但核心定制自由度较低；Contextual Top2Vec 仍标注为 beta，且其列出的上下文 embedding 选择不包含 BGE-M3。 |
| 流式聚类 | [River](https://github.com/online-ml/river) | 后续备选 | 适合海量连续流和概念漂移；个人文件库首版没有必要引入额外复杂度。 |

### 3.1 为什么不是“让大模型逐个文件决定文件夹”

纯 LLM 分类存在四个问题：

- 同一文件多次运行可能得到不同结果。
- 文件多时成本、延迟明显上升。
- 大模型容易自信地创造重复或过细的主题。
- 用户很难知道它为什么把文档放进某栋建筑。

本方案让 embedding 和聚类负责稳定的语义结构，LLM 只负责为候选簇命名、写解释、处理少量边界样本；最终以用户确认作为事实。

## 4. 推荐的混合算法

聚类只用于发现未知主题；已有建筑优先走分类。两者不能混成一个步骤。

### 4.1 文档标准化

每个源文件转换为 `CanonicalDocument`：

```ts
interface CanonicalDocument {
  id: string;
  sourcePath: string;
  sourceRootId: string;
  sha256: string;
  title: string;
  mimeType: string;
  modifiedAt: string;
  text: string;
  structuredContentRef?: string;
  summary: string;
  embeddingRef: string;
  parseStatus: 'ready' | 'unsupported' | 'failed' | 'needs_ocr';
}
```

分类输入不是简单截取开头，而是：标题 + 路径提示 + 文档摘要 + 各章节代表片段。超长文档先分块 embedding，再通过加权池化得到文档级向量，同时保留块级向量供 RAG 使用。

### 4.2 已有建筑匹配

每栋建筑有稳定的 `BuildingTopicProfile`，由以下内容生成主题向量：

- 用户确认的建筑名称、描述和标签。
- 该建筑内已确认文档的中心向量。
- 用户提供的正例和反例。

对新文档计算与各建筑主题向量的相似度：

```text
最高分 >= known_threshold
并且（最高分 - 第二高分）>= margin_threshold
    => 建议映射到已有建筑

最高分处于灰区
    => 等待用户确认，不自动创建建筑

最高分低于 novelty_threshold
    => 进入“待发现主题池”
```

阈值不在设计阶段拍脑袋固定。应使用仓库现有知识库和用户确认样本做离线校准，再保存为版本化配置。

### 4.3 新主题发现

待发现主题池达到最低样本量后运行 BERTopic：

1. 使用 BGE-M3 文档向量。
2. UMAP 降维。
3. HDBSCAN 发现密度簇和离群文档。
4. c-TF-IDF 生成每个簇的代表关键词。
5. 选取代表文档、关键词和相邻已有建筑交给 LLM。
6. LLM 只生成候选主题名、简介和建筑意象，不直接创建建筑。
7. 用户确认后生成稳定 `topicId` 和 `buildingId`。

小数据集需要降级策略：

- 少于 30 篇：不强行做 HDBSCAN，只做已有建筑匹配和人工待确认队列。
- 30–200 篇：使用较保守的小簇参数，并把结果视为候选，不视为真值。
- 200 篇以上：启用完整 BERTopic 主题发现与层级主题分析。

### 4.4 多标签与多建筑

同一文档允许一个主建筑和多个次级映射：

```ts
interface KnowledgePlacement {
  documentId: string;
  primaryBuildingId: string | null;
  secondaryBuildingIds: string[];
  topicIds: string[];
  confidence: number;
  margin: number;
  reason: string;
  evidenceChunkIds: string[];
  state: 'proposed' | 'confirmed' | 'rejected' | 'needs_review';
  modelVersion: string;
  confirmedBy?: 'user' | 'rule';
  confirmedAt?: string;
}
```

3D 界面默认只在主建筑中显示完整入口，在次级建筑显示引用卡片，避免重复复制文件。

## 5. 本地文件夹到建筑的完整数据流

```text
用户选择本地文件夹
  -> 本地伴随服务只读扫描
  -> 扩展名/大小/隐藏文件/临时文件过滤
  -> SHA-256 去重与变更检测
  -> Docling 解析为统一文档
  -> BGE-M3 生成文档级和块级向量
  -> 先匹配已有建筑
     -> 高置信度：生成已有建筑映射建议
     -> 灰区：进入人工确认队列
     -> 新颖文档：进入待发现主题池
  -> BERTopic 对待发现池聚类
  -> LLM 为候选簇命名和解释
  -> 用户在“归档收件箱”确认/修改/拒绝
  -> 写入 placement/topic/building 数据
  -> 同步 metadata 到 RAGFlow
  -> 3D 地图即时刷新建筑和知识卡片
```

### 5.1 文件夹不是分类真值

原始文件夹名可以作为弱提示，但不能直接作为标签。比如 `Downloads`、`微信文件`、`临时` 基本没有语义价值。路径提示在评分中的权重必须低于正文语义，且用户可关闭。

### 5.2 默认不改本地目录

首版分类后只写逻辑映射：

- 原文件路径保持不变。
- 建筑引用 `documentId`，不会复制原文件。
- 文件移动或重命名后用 hash + 文件系统标识重新关联。
- 同一个源文件可以进入多个主题视图。

将来若增加物理整理，必须先显示“移动前/移动后”清单，用户逐批确认，并记录可逆操作日志。物理整理不能成为建筑映射的前置条件。

## 6. 建议的系统结构

```text
apps/city (Three.js / Vite 前端)
  ├─ 归档收件箱：待确认分类
  ├─ 建筑知识列表：读取 API，不直接 import 本地文件
  └─ 新主题预览：确认后创建建筑

services/knowledge (Python + FastAPI，新增)
  ├─ source scanner       只读扫描、变更监听、去重
  ├─ Docling parser       多格式解析
  ├─ embedding service    BGE-M3
  ├─ classifier           已有建筑匹配 / SetFit
  ├─ topic discovery      BERTopic
  ├─ placement service    用户确认与多建筑映射
  ├─ RAGFlow adapter      入库、更新 metadata、删除同步
  └─ SQLite/PostgreSQL    文档、主题、建筑、反馈、作业状态
```

个人本地首版建议 SQLite；多人协作或云端版再换 PostgreSQL。向量可以先沿用 RAGFlow 的索引用于检索，但分类服务要保存自己的文档级向量或可重建引用，避免被某个 RAG 实现锁死。

### 6.1 API 草案

```text
POST /api/sources/folders/select       选择并授权本地目录（桌面端）
POST /api/sources/{id}/scan            发起只读扫描
GET  /api/ingestion/jobs/{id}          查询解析/embedding 进度
GET  /api/placements/inbox             待确认分类建议
POST /api/placements/{id}/confirm      确认映射
POST /api/placements/{id}/correct      改到其他建筑/标签
POST /api/placements/{id}/reject       拒绝建议
GET  /api/buildings/{id}/documents     获取建筑内知识
GET  /api/topics/discovered            获取候选新主题
POST /api/topics/{id}/materialize      确认主题并调用“新建筑生长”接口
```

### 6.2 必须保留的“新建筑生长”接口

这是分类服务与 3D 生成服务之间的稳定边界，不能把逻辑写死在 BERTopic、前端或某一种 3D 生成模型里。

当分类服务无法把一组文档可靠归入现有建筑时，应生成 `BuildingGenesisCandidate`，而不是返回普通错误或临时使用随机建筑：

```ts
interface BuildingGenesisCandidate {
  candidateId: string;
  topicId: string;
  proposedName: string;
  proposedDescription: string;
  representativeDocumentIds: string[];
  evidenceChunkIds: string[];
  keywords: string[];
  nearestBuildingIds: string[];
  noveltyScore: number;
  cohesionScore: number;
  suggestedSceneType?: string;
  suggestedVisualBrief?: string;
  state: 'proposed' | 'confirmed' | 'materializing' | 'ready' | 'rejected' | 'failed';
  classifierVersion: string;
}

interface BuildingGenesisPort {
  preview(candidate: BuildingGenesisCandidate): Promise<BuildingPreview>;
  materialize(candidateId: string, idempotencyKey: string): Promise<BuildingJob>;
  getJob(jobId: string): Promise<BuildingJob>;
  cancel(jobId: string): Promise<void>;
}
```

建议的 HTTP 契约：

```text
POST /api/building-genesis/candidates              创建新建筑候选，不落永久建筑
GET  /api/building-genesis/candidates/{id}/preview 获取建筑预览与知识证据
POST /api/building-genesis/candidates/{id}/confirm 用户确认候选
POST /api/building-genesis/candidates/{id}/build   幂等地发起 3D 建筑生成
GET  /api/building-genesis/jobs/{id}                查询生成进度和结果
POST /api/building-genesis/jobs/{id}/cancel         取消尚未完成的生成
```

硬性规则：

- “无法归因”是可追踪的 `novel-topic` 业务状态，不是异常。
- 单篇离群文档默认进入待确认箱，不单独长出建筑；至少形成有凝聚力的候选主题，或由用户明确要求创建。
- 只有 `confirmed` 候选才能调用 `materialize/build`。
- 生成接口必须幂等；重试不能长出重复建筑。
- 新建筑先获得稳定 `buildingId`，再异步生成场景，知识映射不依赖 3D 任务是否立即完成。
- 3D 生成失败时保留主题、文档和候选记录，允许换生成器重试或让用户选择现有建筑。
- 未来无论接规则模板、Three.js 参数化生成、外部 3D API 或本地生成模型，都实现同一个 `BuildingGenesisPort`。

这样能保证完整链路始终存在：

```text
无法归入已有建筑
  -> 新颖文档池
  -> 聚成候选主题
  -> 用户确认
  -> BuildingGenesisPort
  -> 新建筑
  -> 文档映射进入新建筑
```

## 7. 增量更新与稳定性

新文件不能每次都让整座城市重排：

1. 新文件先用现有主题模型 `transform` 或建筑中心向量做快速归类。
2. 只有新颖文档进入发现池。
3. 定量或定期重跑发现池，不频繁全库重聚类。
4. 重聚类后，用新旧簇中心相似度和成员重叠率匹配稳定 `topicId`。
5. 已经由用户确认的映射不因模型升级自动改变，只生成“建议复核”。
6. 模型、阈值和 embedding 版本必须落库，支持重新计算和回滚。

BERTopic 的 `.partial_fit` 可配合增量降维与 MiniBatchKMeans，但首版不建议用它替代 HDBSCAN 发现未知簇。官方文档也指出在线模式和普通 `.fit` 的内部更新方式不同；对个人知识库，采用“稳定模型快速归类 + 新颖池周期发现”更容易保持城市结构稳定。

## 8. 用户反馈学习

用户每次确认或纠正，记录：

- 原建议和分数。
- 用户最终选择。
- 是否多标签。
- 用户拒绝的建筑（负例）。
- 当时的模型、阈值和证据片段。

学习分三步：

1. **冷启动**：BGE-M3 相似度 + BERTopic 发现主题。
2. **有少量反馈**：更新建筑中心向量、正反例和阈值。
3. **每类有足够且较平衡的确认样本后**：训练 SetFit 多标签分类器；未达到验证门槛时继续使用中心向量，不因“能训练”就上线。

模型上线前至少以时间切分或留出集评估 macro-F1、top-2 recall、拒识精度和校准误差。对“新主题”判定，错误创建建筑的代价高于进入待确认队列，因此阈值应偏保守。

## 9. 隐私与安全

- 文件扫描、解析、embedding、基础分类默认全部本地运行。
- 云端 LLM 默认只接收脱敏后的候选主题摘要、关键词和必要代表片段；用户可关闭。
- 源路径不发送到云端，日志中对用户名和目录做脱敏。
- 跳过系统目录、隐藏文件、Office 临时文件、密钥文件和用户定义黑名单。
- 每个源目录使用显式授权；撤销后停止监听，但不擅自删除历史知识记录。
- 解析器在受限进程中运行，并设置文件大小、页数、耗时和压缩展开上限，防止恶意文档消耗资源。

## 10. 首版交付范围

### P0：可验证原型

- 选择一个本地文件夹，只读扫描。
- 支持 MD/TXT/PDF/DOCX/PPTX/XLSX。
- Docling 解析；BGE-M3 文档 embedding。
- 识别重复、空白、解析失败文件。
- 对仓库现有建筑生成分类建议。
- 提供“归档收件箱”，用户确认后映射到建筑。
- 支持一个主建筑和多个次级建筑。
- 高置信度也默认先确认，不自动移动文件，不自动创建建筑。
- 分类结果同步到 RAGFlow metadata，地图从 API 加载知识。

### P1：主题发现

- 新颖池 + BERTopic 聚类。
- 代表文档、关键词、候选主题名和新建筑预览。
- 用户确认后创建稳定主题与建筑。
- 增量扫描和变更检测。

### P2：个性化学习

- 基于确认数据训练 SetFit 多标签分类器。
- 置信度校准、自动确认开关和按建筑独立阈值。
- 分类质量看板、模型版本和回滚。
- 可选的、显式确认的物理文件整理。

## 11. 验收标准

### 功能验收

- 用户选择本地文件夹后，支持格式的文件均进入可追踪作业状态。
- 原文件在整个扫描、解析、分类和映射过程中内容、路径、修改时间不变。
- 重复文件只生成一个知识实体，并保留多个来源引用。
- 每条建议显示主建筑、次级标签、置信度、理由和证据片段。
- 用户确认后无需重新构建前端，建筑内立即出现该知识。
- 新主题未经用户确认不会生成永久建筑。
- 用户纠正后旧建议保留审计记录，当前映射立即生效。
- RAG 检索结果能按 `buildingId`、`topicId` 和 `documentId` 过滤并回溯源文件。

### 质量验收

- 使用仓库现有知识库建立带人工真值的小型基准集。
- 已有建筑分类评估 macro-F1、top-2 recall 和拒识精度。
- 聚类评估不能只看 silhouette；还要人工检查主题一致性、重复主题率、离群率和跨次运行稳定性。
- 新主题误创建率优先控制，宁可多进入待确认队列。
- Windows 中文路径、同名文件、重命名、断开磁盘、损坏 Office/PDF 文件必须有测试。

## 12. 主要风险与缓解

| 风险 | 表现 | 缓解 |
| --- | --- | --- |
| 小样本聚类不稳定 | 同批文件多跑几次主题数量不同 | 小于最低样本量不聚类；固定随机种子；结果只作为建议。 |
| 混合主题长文档 | 一篇文档被错误压成单一主题 | 块级向量 + 文档级聚合；允许多标签和章节级引用。 |
| 主题无限增殖 | 城市出现大量近义建筑 | 新主题需用户确认；与已有主题做去重；设置合并建议。 |
| 用户文件被误操作 | 分类导致原目录变化 | 首版只做逻辑映射；物理移动单独授权并可回滚。 |
| 模型升级造成重排 | 建筑内容突然变化 | 已确认映射锁定；版本化模型；只提示复核。 |
| 隐私泄露 | 私密正文被发送给云模型 | 默认本地解析/embedding；云端只发送最小脱敏片段且可关闭。 |
| RAG 与分类耦合 | 更换 RAGFlow 后分类数据丢失 | 分类和映射有独立数据表；RAGFlow 只作为索引适配器。 |

## 13. 决策结论

采用以下成熟开源组合，不自研底层聚类算法：

```text
Docling
  + BGE-M3 / FlagEmbedding
  + 已有建筑中心向量匹配
  + BERTopic（仅发现未知主题）
  + 用户确认闭环
  + SetFit（反馈样本足够后）
  + RAGFlow（索引和检索）
```

真正需要自行实现的是：本地文件授权与扫描、去重状态机、分类建议工作流、多标签建筑映射、稳定主题 ID、用户反馈学习、审计与 3D 地图刷新。这些是产品逻辑，现成聚类库不能替代。

## 14. 主要资料

- Docling 支持格式与统一文档模型：<https://github.com/docling-project/docling/blob/main/docs/usage/supported_formats.md>
- Docling 项目与本地执行说明：<https://github.com/docling-project/docling>
- BERTopic 模块化主题管线：<https://github.com/MaartenGr/BERTopic>
- BERTopic 在线/增量模式限制：<https://maartengr.github.io/BERTopic/getting_started/online/online.html>
- BGE-M3 / FlagEmbedding：<https://github.com/FlagOpen/FlagEmbedding>
- SetFit 小样本分类：<https://github.com/huggingface/setfit>
- RAGFlow：<https://github.com/infiniflow/ragflow>
- Top2Vec 备选：<https://github.com/ddangelov/top2vec>
- River 在线机器学习备选：<https://github.com/online-ml/river>
