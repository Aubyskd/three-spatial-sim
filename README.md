# Three Spatial Sim：项目说明与中文使用手册

Three Spatial Sim 是浏览器中的三维空间仿真平台：Three.js 展示地形、水面、OSM 建筑/道路、胶囊体和塔站，Rapier 处理物理碰撞，Recast 与网格 A* 规划路径；算法环境可评估和优化信号塔布局。本文按当前源码编写。仓库已经包含 V0.6-B 可见性矩阵与最短路径全可达图、V0.6-A 坐标检查与按坐标放置资产、V0.5 GIS/OSM 导入以及此前的交互改进；`package.json` 中的 `0.1.0` 只是 npm 包版本。

阅读实现请看 [代码与目录导读](CODEBASE_GUIDE.md)；转换 DEM 的完整实操请看 [GeoTIFF 接入步骤](tools/GIS_GeoTIFF_地形转换与平台接入步骤.md)。

## 1. 安装与启动

需要 Node.js 20.19+ 或 22.12+。在项目根目录运行：

```powershell
npm install
npm run dev
```

浏览器打开终端显示的本地地址，通常是 `http://localhost:5173/`。首次加载大型模型、构建碰撞和导航数据需要一些时间。

| 命令 | 作用 |
| --- | --- |
| `npm run build` | TypeScript 检查并生成 `dist/` 生产文件。 |
| `npm run preview` | 预览已构建的版本；先执行 build。 |
| `npm run test:terrain` | 运行可见性/可达图、坐标转换与放置，以及地形、水体、禁区、路径、碰撞和胶囊体回归测试。 |

仅开发验收时，可访问 `/?algorithmSelfTest=1`，页面会显示算法环境自检报告；正常使用不需要该参数。

## 2. 界面和基本操作

中央是三维画布，右侧是“算法空间仿真”控制面板，左侧是“空间优化实验”。鼠标左键拖动旋转视角、滚轮缩放、右键拖动平移。画布上的**左键短按**用于选择位置；拖动不会设置路径终点。平台为右手坐标系，Y 向上，X/Z 是地平面，局部单位为米。

右上角的四个图标依次打开“算法空间仿真”“空间优化实验”“Coordinate Inspector”和“Visibility & Reachability”。启动时只显示图标栏；点击一个图标会打开对应浮动面板，并自动关闭此前打开的面板，避免遮挡场景。活动图标会高亮，面板右上角 `×` 或再次点击活动图标可关闭。按住面板标题栏仍可拖动到窗口内任意位置，双击标题栏也可关闭。面板的点击、滚动和拖动事件与 Three.js 画布隔离，拖动面板不会旋转、平移或改变相机投影。

右侧 `FPS` 是画面帧率，`AGENT` 和 `TARGET` 显示 X/Z 坐标，`PATH` 显示空闲、规划、移动、到达或阻塞状态。

### 设置路径终点

退出编辑/放置模式后，单击有效地形表面。平台检查有效地形支撑、语义区域和导航可达性，通过后显示目标和路径，胶囊体自动前往。水域、障碍、Restrict 禁区及无有效地形支撑的位置不能作为终点。路线的每段也会检测是否穿过 Restrict；Recast 路线不合格时尝试网格 A* 绕行，确实无路可走时提示失败，而不交付穿越禁区的路径。

`Reset Simulation` 复位胶囊体、速度、目标、路径和仿真计时，但**不删除**地形编辑、禁区或塔站。`定位胶囊体` 聚焦当前胶囊体，`Focus Terrain` 聚焦整张地形。

### 重新部署胶囊体

按 `重新部署胶囊体`，移动鼠标：绿色环表示可部署，红色环表示不可部署；在合法位置单击即完成。校验包括地形支撑、高度、坡度、水域/禁区及资产占位。操作会清除旧目标和路径，同时更新本次会话的重置出生点，因此以后按 Reset 会回到新位置。再次按按钮或 `Esc` 可取消。地形经笔刷修改后，部署校验读取点击位置的当前地形，不只看旧导航格中心。

