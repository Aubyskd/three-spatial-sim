# V0.6-B2 物理空间分析与真实道路图实现说明

## 1. 版本结论

V0.6-B2 已将空间分析链路升级为：

```text
屏幕点击
  → PhysicalPointPicker（terrain / building / road 最近表面）
  → SpatialPointValidator（地形、边界、建筑、Rapier、SemanticMap）
  → 合法 groundPosition
  → Visibility 或 RoadGraph
```

Visibility 只把建筑作为射线遮挡物；Reachability Graph 不再使用通用 NavMesh 作为最终拓扑，而是从 `roads.local.json` 构建真实道路网络并执行 Dijkstra 最短路。当前图为无向图，明确记录 `onewayEnforced: false`，不执行 MST。

## 2. 新增文件

```text
src/
├─ spatial/
│  ├─ PhysicalPointPicker.ts
│  ├─ PhysicalPointTypes.ts
│  └─ SpatialPointValidator.ts
└─ roads/
   ├─ RoadGraph.ts
   ├─ RoadGraphNode.ts
   ├─ RoadGraphEdge.ts
   ├─ RoadIntersectionDetector.ts
   ├─ RoadNetworkBuilder.ts
   ├─ RoadTraversalProfile.ts
   ├─ RoadSnapper.ts
   ├─ RoadPathfinder.ts
   └─ RoadNetworkDebugLayer.ts

V06B2_PHYSICAL_SPATIAL_ANALYSIS.md
```

## 3. 修改文件

```text
src/analysis/GraphTypes.ts
src/analysis/ReachabilityGraphBuilder.ts
src/analysis/SpatialAnalysisDebugLayer.ts
src/analysis/VisibilityAnalyzer.ts
src/core/MultiTerrainSimulation.ts
src/gis/BuildingLayer.ts
src/gis/RoadLayer.ts
src/physics/TerrainPhysicsWorld.ts
src/spatial/PointSelectionManager.ts
src/spatial/SpatialPoint.ts
src/styles/main.css
src/ui/SpatialAnalysisPanel.ts
tests/spatial-analysis-regression.test.ts
tools/gis-converter/gis_converter/road_converter.py
```

## 4. 本版本相关目录树与职责

```text
src/
├─ core/
│  └─ MultiTerrainSimulation.ts       # 总装配、地形生命周期、点选和分析入口
├─ spatial/
│  ├─ CoordinateService.ts            # 既有坐标转换，继续复用
│  ├─ TerrainPicker.ts                 # 普通地形编辑/坐标拾取继续使用
│  ├─ PhysicalPointPicker.ts           # 空间分析专用多表面拾取
│  ├─ PhysicalPointTypes.ts            # 表面类型和标准错误原因
│  ├─ SpatialPointValidator.ts         # 五级物理合法性验证
│  ├─ SpatialPoint.ts                  # ground / analysis 坐标分离
│  └─ PointSelectionManager.ts         # 单一空间选点模式与标记管理
├─ roads/
│  ├─ RoadGraphNode.ts                 # 道路端点、路口、拆分点
│  ├─ RoadGraphEdge.ts                 # 几何、3D 长度、OSM 属性
│  ├─ RoadGraph.ts                     # 节点、边、邻接表
│  ├─ RoadTraversalProfile.ts          # pedestrian / vehicle / all
│  ├─ RoadIntersectionDetector.ts      # 几何相交和拓扑兼容判定
│  ├─ RoadNetworkBuilder.ts            # 道路拆段并生成 RoadGraph
│  ├─ RoadSnapper.ts                   # 地面点有限距离吸附道路
│  ├─ RoadPathfinder.ts                # 无向道路图 Dijkstra
│  └─ RoadNetworkDebugLayer.ts         # 道路节点、边、路口、吸附和长度
├─ analysis/
│  ├─ VisibilityAnalyzer.ts            # 合法点 + 配置高度 + 建筑遮挡
│  ├─ VisibilityMatrix.ts              # observer 行、target 列
│  ├─ GraphTypes.ts                    # 输出图、矩阵和错误类型
│  ├─ ReachabilityGraphBuilder.ts      # 两两道路最短路并保留全部可达边
│  └─ SpatialAnalysisDebugLayer.ts     # 分析高度、射线和最短道路路径
├─ physics/
│  └─ TerrainPhysicsWorld.ts           # Rapier 建筑 probe 查询
├─ gis/
│  ├─ BuildingLayer.ts                 # 建筑物理拾取表面与遮挡物
│  └─ RoadLayer.ts                     # 道路物理拾取表面
└─ ui/
   └─ SpatialAnalysisPanel.ts          # 分析参数、反馈、矩阵、调试开关
```

