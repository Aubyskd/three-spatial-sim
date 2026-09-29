# GeoTIFF 地形转换与 Three.js 平台接入步骤

> **环境要求：转换工具支持 Python 3.11 及以上；下文的实测输出以 Python 3.13 为例。**
>
> **依赖要求：先按 `tools/gis-converter/README.md` 安装 requirements，包括 NumPy、Rasterio、PyProj、Trimesh 和 Pytest。**

本文记录如何使用项目中的 GIS Import Pipeline，将 GeoTIFF DEM 文件转换为 Spatial Lab/Three.js 平台可使用的地形包，并将其注册到地图清单中。

转换流程如下：

```text
GeoTIFF DEM
    ↓
检查 CRS、范围、高程与 NoData
    ↓
转换为米制坐标系和等比例高度网格
    ↓
生成 terrain.json、terrain.glb、metadata.json
    ↓
验证地形包
    ↓
写入 manifest.json
    ↓
在 Three.js 平台中加载
```

## 一、项目与文件位置

本文使用的项目根目录为：

```text
C:\Users\31985\Desktop\three-spatial-sim
```

GIS 转换工具目录为：

```text
C:\Users\31985\Desktop\three-spatial-sim\tools\gis-converter
```

将待转换的 GeoTIFF 文件放入：

```text
tools\gis-converter\input
```

本文使用的输入文件为：

```text
tools\gis-converter\input\output_AW3D30.tif
```

预期生成的地形目录为：

```text
public\assets\maps\terrain-demo\generated\my-dem
```

## 二、进入转换工具目录并激活虚拟环境

打开 PowerShell，执行：

```powershell
cd C:\Users\31985\Desktop\three-spatial-sim\tools\gis-converter
```

激活虚拟环境：

```powershell
.\.venv\Scripts\Activate.ps1
```

成功后，PowerShell 命令行开头应显示：

```text
(.venv)
```

确认当前 Python 版本（需不低于 3.11）：

```powershell
python --version
```

本文示例环境输出为 Python 3.13，例如：

```text
Python 3.13.5
```

确认当前解释器来自项目虚拟环境，并且是 64 位：

```powershell
python -c "import sys, platform; print(sys.executable); print(platform.architecture())"
```

预期结果应满足：

- Python 路径指向 `tools\gis-converter\.venv\Scripts\python.exe`。
- 系统架构显示 `64bit`。

## 三、检查 GeoTIFF 数据

正式转换前，执行检查命令：

```powershell
python -m gis_converter.cli inspect --input input/output_AW3D30.tif
```

本次数据检查结果为：

```text
CRS: EPSG:4326
Bounds: west=-74.38361111, south=41.95138889, east=-74.18277778, north=42.04694444
Raster: 723 × 344
Pixel size: 0.00027778 × 0.00027778
NoData: None; missing ratio=0.0%
Elevation: 165.00m → 1197.00m
Center longitude/latitude: -74.283194, 41.999167
Suggested target CRS: EPSG:32618
```

检查时重点确认：

1. 命令可以正常读取文件，没有出现文件不存在或格式错误。
2. 原始 CRS 能够识别。
3. 栅格尺寸、高程范围和地图范围符合预期。
4. 缺失数据比例没有异常偏高。
5. 工具给出了合理的目标米制坐标系。

该 GeoTIFF 使用经纬度坐标系 `EPSG:4326`。工具根据地图中心位置自动推荐 UTM 18N，即 `EPSG:32618`，转换后的水平单位为米。

## 四、首次转换地形

执行：

```powershell
python -m gis_converter.cli convert --input input/output_AW3D30.tif --output ../../public/assets/maps/terrain-demo/generated/my-dem --terrain-id my-dem --resolution 128 --target-crs auto
```

参数说明：

| 参数 | 本次取值 | 作用 |
| --- | --- | --- |
| `--input` | `input/output_AW3D30.tif` | 指定输入 DEM 文件 |
| `--output` | `../../public/assets/maps/terrain-demo/generated/my-dem` | 指定地形包输出目录 |
| `--terrain-id` | `my-dem` | 设置地形的唯一标识 |
| `--resolution` | `128` | 将较长一边重采样为 128 个顶点 |
| `--target-crs` | `auto` | 根据地理中心自动选择米制投影坐标系 |

本次转换得到：

```text
Target CRS: EPSG:32618
Output grid: 128 × 83
Terrain size: 16731.3m × 10743.5m
Elevation: 165.00m → 1197.00m
Vertices: 10624
Triangles: 20828
NoData: 3.8%
```

检查输出目录：

```powershell
Get-ChildItem ../../public/assets/maps/terrain-demo/generated/my-dem
```

目录中必须包含以下三个文件：

```text
my-dem
├── metadata.json
├── terrain.glb
└── terrain.json
```

三个文件的作用如下：

| 文件 | 作用 |
| --- | --- |
| `terrain.json` | 平台运行时使用的地形高度、覆盖范围及相关数据，是地形数据的主要来源 |
| `terrain.glb` | 由同一高度网格生成的可移植三维模型，用于预览和一致性验证 |
| `metadata.json` | 记录原始 GIS 信息、坐标系、投影范围、局部原点及正反坐标映射 |

## 五、理解转换警告

本次转换出现以下两个警告：

### 1. `MASKED_NODATA`

```text
WARNING MASKED_NODATA: 3.8% of grid samples remain outside valid support
```

含义：重投影和重采样后，约 3.8% 的网格位于原始栅格的有效覆盖范围之外，通常出现在转换后的边缘区域。

