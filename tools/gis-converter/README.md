# GIS 地形与 OSM 矢量转换工具（V0.4 / V0.5）

此目录是项目自带的 Python 命令行工具，用于把本地 GeoTIFF DEM 转换为可注册到 Three Spatial Sim 的地形包，并把 OSM/GeoJSON 建筑、道路转换到同一地形局部坐标。工具**不依赖 QGIS/Blender 图形界面**。入口是 `python -m gis_converter.cli`；DEM 使用 `inspect`、`convert`、`validate`、`batch`，矢量数据使用 `vector-inspect`、`vector-convert`。项目整体操作见 [根目录使用手册](../../README.md)，真实数据的逐步示例见 [GeoTIFF 接入步骤](../GIS_GeoTIFF_地形转换与平台接入步骤.md)。

```text
GeoTIFF DEM → CRS 检查 → 米制坐标系 → 保持长宽比的高度网格
                                         ├─ terrain.json：仿真真值
                                         ├─ terrain.glb：同一网格的可移植模型
                                         └─ metadata.json：GIS 来源与逆映射
```

## 1. 环境安装

工具要求 Python **3.11 或更新版本**。从 `tools/gis-converter` 目录执行；Windows PowerShell 示例：

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

可执行 `python --version` 确认版本，`python -c "import numpy, rasterio, pyproj, trimesh"` 确认依赖。下面命令均假设当前目录为 `tools/gis-converter`；也可以通过 `pip install -e .` 安装包后在其他目录使用。

## 2. 检查输入：inspect

将自己的 `.tif` 或 `.tiff` 放入 `input/`，先运行：

```powershell
python -m gis_converter.cli inspect --input input/map.tif
```

输出包含源 CRS、经纬/投影范围、栅格尺寸与像元大小、NoData 比例、高程范围、中心经纬度和建议目标 CRS。重点确认单位和高程是否符合预期；CRS 错误时不要直接继续转换。

## 3. 转换单个文件：convert

```powershell
python -m gis_converter.cli convert --input input/map.tif --output ../../public/assets/maps/terrain-demo/generated/my-dem --terrain-id my-dem --resolution 128 --target-crs auto
```

首次转换默认**不修改 manifest**。输出目录若已经存在，默认拒绝覆盖；使用 `--overwrite` 才允许替换，旧目录会保留带唯一后缀的备份。`--update-manifest` 会在成功转换并验证后，向地图清单注册新地形；输出必须位于目标 manifest 的地图目录内，重复 ID 会报错。可通过 `--manifest` 指定其他 v2 清单。

| 参数 | 默认值 / 作用 |
| --- | --- |
| `--input`、`--output`、`--terrain-id` | 必填：输入 DEM、单个地形包输出目录和唯一地形 ID。 |
| `--resolution` | 默认 128；较长边的**顶点数**，范围 2～4096；另一边按真实投影长宽比计算。 |
| `--target-crs` | 默认 `auto`；可指定米制投影，如 `EPSG:32618`。 |
| `--resampling` | `nearest` / `bilinear` / `cubic`，默认 `bilinear`。 |
| `--vertical-scale` | 默认 1.0；只缩放高度，取值会写入 metadata。 |
| `--origin-mode` | `center` / `southwest` / `min`，默认 `center`；决定局部坐标原点。 |
| `--overwrite` | 允许替换已有输出，并保留旧输出备份。 |
| `--update-manifest` | 验证成功后原子更新并备份 manifest；默认关闭。 |
| `--save-reprojected-tif` | 额外保存重投影调试栅格。 |
| `--verbose` | 输出更详细日志。 |

## 4. 验证输出：validate

```powershell
python -m gis_converter.cli validate --terrain ../../public/assets/maps/terrain-demo/generated/my-dem
```

成功时会显示 `VALID <地形ID>`，并可能附带警告。验证检查三文件是否齐全、高度是否有限、覆盖掩码尺寸、法线朝向、GLB 顶点/面数及空间范围是否与 JSON 一致。没有 `VALID` 或有错误时先排查，不要注册到平台。

每个包应包含：

| 文件 | 用途 |
| --- | --- |
| `terrain.json` | 平台运行时的高度、尺寸、`sampleCoverage`、语义等数据；驱动可视地形、Rapier heightfield 与导航。 |
| `terrain.glb` | 与同一高度网格对应的可移植 GLB，用于预览与一致性验证；有 `data` 时平台不会把它再作为第二套高度叠加。 |
| `metadata.json` | 源/目标 CRS、投影范围、局部原点、纵向缩放和 GIS↔局部坐标映射。 |

## 5. 批量转换：batch

```powershell
python -m gis_converter.cli batch --input input --output ../../public/assets/maps/terrain-demo/generated --resolution 128 --target-crs auto
```

处理输入目录下的全部 `.tif`/`.tiff`；每个文件得到同名输出子目录。单个文件失败不会阻止其他文件，最终显示成功/失败数，在输出根目录生成 `conversion.log`；只要有失败，命令退出码为 1。批量命令也支持上表中的转换选项，但请先用少量文件确认 ID 和输出范围，再决定是否使用覆盖或注册参数。