### 画幅大小和胶囊大小

“画面与胶囊体”有互相同步的滑块与数字框；数字框输入后按 Enter 或移开焦点生效。

| 控件 | 范围 / 默认值 | 效果 |
| --- | --- | --- |
| 画幅大小 | 25°～90° / 52° | 调整相机透视视场角 FOV。角度越大，同一距离看到的范围越广；**不改变**像素分辨率或地形尺寸。 |
| 胶囊大小 | 高度 0.9～5.4 m / 1.8 m | 同步改变可见胶囊、Rapier 碰撞体和离地偏移；改变大小会停止当前路径，需要重新点目标。 |

公里级 GIS 地形上的胶囊体可能很小，可用“定位胶囊体”；远景定位标记不放大胶囊本体。

### 坐标检查与按坐标放置资产（V0.6-A）

右侧独立的 `Coordinate Inspector / Asset Placement` 面板负责坐标查看、转换和精确放置。平台统一采用右手局部坐标：**+X 向东、+Y 向上、+Z 向南，1 个世界单位 = 1 米**。鼠标移到当前地形表面时，Inspector 会实时显示：

- `Local`：平台局部 X/Y/Z，显示 2 位小数；任何地形都可用。
- `Projected`：当前 GIS 地形的投影 Easting/Northing/Elevation，显示 2 位小数。
- `Lon/Lat`：WGS84 经度/纬度/高程，经纬度显示 6 位小数。

每一行的 `Copy` 可复制该组数值。Projected 和 Lon/Lat 只有在当前地形具有合法 `metadata.json`、`projectedCRS` 和 `localOrigin` 时才启用；普通 GLB 地形会明确显示为仅支持 Local，不会猜测或伪造经纬度。

按坐标放置信号塔的步骤：

1. 在面板选择 `Signal Tower` 和输入模式：`Local`、`Projected` 或 `Lon/Lat`。两个横向输入框会随模式表示 X/Z、Easting/Northing 或 Longitude/Latitude。
2. 选择 `Auto Terrain Y` 时，高程由当前 `TerrainHeightProvider` 在地形高度网格上双线性采样；选择 `Manual Y/Elevation` 时可填写局部 Y 或绝对投影高程。
3. 可直接填写数值，也可按 `Pick From Map` 后单击当前地形。拾取只射线检测活动地形，不会误选建筑、塔或调试层；结果同时更新输入、坐标标记和三套坐标读数。
4. 按 `Preview` 查看半透明预览。预览不会新增资产、碰撞体或保存状态；绿色表示通过，红色表示不可放置。
5. 按 `Deploy` 正式部署。系统依旧经过现有 `PlacementValidator`，检查地形边界、有效支撑、水域、Restrict、坡度和资产碰撞；失败会显示明确原因。

面板的调试开关可分别显示 `Coordinate Marker`、`Local Origin`、`Terrain Bounds`、`World Axes` 和 `100 m Grid`。它们只帮助核对坐标，不参与导航、语义或物理。切换地形时，坐标服务、拾取目标、CRS、原点、边界和面板输入会一起重置，避免旧地形坐标被误用。

`Export Assets` 现在导出一个对象，而不只是数组：

```json
{
  "coordinateReference": {
    "projectedCRS": "EPSG:32613",
    "units": "meters",
    "coordinateConvention": { "x": "east", "y": "up", "z": "south" },
    "localOrigin": { "easting": 343380.51, "northing": 4339223.20, "elevation": 2376.56 },
    "verticalScale": 1,
    "localBounds": {}
  },
  "assets": []
}
```

具体值来自当前活动地形；仅 Local 地形的投影字段为空。加载逻辑同时兼容旧的纯资产数组和新包装格式。实现与验收细节见 [V0.6-A 坐标与资产放置交付说明](V06A_COORDINATE_ASSET_PLACEMENT.md)。

### 可见性矩阵与最短路径全可达图（V0.6-B）

