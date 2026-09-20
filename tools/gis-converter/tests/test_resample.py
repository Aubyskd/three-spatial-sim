from __future__ import annotations

import numpy as np
from affine import Affine
from rasterio.crs import CRS

from gis_converter.dem_reader import DemDataset
from gis_converter.resample import output_shape, resample_dem


def test_resample_shape() -> None:
    assert output_shape((0, 0, 1400, 1200), 128) == (110, 128)
    assert output_shape((0, 0, 1200, 1400), 128) == (128, 110)


def test_nodata_handling(tmp_path) -> None:
    values = np.arange(100, dtype=np.float32).reshape(10, 10)
    values[0:5, 0:5] = np.nan
    values[7, 7] = np.nan
    dem = DemDataset(tmp_path / "synthetic.tif", CRS.from_epsg(32618),
                     Affine(10, 0, 0, 0, -10, 100), (0, 0, 100, 100),
                     10, 10, np.nan, values, "float32")
    result = resample_dem(dem, 10, "nearest")
    assert result.elevation.shape == (10, 10)
    assert np.isfinite(result.elevation).all()
    assert result.coverage[7, 7]
    assert not result.coverage[0, 0]
    assert result.original_nodata_ratio > 0
    assert any("HIGH_NODATA_RATIO" in warning for warning in result.warnings)
