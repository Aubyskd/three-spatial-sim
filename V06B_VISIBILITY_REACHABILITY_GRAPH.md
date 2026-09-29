# V0.6-B 可见性矩阵与最短路径全可达图交付说明

本文对应 `threejs_spatial_sim_v06b_visibility_reachability_graph_codex_prompt.md`。实现目标是在平台统一的 Local World Coordinates 中，完成建筑遮挡可见性矩阵与基于实际最短路径长度的无向完整可达图；本版本明确不实现 MST。

## 1. 交付结论

- Observer / Target 可分别指定数量、默认及自定义高度，在活动 terrain surface 上选点，生成 Building-only 0/1 Visibility Matrix。
- Graph Node 可指定数量与最大导航吸附距离；系统只计算 `i < j`，保留所有可达 pair，以候选中三维折线长度最短的真实路径作为 edge cost。
- 邻接矩阵和 cost matrix 都对称；cost 主对角为 `0`，不可达值为 JSON `null`。
- UI 支持撤销、清空、重新选择、矩阵查看、真实路径 Debug、进度、取消和 JSON/CSV 导出。
- 切换 terrain 清除全部空间点与结果，并换用新 BuildingLayer、NavMesh 和 Pathfinder；地形、禁区或资产改变后不会保留失效图结果。
- 没有添加 MST 过滤，也没有删除 cost 较高但合法的可达边。

## 2. 新增文件

| 文件 | 作用 |
| --- | --- |
| `src/spatial/SpatialPoint.ts` | 统一 O/T/P 点类型、Local XYZ 数据结构、选点模式与安全复制。 |
| `src/spatial/PointSelectionManager.ts` | required count、互斥模式、编号、marker、撤销/清空/完成。 |
| `src/analysis/VisibilityTypes.ts` | 高度/epsilon 配置、默认值、pair/blocker/矩阵类型。 |
| `src/analysis/VisibilityAnalyzer.ts` | Building-only 射线与 Observer×Target 计算。 |
| `src/analysis/VisibilityMatrix.ts` | 行列矩阵组装与 CSV 导出。 |
| `src/analysis/GraphTypes.ts` | 导航吸附节点、边、全图、矩阵、进度与错误码。 |
| `src/analysis/GraphPathCost.ts` | 三维路径长度和多候选最短路径选择。 |
| `src/analysis/ReachabilityGraphBuilder.ts` | 节点吸附、pairwise 寻路、全可达图、进度/取消与 CSV。 |
| `src/analysis/SpatialAnalysisDebugLayer.ts` | 可见性线、遮挡点、吸附线、实际路径和 cost 标签。 |
| `src/ui/SpatialAnalysisPanel.ts` | V0.6-B 图标启动的浮动面板、矩阵查看和导出。 |
| `tests/spatial-analysis-regression.test.ts` | 可见性、矩阵、路径长度、图对称性、最短候选、吸附与 NO MST 测试。 |
| `V06B_VISIBILITY_REACHABILITY_GRAPH.md` | 本交付说明。 |

## 3. 修改文件

| 文件 | 修改内容 |
| --- | --- |
| `src/core/MultiTerrainSimulation.ts` | 接入选点、Visibility、Graph、调试、UI、切图清理和结果失效策略。 |
| `src/gis/BuildingLayer.ts` | 暴露当前精确渲染建筑网格作为可见性遮挡集合。 |
| `src/navigation/TerrainNavMeshManager.ts` | 新增带阈值的最近可导航点查询。 |
| `src/navigation/Pathfinder.ts` | 为 Graph 提供 Recast 与三维几何代价 A* 候选，不改变原 Agent 路径入口。 |
| `src/terrain/TerrainTypes.ts` | 增加互斥的 `SPATIAL_POINT_SELECTION` 交互模式。 |
| `src/render/ThreeRenderer.ts` | 把分析面板纳入相机视口避让/布局更新。 |
| `src/styles/main.css` | 分析面板、矩阵、按钮、折叠和窄屏样式。 |
| `package.json` | 把空间分析回归加入 `test:terrain`。 |
| `tools/runtime-smoke.mjs` | 增加分析面板、默认高度、NO MST、调试根和当前建筑遮挡集合检查。 |
| `README.md` | 增加完整中文使用流程、结果语义、失效规则和排错说明。 |
| `CODEBASE_GUIDE.md` | 增加 V0.6-B 数据流、模块和逐文件职责。 |

## 4. 完整目录树

下面列出当前业务源码、测试、文档、工具和静态资源结构；`node_modules/`、`dist/`、工具虚拟环境、缓存及大型生成文件内部清单不逐文件展开。

