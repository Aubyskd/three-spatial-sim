# Three Spatial Sim 当前版本功能与代码导读

本文以当前仓库源码为准，面向第一次接触项目的开发者。当前界面功能版本为 **V0.6-B Visibility Matrix + Shortest-Path Reachability Graph**，并包含 V0.6-A 坐标放置、V0.5 OSM 建筑/道路、V0.4 GeoTIFF 导入、算法环境、多边形禁区、胶囊体重部署、尺寸调节和路径避障改进；`package.json` 的 `version` 仍是 `0.1.0`，它是 npm 包版本，不代表界面功能版本。面向使用者的逐项操作请先看 [中文使用手册](README.md)。

## 1. 先用一句话理解项目

这是一个基于 Three.js 的多地形空间仿真应用：浏览器负责展示地形、Agent 和塔站，Rapier 处理物理，Recast/网格 A* 负责导航；算法通过 `Environment` 读取结构化状态、提交动作、评估塔站布局，而不需要点击界面或直接操作 3D 对象。

三个边界值得先记住：

1. **`TerrainData` 是地形的共享数据源**：高度、尺寸、采样覆盖范围、语义区域和 revision 都从这里出发。
2. **运行世界与显示分开**：Three.js Mesh 负责看见什么，资产状态、约束、物理和导航分别有自己的模块。
3. **算法通过 `Environment` 交互**：算法候选布局由 `SpatialEvaluator` 静态评估；只有应用最佳方案时才生成可见塔站和 Rapier 碰撞体。

核心源码可直接从 [浏览器入口](src/main.ts)、[主仿真运行时](src/core/MultiTerrainSimulation.ts)、[算法环境](src/algorithm/Environment.ts)、[空间评估器](src/evaluation/SpatialEvaluator.ts) 和 [实验执行器](src/algorithm/experiment/ExperimentRunner.ts) 开始阅读。

## 2. 当前能做什么

| 能力 | 当前实现与入口 |
| --- | --- |
| 多地形 | 从 `public/assets/maps/terrain-demo/manifest.json` 发现当前 3 张地形：Coastal、Valley 与 Aspen DEM + OSM；右侧面板切换、聚焦、重新加载。 |
| GLB 转地形数据 | 识别 land/water mesh，以射线采样为高度网格；记录 `sampleCoverage` 区分真正命中的地面和边界补空。 |
| 地形编辑 | Raise、Lower、Flatten 笔刷；编辑时更新可视网格，结束笔画后重建 Rapier heightfield 和导航数据，递增 terrain revision。 |
| 水面与光照 | 独立 water mesh 按实际覆盖网格渲染；只有带水域命名或显式配置的单网格 GLB 才推断低地水体。地形编辑后水面会刷新。场景有环境光、主光和补光。 |
| Agent 导航 | 点击合法地面设置目标；优先 Recast，失败时使用网格 A*；两类结果均需通过路径段的禁区相交检查，Agent 按固定时间步移动。 |
| 胶囊体操作 | 可重新部署到合法地块、聚焦胶囊体，并通过滑块/数值框同步调整相机 FOV 与胶囊视觉及碰撞尺寸。 |
| 语义与禁区 | 自动语义区加人工禁区；逐点创建并闭合多边形 Restrict、撤销点位、取消或清除，覆盖层贴合当前地形；禁区影响终点及穿越路径的判断。 |
| 手动塔站部署 | 右侧面板提供放置预览、位置验证、真实视觉资产及 Rapier 碰撞体，可导出资产；代码 API 可移除资产。 |
| 坐标检查与放置 | 实时查看 Local/Projected/WGS84 坐标，复制坐标，按 Local/Projected/LonLat 输入或地图拾取位置，选择自动/手动 Y，预览并通过原有校验器部署资产。 |
| 建筑可见性矩阵 | 指定 Observer/Target 数量与高度，在活动地形选点；只射线检测当前 BuildingLayer，输出 0/1 矩阵、pair 详情、调试射线及 JSON/CSV。 |
| 最短路径可达图 | 指定 N 和导航吸附阈值，在地形选择 graph nodes；对所有 `i < j` pair 求最短可行路径，输出完整无向加权图、邻接/cost 矩阵与 JSON/CSV，不做 MST。 |
| 标准算法环境 | `reset / observe / step / evaluate / getMetrics / getState` 等 API，支持放置、移除、移动和 NO_OP 动作，返回结构化约束和奖励。 |
| 塔站优化 | 以 64×64 采样网格计算覆盖、重叠、成本和违规数；按配置权重计算 score。 |
| 实验 | 左侧面板设置地形、Seed、塔数、迭代次数和渲染模式，运行/停止 Random Search，应用最佳方案，导出 JSON/CSV。 |
| 本地算法协议 | `LocalBridge` 处理 RESET、OBSERVE、STEP、EVALUATE、SWITCH_TERRAIN、GET_METRICS 消息。 |
| GIS 导入 | Python 工具对 GeoTIFF 做 CRS 检查、米制投影、等比例重采样、地形包验证与 manifest 注册；有 `terrain.json` 时运行时直接读取它。 |
| 自检 | 带 `?algorithmSelfTest=1` 启动时执行算法 API 验收并显示报告；正常启动不会运行它。 |

当前默认地形 ID 是 `terrain-01`（Coastal Terrain）；清单还包含 `terrain-02`（Valley Terrain）和 `aspen_dem`（Aspen DEM + OSM）。文档或旧提示词里的 `lake` **不是**当前 manifest 中的 ID。实际列表始终以 manifest 为准。