## 5. PhysicalPointPicker 设计

空间分析点击不再直接调用只检测地形的 `TerrainPicker`。Picker 同时射线检测 terrain、building 和 road，按距离排序。最近表面为 building 时立即返回 `BUILDING_SURFACE`；最近表面为 terrain 或 road 时，仍使用同一条射线命中的 terrain 作为基础 `groundPosition`。没有地形命中时返回 `NO_TERRAIN_SUPPORT`。

这保证点击楼顶或建筑侧面不会穿透后在地形上创建 observer、target 或 graph node。

## 6. SpatialPointValidator 与错误反馈

验证顺序固定为：

1. 候选点与 terrain support；
2. terrain 本地边界；
3. 建筑 footprint（支持外环和洞）；
4. Rapier 建筑 collider 球形 probe；
5. `SemanticMap.validateTarget()`。

失败分别返回 `NO_TERRAIN_SUPPORT`、`OUTSIDE_TERRAIN`、`BUILDING_COLLISION`、`PHYSICS_COLLISION` 或 `SEMANTIC_FORBIDDEN`。UI 立即显示 `Invalid Point · <REASON>`，不会静默忽略或创建无效点。

## 7. SpatialPoint 数据

`groundPosition` 始终保存经验证的真实地面坐标。`analysisPosition` 保存当前分析使用的位置：Visibility 是地面高度加配置偏移，Graph 是道路吸附点。每个点还包含 `valid` 和 `validation.reasons`。

## 8. Visibility 修复

- observer 和 target 必须 `valid === true`；
- 默认 observer/target 高度均为 1.5 m，可在 UI 单独调整；
- 高度集中在 `DEFAULT_VISIBILITY_CONFIG`，没有散落硬编码；
- 射线只检查 `BuildingLayer.getVisibilityOccluders()`；
- 调试层绘制地面点到分析点的竖线、分析点、可见/阻挡射线和阻挡命中点；
- 输出保持 observer 为行、target 为列。

## 9. RoadNetworkBuilder 与路口规则

Builder 读取既有 `RoadCollection`，按 Traversal Profile 过滤后，把每条 centerline 变成原始线段。空间哈希只生成可能相交的线段对，避免对大地图做全量平方级比较。

真实路口要求：

```text
XZ 几何相交
AND layer 相同（缺失时为 0）
AND bridge 状态相同
AND tunnel 状态相同
```

满足条件的中部交点会写入两条道路的 split 参数，并把道路拆为多条 RoadGraphEdge。桥梁、隧道或不同 layer 的二维交叉不会错误连通。

GIS 转换脚本现在把 `bridge`、`tunnel`、`layer` 写入标准化 properties；运行时同时兼容旧数据的 `properties.raw` 和 `sourceProperties`。

## 10. RoadGraph 与真实 3D 距离

RoadGraphNode 保存位置、连接边、节点类型、关联道路、layer 和 bridge/tunnel 信息。RoadGraphEdge 保存 source、target、原始道路几何、道路 ID、OSM 属性和长度。

每段长度使用：

```text
sqrt(dx² + dy² + dz²)
```

因此 Aspen 山地高程会进入成本；100 m 水平距离和 20 m 高差得到约 101.98 m，而不是 100 m。

