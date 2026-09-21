# V0.5 OSM 建筑与道路导入：实现与验收报告

本文记录 V0.5 的实际实现、数据格式、代码入口、Aspen 转换结果和已知边界。用户操作总览见 [README](README.md)，代码分层见 [CODEBASE_GUIDE](CODEBASE_GUIDE.md)，CLI 参数见 [转换器说明](tools/gis-converter/README.md)。

## 1. 完成范围

V0.5 已打通如下完整链路：

```text
OSM / GeoJSON
  → 源 CRS 读取和几何检查
  → terrain metadata 指定的投影 CRS
  → terrain localOrigin 指定的局部 X/Z
  → terrain.json 双线性高度采样
  → buildings.local.json / roads.local.json
  → Three.js 建筑和道路图层
  → SemanticMap 道路/障碍语义
  → Rapier 建筑静态碰撞
  → Recast + 网格 A* 建筑阻挡
```

原始 GeoJSON 没有被覆盖。地形、建筑、道路也没有合并烘焙为一个 GLB；每个要素仍保留源 ID 和属性，便于查询、重绘、调试和未来编辑。

## 2. 目录树

下列是 V0.5 相关的完整目录；`node_modules`、构建产物和无关旧模块未展开：

```text
three-spatial-sim/
├─ V05_OSM_BUILDINGS_ROADS.md
├─ README.md
├─ CODEBASE_GUIDE.md
├─ public/assets/maps/terrain-demo/
│  ├─ manifest.json
│  └─ generated/aspen/
│     ├─ terrain.glb
│     ├─ terrain.json
│     ├─ metadata.json
│     └─ processed/
│        ├─ buildings.local.json
│        └─ roads.local.json
├─ src/
│  ├─ core/MultiTerrainSimulation.ts
│  ├─ gis/
│  │  ├─ VectorFeatureTypes.ts
│  │  ├─ TerrainHeightProvider.ts
│  │  ├─ BuildingLayer.ts
│  │  ├─ BuildingMaterial.ts
│  │  ├─ RoadLayer.ts
│  │  └─ RoadMaterial.ts
│  ├─ navigation/Pathfinder.ts
│  ├─ physics/TerrainPhysicsWorld.ts
│  ├─ render/DebugRenderer.ts
│  ├─ render/TerrainRegionOverlay.ts
│  ├─ semantic/SemanticMap.ts
│  ├─ semantic/SemanticRegion.ts
│  ├─ terrain/TerrainTypes.ts
│  └─ ui/V02ControlPanel.ts
├─ tests/terrain-regression.test.ts
└─ tools/
   ├─ runtime-smoke.mjs
   └─ gis-converter/
      ├─ README.md
      ├─ input/aspen/raw/
      │  ├─ aspen_buildings.geojson
      │  └─ aspen_roads.geojson
      ├─ gis_converter/
      │  ├─ cli.py
      │  ├─ utils.py
      │  ├─ vector_reader.py
      │  ├─ vector_crs.py
      │  ├─ vector_transform.py
      │  ├─ terrain_sampler.py
      │  ├─ geometry_utils.py
      │  ├─ vector_validator.py
      │  ├─ building_converter.py
      │  └─ road_converter.py
      └─ tests/
         ├─ test_vector_pipeline.py
         ├─ test_converter_integration.py
         ├─ test_crs.py
         ├─ test_resample.py
         └─ test_mesh_builder.py
```

## 3. 新增和修改文件

新增文件：

- `src/gis/VectorFeatureTypes.ts`
- `src/gis/TerrainHeightProvider.ts`
- `src/gis/BuildingLayer.ts`
- `src/gis/BuildingMaterial.ts`
- `src/gis/RoadLayer.ts`
- `src/gis/RoadMaterial.ts`
- `tools/gis-converter/gis_converter/vector_reader.py`
- `tools/gis-converter/gis_converter/vector_crs.py`
- `tools/gis-converter/gis_converter/vector_transform.py`
- `tools/gis-converter/gis_converter/terrain_sampler.py`
- `tools/gis-converter/gis_converter/geometry_utils.py`
- `tools/gis-converter/gis_converter/vector_validator.py`
- `tools/gis-converter/gis_converter/building_converter.py`
- `tools/gis-converter/gis_converter/road_converter.py`
- `tools/gis-converter/tests/test_vector_pipeline.py`
- `tools/runtime-smoke.mjs`
- `public/assets/maps/terrain-demo/generated/aspen/processed/buildings.local.json`
- `public/assets/maps/terrain-demo/generated/aspen/processed/roads.local.json`
- 本报告。

修改文件：

- `tools/gis-converter/gis_converter/cli.py`、`utils.py`
- `tools/gis-converter/tests/test_converter_integration.py`
- `tools/gis-converter/README.md`
- `src/core/MultiTerrainSimulation.ts`
- `src/terrain/TerrainTypes.ts`
- `src/physics/TerrainPhysicsWorld.ts`
- `src/navigation/Pathfinder.ts`
- `src/semantic/SemanticRegion.ts`、`SemanticMap.ts`
- `src/render/DebugRenderer.ts`、`TerrainRegionOverlay.ts`
- `src/ui/V02ControlPanel.ts`
- `public/assets/maps/terrain-demo/manifest.json`
- `tests/terrain-regression.test.ts`
- `README.md`、`CODEBASE_GUIDE.md`