## 3. 如何运行，先看哪里

```bash
npm install
npm run dev
npm run build
```

- 浏览器入口：`index.html` → `src/main.ts`。
- 当前默认仿真入口：`MultiTerrainSimulation.create()`；不要误以为旧的 `src/core/Simulation.ts` 仍是主入口。
- 页面右侧：地形、Agent、FOV/胶囊尺寸、编辑、资产、禁区和 Debug。
- 页面左侧：V0.3 Experiment。
- 项目坐标：右手坐标系，+X 向东、+Y 向上、+Z 向南，严格保持 1 Three.js world unit = 1 米。

如果只想先读懂全局，推荐顺序：

```text
main.ts
  → core/MultiTerrainSimulation.ts
  → terrain/TerrainManager.ts
  → terrain/TerrainTypes.ts
  → algorithm/Environment.ts
  → evaluation/SpatialEvaluator.ts
  → algorithm/experiment/ExperimentRunner.ts
  → ui/ExperimentPanel.ts
```

## 4. 当前运行链路

### 4.1 启动与切换地形

```text
main.ts
  → TerrainCatalog.load(manifest.json)
  → MultiTerrainSimulation.create()
  → TerrainManager.loadInitialTerrain()
  → 有 descriptor.data：读取并校验 terrain.json → TerrainData
    否则：TerrainGLBImporter.import() → TerrainSampler.sample() → TerrainData
  → MultiTerrainSimulation.buildRuntime()
       ├─ TerrainVisualBuilder / DynamicWaterSystem
       ├─ SemanticMap
       ├─ TerrainPhysicsWorld
       └─ TerrainNavMeshManager
  → commitRuntime()：挂载 Agent、资产、编辑器和 Debug
  → requestAnimationFrame + 固定物理时间步
```

`TerrainManager` 先准备新 Runtime，再提交替换旧 Runtime；加载失败保留旧地形。声明 `data` 的地形若 JSON 缺失或无效会报错，不会悄悄重新采样 GLB。`TerrainStateStore` 按 terrain ID 保存本次浏览器会话的编辑和资产，**不是持久化数据库**，刷新页面后未导出的修改会消失。

### 4.2 地形编辑

```text
V02ControlPanel 选择笔刷
  → MultiTerrainSimulation 指针事件
  → TerrainEditor 修改 TerrainData.heights/revision
  → TerrainVisualBuilder.updateGeometry() 立即显示
  → pointerup 后重建 TerrainPhysicsWorld 与 TerrainNavMeshManager
```

### 4.3 Agent 寻路

```text
点击地面
  → SemanticMap.validateTarget()
  → Pathfinder.findPath()
  → Recast 查询并验证整条线段；不合格则 A* 网格绕行
  → 若任意路径段仍穿过 Restrict，则拒绝返回路径
  → AgentController.follow()
  → CharacterController + Rapier 固定步推进
```

### 4.4 算法实验

```text
ExperimentPanel
  → ExperimentRunner.run(config)
  → Environment.reset(config)
  → RandomSearchBaseline 使用 SeedManager 生成候选
  → SpatialEvaluator.validateCandidate / evaluatePlacementSet
       ├─ ConstraintEngine：能不能放
       ├─ CoverageEvaluator：覆盖与重叠
       └─ ObjectiveEngine / RewardCalculator：方案分数
  → ExperimentResult（best solution、metrics、history）
  → Apply Best Solution 时 Environment.applySolution()
  → AssetPlacementManager 创建正式资产和 Rapier 碰撞体
```

Random Search 的候选评估不重新加载 GLB，不逐个创建/删除 Three.js 或 Rapier 对象。Fast 模式主要减少浏览器渲染和 Debug 更新，**不是完全 headless，也不是独立 Python 服务**。

### 4.5 禁区、胶囊体和尺寸控制

```text
V02ControlPanel 按钮/滑块
  → MultiTerrainSimulation 的交互模式与指针事件
    ├─ RegionEditor：按点击顺序记录顶点、撤销、自交/面积校验
    │   → ManualOverrideLayer / SemanticMap → 地形贴合覆盖层
    │   → TerrainNavMeshManager.rebuild() → Pathfinder 避开禁区
    ├─ Agent 重新部署：验证当前点击处的支撑/坡度/语义/资产
    │   → AgentController.deploy() → 重置位置和本次会话出生点
    └─ 画幅 FOV / 胶囊高度：ThreeRenderer.setFieldOfView()
        或 Agent.setSizeScale() + CharacterController.setSizeScale()
```

Restrict 是语义限制，不是新建一堵 Rapier 墙。终点检查使用 `SemanticMap.validateTarget()`；路径检查使用 `SemanticRegion.intersectsSegment()`，避免“两个可行网格中心之间的连线穿过细禁区”。`Semantic` 显示贴地语义覆盖，`NavMesh` 显示导航采样格，`Colliders` 显示 Rapier 调试线框，三者表示的数据层不同。

### 4.6 GeoTIFF 地形包链路

```text
tools/gis-converter：inspect → convert → validate → --update-manifest
  → generated/<terrain-id>/terrain.json + terrain.glb + metadata.json
  → manifest.json 中的 descriptor.data/source/metadata
  → TerrainManager.loadState() 直接校验 terrain.json
  → 同一 TerrainData 驱动可见地形、Rapier heightfield、导航和 Agent 出生点
```