```text
three-spatial-sim/
├─ index.html
├─ package.json
├─ package-lock.json
├─ vite.config.ts
├─ tsconfig.json
├─ tsconfig.app.json
├─ tsconfig.node.json
├─ README.md
├─ CODEBASE_GUIDE.md
├─ V05_OSM_BUILDINGS_ROADS.md
├─ V06A_COORDINATE_ASSET_PLACEMENT.md
├─ V06B_VISIBILITY_REACHABILITY_GRAPH.md
├─ threejs_spatial_sim_v06b_visibility_reachability_graph_codex_prompt.md
├─ public/
│  └─ assets/
│     ├─ models/demo-model.glb
│     └─ maps/terrain-demo/
│        ├─ manifest.json
│        ├─ source/{terrain1.glb, terrain2.glb}
│        ├─ data/{assets-01.json, assets-02.json, semantic-01.json, semantic-02.json}
│        ├─ semantic/regions.json
│        ├─ terrain/README.md
│        └─ generated/<GIS terrain package>/
│           ├─ terrain.json
│           ├─ terrain.glb
│           ├─ metadata.json
│           └─ processed/{buildings.local.json, roads.local.json}
├─ src/
│  ├─ main.ts
│  ├─ types/index.ts
│  ├─ config/constants.ts
│  ├─ core/
│  │  ├─ MultiTerrainSimulation.ts
│  │  ├─ FixedTimeStep.ts
│  │  ├─ Simulation.ts
│  │  ├─ World.ts
│  │  └─ Entity.ts
│  ├─ spatial/
│  │  ├─ SpatialPoint.ts
│  │  ├─ PointSelectionManager.ts
│  │  ├─ TerrainPicker.ts
│  │  ├─ CoordinateService.ts
│  │  └─ CoordinateDebugLayer.ts
│  ├─ analysis/
│  │  ├─ VisibilityTypes.ts
│  │  ├─ VisibilityAnalyzer.ts
│  │  ├─ VisibilityMatrix.ts
│  │  ├─ GraphTypes.ts
│  │  ├─ GraphPathCost.ts
│  │  ├─ ReachabilityGraphBuilder.ts
│  │  └─ SpatialAnalysisDebugLayer.ts
│  ├─ terrain/
│  │  ├─ TerrainTypes.ts
│  │  ├─ TerrainCatalog.ts
│  │  ├─ TerrainManager.ts
│  │  ├─ TerrainStateStore.ts
│  │  ├─ TerrainGLBImporter.ts
│  │  ├─ TerrainSampler.ts
│  │  ├─ TerrainDataUtils.ts
│  │  ├─ TerrainEditor.ts
│  │  ├─ TerrainVisualBuilder.ts
│  │  └─ AgentSpawn.ts
│  ├─ gis/
│  │  ├─ VectorFeatureTypes.ts
│  │  ├─ TerrainHeightProvider.ts
│  │  ├─ BuildingLayer.ts
│  │  ├─ BuildingMaterial.ts
│  │  ├─ RoadLayer.ts
│  │  └─ RoadMaterial.ts
│  ├─ navigation/
│  │  ├─ TerrainNavMeshManager.ts
│  │  ├─ Pathfinder.ts
│  │  ├─ NavigationDebug.ts
│  │  └─ NavMeshManager.ts
│  ├─ physics/
│  │  ├─ TerrainPhysicsWorld.ts
│  │  ├─ CharacterController.ts
│  │  ├─ PhysicsWorld.ts
│  │  └─ ColliderFactory.ts
│  ├─ render/
│  │  ├─ ThreeRenderer.ts
│  │  ├─ SceneSetup.ts
│  │  ├─ DynamicWaterSystem.ts
│  │  ├─ TerrainRegionOverlay.ts
│  │  ├─ DebugRenderer.ts
│  │  └─ ModelLoader.ts
│  ├─ agent/{Agent.ts, AgentController.ts}
│  ├─ assets/
│  │  ├─ AssetRegistry.ts
│  │  ├─ AssetPlacementManager.ts
│  │  ├─ CoordinateAssetPlacer.ts
│  │  ├─ PlacementValidator.ts
│  │  ├─ GeneratedAssetFactory.ts
│  │  └─ SignalTowerFactory.ts
│  ├─ semantic/{SemanticMap.ts, SemanticRegion.ts, ManualOverride.ts}
│  ├─ map/{MapTypes.ts, MapLoader.ts, DemoMapAdapter.ts, TerrainBuilder.ts}
│  ├─ algorithm/
│  │  ├─ Environment.ts
│  │  ├─ EnvironmentConfig.ts
│  │  ├─ EnvironmentError.ts
│  │  ├─ AlgorithmEnvironmentAcceptance.ts
│  │  ├─ Action.ts
│  │  ├─ Observation.ts
│  │  ├─ action/{Action.ts, ActionSpace.ts, ActionValidator.ts}
│  │  ├─ state/{WorldState.ts, Observation.ts, ObservationBuilder.ts}
│  │  ├─ constraint/{Constraint.ts, ConstraintEngine.ts, ConstraintResult.ts}
│  │  ├─ objective/{Objective.ts, ObjectiveEngine.ts, RewardCalculator.ts}
│  │  ├─ metrics/{Metrics.ts, MetricsCollector.ts}
│  │  ├─ experiment/{ExperimentConfig.ts, ExperimentResult.ts, ExperimentRunner.ts, SeedManager.ts}
│  │  └─ baseline/RandomSearchBaseline.ts
│  ├─ evaluation/{CoverageEvaluator.ts, SpatialEvaluator.ts}
│  ├─ tasks/{Task.ts, SignalTowerOptimizationTask.ts}
│  ├─ bridge/{AlgorithmBridge.ts, LocalBridge.ts, MessageProtocol.ts}
│  ├─ ui/
│  │  ├─ V02ControlPanel.ts
│  │  ├─ ExperimentPanel.ts
│  │  ├─ CoordinatePanel.ts
│  │  ├─ SpatialAnalysisPanel.ts
│  │  ├─ FloatingPanel.ts
│  │  ├─ RegionEditor.ts
│  │  └─ ControlPanel.ts
│  └─ styles/main.css
├─ tests/
│  ├─ terrain-regression.test.ts
│  ├─ coordinate-regression.test.ts
│  └─ spatial-analysis-regression.test.ts
└─ tools/
   ├─ runtime-smoke.mjs
   ├─ GIS_GeoTIFF_地形转换与平台接入步骤.md
   └─ gis-converter/
      ├─ README.md
      ├─ pyproject.toml
      ├─ requirements.txt
      ├─ gis_converter/（DEM、CRS、mesh、manifest、OSM vector 转换模块）
      ├─ tests/（Python 转换回归测试）
      └─ input/（本地 GIS 输入）
```

