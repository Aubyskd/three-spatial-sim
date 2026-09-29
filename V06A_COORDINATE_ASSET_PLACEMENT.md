# Three Spatial Sim V0.6-A：坐标系统与坐标资产放置交付说明

本文记录 V0.6-A 的设计、使用方法、文件变更和实际验收结果。功能范围严格限定为“统一坐标系统 + 通过坐标部署资产”；可见性分析、Visibility Matrix、Graph 点选、Path-based graph 和 MST 不属于本版本，也没有混入实现。

## 1. 实现结果

当前页面已支持：

- 鼠标经过真实地形时实时显示 Local、Projected 和 WGS84 经纬度；离开画布或没有命中地形时显示明确状态。
- Local / Projected / Longitude-Latitude 三种输入方式部署信号塔。
- 自动读取地形 Y，或手工填写 Local Y / 绝对高程。
- 从地图点选坐标、半透明预览、正式部署、复制坐标和坐标调试图层。
- 所有坐标部署继续经过现有 `PlacementValidator`，没有直接向 scene 写入正式资产。
- 地形切换同步更新 CRS、原点、边界、拾取 Mesh、高度提供器和 UI 状态。
- 资产导出附带活动地形的 `coordinateReference`。
- 普通 GLB 在缺少 GIS metadata 时使用 Local-only 模式，不伪造 UTM 或经纬度。

世界尺度保持不变：`1 Three.js world unit = 1 meter`。地图在屏幕中的大小仅由相机、投影和 viewport 决定，没有对 scene 或活动 terrain 做视觉压缩缩放。

## 2. 新增与修改文件

### 新增文件

| 文件 | 职责 |
| --- | --- |
| `src/spatial/CoordinateService.ts` | 四套坐标的统一转换、metadata 配置、边界检查和坐标引用导出。 |
| `src/spatial/TerrainPicker.ts` | 将屏幕鼠标坐标射线拾取为活动地形上的 Local 坐标。 |
| `src/spatial/CoordinateDebugLayer.ts` | 坐标点、局部原点、地形边界、世界轴和百米网格。 |
| `src/assets/CoordinateAssetPlacer.ts` | 解析三种坐标输入、解析 Y、调用既有校验与资产管理器。 |
| `src/ui/CoordinatePanel.ts` | Inspector、复制、输入、拾取、预览、部署及 Debug UI。 |
| `tests/coordinate-regression.test.ts` | 坐标、拾取、放置、预览和地形切换的回归测试。 |
| `V06A_COORDINATE_ASSET_PLACEMENT.md` | 本交付说明。 |

### 本任务修改文件

| 文件 | 修改内容 |
| --- | --- |
| `src/core/MultiTerrainSimulation.ts` | 装配坐标模块、处理 pointer move/pick、预览/部署、切换地形和资产坐标导出。 |
| `src/assets/AssetPlacementManager.ts` | 支持显式 Local XYZ 放置，并保存 `terrain/manual` 高程模式。 |
| `src/terrain/TerrainTypes.ts` | 加入 `COORDINATE_PICK` 交互模式和资产 `heightMode`。 |
| `src/terrain/TerrainManager.ts` | 同时读取旧资产数组和带 `coordinateReference` 的新导出包装。 |
| `src/render/SceneSetup.ts` | 移除始终可见的旧网格/坐标轴，改由坐标 Debug 开关控制。 |
| `src/render/ThreeRenderer.ts` | viewport 计算包含新的坐标面板。 |
| `src/ui/V02ControlPanel.ts` | 功能版本标题更新为 V0.6-A。 |
| `src/styles/main.css` | 坐标面板、字段、状态、响应式布局和滚动样式。 |
| `package.json` / `package-lock.json` | 增加 `proj4`，把坐标回归测试加入 `test:terrain`。 |
| `tools/runtime-smoke.mjs` | 增加 Aspen CRS、转换、预览无污染、部署及坐标 Debug 的浏览器验收。 |
| `README.md` / `CODEBASE_GUIDE.md` | 更新中文使用方法、数据流和文件职责。 |

没有为本任务删除旧功能或旧模块；旧版 Local 资产数组仍可加载。

## 3. 当前项目目录树

下列树列出源码、测试、资源和工具的完整功能分区；`node_modules/`、`dist/` 与构建缓存不展开。