`terrain.json` 的高度和 `sampleCoverage` 是运行时依据；`terrain.glb` 是同一网格的便携模型/验证输出，不会再作为第二套高度来源叠加渲染。`metadata.json` 保存 CRS 与 GIS↔局部坐标映射；当前浏览器导航和物理仍在局部米制坐标中工作。GIS 命令和参数请看 [中文实操](tools/GIS_GeoTIFF_地形转换与平台接入步骤.md)。

### 4.7 OSM 建筑与道路链路

```text
GeoJSON → vector-inspect / vector-convert
  → 读取 terrain metadata 的 projectedCRS 与 localOrigin
  → 投影为局部 X=East、Z=South，并从 terrain.json 采样 Y
  → processed/buildings.local.json + roads.local.json
  → manifest descriptor.buildings / descriptor.roads
  → MultiTerrainSimulation 并行读取和验证
  → RoadLayer / BuildingLayer + SemanticMap + Rapier building colliders
  → TerrainNavMeshManager / Pathfinder 阻挡建筑、优先道路语义
```

源 OSM 属性和 source feature ID 保留在结构化 JSON 中；没有烘焙进 terrain GLB。前端建筑用合并后的 `ExtrudeGeometry` 显示，洞作为 `Shape.holes`；同一份合并三角网格直接生成 Rapier 静态 trimesh，因此凹形轮廓和洞不会被外接框扩大。道路根据宽度生成 ribbon mesh。语义索引使用空间桶避免每次查询遍历数千个要素。完整验收数据见 [V0.5 交付说明](V05_OSM_BUILDINGS_ROADS.md)。

### 4.8 坐标检查与按坐标放置链路

```text
活动地形 metadata / local bounds
  → CoordinateService.configure()：建立 Local ↔ Projected ↔ WGS84 变换
  → TerrainPicker：只对活动地形 Mesh 做射线拾取
  → CoordinatePanel：实时读数、复制、输入、预览、部署和调试开关
  → CoordinateAssetPlacer.resolve()
       ├─ Local / Projected / Geographic 输入统一转成 Local
       ├─ Auto Y：TerrainHeightProvider 双线性采样
       └─ Manual Y：局部 Y 或绝对投影高程换算
  → PlacementValidator：边界、支撑、水域、禁区、坡度和碰撞校验
  → Preview：只创建临时 Ghost；Deploy：AssetPlacementManager.placeAt()
```

坐标轴契约是 `+X east / +Y up / +Z south`，局部和投影平面单位都为米。Northing 增大时局部 Z 减小，即 `localZ = originNorthing - northing`。Projected 与 WGS84 转换由 `proj4` 完成，转换器按活动 CRS 缓存；生产代码不写死 Aspen 的 CRS 或原点。没有 GIS metadata 的 GLB 会进入 local-only 模式，Projected/Geographic UI 和 API 会明确拒绝，而不是猜坐标。

地形切换时 `MultiTerrainSimulation.commitRuntime()` 会同时重新配置服务、拾取目标、调试边界和输入面板，并清除旧预览/坐标点。资产导出包含 `coordinateReference` 与 `assets`；`TerrainManager` 仍能读取旧版纯数组，避免破坏已有数据。

### 4.9 可见性矩阵与最短路径全可达图链路

```text
SpatialAnalysisPanel 指定数量/高度/吸附阈值
  → MultiTerrainSimulation 进入唯一 SPATIAL_POINT_SELECTION 模式
  → TerrainPicker 只拾取活动 terrain surface
  → PointSelectionManager 生成 O/T/P SpatialPoint 与标签 marker
  ├─ VisibilityAnalyzer
  │    → Observer/Target 地面 Y + 配置高度
  │    → 仅 raycast BuildingLayer.getVisibilityOccluders()
  │    → VisibilityMatrix（row=observer，column=target）
  └─ ReachabilityGraphBuilder
       → TerrainNavMeshManager.findNearestWalkablePoint() 有阈值吸附
       → 对每对 i<j 调 Pathfinder.findPathCandidates()
       → GraphPathCost 以三维折线米数选择最短路径
       → 所有可达 pair 组成 undirected full graph（NO MST）
       → adjacency/cost matrix + shortest-path geometry
```

`SpatialPoint.position` 始终是地形表面的 Local World XYZ，约定 `+X east / +Y up / +Z south / 1 unit = 1 m`。Observer/Target 不依赖导航；Graph Node 才要求阈值范围内存在导航点，并同时保存 `position`、`navigationPosition` 和 `snapDistance`。

`VisibilityAnalyzer` 只持有当前 BuildingLayer 明确交给它的对象数组，不遍历 `scene.children`。默认 1.5 m 与 0.01 m 定义在 `DEFAULT_VISIBILITY_CONFIG`，UI 每次计算都把当前值传入。`ReachabilityGraphBuilder` 只保留每对候选路径中三维折线长度最短者，但保留所有可达 pair 的边；矩阵对称，不可达 cost 使用可 JSON 序列化的 `null`。

图构建按批次让出主线程，汇报 `completedPairs / totalPairs` 并接受 `AbortSignal`。地形切换清空点和全部结果；地形、禁区、资产或导航变化会使相关旧结果失效，下一次构建始终从当前 runtime 获取 Pathfinder 与 NavMesh。