## 4. CRS 与 localOrigin

转换器从 GeoJSON 的 CRS 声明读取源坐标系，并从目标地形 `metadata.json` 读取 `projectedCRS`。Aspen 当前是 `EPSG:32613`，但代码没有硬编码该值。`pyproj.Transformer(..., always_xy=True)` 保证经度/东向坐标在前。

建筑和道路禁止自行计算局部原点，统一使用 metadata 中：

```text
originEasting   = 343380.5116724485
originNorthing  = 4339223.202138869
originElevation = 2376.56298828125
```

投影坐标到平台坐标的公式为：

```text
x = easting - originEasting
y = elevation - originElevation
z = originNorthing - northing
```

因此坐标约定始终为 X 向东、Y 向上、Z 向南。纬度/北向坐标增加时，本地 Z 必须减小；对应单元测试专门防止南北镜像。

## 5. Terrain height sampling

Python `terrain_sampler.py` 和前端 `TerrainHeightProvider.ts` 都读取 `terrain.json` 的 `origin`、`width`、`depth`、`rows`、`cols` 与 `heights`，把局部 X/Z 映射到浮点 row/col，再对四个格点做双线性插值。道路因此不会按最近格点形成明显台阶。

约 5.04% Aspen 网格样本属于 NoData/有效 DEM 支撑之外。转换器仍使用 `terrain.json` 中已填充的有限高度，确保输出没有 NaN/Infinity，同时把 `VECTOR_ON_MASKED_TERRAIN` 计入警告。前端部署和导航仍读取 `sampleCoverage`，不会把有限的填充值误当成可用地块。

## 6. 建筑转换

流程如下：

1. 接受 `Polygon` 和 `MultiPolygon`，其他几何输出 warning 并跳过。
2. 清理重复点、检查有限值/最少顶点/自交，保留 outer ring 与 inner rings。
3. 从源 CRS 转到目标投影 CRS，再应用 terrain localOrigin。
4. 完全在地形外的 polygon 跳过；部分相交的 polygon 裁剪到 local bounds。
5. 对 footprint 顶点采样地形，默认以中位数作为 `baseHeight`；CLI 也支持 `min`、`mean`。
6. `height` 可解析时直接使用米值；否则使用 `building:levels × defaultFloorHeight`；两者都没有则使用 fallback。
7. 输出 source feature ID、source type、完整源属性、rings、采样高度、baseHeight 和 extrudeHeight。
8. 前端把外环传给 `THREE.Shape`，内环传给 `Shape.holes`，再用 `ExtrudeGeometry` 向上挤出并合并渲染。

默认高度规则：

```text
height                 → 原值（米）
building:levels        → levels × 3.0m
无 height / levels      → 9.0m
```

可通过 `--default-floor-height`、`--default-building-height` 和 `--building-base-strategy` 修改。

## 7. 道路转换

流程如下：

1. 接受 `LineString` 和 `MultiLineString`，保留每一段及源属性。
2. 转到目标投影 CRS和同一 localOrigin。
3. 完全在外的线跳过，部分相交的线使用线段裁剪保留地形内部分。
4. 长线段按最大 10m 插入点；每个点重新双线性采样地形高度。
5. 输出 Y 为 `terrainY + 0.05m`，避免道路与地形 z-fighting。
6. 前端根据中心线切向生成左右两侧顶点和三角形，得到有真实宽度的 ribbon，而不是无宽度的 `THREE.Line`。

默认 highway 宽度：

| highway | 宽度 |
| --- | ---: |
| motorway | 12m |
| trunk | 11m |
| primary | 10m |
| secondary | 8m |
| tertiary | 7m |
| residential | 6m |
| service / living_street | 4m |
| cycleway | 2.5m |
| footway | 2m |
| path | 1.5m |
| track | 3m |
| 未识别 | 4m |

存在有效 `lanes` 时也会参与宽度估算。CLI 可用 `--road-height-offset` 和 `--road-max-segment-length` 调整。

## 8. Semantic Map、Rapier 与导航

`VectorFeatureTypes.ts` 将道路注册为 `road` 语义，将建筑 footprint 注册为 `obstacle`。道路中 motorway/trunk 不标记为步行区域，其他道路按可步行/可行驶语义处理。`SemanticMap` 使用 48×48 空间桶缩小候选集合，避免每次点查询都遍历数千个建筑。

Rapier 在一个固定刚体上为每个建筑创建简化 AABB cuboid collider。这样比数千个复杂 trimesh/凸包更稳定、成本更低；调试开关 `Building Collision` 显示这些近似盒。真实碰撞始终生效，隐藏调试线框不会关闭 collider。