```text
three-spatial-sim/
├─ src/
│  ├─ main.ts
│  ├─ core/
│  │  ├─ MultiTerrainSimulation.ts
│  │  ├─ FixedTimeStep.ts
│  │  ├─ Simulation.ts
│  │  ├─ World.ts
│  │  └─ Entity.ts
│  ├─ spatial/
│  │  ├─ CoordinateService.ts
│  │  ├─ TerrainPicker.ts
│  │  └─ CoordinateDebugLayer.ts
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
│  │  ├─ TerrainHeightProvider.ts
│  │  ├─ VectorFeatureTypes.ts
│  │  ├─ BuildingLayer.ts
│  │  ├─ BuildingMaterial.ts
│  │  ├─ RoadLayer.ts
│  │  └─ RoadMaterial.ts
│  ├─ assets/
│  │  ├─ CoordinateAssetPlacer.ts
│  │  ├─ AssetPlacementManager.ts
│  │  ├─ PlacementValidator.ts
│  │  ├─ AssetRegistry.ts
│  │  ├─ SignalTowerFactory.ts
│  │  └─ GeneratedAssetFactory.ts
│  ├─ ui/
│  │  ├─ CoordinatePanel.ts
│  │  ├─ FloatingPanel.ts
│  │  ├─ V02ControlPanel.ts
│  │  ├─ ExperimentPanel.ts
│  │  ├─ RegionEditor.ts
│  │  └─ ControlPanel.ts
│  ├─ render/
│  │  ├─ ThreeRenderer.ts
│  │  ├─ SceneSetup.ts
│  │  ├─ DebugRenderer.ts
│  │  ├─ DynamicWaterSystem.ts
│  │  ├─ TerrainRegionOverlay.ts
│  │  └─ ModelLoader.ts
│  ├─ physics/
│  │  ├─ TerrainPhysicsWorld.ts
│  │  ├─ CharacterController.ts
│  │  ├─ PhysicsWorld.ts
│  │  └─ ColliderFactory.ts
│  ├─ navigation/
│  │  ├─ TerrainNavMeshManager.ts
│  │  ├─ Pathfinder.ts
│  │  ├─ NavigationDebug.ts
│  │  └─ NavMeshManager.ts
│  ├─ semantic/
│  │  ├─ SemanticMap.ts
│  │  ├─ SemanticRegion.ts
│  │  └─ ManualOverride.ts
│  ├─ agent/
│  │  ├─ Agent.ts
│  │  └─ AgentController.ts
│  ├─ algorithm/
│  │  ├─ Environment.ts
│  │  ├─ EnvironmentConfig.ts
│  │  ├─ EnvironmentError.ts
│  │  ├─ AlgorithmEnvironmentAcceptance.ts
│  │  ├─ Action.ts
│  │  ├─ Observation.ts
│  │  ├─ action/{Action,ActionSpace,ActionValidator}.ts
│  │  ├─ state/{WorldState,Observation,ObservationBuilder}.ts
│  │  ├─ constraint/{Constraint,ConstraintEngine,ConstraintResult}.ts
│  │  ├─ objective/{Objective,ObjectiveEngine,RewardCalculator}.ts
│  │  ├─ metrics/{Metrics,MetricsCollector}.ts
│  │  ├─ experiment/{ExperimentConfig,ExperimentResult,ExperimentRunner,SeedManager}.ts
│  │  └─ baseline/RandomSearchBaseline.ts
│  ├─ evaluation/{CoverageEvaluator,SpatialEvaluator}.ts
│  ├─ bridge/{AlgorithmBridge,LocalBridge,MessageProtocol}.ts
│  ├─ tasks/{Task,SignalTowerOptimizationTask}.ts
│  ├─ map/{MapTypes,MapLoader,DemoMapAdapter,TerrainBuilder}.ts
│  ├─ config/constants.ts
│  ├─ types/index.ts
│  └─ styles/main.css
├─ tests/
│  ├─ coordinate-regression.test.ts
│  └─ terrain-regression.test.ts
├─ public/assets/maps/terrain-demo/
│  ├─ manifest.json
│  ├─ source/               # Coastal / Valley GLB
│  ├─ data/                 # 两张 GLB 地形的语义/资产 JSON
│  └─ generated/aspen/      # DEM、metadata 和 OSM 转换结果
├─ tools/
│  ├─ gis-converter/        # GeoTIFF/GeoJSON 转换与 Python 测试
│  └─ runtime-smoke.mjs     # 浏览器运行时冒烟验收
├─ README.md
├─ CODEBASE_GUIDE.md
├─ V05_OSM_BUILDINGS_ROADS.md
├─ V06A_COORDINATE_ASSET_PLACEMENT.md
├─ package.json
├─ vite.config.ts
└─ tsconfig*.json
```