## 5. 目录和关键文件职责

### 根目录与静态资源

| 路径 | 作用 |
| --- | --- |
| `index.html` | Vite HTML 入口，提供 `#app` 挂载点。 |
| `package.json` / `package-lock.json` | 依赖与 dev/build/preview 命令及锁定版本。 |
| `vite.config.ts`、`tsconfig*.json` | 打包和 TypeScript 配置。 |
| `README.md` | 当前中文使用手册：每个界面功能、操作流程、数据保存及排错。 |
| `CODEBASE_GUIDE.md` | 本文件：模块职责、调用链、算法 API 和阅读顺序。 |
| `V05_OSM_BUILDINGS_ROADS.md` | V0.5 的坐标、转换、运行时接入、目录与实际验收报告。 |
| `V06A_COORDINATE_ASSET_PLACEMENT.md` | V0.6-A 坐标服务、拾取、坐标放置、导出格式、测试与验收报告。 |
| `V06B_VISIBILITY_REACHABILITY_GRAPH.md` | V0.6-B SpatialPoint、建筑可见性矩阵、最短路径全可达图、导出、测试与验收报告。 |
| `tools/GIS_GeoTIFF_地形转换与平台接入步骤.md` | GeoTIFF 到平台地形包的中文操作实例。 |
| `tools/gis-converter/` | Python DEM 与 OSM/GeoJSON 转换 CLI、依赖、转换/验证模块和 pytest。 |
| `tools/gis-converter/gis_converter/`、`tools/gis-converter/tests/`、`tools/gis-converter/input/`、`tools/gis-converter/output/` | 分别为转换实现、Python 测试、用户输入 GeoTIFF 和可选的本地工具输出；平台地形包通常输出到下述 `generated/`。 |
| `tests/terrain-regression.test.ts` | TypeScript 地形、水体、禁区、导航与碰撞回归测试。 |
| `tests/coordinate-regression.test.ts` | Local/Projected/WGS84 往返、拾取、边界、自动/手动 Y、预览和三种坐标部署回归测试。 |
| `tests/spatial-analysis-regression.test.ts` | 建筑可见性、高度配置、矩阵方向、三维路径长度、pair 数、对称矩阵、吸附错误、多候选最短路径和 NO MST 回归测试。 |
| `public/assets/maps/terrain-demo/manifest.json` | 地形目录：ID、GLB 路径、采样分辨率、缩放、可选语义和资产文件。 |
| `public/assets/maps/terrain-demo/source/` | Coastal 与 Valley 两个源 GLB 文件。 |
| `public/assets/maps/terrain-demo/generated/` | GIS 转换产生的地形包；可含 `terrain.json`、`terrain.glb`、`metadata.json` 和 `processed/*.local.json`。 |
| `public/assets/models/` | V0.1 普通场景对象的示例 GLB；不是当前多地形下拉框的来源。 |
| `public/assets/maps/terrain-demo/data/` | 每张地形的可选语义/资产 JSON；当前示例文件为空数组。 |
| `public/assets/maps/terrain-demo/semantic/`、`terrain/` | 旧版/示例静态资料及说明。 |
| `dist/`、`node_modules/` | 构建结果和依赖；读业务代码时先跳过。 |

### `src/core/`：仿真总控和基础世界

| 文件 | 作用 |
| --- | --- |
| `MultiTerrainSimulation.ts` | 当前主运行时。串联地形生命周期、渲染、物理、导航、Agent、资产、笔刷、指针事件和右侧 UI。 |
| `FixedTimeStep.ts` | 将不稳定的帧间隔累积成固定物理步。 |
| `World.ts`、`Entity.ts` | V0.1 逻辑世界与实体结构，仍保留供旧架构参考。 |
| `Simulation.ts` | V0.1 单地图仿真入口；**当前 `main.ts` 没有调用它**。 |

### `src/terrain/`：地形输入、数据和编辑

| 文件 | 作用 |
| --- | --- |
| `TerrainTypes.ts` | `TerrainDescriptor`、`TerrainData`、`TerrainRuntimeState`、`PlacedAsset`、错误类型；先读这个文件理解数据形状。 |
| `TerrainCatalog.ts` | 加载并校验 manifest，按 ID 查地形、解析相对资源路径。 |
| `TerrainGLBImporter.ts` | 加载 GLB、识别 land/water、归一化模型位置与比例、调用采样器。 |
| `AgentSpawn.ts` | 在可用地形/导航候选中确定胶囊出生点；GIS 地形可自动选择有效位置。 |
| `TerrainSampler.ts` | 向下射线采样高度和 `sampleCoverage`，生成初始语义及 water regions。 |
| `TerrainDataUtils.ts` | 高度插值、坡度、地面支撑、低地水域判断和高度范围更新。 |
| `TerrainManager.ts` | 地形切换/重新加载的事务式流程和事件；失败时保留当前 Runtime。 |
| `TerrainStateStore.ts` | 按 terrain ID 保存会话状态和快照；仅内存。 |
| `TerrainEditor.ts` | Raise/Lower/Flatten 笔刷、光标和 revision 更新。 |
| `TerrainVisualBuilder.ts` | 根据 TerrainData 创建/更新可视地形网格并处理释放。 |

### `src/gis/`：结构化建筑与道路运行时