`Visibility & Reachability` 是独立可拖动面板，和坐标工具共用同一个 `TerrainPicker` 与局部米制坐标。所有点都必须由当前活动地形表面拾取；建筑、道路、资产和调试图元不会成为点击基础面。短按添加点，拖动视角不会误选；`Esc` 停止选点，选点时 `Backspace` 撤销当前类型最后一点。

可见性分析步骤：

1. 填写 `Observer Count` 与 `Target Count`，并设置两类点的高度。默认都是 1.50 m，但它们是传入算法的配置值，不是算法内部常量；`Ray Epsilon` 默认 0.01 m。
2. 按 `Select Observers`，在地形上选择 O1、O2……达到数量后自动停止；点错可按该行 `Undo` 或 `Clear`。再用相同步骤选择 T1、T2……。
3. 按 `Compute Visibility`。算法从地面点加 Observer 高度发射到目标地面点加 Target 高度的射线，**只把当前地形的建筑网格当作遮挡物**；地形、道路、树、资产和车辆当前都不遮挡。
4. 矩阵行是 Observer，列是 Target；`1` 表示没有建筑遮挡，`0` 表示射线在目标之前击中建筑。场景中实线/虚线及 `VISIBLE`/`BLOCKED` 标签用于检查每一对点。
5. 可导出 JSON 或 CSV；JSON 还包含点、配置、距离和命中建筑信息。改变点位后旧结果自动失效，`Clear Result` 只清结果和射线，不删除点。

可达图步骤：

1. 先输入 `Node Count = N` 和 `Max Nav Snap`。按 `Select Graph Nodes` 后选择 P1…PN；如果点击处到最近可导航位置超过阈值，会报告 `NO_NEARBY_NAVMESH`，不会远距离偷偷吸附。
2. 每个节点同时保留原始地形点、吸附后的导航点与吸附距离。达到 N 个点后自动结束选点。
3. 按 `Build Full Graph`。系统只计算每一对 `i < j`，因此总任务数为 `N(N-1)/2`；进度显示已完成 pair，可按 `Cancel` 中止。
4. Pathfinder 同时检查当前可用的 Recast 与三维几何代价 A* 候选。边 cost 是候选中**实际折线路径长度最短**者，单位米，不是端点直线距离，也不是路点数量。边保留完整 shortest-path 几何，地图绘制真实路径和长度。
5. 结果是无向的完整加权可达图：所有可达 pair 都保留，不可达 pair 没有边。邻接矩阵对称，主对角为 0；cost matrix 对称、主对角为 0、不可达为 `null`（界面显示 `∞`）。本版本明确**不做 MST**，不会因为边 cost 较高而删除合法边。
6. JSON 包含节点、边、真实路径、邻接矩阵和 cost matrix；CSV 分 metadata、nodes、edges、adjacency matrix、cost matrix 五段导出。`Clear`/`Undo` 可重选节点，`Clear Result` 清图结果。

切换或重新加载地形时，三类点、矩阵、图、射线与路径调试线会全部清空，并换用新地形的 BuildingLayer、NavMesh 和 Pathfinder。地形编辑会清除全部空间分析状态；禁区、资产或导航发生变化时，旧可达图会被清除，避免展示失效路径。更详细的数据结构和验收记录见 [V0.6-B 可见性与可达图交付说明](V06B_VISIBILITY_REACHABILITY_GRAPH.md)。

## 3. 地形：选择、识别、重新加载

`Current Terrain` 选项由 [manifest.json](public/assets/maps/terrain-demo/manifest.json) 自动生成。当前清单包含：

| ID | 界面名称 | 来源 |
| --- | --- | --- |
| `terrain-01` | Coastal Terrain | `source/terrain1.glb` |
| `terrain-02` | Valley Terrain | `source/terrain2.glb` |
| `aspen_dem` | Aspen DEM + OSM | GIS DEM 加结构化 OSM 建筑/道路图层 |

切换时先建立新地形的渲染、物理、导航和 Agent，再替换旧运行时；加载失败通常保留原地形。每张地形的编辑和资产状态在**当前浏览器页面会话**中分别保留，刷新或关闭页面后未导出的修改会丢失。

