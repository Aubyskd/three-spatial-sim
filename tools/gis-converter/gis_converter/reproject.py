"""Reproject DEMs in memory to a metre-based projected CRS."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import rasterio
from rasterio.crs import CRS
from rasterio.warp import Resampling, calculate_default_transform, reproject

from .dem_reader import DemDataset
from .utils import ReprojectionError


def reproject_dem(dem: DemDataset, target_crs: str) -> DemDataset:
    target = CRS.from_user_input(target_crs)
    if dem.crs == target:
        return dem
    try:
        transform, width, height = calculate_default_transform(
            dem.crs, target, dem.width, dem.height, *dem.bounds)
        if width < 2 or height < 2:
            raise ReprojectionError("Projected DEM is smaller than 2 × 2 pixels.")
        elevation = np.full((height, width), np.nan, dtype=np.float32)
        reproject(source=dem.elevation, destination=elevation, src_transform=dem.transform,
                  src_crs=dem.crs, src_nodata=np.nan, dst_transform=transform,
                  dst_crs=target, dst_nodata=np.nan, resampling=Resampling.bilinear,
                  init_dest_nodata=True)
        bounds = rasterio.transform.array_bounds(height, width, transform)
        return DemDataset(dem.path, target, transform, bounds, width, height, np.nan,
                          elevation, "float32")
    except ReprojectionError:
        raise
    except (rasterio.errors.RasterioError, ValueError, RuntimeError) as exc:
        raise ReprojectionError(f"Failed to reproject {dem.path} to {target}: {exc}") from exc


def save_reprojected_tif(dem: DemDataset, path: Path) -> None:
    try:
        with rasterio.open(path, "w", driver="GTiff", width=dem.width, height=dem.height,
                           count=1, dtype="float32", crs=dem.crs, transform=dem.transform,
                           nodata=np.nan) as dst:
            dst.write(dem.elevation, 1)
    except (rasterio.errors.RasterioError, OSError) as exc:
        raise ReprojectionError(f"Could not save debug GeoTIFF {path}: {exc}") from exc