| 文件 | 作用 |
| --- | --- |
| `VectorFeatureTypes.ts` | 校验建筑/道路集合，定义属性与几何类型，并转换为道路/障碍语义区域。 |
| `TerrainHeightProvider.ts` | 与 Python 转换器一致的局部网格双线性高度采样。 |
| `BuildingLayer.ts` | 将外环和洞转成 `Shape`/`ExtrudeGeometry`，合并渲染网格，并从同一几何生成 trimesh 数据、实体碰撞线框和高度点调试层。 |
| `RoadLayer.ts` | 根据中心线和真实宽度生成贴地 ribbon，附带宽度边界与采样点调试层。 |
| `BuildingMaterial.ts`、`RoadMaterial.ts` | 低饱和马卡龙材质，集中管理图层外观。 |

### `src/render/`：只负责可视化

| 文件 | 作用 |
| --- | --- |
| `ThreeRenderer.ts`、`SceneSetup.ts` | WebGL renderer、相机、场景、灯光、雾、地面拾取和相机聚焦。 |
| `DynamicWaterSystem.ts` | 显式 water region 或推断低地上的动态水面 Shader。 |
| `TerrainRegionOverlay.ts` | 将禁区等语义覆盖裁剪/贴合当前可见地形三角面，计算轮廓线高度。 |
| `DebugRenderer.ts` | 语义、碰撞、路径、覆盖采样点等调试可视化；覆盖点不写回真实 World。 |
| `ModelLoader.ts` | V0.1 普通场景对象的 GLB 加载与回退视觉模型。 |

### `src/physics/`、`src/navigation/`、`src/agent/`

| 文件 | 作用 |
| --- | --- |
| `physics/TerrainPhysicsWorld.ts` | 当前多地形 Rapier World、heightfield、塔站碰撞体及与 OSM 可见建筑一致的静态 trimesh 碰撞体。 |
| `physics/CharacterController.ts` | Agent 角色碰撞/运动接口。 |
| `physics/PhysicsWorld.ts`、`ColliderFactory.ts` | V0.1 地图和对象的物理实现。 |
| `navigation/TerrainNavMeshManager.ts` | 当前地形导航采样、Recast 构建/查询及重建。 |
| `navigation/Pathfinder.ts` | 优先 Recast，必要时走网格 A*；候选路径与 A* 邻边都不能跨越 Restrict 或 OSM 建筑障碍。 |
| `navigation/NavigationDebug.ts` | 将导航单元交给 DebugRenderer 显示。 |
| `navigation/NavMeshManager.ts` | V0.1 单地图导航实现。 |
| `agent/Agent.ts` | Agent 位置、速度、状态和其可视对象。 |
| `agent/AgentController.ts` | 路径跟随、路点切换、重新部署、重置及与物理位置同步。 |

### `src/semantic/`、`src/map/`、`src/assets/`

| 文件 | 作用 |
| --- | --- |
| `semantic/SemanticRegion.ts` | 矩形/多边形语义区域、点包含及线段相交判断。 |
| `semantic/SemanticMap.ts` | 自动区域与人工区域叠加、空间桶查询、目标/通行成本，以及 Restrict/建筑穿越判断。 |
| `semantic/ManualOverride.ts` | 高优先级人工语义覆盖层。 |
| `map/MapTypes.ts` | V0.1 WorldMap、语义和地图适配器类型；V0.3 仍复用语义数据类型。 |
| `map/MapLoader.ts`、`DemoMapAdapter.ts`、`TerrainBuilder.ts` | V0.1 地图加载、演示地图和 heightmap/程序地形路径，不是当前默认 GLB 入口。 |
| `assets/AssetRegistry.ts` | 资产定义与基础参数，目前注册 signal-tower。 |
| `assets/SignalTowerFactory.ts`、`GeneratedAssetFactory.ts` | 用 Three.js primitive 生成塔站的可视对象。 |
| `assets/PlacementValidator.ts` | V0.2 手动部署的地形/坡度/语义/碰撞基础检查。 |
| `assets/AssetPlacementManager.ts` | 正式资产放置、移动、删除、恢复，与视觉和 Rapier 同步。 |
| `assets/CoordinateAssetPlacer.ts` | 解析 Local/Projected/Geographic 输入和 Auto/Manual Y；预览只读，部署复用 PlacementValidator 与 AssetPlacementManager。 |

### `src/spatial/`：统一空间点、坐标和拾取

| 文件 | 作用 |
| --- | --- |
| `spatial/CoordinateService.ts` | 坐标真值入口；管理活动 CRS/原点/边界，实现 Local、Projected、WGS84、Screen/Ray 的转换和导出引用。 |
| `spatial/TerrainPicker.ts` | 复用 Raycaster，只与当前活动地形 Mesh 相交，输出世界/局部坐标。 |
| `spatial/CoordinateDebugLayer.ts` | 坐标标记、局部原点、地形边界、世界轴和 100 m 网格；纯显示，不写入仿真状态。 |
| `spatial/SpatialPoint.ts` | Observer、Target、Graph Node 共用的 Local World XYZ 数据结构、类型与选点模式。 |
| `spatial/PointSelectionManager.ts` | 管理互斥选点模式、required count、O/T/P 编号、撤销/清空，以及不同形状并带文字标签的 marker。 |

### `src/analysis/`：可见性与可达图