## 5. SpatialPoint 与 PointSelectionManager

`SpatialPoint` 用一个结构表达三类点：`observer | target | graph-node`。`position` 是 terrain surface 上的 Local World XYZ，不是投影坐标，也不是屏幕坐标；元数据和 `heightOffset` 可选。

`PointSelectionManager` 同一时间只允许一种 active mode。它验证 required count 和坐标，按类型生成 O1/T1/P1 编号，维护点副本和 marker。Observer 使用锥体、Target 使用八面体、Graph Node 使用立方体，并额外显示 O/T/P 文字标签，因此不是只靠颜色辨识。数量达到 required count 后自动停止。画布入口记录 pointerdown 与 pointerup 的位移，超过 5 px 视为拖动，不添加点。

## 6. VisibilityAnalyzer

真实射线端点是：

```text
origin = observer.position + (0, observerHeightOffset, 0)
target = target.position + (0, targetHeightOffset, 0)
```

方向归一化后，复用同一个 `THREE.Raycaster` 与临时 `Vector3`。仅当最近建筑交点满足 `hit.distance < targetDistance - visibilityEpsilon` 时判定 blocked。

### 为什么 1.5 m 没有写死

1.5 m 只存在于 `DEFAULT_VISIBILITY_CONFIG`，是 UI 的初始值和配置缺省值。`analyzePair()` 只读取传入的 `config.observerHeightOffset`、`config.targetHeightOffset` 与 `config.visibilityEpsilon`；测试把高度改为 3 m 后射线结果随配置改变，证明算法没有硬编码 1.5。

### Building-only occlusion

`BuildingLayer.getVisibilityOccluders()` 返回当前地形的精确合并建筑表面。`commitRuntime()` 将它传给 `VisibilityAnalyzer.setBuildingOccluders()`；切图销毁旧 runtime 时清空。分析器从不 raycast `scene.children`，因此 terrain、road、asset、vehicle 和其他 debug object 不参与遮挡。

### Visibility Matrix

`VisibilityMatrixResult` 含 `type`、terrain ID/revision、observer/target IDs、完整点数据、配置、pair 详情和 `number[][] matrix`。构造顺序固定为 Observer 行、Target 列；visible 为 1，blocked 为 0。JSON 原样保留全部字段，CSV 首行为 Target IDs，首列为 Observer IDs。

## 7. ReachabilityGraphBuilder 与 Pathfinder

Graph Node 先通过 `findNearestWalkablePoint(x,z,maxDistance)` 投影到当前导航采样；失败抛出带 code 的 `NO_NEARBY_NAVMESH`。`GraphNode` 保留原始 `position`、`navigationPosition` 与 `snapDistance`。

Builder 只执行 `i < j`，总 pair 数为 `N(N-1)/2`。对每对调用当前 runtime 的 `Pathfinder.findPathCandidates()`：

