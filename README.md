# Three Spatial Sim：项目说明与中文使用手册

Three Spatial Sim 是浏览器中的三维空间仿真平台：Three.js 展示地形、水面、胶囊体和塔站，Rapier 处理物理碰撞，Recast 与网格 A* 规划路径；算法环境可评估和优化信号塔布局。本文按当前源码编写。界面仍显示 V0.3，仓库同时包含后续的 GeoTIFF 导入和交互改进；`package.json` 中的 `0.1.0` 只是 npm 包版本。

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
| `npm run test:terrain` | 运行地形、水体、禁区、路径、碰撞及胶囊体回归测试。 |

仅开发验收时，可访问 `/?algorithmSelfTest=1`，页面会显示算法环境自检报告；正常使用不需要该参数。

## 2. 界面和基本操作

中央是三维画布，右侧是“算法空间仿真”控制面板，左侧是“空间优化实验”。鼠标左键拖动旋转视角、滚轮缩放、右键拖动平移。画布上的**左键短按**用于选择位置；拖动不会设置路径终点。平台为右手坐标系，Y 向上，X/Z 是地平面，局部单位为米。

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

## 3. 地形：选择、识别、重新加载

`Current Terrain` 选项由 [manifest.json](public/assets/maps/terrain-demo/manifest.json) 自动生成。当前清单包含：

| ID | 界面名称 | 来源 |
| --- | --- | --- |
| `terrain-01` | Coastal Terrain | `source/terrain1.glb` |
| `terrain-02` | Valley Terrain | `source/terrain2.glb` |
| `terrain-03` | Extended Terrain | `source/terrain3.glb` |
| `terrain-04` | DEM Terrain | `source/terrain4.glb`，声明 Z-up 与比例换算 |
| `synthetic-gis-demo` | synthetic-gis-demo | 已生成的 GIS 地形包 |
| `ny-demo` | ny-demo | 已生成的 GIS 地形包 |

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

### Debug 三个开关

| 开关 | 显示内容 | 正确理解 |
| --- | --- | --- |
| `Semantic` | 水域、障碍和禁区等半透明贴地语义覆盖；默认开启。 | 人工禁区有轮廓，不是独立地形模型。 |
| `NavMesh` | 当前导航**采样格**。 | 并非完整 Recast 多边形，也不是原 GLB 的三角面；隐藏它不影响导航。 |
| `Colliders` | Rapier 世界的调试线框，包括 heightfield、角色和资产碰撞体。 | 与源 GLB 的细节网格可以不同；这是实际仿真碰撞的可视化，开关不改变碰撞。 |

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

Python GIS 工具可检查 GeoTIFF、选择米制投影、等比例重采样、生成 `terrain.json`/`terrain.glb`/`metadata.json`、校验并更新 manifest。快速流程如下；完整参数和注意事项请看 [工具说明](tools/gis-converter/README.md) 与 [中文实操](tools/GIS_GeoTIFF_地形转换与平台接入步骤.md)。

```powershell
cd tools/gis-converter
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m gis_converter.cli inspect --input input/map.tif
python -m gis_converter.cli convert --input input/map.tif --output ../../public/assets/maps/terrain-demo/generated/my-dem --terrain-id my-dem --resolution 128 --target-crs auto
python -m gis_converter.cli validate --terrain ../../public/assets/maps/terrain-demo/generated/my-dem
```

验证通过后再用 `--update-manifest` 注册；覆盖同名输出需另加 `--overwrite`，旧文件会备份。刷新平台后在地形列表选择新 ID。`terrain.json` 是运行时高度真值；`sampleCoverage` 保留 NoData/未覆盖位置，不应把仅为保持网格有限而填充高度的区域当成可部署地面。当前工具只处理 DEM，不导入 OSM 建筑、道路、水系或卫星影像。

## 9. 保存边界与常见问题

- 所有 `Export` 都是**浏览器下载**，不修改仓库中的 `public/` 文件、manifest 或本地数据库。页面刷新后，会话内编辑不会自动恢复。
- 地形列表没有新增项：检查 manifest JSON 格式、唯一 ID、相对路径，并刷新页面。
- 地形加载失败或没有出生点：检查文件路径、DEM `sampleCoverage`、单位/比例、坡度和语义禁区。已有 `data` 却缺失/损坏时会明确失败，不会偷偷改用 GLB 重采样。
- 点击后不能导航或部署：先确认不在编辑模式，再检查地形支撑、水域、禁区和坡度；可开启 `Semantic`/`NavMesh` 辅助判断，但导航格不是源模型的精确三角面。
- 当前地形是 **2.5D heightfield**，一个 X/Z 位置只有一个高度，不能完整表达洞穴、叠层道路或建筑内部。大型 GLB 采样仍在主线程，首次加载可能短暂卡顿；Recast 失败可回退到 A*，但不保证任意端点都可达。
- 视觉使用白色背景和低饱和马卡龙色系；渲染表现不替代地形、覆盖掩码、语义、导航和碰撞的实际判定。

## 10. 从哪里开始读代码

从 `src/main.ts` 看启动，再看 `src/core/MultiTerrainSimulation.ts` 如何装配地形、渲染、物理、导航、Agent 与 UI；地形主数据结构见 `src/terrain/TerrainTypes.ts`，算法接口见 `src/algorithm/Environment.ts`，实验执行见 `src/algorithm/experiment/ExperimentRunner.ts`。逐目录、逐文件职责与数据流见 [CODEBASE_GUIDE.md](CODEBASE_GUIDE.md)。