| 文件 | 作用 |
| --- | --- |
| `analysis/VisibilityTypes.ts` | 可见性配置、1.5 m 默认高度、epsilon、pair/blocker 与矩阵结果类型。 |
| `analysis/VisibilityAnalyzer.ts` | 复用 Raycaster/临时向量，只检测显式注册的建筑网格，计算单 pair 与全部 Observer×Target。 |
| `analysis/VisibilityMatrix.ts` | 按 Observer 行、Target 列组装 0/1 矩阵并导出 CSV。 |
| `analysis/GraphTypes.ts` | 原始/吸附节点、带 shortest-path geometry 的边、无向图、矩阵、进度和错误码。 |
| `analysis/GraphPathCost.ts` | 计算三维折线总长并从多个有效候选中选 cost 最小者。 |
| `analysis/ReachabilityGraphBuilder.ts` | 阈值吸附节点、仅遍历 `i < j`、调用当前 Pathfinder、生成完整可达边和对称矩阵，支持进度/取消/CSV。 |
| `analysis/SpatialAnalysisDebugLayer.ts` | 显示 VISIBLE/BLOCKED 射线、遮挡点、导航吸附线、真实 shortest path 和米制 cost 标签。 |

### `src/algorithm/`：算法环境，不直接操作 UI

| 文件或子目录 | 作用 |
| --- | --- |
| `Environment.ts` | 对算法暴露的主 API；管理 episode、动作、观察、指标和静态评估，必要时调用仿真运行时。 |
| `EnvironmentConfig.ts` | 环境配置、默认塔数/半径/坡度/权重等集中参数。 |
| `EnvironmentError.ts` | 带错误码的环境异常。 |
| `AlgorithmEnvironmentAcceptance.ts` | 可选的纯 API 验收流程。 |
| `Action.ts`、`Observation.ts` | 兼容/转发旧类型；当前算法动作与观察的细分定义在子目录。 |
| `action/` | `Action.ts` 定义 PLACE/REMOVE/MOVE/NO_OP；`ActionSpace.ts` 列可用动作；`ActionValidator.ts` 检查输入、资产是否存在并转交约束。 |
| `state/` | `WorldState.ts` 是内部状态；`Observation.ts` 是对外数据形状；`ObservationBuilder.ts` 构建结构化观察和高度/语义/占用网格。 |
| `constraint/` | `Constraint.ts` 定义接口/上下文；`ConstraintEngine.ts` 执行地形、水域、坡度、碰撞、最小塔距等检查；`ConstraintResult.ts` 定义返回值。 |
| `objective/` | `Objective.ts` 定义结果；`RewardCalculator.ts` 根据原始 metrics 和权重算分；`ObjectiveEngine.ts` 包装评估。 |
| `metrics/` | `Metrics.ts` 定义 Coverage、Overlap、Tower Count、Cost、Violations；`MetricsCollector.ts` 记录每一步。 |
| `experiment/` | `ExperimentConfig.ts`/`ExperimentResult.ts` 定义配置与可复现元数据；`ExperimentRunner.ts` 管理执行、停止、应用、导出；`SeedManager.ts` 提供可 seed 的 PRNG。 |
| `baseline/RandomSearchBaseline.ts` | 随机布局基线：生成合法候选、静态评价、记录历史并保留最佳方案。 |

`src/algorithm/` 本身不依赖 DOM 或 Three.js Mesh；它通过 `Environment` 包装运行时接口。注意 `Environment` 当前依旧需要浏览器中的 `MultiTerrainSimulation` 才能完成地形加载和正式资产应用，所以“算法层无 UI 依赖”不等于“整个项目已经能在纯 Node 环境运行”。

### `src/evaluation/`、`src/tasks/`、`src/bridge/`

| 文件 | 作用 |
| --- | --- |
| `evaluation/CoverageEvaluator.ts` | 64×64 网格上的简化几何覆盖与重叠统计。 |
| `evaluation/SpatialEvaluator.ts` | 不创建 Runtime 对象，依次验证候选塔位，汇总指标与 score。 |
| `tasks/Task.ts` | 可扩展的任务定义接口。 |
| `tasks/SignalTowerOptimizationTask.ts` | 当前唯一内置任务，决定可用动作、目标塔数和终止条件。 |
| `bridge/MessageProtocol.ts` | JSON 请求/响应的消息类型。 |
| `bridge/AlgorithmBridge.ts` | Bridge 抽象接口。 |
| `bridge/LocalBridge.ts` | 同进程消息分发到 Environment；尚无 WebSocket 传输。 |

### `src/ui/`、`src/styles/`、`src/config/`、`src/types/`

| 文件 | 作用 |
| --- | --- |
| `ui/V02ControlPanel.ts` | 右侧主控制面板；文件名为历史命名，界面功能标识已更新为 V0.6-A。 |
| `ui/CoordinatePanel.ts` | 独立坐标面板：实时三套坐标、复制、坐标输入、地图拾取、预览/部署和坐标调试开关。 |
| `ui/SpatialAnalysisPanel.ts` | V0.6-B 面板：数量/高度/吸附阈值、选点、进度/取消、矩阵查看与 JSON/CSV 导出。 |
| `ui/FloatingPanel.ts` | 四个主要面板共用的右上角图标启动栏、单面板展开、关闭、标题栏拖拽、事件隔离、自动置顶和视口约束。 |
| `ui/ExperimentPanel.ts` | 左侧实验表单、状态、结果及应用/导出按钮。 |
| `ui/RegionEditor.ts` | 逐点创建多边形人工禁区；处理撤销、自交、最小间距和闭合面积校验。 |
| `ui/ControlPanel.ts` | V0.1 面板，非当前默认入口。 |
| `styles/main.css` | 场景容器、双面板、按钮、加载屏、响应式样式。 |
| `config/constants.ts` | 仿真固定步、Agent 尺寸/速度和基础颜色。 |
| `types/index.ts` | 公共三维向量、路径状态等类型。 |