- Recast 候选必须通过现有逐路径段语义/导航验证。
- 网格 A* 候选用每段的三维空间距离作为 g/h 代价，不以 waypoint count 判断。
- `chooseShortestPath()` 对全部有效候选计算真实三维折线总长，选择 cost 最小者。

路径长度定义为：

```text
cost = Σ hypot(dx, dy, dz)
```

因为 1 world unit = 1 m，所以 cost 单位为米。Edge 同时保存 source、target、cost 和所选 shortest path 的完整 XYZ 数组。

### 矩阵规则

- Adjacency：可达为 1，不可达为 0，主对角为 0，并写入 `[i][j]` 与 `[j][i]`。
- Cost：可达为 shortest-path metres，不可达为 `null`，主对角为 0，并保持对称。
- 所有 reachable pair 都生成边。没有 Kruskal、Prim、边排序删除或任何 MST 过滤。

每完成一个 pair 都更新进度；默认每 8 对通过 `setTimeout(0)` 让出浏览器主线程。`AbortSignal` 在下一 pair 前终止，核心错误会显示在面板并记录到控制台，不会静默吞掉。

## 8. Debug 与导出

- O/T/P 地形点由 `PointSelectionManager` 显示形状和文字标签。
- Visibility：visible 用实线且标 `VISIBLE`；blocked 用虚线、`BLOCKED` 和命中位置球体。
- Graph：原始点到吸附点显示虚线；每条边绘制保存的 shortest path，而非端点直线，并显示 `x.x m`。
- Visibility JSON 包含配置、点、矩阵和 pair/blocker；CSV 是矩阵。
- Graph JSON 包含节点、边、路径、邻接矩阵与 cost matrix；CSV 包含 metadata、nodes、edges、adjacency matrix、cost matrix 五段。

## 9. 测试和构建结果

执行：

```powershell
npm run test:terrain
npm run build
```

结果：

- 自动化回归：33 项全部通过，0 failed；其中 9 个测试用例集中覆盖 V0.6-B，并在组合断言中覆盖 prompt 列出的默认高度、配置高度、矩阵尺寸/方向、Building-only、pair count、reachable/unreachable、无向/对称、路径长度、最短候选、保存路径、null/zero 与 NO MST 条件。
- 关键多路径测试提供 120 m、85 m、103 m 三个候选，结果选择 85 m 候选及其 geometry；同时断言 cost 大于 80 m 端点直线距离。
- 生产构建通过：TypeScript 检查成功，Vite 转换 199 modules 并生成 `dist/`。
- 浏览器实测：Coastal 上 O1/T1 得到 `1 × 1` 矩阵；P1/P2 得到 1 条可达边、对称矩阵和 7.48 m 路径；切换 Aspen 后点数和两类结果归零，当前 BuildingLayer/CRS 正常加载。

## 10. 已知 warning 与限制

- Vite 仍提示主 bundle 超过 500 kB；Three.js、Rapier 与 Recast 体积较大，这是现有打包优化项，不影响本次功能。
- 示例 Coastal GLB 会出现旧材质扩展 `KHR_materials_pbrSpecularGlossiness` 和“没有命名 land mesh，使用最大 X-Z mesh”的 warning；Aspen 加载及 V0.6-B 没有新增浏览器错误。
- Graph 上限 UI 为 30 节点，即 435 对；仍可能在复杂地形耗时，已提供分批进度和取消，但尚未移到 Web Worker。
- Visibility 当前按需求只检测建筑；地形遮挡、树木和资产遮挡不是遗漏性 bug，而是本版本明确边界。
- Graph 候选来自当前 Recast 与网格 A* 两套现有路径来源；它不是列举几何世界中理论上的所有同伦路径。

## 11. 错误、兼容与非目标保证

- 输入数量/范围、错误点类型、无导航邻点和分析失败都有明确错误信息；Graph 核心异常同时 `console.error` 并显示在面板，取消单独报告，不静默忽略。
- 原有路径设置、Agent、Restrict、Terrain 编辑、Coordinate Inspector、坐标资产放置、OSM 建筑/道路、算法 Environment 与实验面板均保留；原 `Pathfinder.findPath()` 行为入口未被替换。
- 本版本没有实现 MST，也没有把“最小 cost”误解为整张图的最小生成树。所谓最小只发生在单个节点 pair 的候选路径之间。

## 12. 最终数据流

```text
                  TerrainPicker
                       ↓
                 SpatialPoint
                  /         \
                 /           \
                ↓             ↓
       VisibilityAnalyzer   ReachabilityGraphBuilder
              ↓                 ↓
      current BuildingLayer   current Pathfinder/NavMesh
              ↓                 ↓
     Visibility Matrix    Shortest-Path Weighted Edge
               \             /
                \           /
                 ↓         ↓
          Matrix/Graph UI + Debug + JSON/CSV
```