工具会用最近的有效高度填充这些位置，以保证 GLB 网格和物理高度场中的数值有限；同时在 `sampleCoverage` 中保留无效标记，使导航和物体放置逻辑能够拒绝这些区域。3.8% 的比例不高，本次可以接受。

### 2. `SUSPICIOUS_TERRAIN_SIZE`

```text
WARNING SUSPICIOUS_TERRAIN_SIZE: verify the source CRS and metre units.
```

含义：工具检测到地形尺寸较大，提醒确认原始 CRS 与米制单位是否正确。

本次地形尺寸约为 `16.7 km × 10.7 km`，与原始经纬度范围相符；源 CRS 为 `EPSG:4326`，目标 CRS 为 `EPSG:32618`，因此该警告属于尺寸提醒，不表示转换失败。

## 六、验证地形包

执行：

```powershell
python -m gis_converter.cli validate --terrain ../../public/assets/maps/terrain-demo/generated/my-dem
```

本次正确结果为：

```text
VALID my-dem: 10624 vertices, 20828 triangles
WARNING SUSPICIOUS_TERRAIN_SIZE: verify the source CRS and metre units.
```

出现 `VALID my-dem` 表示验证通过。验证过程会检查：

- 必要文件是否齐全。
- 高度值是否为有效有限值。
- 高度网格与覆盖遮罩尺寸是否一致。
- 地形法线方向是否正确。
- GLB 顶点数和三角形数是否正确。
- GLB 空间范围是否与 `terrain.json` 一致。

如果只有已经确认过的 `SUSPICIOUS_TERRAIN_SIZE` 警告，而没有 `ERROR` 或 `FAILED`，可以继续注册地形。

## 七、将地形注册到 manifest.json

首次转换默认不会修改地图清单。验证通过后，重新执行转换，并添加 `--overwrite` 与 `--update-manifest`：

```powershell
python -m gis_converter.cli convert --input input/output_AW3D30.tif --output ../../public/assets/maps/terrain-demo/generated/my-dem --terrain-id my-dem --resolution 128 --target-crs auto --overwrite --update-manifest
```

其中：

- `--overwrite`：允许替换已经存在的 `my-dem` 输出目录。工具会先创建带唯一后缀的备份目录。
- `--update-manifest`：在转换和验证成功后，将地形条目写入地图清单。

工具会备份：

- 原有的 `generated/my-dem` 输出目录。
- 原有的 `public/assets/maps/terrain-demo/manifest.json`。

检查清单中是否已经出现 `my-dem`：

```powershell
Select-String -Path ../../public/assets/maps/terrain-demo/manifest.json -Pattern '"my-dem"' -Context 0,10
```

预期清单条目为：

```json
{
  "id": "my-dem",
  "name": "my-dem",
  "type": "glb",
  "source": "generated/my-dem/terrain.glb",
  "data": "generated/my-dem/terrain.json",
  "metadata": "generated/my-dem/metadata.json",
  "samplingResolution": 128
}
```

PowerShell 可能因为终端宽度不足而把较长路径换行显示。这只是显示折行，不代表 JSON 字符串中存在换行。

## 八、启动 Three.js 平台

从 `tools\gis-converter` 返回项目根目录：

```powershell
cd ../..
```

当前路径应为：

```text
C:\Users\31985\Desktop\three-spatial-sim
```

启动开发服务器：

```powershell
npm run dev
```

终端会显示本地访问地址，例如：

```text
http://localhost:5173/
```

保持该 PowerShell 窗口运行，在浏览器中打开终端提供的地址。

## 九、网页端验收

在地形或地图选择界面中选择：

```text
my-dem
```

依次确认：

1. 地图清单中能够找到 `my-dem`。
2. 选择后地形能够正常加载。
3. 山体高度和朝向符合预期。
4. 页面没有出现地形加载错误。
5. 浏览器开发者工具的 Console 中没有与 `terrain.json`、`terrain.glb` 或 `metadata.json` 有关的错误。
6. 镜头可以正常观察约 `16.7 km × 10.7 km` 的地形范围。

满足以上条件，即完成从 GeoTIFF DEM 到 Three.js 平台地形的完整转换与接入。

## 十、后续重复使用时的命令顺序

更换新的 `.tif` 或 `.tiff` 文件时，按照以下顺序执行：

1. 将新文件放入 `tools/gis-converter/input`。
2. 使用 `inspect` 检查 CRS、范围、高程和缺失数据。
3. 使用不带 `--update-manifest` 的 `convert` 首次生成地形包。
4. 使用 `validate` 验证生成结果。
5. 确认结果正确后，使用 `--overwrite --update-manifest` 重新转换并注册。
6. 返回项目根目录，执行 `npm run dev`。
7. 在网页中选择新地形并完成视觉与控制台验收。

通用命令模板如下：

```powershell
python -m gis_converter.cli inspect --input input/<输入文件名>.tif
```

```powershell
python -m gis_converter.cli convert --input input/<输入文件名>.tif --output ../../public/assets/maps/terrain-demo/generated/<地形ID> --terrain-id <地形ID> --resolution 128 --target-crs auto
```

```powershell
python -m gis_converter.cli validate --terrain ../../public/assets/maps/terrain-demo/generated/<地形ID>
```

```powershell
python -m gis_converter.cli convert --input input/<输入文件名>.tif --output ../../public/assets/maps/terrain-demo/generated/<地形ID> --terrain-id <地形ID> --resolution 128 --target-crs auto --overwrite --update-manifest
```

地形 ID 必须保持唯一，并且输出文件夹名称应与地形 ID 一致。
