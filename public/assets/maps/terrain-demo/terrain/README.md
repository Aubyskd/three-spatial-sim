# 旧版地形资源目录说明

本目录属于早期 V0.1 示例，**不是当前网页默认地形的入口**。旧代码 `src/map/TerrainBuilder.ts` 保留了高度图与程序生成地形逻辑，可供阅读或迁移参考；当前 `src/main.ts` 启动的是 `MultiTerrainSimulation`，它通过上一级的 `manifest.json` 发现 GLB 或已转换的 GIS 地形包。

要添加当前平台可切换的地形，请按项目根目录 [README.md](../../../../../README.md#3-地形选择识别重新加载) 修改 `public/assets/maps/terrain-demo/manifest.json`，不要仅向本目录放入 `heightmap.png` 后期待它自动出现。GeoTIFF 转换请看 [中文接入步骤](../../../../../tools/GIS_GeoTIFF_地形转换与平台接入步骤.md)。