`Reload Terrain` 从源文件重新加载**当前地形**，丢弃它在本次会话的改动；有未导出修改时会先确认。`Focus Terrain` 仅调整镜头。

`Detected Meshes / Roles` 列出 GLB 子网格，可把错误识别的网格改为 `land`、`water` 或 `ignore`；随后按 Reload 重新采样才生效。自动识别主要参考网格和材质名称。独立 water mesh 会按真实覆盖采样；只有明确指定推断或存在水域命名提示而无独立水网格时，才采用低地水体推断。清单中有 `data: terrain.json` 的 GIS 地形直接读取数据文件，调整 GLB role 不会让它改走 GLB 重采样。

### 添加自己的 GLB

1. 将文件放入 `public/assets/maps/terrain-demo/source/`。
2. 在 manifest 的 `terrains` 中增加唯一 ID、名称、相对 source、`type: "glb"` 和采样分辨率；根据模型单位填写 `scale`，Z 轴向上的模型填写 `upAxis: "z"`。
3. 刷新页面，在地形下拉框选择它，检查朝向、尺寸、水体、胶囊出生位置和调试显示；必要时修改 mesh role 并 Reload。

```json
{
  "id": "my-terrain",
  "name": "我的地形",
  "type": "glb",
  "source": "source/my-terrain.glb",
  "samplingResolution": 64,
  "scale": 1,
  "upAxis": "y"
}
```

如果描述符含 `data`，`terrain.json` 是地形高度、渲染和物理的主数据源；GLB 不再作为第二套高度重采样。`metadata` 记录 GIS 来源和坐标变换信息。

## 4. 地形编辑与导出

`Edit Terrain` 提供 `Raise` 抬高、`Lower` 降低、`Flatten` 按本次起笔点高度整平、`Off` 退出。选择工具后设置 `Radius`（面板 1～12 m，默认 3 m）及 `Strength`（0.05～1.5，默认 0.45），在地形上按住左键拖动。笔刷有平方衰减；`Flatten` 的参考高度来自按下鼠标的位置。

笔画期间更新可见网格；松开鼠标后重建 Rapier 地形碰撞、动态水面和导航，旧路径停止。曾是未采样空白的格点被实际涂画后可变为有支撑地面。粗分辨率 GIS 地形可能需要较大半径才能影响到网格顶点。

`Export Terrain` 下载当前 `TerrainData` JSON（包括高度、覆盖掩码、水面数据）。下载**不会**自动修改项目里的文件或 manifest，也不会在刷新后自动恢复。要把编辑结果作为下次启动的数据，需自行保存到项目资源目录并把 manifest 的 `data` 指向它。

## 5. 塔站、Restrict 禁区与调试层

### 手工信号塔

按 `Place Signal Tower`，移动鼠标预览，单击合法地面放置一次。平台检查边界与支撑、水域/禁区、坡度及已有资产碰撞；通过后创建可视塔和固定物理碰撞体。`Export Assets` 下载当前地形的资产 JSON。右侧手工放置和左侧算法实验使用两套不同的验证入口，研究复现应统一使用 Environment API。

### 绘制 Restrict 禁区

1. 按 `Add Restricted`，在地形表面依次点**至少三个不同位置**。系统按顺序连线，完成时自动连接末点与首点，不必重复点击起点。
2. 点错可按 `撤销上一点` 或 `Backspace`。边线自交、点距过小或面积过小会被拒绝。
3. 再按变成 `完成选区 (N 点)` 的按钮闭合。禁区覆盖会贴合当前地形可视表面；导航随后重建，原目标和路径停止。
4. `取消选区` 或 `Esc` 只放弃正在画的点；`Clear Regions` 清空当前地形**所有手工禁区**，不删自动语义区域；`Export Semantic` 下载手工禁区 JSON。

禁区内不能选择路径终点；穿越禁区的路径段会被排除或改为绕行。导出的 Semantic JSON 同样不会自动写回项目，也不会在刷新后自动导入。

### Debug 与 OSM 图层开关