## 4. 四套坐标系统

| 坐标系统 | 字段与单位 | 用途 |
| --- | --- | --- |
| Geographic | longitude、latitude（EPSG:4326），可带 elevation | 输入、显示和 GIS 数据交换。 |
| Projected | Easting、Northing、Elevation，米 | 活动地形 metadata 指定的米制投影，如 Aspen 的 EPSG:32613。 |
| Local World | X、Y、Z，米 | 资产位置、距离、导航、物理和算法的唯一真实坐标。 |
| Screen | pixel X、pixel Y | 鼠标、UI、射线和标签；不参与空间距离或物理。 |

Local 方向固定为：

```text
+X = East
+Y = Up
+Z = South
Local Origin = (0, 0, 0)
```

### Local 与 Projected

在 `verticalScale = 1` 的常规米制数据上：

```text
X = Easting - originEasting
Y = Elevation - originElevation
Z = originNorthing - Northing

Easting = X + originEasting
Northing = originNorthing - Z
Elevation = Y + originElevation
```

实现同时读取 metadata 的 `verticalScale`，因此垂直方向会按 metadata 做可逆换算；地形平面仍严格保持一单位一米。

### Geographic 与 Projected

`CoordinateService` 使用成熟的 `proj4` 库在 `EPSG:4326` 与当前 `metadata.projectedCRS` 间转换。CRS 与转换器在地形提交时构建并缓存，pointer move 不会反复解析 metadata 或创建投影对象。业务代码没有硬编码 Aspen 的 EPSG 或原点。

### Screen 与 Local

`worldToScreen()` 使用相机投影矩阵和真实 viewport；`screenToWorldRay()` 将像素转换为 NDC 再创建射线。`TerrainPicker` 复用一个 `Raycaster`，且只调用当前 terrain mesh 的求交，不与建筑、道路、资产、Agent 或 Debug 对象求交。

## 5. CoordinateService 设计

`CoordinateService` 是坐标转换的唯一入口，主要 API 为：

```ts
configure(metadata)
configureLocalOnly(bounds)
localToProjected() / projectedToLocal()
localToGeographic() / geographicToLocal()
projectedToGeographic() / geographicToProjected()
worldToScreen() / screenToWorldRay()
containsLocal() / assertWithinLocalBounds()
exportReference()
```

`configure()` 严格检查 terrain ID、CRS、米制单位、east/up/south 方向、原点、边界和 verticalScale。空字符串、NaN、Infinity、非法经纬度和越界位置都有明确错误码；关键坐标错误不会被静默吞掉。没有 metadata 时调用 GIS 转换会返回 `CRS_NOT_CONFIGURED`。

Local 是资产位置的 single source of truth。Projected 和 Geographic 只在显示、输入和导出时计算，不在资产上维护三份可能漂移的状态。

## 6. TerrainPicker 与实时 Inspector

`TerrainPicker.setActiveTerrain()` 在地形切换时替换唯一射线目标。鼠标移动由 `requestAnimationFrame` 节流：

```text
client pixel → active terrain raycast → Local XYZ
             → CoordinateService → Projected → Lon/Lat
             → CoordinatePanel
```

精度为 Local 2 位、Projected 2 位、经纬度 6 位。`Copy Local / Projected / LonLat` 复制当前显示坐标。点击选择只更新同一个 marker，不会不断创建对象；marker、原点、边界、坐标轴和网格均不加入物理、导航或语义。

## 7. Coordinate Asset Placement 使用方法

1. 选择资产类型，目前为 Signal Tower。
2. 选择 Local、Projected 或 Lon/Lat；没有 GIS metadata 时只能选择 Local。
3. 填写水平坐标，或按 `Pick From Map` 后点击地形。
4. 选择 `Auto Terrain Y` 或 `Manual Y/Elevation`。
5. 按 `Preview` 检查半透明 ghost 和结果码。
6. 按 `Deploy` 正式加入状态、Three.js 与 Rapier。

Auto 模式将输入统一换成 Local X/Z，再调用现有 `TerrainHeightProvider.heightAt(x,z)` 双线性采样当前地形高度。Manual 模式下，Local 输入的 Y 就是 Local Y；Projected/LonLat 输入的是绝对 elevation，再减去 origin elevation 并应用 verticalScale。