Recast 仍从 terrain heightfield 生成基础可行走面；路径交付前，`Pathfinder` 对每个路径段检查建筑 obstacle 和人工 Restrict 的精确相交。如果 Recast 候选穿越建筑则改走网格 A*，A* 的每条邻边也执行相同拦截。因此 Agent 不会把建筑内部当作捷径。道路语义的 movement cost 为 1，可作为优先通行区域。

## 9. 前端加载和调试

Aspen descriptor 声明：

```json
{
  "buildings": "generated/aspen/processed/buildings.local.json",
  "roads": "generated/aspen/processed/roads.local.json"
}
```

切换地形时先读 terrain，再并行读取声明的矢量 JSON；结构校验通过后，先注册语义，再创建图层和建筑碰撞，最后构建导航。声明了文件但下载/解析失败会让切换明确失败，不会悄悄省略城市图层。

右侧开关包括 Buildings、Roads、Building Collision、Road Width Debug 和 Terrain Height Samples。建筑/道路开关只改变显示；语义和碰撞继续参与仿真。高度采样开关同时显示建筑采样点与道路中心线采样点，可用于检查整体偏移、90° 旋转、南北镜像和悬空。

## 10. Aspen 实际转换结果

地形：`aspen_dem`，投影 `EPSG:32613`，网格 110×128，局部范围约 3784.51m × 3258.88m。

| 数据 | 原始要素 | 原始类型 | 输出要素 | 无效 | 越界跳过 | masked warning |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| Buildings | 2623 | 2623 MultiPolygon | 2328 | 0 | 295 | 38 |
| Roads | 483 | 483 LineString | 483 | 0 | 0 | 2 |

补充实测：

- 输出建筑中有 14 个包含 holes；MultiPolygon 的各 polygon 均保留。
- 建筑局部范围为 X `[-1892.2546, 1688.9663]`，Z `[-1629.4414, 1509.7615]`。
- 道路局部范围为 X `[-1332.1651, 973.3307]`，Z `[-856.1741, 1629.4414]`。
- 前 10 个建筑记录的地形采样高度复算最大误差为 0.0m。
- 前 10 个道路点按 `terrainY + 0.05m` 复算最大误差为 0.0m。
- 道路输出包含 8219 个加密地形采样点。
- `buildings.local.json` 约 14.75MB；`roads.local.json` 约 3.64MB。

浏览器运行时冒烟检查结果：成功切换 `aspen_dem`；加载 2328 个建筑、483 条道路；建筑内点返回 `obstacle`；两个图层开关存在；加载屏正常退出；整个场景没有非有限 geometry/instance matrix，控制台没有本次 Aspen 切换产生的错误。

## 11. 自动化测试结果

Python：

```text
28 passed, 13 warnings in 2.36s
```

13 条 warning 均来自 rasterio 的 `PendingDeprecationWarning`，不是转换失败。测试覆盖 CRS、projected-to-local、Z 向南、三种建筑高度规则、建筑底高中位数、holes、MultiPolygon、道路宽度/贴地、MultiLineString、越界裁剪和 Aspen 对齐。

TypeScript：

```text
14 tests passed
```

测试覆盖矢量集合校验、holes、道路 ribbon、语义障碍、高度采样南北方向、Rapier 建筑射线碰撞，以及既有地形/水体/禁区/路径/胶囊体回归。

生产构建：`npm run build` 通过。Vite 会提示 chunk 大于 500kB，这是 Three.js、Rapier、Recast 和数据处理代码的打包体积提示，不影响正确性。

## 12. 已知限制和 warning

- 建筑 Rapier collider 与语义 footprint 采用性能优先的简化表示。旋转、凹形建筑的 AABB 可能比可见外形略大；建筑 courtyard holes 在视觉上正确，但碰撞/阻挡不会开放庭院内部。
- 道路是地表 ribbon 和语义优选区域，本版没有创建车辆物理、路口拓扑、单行交通规则或独立道路 collider。
- 地形和道路仍是 2.5D，一个 X/Z 只能有一个地面高度，不能表达桥下通行、隧道或上下叠层道路。
- OSM 属性可能缺失或格式不统一；转换器保留 raw/source properties，并按明确 fallback 生成可用高度和宽度。
- 14.75MB 建筑 JSON 首次解析和几何合并需要时间；后续可考虑二进制格式、Web Worker、分块加载或 LOD，但不应牺牲结构化属性与语义可追踪性。
- Vite chunk-size warning 和 rasterio deprecation warning 已如实保留；核心数据错误不会被 `except: pass` 或静默 fallback 隐藏。

## 13. 如何复验

在 `tools/gis-converter` 中运行 `vector-inspect`、上述两个 `vector-convert` 命令和：

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

回到项目根目录：

```powershell
npm run test:terrain
npm run build
npm run dev
```

浏览器选择 `aspen_dem`，依次检查 Buildings、Roads、Building Collision、Road Width Debug、Terrain Height Samples。点击建筑外的合法地面设置路径，确认胶囊不穿建筑；建筑内部不应成为有效终点。开启高度点核对道路贴地，开启宽度边界核对不同道路等级，开启碰撞盒核对 Rapier 近似范围。
