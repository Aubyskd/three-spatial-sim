# Three Spatial Sim

浏览器中的三维地形、GIS 与空间算法实验平台。可以导入地形和建筑道路数据，编辑地面、绘制禁行区、部署胶囊角色与信号塔，并进行坐标定位、建筑通视分析、道路可达性分析和信号塔布局优化。

本文按当前 **V0.6-B2 功能阶段**的源码整理。`package.json` 的 `0.1.0` 是 npm 包版本；部分面板标题仍保留其最初引入时的版本号，不代表整个平台的功能版本。

## 目录

- [1. 当前能力与边界](#1-当前能力与边界)
- [2. 安装与启动](#2-安装与启动)
- [3. 第一次使用与界面操作](#3-第一次使用与界面操作)
- [4. 地形管理与模型识别](#4-地形管理与模型识别)
- [5. 胶囊导航与重新部署](#5-胶囊导航与重新部署)
- [6. 地形编辑与 Restrict 禁行区](#6-地形编辑与-restrict-禁行区)
- [7. 坐标检查与信号塔部署](#7-坐标检查与信号塔部署)
- [8. 物理选点与空间分析](#8-物理选点与空间分析)
- [9. 空间优化实验](#9-空间优化实验)
- [10. GIS 地形建筑与道路导入](#10-gis-地形建筑与道路导入)
- [11. 保存导出与会话状态](#11-保存导出与会话状态)
- [12. 调试图层与问题排查](#12-调试图层与问题排查)
- [13. 算法 API 与扩展入口](#13-算法-api-与扩展入口)
- [14. 目录职责与代码阅读顺序](#14-目录职责与代码阅读顺序)
- [15. 测试与验收](#15-测试与验收)
- [16. 已知限制与相关文档](#16-已知限制与相关文档)

## 1. 当前能力与边界

| 模块 | 已实现功能 | 使用前需要知道 |
| --- | --- | --- |
| 三维场景 | 多地形切换、GLB 采样、GIS 高度网格、动态水面、白底低饱和配色 | 地形仿真基于 2.5D 高度场，不是任意三维体素世界。 |
| 胶囊角色 | 点击移动、碰撞、路径规划、重新部署、尺寸调整、镜头定位 | 使用 Recast 与网格 A*，不是沿 OSM 道路图移动。 |
| 地形与禁区 | 抬高、降低、平整、多点多边形 Restrict、贴地覆盖显示 | 修改保存在页面会话中，需主动导出。 |
| GIS / OSM | GeoTIFF 转换、建筑挤出与实体碰撞、道路宽度与高程 | 读取本地数据，不自动联网下载 OSM。 |
| 坐标与资产 | Local / Projected / LonLat、鼠标或坐标部署信号塔 | 地理坐标转换要求地图具有有效 GIS 元数据。 |
| 通视分析 | 观察点与目标点、配置高度、建筑遮挡、矩阵与射线 | 当前只有建筑参与通视遮挡。 |
| 道路可达性 | 道路图、道路吸附、Dijkstra、全部可达点对、成本矩阵 | 需要结构化道路数据；当前为无向图，不执行单行道或 MST。 |
| 优化实验 | 信号塔布局随机搜索、评分、应用最优解、结果导出 | 界面目前只有一个任务和一种优化算法。 |
| 算法接口 | reset / observe / step / evaluate、栅格观察、本地消息桥 | 尚无 Python WebSocket 连接或独立 headless 运行入口。 |

三套容易混淆的计算流程：

| 想做的事 | 数据与算法 | 代码入口 |
| --- | --- | --- |
| 让绿色胶囊走到目标 | 地形、语义与障碍 → Recast / 网格 A* → 角色运动 | `src/navigation/`、`src/agent/` |
| 比较 P1、P2 等点的道路距离 | 道路中心线 → RoadGraph → Dijkstra | `src/roads/`、`src/analysis/ReachabilityGraphBuilder.ts` |
| 寻找更好的塔站布局 | 候选塔位 → 约束与覆盖评价 → Random Search | `src/algorithm/`、`src/evaluation/` |

## 2. 安装与启动

需要支持 WebGL 的桌面浏览器，以及符合当前 Vite 依赖要求的 Node.js：`^20.19.0 || >=22.12.0`。npm 随 Node.js 安装。只使用现有地图时不需要安装 Python。

在项目根目录执行：

```powershell
npm ci
npm run dev
```

`npm ci` 按现有 `package-lock.json` 安装依赖，适合首次安装或恢复开发环境。浏览器打开终端实际显示的地址，通常是 `http://localhost:5173/`；不要直接双击 `index.html`。大型地形初次采样、构建碰撞和导航时可能需要等待。

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动 Vite 开发服务器，修改源码后自动更新页面。 |
| `npm run build` | 执行 TypeScript 检查并生成 `dist/`。 |
| `npm run preview` | 本地预览生产构建；需先执行 build。 |
| `npm run test:terrain` | 运行地形、坐标、物理选点及空间分析回归测试。 |

Windows PowerShell 若拦截 `npm.ps1`，可将命令中的 `npm` 换成 `npm.cmd`，不必为此修改系统执行策略。GIS 工具的 Python 安装步骤见第 10 节。

## 3. 第一次使用与界面操作

### 四个功能面板

右上角图标栏打开以下面板；以图标提示文字识别，不依赖固定排列顺序。

| 面板 | 主要用途 |
| --- | --- |
| 算法空间仿真 | 地形切换、胶囊控制、编辑、手工放塔、禁区、基础调试。 |
| 空间优化实验 | 配置并运行塔站布局优化，查看与导出最优方案。 |
| Coordinate Inspector | 查看坐标、按坐标放塔、坐标调试。 |
| 空间分析 / Visibility & Reachability | 物理选点、建筑通视、道路可达图。 |

默认只显示图标栏。点击图标展开面板，同时收起其他面板；再次点击活动图标、点击面板 `×` 或双击标题栏可收起。按住标题栏可拖动面板，面板内的鼠标操作与三维相机隔离。

### 鼠标与交互模式

- 普通浏览时，左键拖动旋转、滚轮缩放、右键拖动平移。
- 画布上的左键短按执行当前模式的操作；拖动视角不会添加路径终点或分析点。
- 地形笔刷启用时，左键拖动用于绘制；回到 `Off` 后恢复普通浏览操作。
- 放塔、重新部署、禁区绘制、坐标拾取和空间选点有各自模式。使用时注意按钮高亮和面板提示。
- 收起面板不等于取消当前选点工具。空间选点可按 `Stop Point Selection` 或 `Esc` 停止；其他工具使用取消按钮或 `Esc`。

### 建议的首次体验顺序

1. 打开“算法空间仿真”，等待默认地形加载完成，按 `Focus Terrain` 查看全貌。
2. 按“定位胶囊体”，退出其他工具后单击附近合法地面，观察绿色胶囊沿路径移动。
3. 用 `Add Restricted` 画一个禁区，再点禁区另一侧，检查胶囊能否绕行。
4. 打开 Coordinate Inspector，在地形上移动鼠标，查看本地坐标。
5. 若 Aspen 数据文件完整且可访问，切换 `aspen_dem`，体验建筑、道路、通视与道路可达性。
6. 最后运行优化实验。实验会清空现有塔站，先导出需要保留的布局。

## 4. 地形管理与模型识别

### 当前地图清单

地形选项来自 [manifest.json](public/assets/maps/terrain-demo/manifest.json)，不是写死在 UI 中。

| ID | 当前界面名称 | 数据来源 |
| --- | --- | --- |
| `terrain-01` | Coastal Terrain | `source/terrain1.glb`，GLB 采样。 |
| `terrain-02` | Valley Terrain | `source/terrain2.glb`，GLB 采样。 |
| `aspen_dem` | aspen_dem | `generated/aspen/` 下的 DEM 地形包，以及结构化建筑、道路 JSON。 |

清单中存在选项不代表资源一定已在当前电脑上准备好。尤其是 Aspen，需同时具备清单引用的地形、元数据、建筑和道路文件。

### 切换、重载与定位

- `Current Terrain`：切换活动地形。系统先构建新运行时再替换旧运行时；切换失败时保留原地形并报告错误。
- `Reload Terrain`：从源数据重新加载当前地形，丢弃该地形会话内的修改；有未导出修改时先确认。
- `Focus Terrain`：只调整镜头，不改变数据。
- 每张地图的地形编辑、手工禁区和资产状态在当前页面会话内分别保留；刷新不会自动恢复这些修改。

### GLB 模型分类与水体

`Detected Meshes / Roles` 展示检测到的子网格，可手工指定 `land`（地面）、`water`（水体）或 `ignore`（不参与采样），然后按 `Reload Terrain` 重新采样。

自动识别参考网格与材质名称等信息；独立水网格按其覆盖范围采样。没有独立水网格时，只有存在水域命名提示或显式启用推断等条件下才进行低地水体推断，不能保证任意未标注模型都能正确识别。

如果地图描述符声明了 `data`，运行时直接使用 `terrain.json` 的高度数据，不会因为修改 GLB role 就改成重新采样 GLB。编辑水域分类前，先确认地图使用哪条加载路径。

### 添加自己的 GLB

1. 把文件放到 `public/assets/maps/terrain-demo/source/`。
2. 在 manifest 的 `terrains` 数组中添加唯一 ID 与相对路径，例如：

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

3. 根据模型原始单位调整 `scale`；Z 向上的模型使用 `upAxis: "z"`。
4. 刷新页面并选择新地图，核对朝向、尺寸、水体、碰撞和出生点。仅复制文件不会自动增加选项。

## 5. 胶囊导航与重新部署

### 点击移动

退出编辑、放置与分析选点模式后，单击合法地面。系统检查地形支撑、语义与导航条件，通过后设置目标，显示路径并驱动胶囊移动。水域、障碍和 Restrict 区域不能作为目标。

胶囊路径会检查中间线段是否穿过 Restrict。Recast 路线不符合约束时会尝试网格 A*；无法找到合法路线则报失败，不把“终点合法”当成“整条路线合法”。

面板 `AGENT`、`TARGET` 显示角色和目标 X/Z，`PATH` 显示规划、移动、到达或阻塞等状态。

### 重新部署与重置

1. 按“重新部署胶囊体”。
2. 移动鼠标观察预览环：绿色可部署，红色不可部署。
3. 单击合法地面完成部署；再次按按钮或按 `Esc` 取消。

部署校验包括当前地形支撑、坡度、水域、禁区与资产占位。部署成功会停止旧路径，并更新本次会话的重置出生点。地形经过笔刷修改后，校验会读取当前点击位置的地面，不只依赖旧导航格中心。

`Reset Simulation` 重置角色、目标、路径和仿真计时，**不会删除**地形编辑、手工禁区或塔站。“定位胶囊体”只聚焦角色；公里级 GIS 地图上可用它快速找到真实米制大小的胶囊。

### 画幅与胶囊大小

滑块与数值输入框互相同步；输入数值后按 Enter 或移开焦点生效。

| 控件 | 范围 / 默认值 | 含义 |
| --- | --- | --- |
| 画幅大小 | 25°～90° / 52° | 相机 FOV；同一距离下越大看得越广，不改变分辨率或地图尺寸。 |
| 胶囊大小 | 高度 0.9～5.4 m / 1.8 m | 同步更新可见角色、物理碰撞体与离地偏移。修改后旧路径停止，需重新选目标。 |

远景定位标记只是辅助寻找角色，不代表胶囊真实碰撞尺寸变大。

## 6. 地形编辑与 Restrict 禁行区

### 高度笔刷

在 `Edit Terrain` 选择工具，在地形上按住左键拖动：

| 工具 / 参数 | 用法 |
| --- | --- |
| `Raise` | 抬高地面。 |
| `Lower` | 降低地面。 |
| `Flatten` | 向本次起笔位置的高度整平。 |
| `Off` | 退出编辑，恢复普通点击导航。 |
| `Radius` | 笔刷半径，界面范围 1～12 m，默认 3 m。 |
| `Strength` | 笔刷强度，界面范围 0.05～1.5，默认 0.45。 |

笔画期间更新可见地形；松开鼠标后重建地形碰撞、水面和导航，停止旧路径并清理失效的空间分析。粗网格 GIS 地形需要让笔刷覆盖到网格顶点才能产生明显变化。

编辑的是高度场，不是任意 GLB 三角面的雕刻。`Export Terrain` 导出编辑后的数据，保存规则见第 11 节。

### 手工多边形禁区

1. 按 `Add Restricted`，在真实地形表面依次单击至少三个不同点。
2. 系统按顺序连线；点错时按“撤销上一点”或 `Backspace`。
3. 按 `完成选区 (N 点)` 闭合。系统自动连接末点与首点，不必重复点击起点。
4. 自交、过近点位或面积过小会被拒绝，按提示调整。
5. “取消选区”或 `Esc` 只取消正在绘制的草稿；`Clear Regions` 清除当前地形的所有手工禁区，不删除自动语义。

禁区覆盖贴合地形，用于胶囊导航、资产部署与空间点位合法性判断。`Export Semantic` 导出手工区域。

**注意两套路径的区别：**胶囊导航会检查 Restrict；V0.6-B2 道路图目前按道路数据与通行配置构建，尚未按手工 Restrict 对整条道路边进行裁切或禁用。分析点被禁区拒绝，不等于道路分析的所有中间路段都会避开禁区。

## 7. 坐标检查与信号塔部署

### 坐标体系

平台局部坐标约定为 **+X 向东、+Y 向上、+Z 向南，1 个世界单位 = 1 米**。普通 GLB 的实际方向与尺寸仍取决于导入配置；只有带 GIS 元数据时，才能建立真实地理位置映射。

在 Coordinate Inspector 中，将鼠标移到地形表面查看：

| 显示 / 输入模式 | 含义 | 条件 |
| --- | --- | --- |
| `Local XYZ` | 局部 X/Y/Z，单位米。 | 所有地形可用。 |
| `Projected / UTM` | 当前投影 CRS 下的 Easting、Northing 与高程。 | 需要有效 `metadata.json`、CRS 与局部原点。 |
| `Longitude / Latitude` | WGS84 经度、纬度；手动高程输入为绝对高程。 | 同上；经度在前、纬度在后。 |

`Copy Local`、`Copy Projected`、`Copy LonLat` 复制对应读数。普通 GLB 显示 `LOCAL ONLY`，不会猜测经纬度。地图切换时清空旧坐标、原点和表单状态。

### 鼠标放塔

在“算法空间仿真”按 `Place Signal Tower`，移动鼠标预览，在合法地面单击放置一座塔。校验包括边界、地形支撑、水域、禁区、坡度和资产碰撞，通过后创建可见模型与固定碰撞体。

### 按坐标放塔

1. 在 Coordinate Inspector 选择 `Signal Tower` 和坐标模式。
2. 填写 X/Z、Easting/Northing 或 Longitude/Latitude，也可按 `Pick From Map` 后单击地形自动填入。
3. `Y Mode` 选 `Auto Terrain` 时从当前地形取高度；选 `Manual` 时，本地模式填写 Local Y，地理/投影模式填写绝对高程。
4. 按 `Preview` 检查半透明预览和校验提示。预览不新增正式资产或碰撞体。
5. 按 `Deploy` 正式部署；不合法时显示原因。

坐标工具的普通地图拾取使用 `TerrainPicker`，空间分析使用的物理拾取见下一节，二者职责不同。

`Coordinate Debug` 提供坐标标记、局部原点、地形边界、世界坐标轴和 100 m 网格，仅用于观察，不改变坐标或物理规则。

## 8. 物理选点与空间分析

### 8.1 点位必须先合法

在“空间分析”面板选择观察点 O、目标点 T 或图节点 P。当前链路为：

```text
屏幕点击
  → PhysicalPointPicker：检测地形、建筑、道路的最近表面
  → SpatialPointValidator：校验地形支撑、范围、建筑、Rapier 与语义
  → 保存合法 groundPosition
  → 通视高度偏移，或吸附到 RoadGraph
```

点击建筑屋顶或侧面会被拒绝，不会穿透建筑后选中下面的地面。点击道路仍需有效地形支撑，不是任意悬空道路表面都可选。每个点分别保留真实地面位置 `groundPosition` 和分析位置 `analysisPosition`。

短按添加点，达到设定数量后结束。`Undo` / `Backspace` 撤销当前类型最后一点，`Clear` 清该类点，`Stop Point Selection` / `Esc` 停止选点。点选失败时查看 `Invalid Point · 原因`，错误含义见第 12 节。

### 8.2 建筑通视分析

1. 在 `Visibility Analysis` 设置 `Observer Count` 与 `Target Count`，各为 1～20。
2. 设置观察点与目标点高度，默认各 1.5 m，表示相对地面的分析高度；`Ray Epsilon` 默认 0.01 m。
3. 按 `Select Observers` 选择 O1、O2……，再按 `Select Targets` 选择 T1、T2……。
4. 按 `Compute Visibility`。
5. 查看矩阵和场景射线；需要保存时选择 JSON 或 CSV 导出。

结果行对应 Observer，列对应 Target：`1` 表示无遮挡，`0` 表示射线在到达目标前被建筑阻挡。调试线展示地面点到分析点的高度、通视线和阻挡命中位置。JSON 还包含配置、距离和命中信息。

**当前只检查建筑遮挡**，不把地形、道路、树木、信号塔或胶囊当作遮挡物。没有建筑的地图也能运行，但结果不能当作考虑山体后的真实通视结论。

### 8.3 道路可达性与最短路

前提是地图已加载有效的 `roads.local.json`。普通 GLB 中“看起来像道路”的表面，不会自动变成道路网络；目前可使用配置了道路数据的 `aspen_dem`，或自行导入道路。

1. 打开 `Reachability Graph`，设置 `Traversal Profile`：`pedestrian` 步行、`vehicle` 车辆、`all` 不按道路类型筛选。它是道路通行类型过滤，不是切换优化算法。
2. 设置 `Node Count`，范围 2～30；设置 `Max Road Snap · m`，默认 10 m。
3. 按 `Select Graph Nodes`，选择 P1…PN。每个点先通过物理校验，再在阈值内吸附到可通行道路；失败不会远距离强行吸附。
4. 按 `Build Full Graph`，系统计算每一对 `i < j`，共 `N(N-1)/2` 对；可按 `Cancel` 中止。
5. 查看实际道路路径、邻接矩阵、成本矩阵，按需导出 JSON / CSV。

当前最短路使用 **RoadGraph + Dijkstra**，不是旧版的 NavMesh/A* 空间可达图。道路每段成本为 `sqrt(dx² + dy² + dz²)`，因此高程进入道路长度；cost 是吸附点之间的沿路距离，不包含从原始点击点走到道路的接入段，也不是预计通行时间。

| 输出 | 含义 |
| --- | --- |
| 图节点 | 原始地面位置、道路吸附位置、吸附距离与道路边 ID。 |
| 图边 | 两点间的最短道路路径 `roadPath`、道路边列表 `roadEdgeIds`、长度 cost（米）。 |
| 邻接矩阵 | 可达为 1，不可达为 0，主对角为 0，对称。 |
| 成本矩阵 | 可达为最短道路长度，不可达为 `null`（界面显示 `∞`），主对角为 0，对称。 |

保留所有可达点对，**不做最小生成树（MST）**，也不枚举全部可能路线。道路图为无向图，导出包含 `directed: false` 和 `onewayEnforced: false`，目前不强制 OSM 单行道。

道路交叉要求 X/Z 几何相交，且 `layer`、`bridge`、`tunnel` 兼容，以免把立交当普通路口。但这套严格规则仍有边界问题，见第 16 节。

切换通行配置后需重新选择道路图节点；切换/重载地图或编辑地形会清理空间分析状态。禁区、资产等改变后旧图结果会失效，需重算；**结果失效机制不代表道路边已经完整纳入动态禁区约束**。

## 9. 空间优化实验

### 当前任务与操作

当前只有 `Signal Tower Optimization` 和 `Random Search`，`Task` / `Algorithm` 下拉框是只读的。

1. 选择实验 `Terrain`，填写 `Seed`、`Tower Count`（1～20）和 `Iterations`（1～10000）。
2. 选择 `Visualization` 或 `Fast`。前者显示覆盖调试结果，后者减少渲染；Fast 仍在浏览器中运行。
3. 按 `Run Experiment`。**运行会重置环境并清空现有塔站**，重要布局请先导出。
4. 算法反复生成并评价候选布局，不会每次都创建一套真实塔和物理世界；可按 `Stop` 请求停止。
5. 查看 Best Score、Coverage、Overlap、Tower Count、Cost、Violations。实际找到的塔数可能少于目标数，需检查结果。
6. 按 `Apply Best Solution` 将最优方案写入真实场景；只完成搜索并不等于已经部署。
7. `Export JSON` 保存配置、方案、指标、历史和复现信息；`Export CSV` 保存实验摘要。

同一输入数据、地形状态、种子、配置和算法版本可复现候选序列；只记录 Seed 不足以复现修改后的地图。

### 评分如何理解

默认采用 64×64 合法地面采样、15 m 圆形覆盖半径，每座塔成本为 1：

```text
score = coverageRatio
      - 0.2 × overlapRatio
      - 0.1 × (totalCost / targetTowerCount)
      - constraintViolations
```

覆盖率是至少被一座塔覆盖的合法样点比例；重叠率是被两座及以上塔覆盖的比例。调试色块红色为未覆盖、绿色为单次覆盖、黄色为重复覆盖；色块采样密度与数值评价网格不同，不应按屏幕色块数量重算指标。

这是一套简化几何覆盖模型，**不是电磁波传播、信号衰减或建筑遮挡模拟**。算法默认最大坡度 12°、塔间最小距离 5 m。手工 UI 与算法使用不同验证入口，不能假定手工放塔完全遵循算法的最小间距规则。

## 10. GIS 地形建筑与道路导入

工具位于 [tools/gis-converter](tools/gis-converter/README.md)，要求 Python 3.11+。不依赖 QGIS 或 Blender 图形界面。以下示例中的文件名是占位名称，先准备自己的输入文件。

### 10.1 安装 Python 依赖

从项目根目录执行：

```powershell
cd tools/gis-converter
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

直接调用虚拟环境中的 Python，无需运行激活脚本。下列转换命令均在 `tools/gis-converter` 目录执行。

### 10.2 GeoTIFF 转地形包

将 DEM 放到 `input/map.tif`，先检查，再转换、验证：

```powershell
.\.venv\Scripts\python.exe -m gis_converter.cli inspect --input input/map.tif
.\.venv\Scripts\python.exe -m gis_converter.cli convert --input input/map.tif --output ../../public/assets/maps/terrain-demo/generated/my-dem --terrain-id my-dem --resolution 128 --target-crs auto
.\.venv\Scripts\python.exe -m gis_converter.cli validate --terrain ../../public/assets/maps/terrain-demo/generated/my-dem
```

检查源 CRS、投影范围、高程与 NoData 比例。`--target-crs auto` 对经纬度数据按区域中心选择 UTM，已有米制投影则保留；大区域或跨带区域需人工选择合适投影。`--resolution 128` 指较长边的顶点数，另一边保持实际长宽比。

| 输出文件 | 作用 |
| --- | --- |
| `terrain.json` | 运行时高度、尺寸、覆盖掩码等主数据，驱动地形渲染、碰撞与导航。 |
| `terrain.glb` | 同一高度网格生成的模型，用于可移植预览与一致性检查。 |
| `metadata.json` | CRS、原点、纵向缩放和 GIS ↔ Local 的映射信息。 |

`validate` 成功应报告 `VALID`。它会检查文件、数值、网格、范围及 GLB/JSON 一致性；警告仍需阅读。有限高度不等于可用地面，NoData 区域由 `sampleCoverage` 标识。

### 10.3 注册到地图列表

上述命令默认不修改 manifest。验证后可手工在 `terrains` 数组添加：

```json
{
  "id": "my-dem",
  "name": "我的 DEM",
  "type": "glb",
  "source": "generated/my-dem/terrain.glb",
  "data": "generated/my-dem/terrain.json",
  "metadata": "generated/my-dem/metadata.json",
  "samplingResolution": 128
}
```

刷新页面后选择 `my-dem`。必须保留 `data` 与 `metadata`，不要只把 GLB 当普通模型导入，否则不能沿用完整 GIS 高度真值与地理坐标关系。

也可在**首次 convert** 时增加 `--update-manifest`，工具内部转换与验证成功后注册。不支持通过 `validate` 注册。输出已存在时需明确加 `--overwrite` 并保留备份；`--overwrite` 不代表允许重复地图 ID，已注册地图重新转换时通常不应再次加 `--update-manifest`。输出目录必须位于目标 manifest 所属地图目录内。

批量处理使用 `batch`，完整参数、备份行为和故障处理见工具 README。

### 10.4 导入建筑与道路

先完成 DEM，再使用同一包的 metadata 和 terrain 数据转换 GeoJSON。不要为建筑与道路重新计算独立原点。

```powershell
.\.venv\Scripts\python.exe -m gis_converter.cli vector-inspect --input input/buildings.geojson
.\.venv\Scripts\python.exe -m gis_converter.cli vector-inspect --input input/roads.geojson
.\.venv\Scripts\python.exe -m gis_converter.cli vector-convert --input input/buildings.geojson --terrain-metadata ../../public/assets/maps/terrain-demo/generated/my-dem/metadata.json --terrain-data ../../public/assets/maps/terrain-demo/generated/my-dem/terrain.json --output ../../public/assets/maps/terrain-demo/generated/my-dem/processed/buildings.local.json --type buildings
.\.venv\Scripts\python.exe -m gis_converter.cli vector-convert --input input/roads.geojson --terrain-metadata ../../public/assets/maps/terrain-demo/generated/my-dem/metadata.json --terrain-data ../../public/assets/maps/terrain-demo/generated/my-dem/terrain.json --output ../../public/assets/maps/terrain-demo/generated/my-dem/processed/roads.local.json --type roads
```

再向同一个 manifest 地形项添加以下两个字段，而不是新增重复 ID：

```json
{
  "buildings": "generated/my-dem/processed/buildings.local.json",
  "roads": "generated/my-dem/processed/roads.local.json"
}
```

建筑按 footprint 挤出，支持内洞；高度优先使用 `height`，其次楼层数乘默认层高 3 m，再回退到默认建筑高度 9 m。建筑物理碰撞使用与可见挤出实体对应的三角网格，不是外围矩形线框。

道路按 `highway` / `lanes` 估计宽度，加密中心线并采样地形高程；默认抬高 0.05 m 减少闪烁。桥梁、隧道、layer 等属性用于道路网络分析，**保留属性不等于生成了真实桥面或地下隧道几何**。

数据保持为独立结构化 JSON，不会把地形、建筑与道路烘焙成一个 GLB。转换不覆盖原始 GeoJSON；manifest 中声明的矢量文件缺失或格式错误时会中止该地图加载。

## 11. 保存导出与会话状态

**所有 Export 都是浏览器下载，不会自动写回仓库、修改 manifest 或保存到数据库。** 页面刷新、关闭或重新载入源数据前，先保存需要保留的修改。

| 导出入口 | 内容 | 下次如何使用 |
| --- | --- | --- |
| `Export Terrain` | 当前 TerrainData 高度、覆盖掩码、水面数据等 JSON。 | 将文件保存到地图目录，设置 manifest 的 `data`；保持 terrainId 一致。 |
| `Export Semantic` | 当前手工语义区域/禁区 JSON。 | 保存并设置 manifest 的 `semantic`。 |
| `Export Assets` | `coordinateReference` 与 `assets` 包装对象。 | 保存并设置 manifest 的 `assets`；加载器也兼容旧资产数组格式。 |
| 实验 `Export JSON / CSV` | 完整实验结果 / 一行摘要。 | 用于分析和复现；不是刷新后自动恢复场景的存档。 |
| 通视 `Export JSON / CSV` | 点、配置和矩阵等结果。 | 用于后续分析；当前没有对应的一键结果回导流程。 |
| 可达图 `Export JSON / CSV` | 节点、路径、道路边 ID、邻接与成本矩阵。 | CSV 包含 metadata、nodes、edges 和两类矩阵多个区段。 |

只有坐标参考一致的地形、语义和资产才应组合使用。单独导出地形不会同时导出资产和禁区；编辑后的 Terrain JSON 也不会自动重写原始 GLB、DEM 或 GIS 矢量源文件。

## 12. 调试图层与问题排查

### 调试开关

| 开关 | 显示什么 / 适合排查什么 |
| --- | --- |
| `Semantic` | 水域、障碍、禁区等语义覆盖，判断为何不可部署或导航。 |
| `NavMesh` | 胶囊导航采样格；不是完整 Recast 多边形，也不是 RoadGraph。 |
| `Colliders` | Rapier 实际碰撞体线框。地形为采样 heightfield，与源 GLB 每个三角面不一定完全相同。 |
| `Buildings` / `Roads` | 建筑和道路的可见图层；关闭显示不等于删除数据或移除相关碰撞、语义。 |
| `Building Collision` | 与挤出建筑实体对应的碰撞线框，用来核对建筑接触边界。 |
| `Road Width Debug` | 道路两侧边界，检查宽度。 |
| `Terrain Height Samples` | 建筑与道路高程采样位置，排查贴地与坐标偏移。 |
| `Show Road Graph Nodes / Edges` | 道路网络节点与边，判断道路是否真的连通。 |
| `Show Intersections` | 路口及属性标签，检查 layer、bridge、tunnel。 |
| `Show Road Snap` | 原始选点到道路吸附点的关系。 |
| `Show Road Edge Length` | 道路段长度。 |

调试开关主要控制显示，不是启停物理或改变算法约束的开关。

### 空间选点错误

| 错误 | 含义与处理 |
| --- | --- |
| `BUILDING_SURFACE` | 最先点到了建筑。调整视角，直接选择地面或道路。 |
| `BUILDING_COLLISION` | 候选点处于建筑 footprint 内。移到建筑外。 |
| `PHYSICS_COLLISION` | 建筑物理探针校验失败。打开建筑碰撞调试检查。 |
| `NO_TERRAIN_SUPPORT` | 没有有效地形命中或覆盖支撑。检查 NoData 与地图边界。 |
| `OUTSIDE_TERRAIN` | 超出当前地形本地范围。 |
| `SEMANTIC_FORBIDDEN` | 被水域、障碍、禁区等语义拒绝。打开 Semantic 检查。 |
| `NO_NEARBY_TRAVERSABLE_ROAD` | 阈值内没有当前通行配置允许的道路。检查道路数据、Profile 与吸附距离，不要只盲目增大阈值。 |

### 常见问题

- **新增地图不出现：**检查 manifest 的 JSON 格式、唯一 ID、相对路径，并刷新；资源目录中的文件不会自动注册。
- **Aspen 加载失败：**检查 `generated/aspen/` 文件是否齐全、是否有访问权限，并查看浏览器 Network/控制台；声明了 `data` 却无法读取时不会悄悄回退到 GLB 采样。
- **看不到胶囊：**先按“定位胶囊体”；再检查地图单位、覆盖掩码、合法出生点与加载提示，不要只放大模型掩盖坐标问题。
- **点地图没有设置移动目标：**确认没有停留在编辑、放置或空间选点模式，等待地图切换结束；关闭面板本身不一定取消工具。
- **地形修改后仍不能放置：**等待碰撞/导航重建，并检查水域、禁区、坡度、地形支撑和资产占位；可见地面不等于通过所有约束。
- **水体覆盖不准确：**检查 GLB 子网格 role 与源模型命名；确认是 GLB 采样还是 `data` 加载路径，推断水面不能替代真实水域数据。
- **碰撞线框与 GLB 细节不同：**地形碰撞基于采样高度场，分辨率与局部细节会影响结果；建筑碰撞则使用挤出实体网格。
- **坡道路段看起来相连却不可达：**先检查 RoadGraph 边和路口，而不是只看道路色带。当前道路最短路没有简单的“坡度超限即断开”规则；高程进入长度，断连还可能来自中心线端点、通行类型、桥隧/layer 属性或吸附到另一条道路。先前反馈的具体路段仍需定位，不能视为已经修复。

## 13. 算法 API 与扩展入口

### Environment API

应用成功启动后，浏览器控制台提供：

```js
window.spatialEnvironment
window.spatialExperimentRunner
window.spatialAlgorithmBridge
```

以下示例会切换/重置环境并清空塔站，仅在已保存重要数据后运行。坐标为示意，未通过验证不会放置：

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

const action = {
  type: 'PLACE_ASSET',
  assetType: 'signal-tower',
  position: { x: 12, z: 20 }
};
const check = env.validateAction(action);
if (check.valid) console.log(await env.step(action));
else console.log(check);
console.log(env.observe(), env.getMetrics(), env.getGlobalGrid(32, 32));
```

| API | 用途 |
| --- | --- |
| `reset(config)` | 初始化 episode，配置地形、种子、目标、步数和资产重置。 |
| `observe()` / `getState()` | 算法观察 / 更完整的内部状态快照。 |
| `validateAction(action)` / `step(action)` | 只读预检 / 执行动作并返回 reward 与终止状态。 |
| `evaluate()` / `getMetrics()` / `getEpisodeHistory()` | 当前布局评价、指标和步骤历史。 |
| `getAvailableActions()` / `getAvailableTerrains()` / `switchTerrain(id)` | 查询动作、地图和切换地图。 |
| `getHeightGrid()` / `getSemanticGrid()` / `getOccupancyGrid()` | 高度、语义、资产占用栅格。 |
| `getGlobalGrid()` / `getLocalGrid()` | 全局或局部组合栅格观察。 |
| `validateCandidate()` / `evaluatePlacementSet()` | 不创建真实塔的候选验证与整组布局评价。 |
| `applySolution(assets)` | 重新验证并应用正式方案，替换当前塔站。 |

支持 `PLACE_ASSET`、`REMOVE_ASSET`、`MOVE_ASSET`、`NO_OP`。非法动作不改变世界，但计一步并记录违规；合法动作 reward 是本步相对上步的 score 差。返回的 `terminated` 表示任务终止，`truncated` 表示步数上限截断。`reset`、`step`、切换地形等异步操作需等待完成。

语义栅格编码：未知 0、草地 1、道路 2、水域 3、障碍 4、禁区 5。没有有效地面支撑的高度可能为 `NaN`，算法不能只检查数值范围而忽略有效覆盖。

### 如何增加优化算法

1. 参考 `src/algorithm/baseline/RandomSearchBaseline.ts`，实现 `OptimizationAlgorithm` 的 `name`、`version` 和异步 `run(environment, config, signal)`。
2. 返回 score、metrics、solution 和 history，支持取消信号；复用环境的候选验证和评价，不模拟 UI 点击。
3. 调用 `ExperimentRunner.register(algorithm)` 注册，再以对应 `config.algorithm` 运行。
4. 若要在页面中切换算法，还需修改 `src/ui/ExperimentPanel.ts`：当前下拉框禁用，运行配置固定为 `Random Search`。注册接口本身不会自动生成新菜单项。

接口定义位于 `src/algorithm/experiment/ExperimentResult.ts`。道路 Dijkstra、胶囊寻路与布局优化是不同扩展点，不要把 `Traversal Profile` 当成优化算法选择器。

### 消息桥

本地桥接支持 `RESET`、`OBSERVE`、`STEP`、`EVALUATE`、`SWITCH_TERRAIN`、`GET_METRICS`：

```js
const reply = await window.spatialAlgorithmBridge.handle({
  type: 'OBSERVE', requestId: 'demo-1'
});
console.log(reply);
```

目前仅在同一浏览器进程内分发消息，不是 HTTP API 或 WebSocket 服务。接 Python 或远程算法需另外实现传输层。

## 14. 目录职责与代码阅读顺序

### 目录职责

| 路径 | 主要职责 |
| --- | --- |
| `src/main.ts` | 启动当前多地形应用，装配 Environment、实验面板和全局开发接口。 |
| `src/core/` | 仿真生命周期与总装配，当前核心为 `MultiTerrainSimulation.ts`。 |
| `src/terrain/` | 地形清单、GLB 导入采样、TerrainData、高度编辑、会话状态和出生点。 |
| `src/render/` | Three.js 场景、相机、光照、水面与调试覆盖渲染。 |
| `src/physics/` | Rapier 地形、建筑、资产碰撞与角色控制。 |
| `src/agent/` | 胶囊实体和沿路径运动。 |
| `src/navigation/` | 胶囊使用的 Recast / 网格导航、路径校验与调试。 |
| `src/semantic/` | 地表类型、禁区、障碍和手工语义覆盖。 |
| `src/assets/` | 资产定义、模型创建、部署校验和按坐标放置。 |
| `src/gis/` | 建筑道路数据类型、地形高度服务、建筑和道路图层。 |
| `src/spatial/` | 坐标转换、普通/物理拾取、空间点验证与选择管理。 |
| `src/roads/` | 道路图节点/边、路口、通行配置、吸附、Dijkstra 和调试层。 |
| `src/analysis/` | 建筑通视、点对道路可达图、矩阵与导出。 |
| `src/algorithm/` | Environment、动作、状态、约束、目标、奖励、指标、随机搜索和实验执行。 |
| `src/evaluation/`、`src/tasks/` | 布局覆盖评价与任务定义。 |
| `src/bridge/` | 算法消息协议与本地桥接。 |
| `src/ui/`、`src/styles/` | 四个功能面板、浮动窗口、禁区编辑交互和样式。 |
| `src/config/`、`src/types/` | 基础常量与公共类型。 |
| `src/map/` | 早期地图加载/适配代码；当前新增多地形逻辑主要看 `terrain/`。 |
| `public/assets/maps/terrain-demo/` | manifest、原始模型、地形/语义/资产数据与生成 GIS 包。 |
| `tools/gis-converter/` | Python 转换器、输入数据目录、转换与校验测试。 |
| `tools/runtime-smoke.mjs` | 运行时辅助检查脚本；不是前端启动入口。 |
| `tests/` | TypeScript 地形、坐标和空间分析回归测试。 |
| `scripts/` | 当前预留目录，不是核心运行入口。 |
| `dist/`、`node_modules/` | 构建产物、依赖；不要在这里修改业务实现。 |

`public/` 下的文件由 Vite 作为静态资源提供，manifest 内的资源路径相对于该地图目录解析。旧版 `Simulation.ts`、`ControlPanel.ts` 等仍在仓库中，不能仅凭文件名判断它们就是当前页面入口。

### 建议阅读顺序

1. `src/main.ts` → `src/core/MultiTerrainSimulation.ts`：先理解启动、模式切换和各子系统的关系。
2. `TerrainTypes.ts` → `TerrainManager.ts` → `TerrainSampler.ts`：理解数据真值、加载和切换，再看渲染与碰撞如何使用这些数据。
3. 若研究角色移动，看 `navigation/Pathfinder.ts` 与 `agent/AgentController.ts`；若研究道路分析，看 `roads/RoadNetworkBuilder.ts`、`RoadSnapper.ts`、`RoadPathfinder.ts`。
4. 若研究点选与通视，看 `PhysicalPointPicker.ts` → `SpatialPointValidator.ts` → `VisibilityAnalyzer.ts`。
5. 若研究优化算法，看 `algorithm/Environment.ts` → `evaluation/SpatialEvaluator.ts` → `ExperimentRunner.ts` → `RandomSearchBaseline.ts`。
6. 最后看相应 UI 如何调用这些接口，不从按钮事件反推全部算法逻辑。

进一步的逐模块讲解见 [CODEBASE_GUIDE.md](CODEBASE_GUIDE.md)。其中较早的空间分析描述应结合当前 V0.6-B2 文档阅读。

## 15. 测试与验收

### 自动测试

项目根目录执行：

```powershell
npm run test:terrain
npm run build
```

`test:terrain` 会打包并运行以下三组测试，名称虽然保留 terrain，但覆盖范围已经扩展：

- `tests/terrain-regression.test.ts`：地形、水体、覆盖、禁区、路径、碰撞与胶囊相关回归。
- `tests/coordinate-regression.test.ts`：坐标转换与按坐标部署。
- `tests/spatial-analysis-regression.test.ts`：物理选点、遮挡、道路图、吸附、最短路、矩阵与运行时切换回归。

GIS 工具测试从项目根目录进入工具目录后执行：

```powershell
cd tools/gis-converter
.\.venv\Scripts\python.exe -m pytest -q
```

部分真实 DEM 测试取决于本地输入数据是否存在，缺少时可能跳过；通过合成数据测试不等于已验收所有真实地图。

开发时可用 `/?algorithmSelfTest=1` 触发浏览器内算法环境自检。它会调用环境动作，应在不需要保留当前布局的测试会话中使用。

### 手动验收建议

1. 默认地图与各可用地图能切换，失败时有明确提示。
2. 胶囊能移动、重新部署，尺寸与碰撞一致；Restrict 中间路段不会被胶囊路径直接穿过。
3. 地形编辑后可见高度、碰撞与部署判断同步。
4. 坐标读数与 GIS 元数据一致，按坐标预览和部署位置一致。
5. 点击建筑不能创建空间分析点；切换地图后仍能正常选点。
6. 用建筑两侧的点验证通视；用相连和断连道路验证可达矩阵及道路路径。
7. 拖动面板不带动相机；导出的 JSON/CSV 有当前地图与结果信息。

本文提供验证方法，不代表每次修改 README 都重新完成了浏览器和真实数据验收；历史版本文档中的测试数量也不应作为本次运行结果。

## 16. 已知限制与相关文档

- **坡道路段误判不可达仍待针对性修复。** 当前道路端点合并采用厘米级坐标量化，没有通用的近邻端点补连；共线重叠交点与桥梁/地面入口等情况可能无法按预期连接。先前截图对应路段的确切原因尚未定位，不能直接归因于坡度，也不能声称已解决。
- **道路规则尚不完整。** 未强制单行道，通行配置主要按道路类型过滤；道路边尚未完整结合手工禁区、动态障碍或所有真实通行限制。可达性结果是当前数据与规则下的计算结果。
- **地形仍是 2.5D。** 一个 X/Z 对应一个地面高度，不能完整表达洞穴、叠层道路、悬空平台或建筑内部通行；桥隧属性不等于真实多层几何。
- **通视仅考虑建筑。** 山体、树木、角色和资产不参与当前通视遮挡。
- **优化模型简化。** 只有随机搜索基线与几何覆盖模型；没有真实无线传播、多算法 UI 或现成强化学习训练服务。
- **保存仅限会话与手动导出。** 没有完整工程存档、一键恢复、数据库或多人协作持久化。
- **GIS 范围有限。** 目前处理局部区域 DEM 与建筑/道路 GeoJSON，不包含 OSM 水系、卫星影像或 3D Tiles。
- **性能仍有改进空间。** 大型 GLB 采样在主线程；Three.js、Rapier 和 Recast 带来较大构建体积，首次加载可能卡顿或出现 chunk-size 提示。

相关文档：

| 文档 | 阅读用途 |
| --- | --- |
| [代码与目录导读](CODEBASE_GUIDE.md) | 更详细的数据流和算法环境说明；部分旧空间分析内容需以 B2 为准。 |
| [V0.6-B2 物理空间分析](V06B2_PHYSICAL_SPATIAL_ANALYSIS.md) | 当前物理点选、道路拓扑、Dijkstra 与输出约定。 |
| [V0.6-A 坐标与资产放置](V06A_COORDINATE_ASSET_PLACEMENT.md) | 坐标服务、元数据和精确部署。 |
| [V0.5 建筑与道路](V05_OSM_BUILDINGS_ROADS.md) | OSM 数据结构与图层接入。 |
| [GIS 转换工具说明](tools/gis-converter/README.md) | CLI 参数、验证、批处理、备份与矢量转换。 |
| [GeoTIFF 中文接入步骤](tools/GIS_GeoTIFF_地形转换与平台接入步骤.md) | 转换真实 DEM 的操作示例。 |
| [V0.6-B 历史说明](V06B_VISIBILITY_REACHABILITY_GRAPH.md) | 了解早期方案；其 NavMesh 可达图方案已被 B2 道路图替代。 |