| 开关 | 显示内容 | 正确理解 |
| --- | --- | --- |
| `Semantic` | 水域、障碍和禁区等半透明贴地语义覆盖；默认开启。 | 人工禁区有轮廓，不是独立地形模型。 |
| `NavMesh` | 当前导航**采样格**。 | 并非完整 Recast 多边形，也不是原 GLB 的三角面；隐藏它不影响导航。 |
| `Colliders` | Rapier 世界的调试线框，包括 heightfield、角色和资产碰撞体。 | 与源 GLB 的细节网格可以不同；这是实际仿真碰撞的可视化，开关不改变碰撞。 |
| `Buildings` | OSM 建筑挤出网格。 | 只控制显示；建筑语义与物理碰撞仍然生效。 |
| `Roads` | 具有真实宽度并贴地的 OSM 道路带。 | 只控制显示；道路语义仍然保留。 |
| `Building Collision` | 与可见挤出建筑相同的 Rapier trimesh 线框，默认关闭。 | 用于核对实体碰撞边界；开关只显示/隐藏线框，不会启停真实碰撞。 |
| `Road Width Debug` | 道路左右边界。 | 用于核对 `highway`/车道宽度映射。 |
| `Terrain Height Samples` | 建筑地形采样点与道路采样点。 | 用于排查局部坐标、高度或南北翻转问题。 |

## 6. 左侧空间优化实验

目前内置任务为 `Signal Tower Optimization`，算法为 `Random Search`；这两个下拉框是只读的，尚不能在面板直接切换任务/算法。

1. 选 `Terrain`；设定 `Seed`（随机种子）、`Tower Count`（目标塔数，界面 1～20）、`Iterations`（候选布局次数，界面 1～10000）。同一地形 revision、种子和配置有可复现的候选序列。
2. `Rendering` 选 `Visualization` 或 `Fast`。前者完成后显示覆盖调试色块，后者减少渲染/调试更新；Fast **不是**无浏览器 headless。
3. 按 `Run Experiment`。运行会重置环境并清除现有塔站；`Stop` 请求中止。每次候选布局只做静态评估，不会逐次创建真实 Three.js/Rapier 塔。
4. 完成后查看 `Best Score`、`Coverage`、`Overlap`、`Tower Count`、`Cost` 和 `Violations`。覆盖调试色块：红色未覆盖，绿色覆盖一次，黄色重复覆盖。
5. 按 `Apply Best Solution` 才将最佳方案放进真实世界。`Export JSON` 包含配置、最佳布局、指标、历史和复现元数据；`Export CSV` 是一行实验摘要。

评分使用 64×64 合法地面采样、塔站 15 m 简化覆盖半径，默认公式为 `覆盖率 − 0.2×重叠率 − 0.1×归一化成本 − 违规数`。它不是无线电传播或遮挡模拟。覆盖调试色块的采样密度低于数值评估网格，不应直接按色块数量重算指标。

## 7. 算法 API 与消息桥

应用启动成功后，浏览器控制台可以访问 `window.spatialEnvironment`、`window.spatialExperimentRunner`、`window.spatialAlgorithmBridge`。以下是可直接在控制台运行的 JavaScript 示例；塔位仅作示意，先验证再执行：

```js
const env = window.spatialEnvironment;
await env.reset({
  terrainId: 'terrain-01',
  seed: 42,
  task: { type: 'SIGNAL_TOWER_OPTIMIZATION', targetTowerCount: 5 },
  episode: { maxSteps: 20, maxAssets: 5 },
  rendering: { enabled: true },
  assets: { resetPlacedAssets: true }
});
const action = { type: 'PLACE_ASSET', assetType: 'signal-tower', position: { x: 12, z: 20 } };
const check = env.validateAction(action);
if (check.valid) console.log(await env.step(action));
console.log(env.observe(), env.getMetrics(), env.getGlobalGrid(32, 32));
```