Preview 与 Deploy 共用同一解析和校验路径。Preview 只创建临时 ghost，不调用 `placeAt()`，所以不会改变资产数组、物理、语义或保存状态。Deploy 最终调用 `AssetPlacementManager.placeAt()`；资产恢复时会保留 manual/terrain 高程模式。

## 8. PlacementValidator 接入

三种坐标模式最终都走同一条链路：

```text
input → CoordinateService → Local X/Y/Z → bounds
      → TerrainHeightProvider（Auto Y）
      → AssetPlacementManager.validate()
      → PlacementValidator
      → AssetPlacementManager.placeAt()（仅 Deploy）
```

校验覆盖有效地形支撑、水域、Restrict、障碍/建筑、坡度、已放资产碰撞和未知资产。典型结果码包括 `INVALID_COORDINATE`、`OUTSIDE_TERRAIN_BOUNDS`、`NO_TERRAIN_SUPPORT`、`BUILDING_COLLISION`、`NON_WALKABLE`、`WATER`、`ASSET_COLLISION` 与 `SLOPE_TOO_STEEP`。

## 9. 地形切换与导出

新 Runtime 提交时依次更新：CoordinateService metadata/local bounds、TerrainPicker active mesh、CoordinateDebugLayer、CoordinatePanel CRS 状态和绑定当前 TerrainHeightProvider 的 CoordinateAssetPlacer。旧预览、旧选择点和旧输入会清除，避免跨地形误部署。

资产导出格式：

```json
{
  "coordinateReference": {
    "projectedCRS": "EPSG:32613",
    "units": "meters",
    "localOrigin": {
      "easting": 343380.5116724485,
      "northing": 4339223.202138869,
      "elevation": 2376.56298828125
    },
    "coordinateConvention": { "x": "east", "y": "up", "z": "south" },
    "verticalScale": 1,
    "localBounds": {}
  },
  "assets": []
}
```

示例数值仅用于说明 Aspen；实际导出全部来自当前 terrain。Local-only 地形的 `projectedCRS` 和 `localOrigin` 为 `null`。读取端兼容上述对象和旧版 `PlacedAsset[]`。

## 10. 测试与实际验收

### Aspen integration smoke test

在实际页面切换到 `aspen_dem` 后读取到 `EPSG:32613`。以：

```text
Local X = 100
Local Z = -200
```

运行时得到：

```text
Easting  = 343480.5116724485
Northing = 4339423.202138869
```

与 `originEasting + 100`、`originNorthing + 200` 完全一致，确认 `+Z = South`。同一浏览器验收还确认：Aspen 2328 个建筑与 483 条道路加载、预览前后正式资产数均为 0、Deploy 后为 1、坐标 Debug 已挂载、没有无效几何或浏览器运行错误。

### 自动测试

执行：

```powershell
npm run test:terrain
```

结果：`24 passed, 0 failed`。其中 10 项为 V0.6-A 坐标回归，覆盖 Local/Projected、Local/Geographic 往返、南向 Z、一单位一米、TerrainPicker、边界/经纬度校验、world/screen、Auto/Manual Y、三种坐标部署、Preview 无状态污染和地形切换；其余 14 项验证原有水体、编辑、Restrict、路径、GIS、胶囊体和建筑 trimesh 碰撞没有回归。

### 生产构建

执行：

```powershell
npm run build
```

结果：TypeScript 检查与 Vite 构建成功，188 个模块完成转换。

已知 warning：生产主 chunk 约 3.81 MB，Vite 提示 minify 后存在超过 500 kB 的 chunk。它是既有依赖与打包拆分建议，不影响本次功能或构建成功；后续可用 dynamic import/manualChunks 优化。Windows 受限沙箱可能阻止 Node/esbuild 创建子进程并报 `spawn EPERM`，在正常终端或授权环境运行即可。

## 11. 明确边界

- 本版本没有实现观测点/被观测点、Visibility Matrix、Graph 点选、Path-based graph 或 MST。
- 坐标面板部署继续使用 V0.2 `PlacementValidator`；左侧算法实验继续使用 `ConstraintEngine`，没有暗中改变实验约束。
- 普通 GLB 没有 CRS 时只能证明 Local 米制坐标，不能从模型本身推导真实经纬度。
- 当前 terrain 仍是 2.5D heightfield；同一 X/Z 只能有一个地形高度。
- 核心 metadata、投影、数值、边界和放置错误都会显式返回或中止当前操作，不会悄悄回退到伪造 CRS、旧地形坐标或直接 scene.add。