## 6. 坐标、NoData 与警告

源数据若已是以米为单位的投影坐标系，会保留该坐标系。经纬度 DEM（如 EPSG:4326）在 `auto` 模式下按区域中心选择 UTM；跨 UTM 带或非常大的区域会提示 `AUTO_UTM_MAY_BE_INAPPROPRIATE`，应人工选择更合适投影。工具针对局部区域，不是大陆尺度的完整 GIS 平台。

默认 `center` 模式以投影范围中心为水平原点、最低采样高程为垂直原点。项目的局部坐标为 **X 向东、Y 向上、Z 向南，1 单位 = 1 米**：

```text
x = easting - originEasting
y = (elevation - originElevation) × verticalScale
z = originNorthing - northing
```

`southwest` 使用西南角为水平原点；`min` 使用西北角，使局部 X/Z 从零开始。正反变换由 `gis_converter.metadata.gis_to_local()` 和 `local_to_gis()` 提供。

NoData、NaN、`-9999` 不参与有效高程统计。小型内部缺口会插值；边缘/较大的缺口仍在 `sampleCoverage` 标为 0，虽然储存高度会从附近有效点填充以保持 GLB 和物理网格有限。平台导航和部署应拒绝这类位置。缺失比例过高会提示 `HIGH_NODATA_RATIO`；尺寸异常会提示 `SUSPICIOUS_TERRAIN_SIZE`，需核对 CRS 和米制单位。核心转换出错时不会暗中换用其他 DEM 或 GLB。

## 7. 在平台中接入与测试

建议顺序：`inspect` → 不带注册参数的 `convert` → `validate` → 核对视觉/范围 → 必要时用 `--overwrite --update-manifest` 重新转换并注册 → 返回项目根目录执行 `npm run dev` → 在 `Current Terrain` 选择新 ID。清单应同时声明 `source`、`data`、`metadata` 的相对路径。`data` 缺失或格式错误时平台会明确报错，不会悄悄重采样 GLB。

工具测试：

```powershell
.venv\Scripts\python.exe -m pytest -q
```

如测试依赖未安装，先安装 `pytest`（或 `pip install -e ".[test]"`）。真实 `input/output_AW3D30.tif` 存在时会运行对应验收；不存在则该项跳过。另有合成 GeoTIFF 集成测试，不会把合成数据伪称为真实 DEM。

## 8. OSM / GeoJSON 建筑与道路（V0.5）

先查看源文件，不会修改它：

```powershell
python -m gis_converter.cli vector-inspect --input input/aspen/raw/aspen_buildings.geojson
python -m gis_converter.cli vector-inspect --input input/aspen/raw/aspen_roads.geojson
```

Aspen 的实际转换命令如下。输出放在 `processed/`，原始 GeoJSON 始终保留在 `input/aspen/raw/`：

```powershell
python -m gis_converter.cli vector-convert --input input/aspen/raw/aspen_buildings.geojson --terrain-metadata ../../public/assets/maps/terrain-demo/generated/aspen/metadata.json --terrain-data ../../public/assets/maps/terrain-demo/generated/aspen/terrain.json --output ../../public/assets/maps/terrain-demo/generated/aspen/processed/buildings.local.json --type buildings --building-base-strategy median --default-floor-height 3 --default-building-height 9

python -m gis_converter.cli vector-convert --input input/aspen/raw/aspen_roads.geojson --terrain-metadata ../../public/assets/maps/terrain-demo/generated/aspen/metadata.json --terrain-data ../../public/assets/maps/terrain-demo/generated/aspen/terrain.json --output ../../public/assets/maps/terrain-demo/generated/aspen/processed/roads.local.json --type roads --road-height-offset 0.05 --road-max-segment-length 10
```

矢量转换不自行计算原点或硬编码 UTM 区号，而是读取目标地形 `metadata.json` 的 `projectedCRS`、`localOrigin` 和坐标约定。转换顺序为：源 CRS → 目标投影 CRS → `X=Easting-originEasting`、`Z=originNorthing-Northing` → 从 `terrain.json` 双线性采样 Y。建筑底面默认取 footprint 顶点地形高度中位数；建筑高度优先使用 `height`，其次 `building:levels × 3m`，最后 9m。道路按 `highway`/`lanes` 估算真实宽度，每 10m 以内加密采样，并在地形高度上增加 0.05m 防止闪烁。

`vector-convert` 会裁剪目标地形范围、验证有限坐标与几何、报告不支持/无效/越界/掩膜地形要素；核心读取、CRS 或输出错误会以非零退出码失败，不会静默吞掉。完整数据格式、运行时接入和 Aspen 验收结果见 [V0.5 交付说明](../../V05_OSM_BUILDINGS_ROADS.md)。

当前不处理 OSM 水系、卫星影像、3D Tiles，也不把地形、建筑和道路烘焙成单一 GLB；结构化 JSON 被保留以支持属性追踪、语义查询、碰撞分类和未来编辑。