`reset()` 和 `step()` 是异步接口。支持 `PLACE_ASSET`、`REMOVE_ASSET`、`MOVE_ASSET`、`NO_OP`；非法动作不改变世界，但计一步并记录违规。`validateAction()` 只读预检；`evaluate()` 评价当前布局；`getHeightGrid()`、`getSemanticGrid()`、`getOccupancyGrid()`、`getGlobalGrid()`、`getLocalGrid()` 提供栅格观察。语义编码为草地 1、道路 2、水域 3、障碍 4、禁区 5，0 为未知。`getState()` 比对外的 `observe()` 更接近内部状态。详细方法见 [代码导读](CODEBASE_GUIDE.md#6-environment-api-怎么读)。

| API | 何时使用 / 返回内容 |
| --- | --- |
| `reset(config)` | 开始新 episode；可指定地形、随机种子、目标塔数、最大步数/资产数及是否清空现有资产，返回初始 Observation。 |
| `observe()` / `getState()` | 前者取算法可见的地形摘要、有效资产、Agent、指标与步数；后者取更完整的世界状态快照。 |
| `validateAction(action)` | 提前检查放置/移动/删除等动作的合法性与约束结果，不改变世界。 |
| `step(action)` | 执行动作并计一步；返回 Observation、reward、`terminated`（任务完成）/`truncated`（达到步数上限）和详细指标。 |
| `evaluate()` / `getMetrics()` / `getEpisodeHistory()` | 评价当前正式资产布局、读取原始指标和本 episode 的步骤记录。 |
| `getAvailableActions()` / `getAvailableTerrains()` / `switchTerrain(id)` | 查询可用动作/地形，或异步切换地形。切换期间应等待完成后再调用动作。 |
| `validateCandidate()` / `evaluatePlacementSet()` | 不放置真实塔，静态验证一个候选点或整组布局，适合算法搜索。 |
| `getGlobalGrid()` / `getLocalGrid()` | 获取全局或指定位置附近的高度、语义和占用矩阵；也可单取三种矩阵。 |
| `applySolution(assets)` | 对已选方案重新验证后写入真实世界；会替换当前塔站。 |

算法约束包含地形边界、有效地面支撑、水域、Restrict、最大坡度（默认 12°）、碰撞及塔间最小距离（默认 5 m）。`PLACE_ASSET` 需要资产类型和 X/Z 坐标；`REMOVE_ASSET` 需要资产 ID；`MOVE_ASSET` 需要已有 ID 和新坐标；`NO_OP` 可用 `endEpisode: true` 主动结束。分数和 reward 是不同概念：合法动作的 reward 是本步相对上步的分数变化，不合法动作获得负奖励且仍占用一步。

本地桥接支持 `RESET`、`OBSERVE`、`STEP`、`EVALUATE`、`SWITCH_TERRAIN`、`GET_METRICS` 消息，但它只在同一浏览器进程内分发；目前没有可让 Python 直接连接的 WebSocket 服务或纯 Node headless 入口。

```js
const reply = await window.spatialAlgorithmBridge.handle({
  type: 'OBSERVE', requestId: 'demo-1'
});
console.log(reply); // OBSERVE_RESULT；失败时返回带 code/message 的 ERROR
```

## 8. GeoTIFF / DEM 转换

Python GIS 工具可检查 GeoTIFF、选择米制投影、等比例重采样、生成 `terrain.json`/`terrain.glb`/`metadata.json`、校验并更新 manifest，还可以把 OSM/GeoJSON 建筑和道路转换到同一个地形局部坐标。快速流程如下；完整参数和注意事项请看 [工具说明](tools/gis-converter/README.md)、[中文实操](tools/GIS_GeoTIFF_地形转换与平台接入步骤.md) 与 [V0.5 交付说明](V05_OSM_BUILDINGS_ROADS.md)。

```powershell
cd tools/gis-converter
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m gis_converter.cli inspect --input input/map.tif
python -m gis_converter.cli convert --input input/map.tif --output ../../public/assets/maps/terrain-demo/generated/my-dem --terrain-id my-dem --resolution 128 --target-crs auto
python -m gis_converter.cli validate --terrain ../../public/assets/maps/terrain-demo/generated/my-dem
```

验证通过后再用 `--update-manifest` 注册；覆盖同名输出需另加 `--overwrite`，旧文件会备份。刷新平台后在地形列表选择新 ID。`terrain.json` 是运行时高度真值；`sampleCoverage` 保留 NoData/未覆盖位置，不应把仅为保持网格有限而填充高度的区域当成可部署地面。

### 导入 OSM 建筑和道路

V0.5 的 `vector-inspect` 用来查看 GeoJSON 的 CRS、几何类型、数量、范围、字段和无效要素；`vector-convert` 读取目标地形的 `metadata.json` 与 `terrain.json`，生成结构化 `buildings.local.json` / `roads.local.json`。不要修改原始 GeoJSON，也不要为矢量数据重新计算 origin。以 Aspen 为例：

```powershell
cd tools/gis-converter
.\.venv\Scripts\python.exe -m gis_converter.cli vector-inspect --input input/aspen/raw/aspen_buildings.geojson
.\.venv\Scripts\python.exe -m gis_converter.cli vector-convert --input input/aspen/raw/aspen_buildings.geojson --terrain-metadata ../../public/assets/maps/terrain-demo/generated/aspen/metadata.json --terrain-data ../../public/assets/maps/terrain-demo/generated/aspen/terrain.json --output ../../public/assets/maps/terrain-demo/generated/aspen/processed/buildings.local.json --type buildings
.\.venv\Scripts\python.exe -m gis_converter.cli vector-convert --input input/aspen/raw/aspen_roads.geojson --terrain-metadata ../../public/assets/maps/terrain-demo/generated/aspen/metadata.json --terrain-data ../../public/assets/maps/terrain-demo/generated/aspen/terrain.json --output ../../public/assets/maps/terrain-demo/generated/aspen/processed/roads.local.json --type roads
```

在 manifest 对应地形项中设置 `buildings` 和 `roads` 相对路径，刷新并选择该地形。加载顺序是地形数据 → 矢量 JSON → 语义注册 → 建筑碰撞 → 导航；文件缺失或结构错误会中止这次地形切换，而不是隐藏错误。Aspen 已配置好，可直接选择 `aspen_dem` 检查道路、建筑与地形的对齐。

## 9. 保存边界与常见问题

- 所有 `Export` 都是**浏览器下载**，不修改仓库中的 `public/` 文件、manifest 或本地数据库。页面刷新后，会话内编辑不会自动恢复。
- 地形列表没有新增项：检查 manifest JSON 格式、唯一 ID、相对路径，并刷新页面。
- 地形加载失败或没有出生点：检查文件路径、DEM `sampleCoverage`、单位/比例、坡度和语义禁区。已有 `data` 却缺失/损坏时会明确失败，不会偷偷改用 GLB 重采样。
- 点击后不能导航或部署：先确认不在编辑模式，再检查地形支撑、水域、禁区和坡度；可开启 `Semantic`/`NavMesh` 辅助判断，但导航格不是源模型的精确三角面。
- 当前地形是 **2.5D heightfield**，一个 X/Z 位置只有一个高度，不能完整表达洞穴、叠层道路或建筑内部。大型 GLB 采样仍在主线程，首次加载可能短暂卡顿；Recast 失败可回退到 A*，但不保证任意端点都可达。
- 视觉使用白色背景和低饱和马卡龙色系；渲染表现不替代地形、覆盖掩码、语义、导航和碰撞的实际判定。

## 10. 从哪里开始读代码

从 `src/main.ts` 看启动，再看 `src/core/MultiTerrainSimulation.ts` 如何装配地形、渲染、物理、导航、Agent 与 UI；地形主数据结构见 `src/terrain/TerrainTypes.ts`，算法接口见 `src/algorithm/Environment.ts`，实验执行见 `src/algorithm/experiment/ExperimentRunner.ts`。逐目录、逐文件职责与数据流见 [CODEBASE_GUIDE.md](CODEBASE_GUIDE.md)。