操作入口可以按功能反查：右侧常规按钮/滑块在 `V02ControlPanel.ts` 绑定，坐标工具在 `CoordinatePanel.ts`，O/T/P 选点与矩阵在 `SpatialAnalysisPanel.ts`，左侧表单在 `ExperimentPanel.ts`，画布点击/拖动/按键统一由 `MultiTerrainSimulation.ts` 分派。“重新部署胶囊体”“Pick From Map”、空间分析选点、禁区和地形编辑与普通“点击设置路径”是互斥交互模式。更细的用户操作请见 [README 使用手册](README.md)。

## 6. Environment API 怎么读

最重要的方法是：

| 方法 | 做什么 | 读源码时关注 |
| --- | --- | --- |
| `reset(config?)` | 可切换地形，按配置清理资产、Agent 目标与旧 episode，初始化任务和指标，返回初始 Observation。 | 先看配置解析，再看 `clearPlacedAssets()` 与 `configureEvaluation()`。 |
| `observe()` | 从内部 WorldState 生成算法可见的结构化状态。 | `state/ObservationBuilder.ts`。 |
| `validateAction(action)` | 给出逐项合法性结果，但不改变世界。 | `ActionValidator.ts` → `ConstraintEngine.ts`。 |
| `step(action)` | 验证、执行合法动作、计步、重新评估并返回 reward、terminated/truncated 和 info。 | `applyAction()`、`evaluate()`、Task 的终止判断。 |
| `evaluate()` | 对当前已放置塔站静态计算 Metrics 和 score。 | `SpatialEvaluator.ts`。 |
| `getMetrics()` / `getEpisodeHistory()` | 读取原始指标/步骤记录。 | `Metrics.ts`、`MetricsCollector.ts`。 |
| `getState()` | 读取更完整的内部 WorldState 快照。 | 注意它与对外 Observation 的区别。 |
| `getGlobalGrid()` / `getLocalGrid()` | 供空间算法读取高度、语义和占用矩阵。 | `ObservationBuilder.buildGrid()`。 |
| `getHeightGrid()` / `getSemanticGrid()` / `getOccupancyGrid()` | 分别取高度、语义编码和资产占用矩阵。 | 无地面支撑的高度值为 `NaN`；语义编码定义于 `ObservationBuilder.ts`。 |
| `getAvailableTerrains()` / `switchTerrain(id)` | 查询清单并切换活动地形。 | 切换是异步过程，期间不能执行依赖当前世界的变更。 |
| `validateCandidate()` / `evaluatePlacementSet()` | 不写入 Runtime 的候选位置或整组布局评价。 | `SpatialEvaluator.ts`，实验会大量复用。 |
| `applySolution()` | 将最佳方案真正写入当前世界。 | 重新验证并创建真实资产；失败时清理部分应用结果。 |

Action 目前为 `PLACE_ASSET`、`REMOVE_ASSET`、`MOVE_ASSET`、`NO_OP`。`step()` 返回的 reward 对合法动作是本步 score 与上步 score 的差；非法动作给负奖励，且仍消耗一步。达到目标塔数或 `NO_OP.endEpisode` 时 `terminated=true`；未终止但达到 `maxSteps` 时 `truncated=true`。

## 7. 约束、指标和分数如何计算

### 约束：能否执行

`ConstraintEngine` 对放置/移动动作执行：`INSIDE_TERRAIN`、`GROUND_SUPPORT`、`NOT_IN_WATER`、`NOT_IN_RESTRICTED_REGION`、`MAX_SLOPE`、`NO_COLLISION`、`MIN_TOWER_DISTANCE`。默认最大坡度 12°，塔间最小距离 5 m。失败结果包含 `constraintId`、原因以及可用的数值信息。

### 指标：方案表现

`CoverageEvaluator` 将地形分成 64×64 采样格。只统计有地面支撑、非水域、可通行且不在禁区的点：

```text
coverageRatio = 被至少 1 座塔覆盖的合法采样点 / 所有合法采样点
overlapRatio  = 被至少 2 座塔覆盖的合法采样点 / 所有合法采样点
totalCost     = towerCount × 1
```

每座塔在 X-Z 平面按 15 m 半径覆盖；这是简化几何模型，**不是真实无线电传播模拟**。默认 score：

```text
score = 1.0 × coverageRatio
      - 0.2 × overlapRatio
      - 0.1 × (totalCost / targetTowerCount)
      - 1.0 × constraintViolations
```

权重可在实验配置中覆盖。原始 metrics 与 score 一起保留，方便比较算法，不要只看一个分数。

## 8. 一个完整调用示例

以下代码可在应用加载完成后通过浏览器开发工具运行；塔位仅是示例，实际坐标应先使用 `validateAction()` 检查：