## 11. Traversal Profile

UI 提供 `pedestrian`、`vehicle` 和 `all`。Profile 决定允许的 `highway=*` 类型，并保留 bridge/tunnel 开关。切换 profile 时会清除旧 graph node/结果并重建活动 RoadGraph，避免旧拓扑混用。

## 12. RoadSnapper

RoadSnapper 将合法地面点投影到最近可通行 RoadGraphEdge，保存：

- originalPosition；
- snappedPosition；
- roadEdgeId；
- snapDistance；
- 到该边两端的沿边成本。

`maxRoadSnapDistance` 默认 10 m，可在 UI 修改。超过阈值返回 `NO_NEARBY_TRAVERSABLE_ROAD`，不会偷偷远距离吸附。

## 13. RoadPathfinder 与 ReachabilityGraphBuilder

RoadPathfinder 对非负 3D edge length 使用 Dijkstra。起终点可以位于道路段中间，通过虚拟端点成本接入道路图；若两点在同一条边上，也比较边内直接路径。它不暴力枚举全部路径。

ReachabilityGraphBuilder 仅计算 `i < j`，把找到最短路的点对保存为无向 edge，并同时写入：

- `roadPath`；
- `roadEdgeIds`；
- 最短 3D 道路成本（米）；
- 对称 adjacency matrix；
- 对称 cost matrix；
- 不可达点对 cost 为 `null`；
- 对角线 cost 为 0、adjacency 为 0。

所有可达点对都会保留，不做 MST。当前不强制 one-way，导出数据明确包含 `onewayEnforced: false`。

## 14. Debug Rendering

空间分析面板新增五个开关：Road Graph Nodes、Road Graph Edges、Intersections、Road Snap、Road Edge Length。路口标签包含节点 ID、关联道路、layer、bridge/tunnel；Graph 结果绘制原始点、吸附点、吸附线和最短道路路径。

## 15. Terrain 与 revision 生命周期

地形切换会清除 physical points、visibility result、graph nodes、graph result，重新建立建筑遮挡物、物理拾取表面和活动 RoadGraph。地形编辑继续使全部空间分析失效；语义区域或物理障碍变化不会继续显示旧 graph 结果。

## 16. 测试结果

```text
npm run test:terrain
34 passed, 0 failed

tools/gis-converter/.venv/Scripts/python.exe -m pytest -q
28 passed, 0 failed, 13 warnings

npm run build
TypeScript + Vite build passed
```

覆盖了建筑点击拒绝、地形点合法、建筑 footprint、Rapier、SemanticMap、1.5 m 配置高度、建筑遮挡、路端点、真实交叉、bridge/tunnel/layer 隔离、路口拆段、近/远道路吸附、原始/吸附坐标、Dijkstra 多路径、3D 山地长度、断连道路、矩阵对称、null cost 和不做 MST。

## 17. 浏览器验收与已知 warning

已在本地页面验证四图标面板、V0.6-B2 空间分析面板、Traversal Profile、Max Road Snap 和五个 Road Debug 开关；Aspen 地形与其实际 buildings/roads 数据可正常完成加载，控制台没有运行时 error。

保留的非阻塞 warning：

- `KHR_materials_pbrSpecularGlossiness` 是旧 GLB 材质扩展提示；
- 某些无命名地形会回退使用最大 X-Z mesh；
- Vite 提示主 bundle 超过 500 kB；
- Python 测试含 rasterio 的 `PendingDeprecationWarning`。

## 18. 兼容性保证

本改动没有删除 V0.1～V0.6-A 的地形加载、编辑、restrict、多地形、建筑道路渲染、坐标检查、资产放置、胶囊控制、NavMesh 或实验接口。普通编辑和坐标功能继续使用既有 TerrainPicker；只有要求物理合法性的空间分析选点使用 PhysicalPointPicker。这样避免恢复为简单 TerrainPicker 穿透逻辑，同时不影响旧交互。
