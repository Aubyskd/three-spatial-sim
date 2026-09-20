from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest
import rasterio
from rasterio.transform import from_bounds


@pytest.fixture
def synthetic_aw3d30(tmp_path: Path) -> Path:
    """Small NYC-area WGS84 DEM with the ground-truth raster shape/scale."""
    path = tmp_path / "output_AW3D30.tif"
    rows, cols = 39, 59
    row, col = np.meshgrid(np.arange(rows), np.arange(cols), indexing="ij")
    elevation = (-4 + 52 * (0.55 * col / (cols - 1) + 0.45 * row / (rows - 1))).astype("float32")
    elevation[10, 12] = -9999
    transform = from_bounds(-73.7585, 40.7446, -73.7415, 40.7554, cols, rows)
    with rasterio.open(path, "w", driver="GTiff", width=cols, height=rows,
                       count=1, dtype="float32", crs="EPSG:4326", transform=transform,
                       nodata=-9999) as dst:
        dst.write(elevation, 1)
    return path