```js
const env = window.spatialEnvironment;

const observation = await env.reset({
  terrainId: 'terrain-01',
  seed: 42,
  task: { type: 'SIGNAL_TOWER_OPTIMIZATION', targetTowerCount: 5 },
  episode: { maxSteps: 20, maxAssets: 5 },
  rendering: { enabled: true },
  assets: { resetPlacedAssets: true },
});

const action = {
  type: 'PLACE_ASSET',
  assetType: 'signal-tower',
  position: { x: 12, z: 20 },
};

const validation = env.validateAction(action);
if (validation.valid) {
  const step = await env.step(action);
  console.log(step.observation, step.reward, step.info.metrics);
}

const runner = window.spatialExperimentRunner;
const result = await runner.run({
  experimentId: 'example-seed-42',
  terrainId: 'terrain-01',
  seed: 42,
  algorithm: 'Random Search',
  task: { type: 'SIGNAL_TOWER_OPTIMIZATION', targetTowerCount: 5 },
  maxSteps: 20,
  iterations: 100,
  rendering: 'fast',
  objectiveWeights: { coverage: 1, overlap: 0.2, cost: 0.1, violations: 1 },
});

console.log(result.bestScore, result.metrics, result.solution);
await runner.applyBestSolution();
```

`runner.run()` 会再次调用 `reset()`，所以示例中前面手动放置的塔会被清理；这里刻意把单步 API 和完整实验放在一起，展示两种调用方式。

## 9. 哪些东西尚未完成或需要注意

- **Python 连接**：已有 `AlgorithmBridge`/`LocalBridge` 协议抽象，但没有 WebSocket server/client，也不能让 Python 直接连当前页面。
- **真正 headless**：算法候选的评估不依赖 UI 点击和逐候选渲染；但当前 TerrainData 的载入与 Runtime 仍由浏览器应用完成，未提供独立 Node/服务器入口。
- **运行时与算法验证路径不同**：左侧实验和 `Environment.step()` 使用 V0.3 `ConstraintEngine`；右侧手动放塔沿用 V0.2 `PlacementValidator`。因此手动 UI 的最小距离规则不等同于算法的 5 m 规则。研究实验应走 Environment API。
- **显式语义数据较少**：示例地形的部分语义 JSON 为空数组；没有独立 water mesh 时，只有带水域命名或 `waterMode: "infer"` 的 GLB 才启用低地推断。正式研究数据应提供明确语义/水域资产。
- **地形是 2.5D heightfield**：不能完整表示洞穴、上下叠层道路或悬空平台。
- **会话存储**：`TerrainStateStore` 只存在内存；JSON/CSV 导出需由用户主动保存。
- **大型 GLB**：采样在主线程，第三张地形较大，首次加载可能卡顿；尚未迁移到 Web Worker。
- **GIS DEM 范围与 NoData**：GeoTIFF 转换后仍是 2.5D 地形；无效覆盖可有有限高度用于网格/碰撞计算，但导航与部署必须读取 `sampleCoverage`，不能将其当成可用地面。
- **调试视图语义**：NavMesh 开关显示采样单元，不是 Recast 完整多边形；Colliders 是 Rapier 高度场与其他碰撞体，不等同于源 GLB 的每个三角面。
- **包体积**：Rapier/Recast/Three.js 使构建输出较大，当前构建可能提示 chunk-size warning。

## 10. 按需求寻找代码

| 想改什么 | 从哪里入手 |
| --- | --- |
| 新增一张地形 | 先改 `manifest.json`，再看 `TerrainCatalog`、`TerrainGLBImporter`、`TerrainSampler`。 |
| 接入 GeoTIFF | 先看 `tools/gis-converter/README.md`、`tools/GIS_GeoTIFF_地形转换与平台接入步骤.md`，再看 `TerrainManager.loadState()`。 |
| 改地形高度/编辑手感 | `TerrainEditor` → `TerrainVisualBuilder` → `MultiTerrainSimulation.rebuildAfterEdit()`。 |
| 改水面/亮度 | `DynamicWaterSystem`、`SceneSetup`、`ThreeRenderer`。 |
| 改导航行为 | `TerrainNavMeshManager`、`Pathfinder`、`AgentController`。 |
| 改禁区的绘制/路径拦截 | `RegionEditor`、`SemanticRegion`、`SemanticMap`、`TerrainRegionOverlay`、`Pathfinder`。 |
| 改画幅或胶囊尺寸 | `V02ControlPanel` → `MultiTerrainSimulation` → `ThreeRenderer`、`Agent`、`CharacterController`。 |
| 加新资产类型 | `AssetRegistry`、`GeneratedAssetFactory`、`AssetPlacementManager`，并同步算法动作/约束与物理实现。 |
| 改塔站能否放置 | 算法侧看 `ActionValidator`/`ConstraintEngine`；手动 UI 侧还要看 `PlacementValidator`。 |
| 改覆盖或奖励公式 | `CoverageEvaluator`、`SpatialEvaluator`、`RewardCalculator` 和 `EnvironmentConfig`。 |
| 加新算法 | 实现 `OptimizationAlgorithm`，通过 `ExperimentRunner.register()` 注册；不要在 UI 中模拟点击。 |
| 加新任务 | 实现 `TaskDefinition`，再扩展 Environment 的任务选择与动作空间。 |
| 接 Python | 从 `MessageProtocol`、`AlgorithmBridge`、`LocalBridge` 开始，新增独立 WebSocket transport。 |

阅读时始终区分“数据定义”“算法判断”“Runtime 世界变更”和“可视化”四层；沿上面的调用链逐层追踪，比从 `MultiTerrainSimulation.ts` 的每一行从头读起更容易理解项目。
