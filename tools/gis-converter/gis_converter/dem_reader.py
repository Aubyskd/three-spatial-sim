"""Read band 1 of a GeoTIFF without treating NoData as elevation."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import rasterio
from affine import Affine
from rasterio.crs import CRS

from .utils import InvalidRasterError, MissingCRSError, NoDataError


@dataclass(frozen=True)
class DemDataset:
    path: Path
    crs: CRS
    transform: Affine
    bounds: tuple[float, float, float, float]  # west, south, east, north
    width: int
    height: int
    nodata: float | None
    elevation: np.ndarray  # float32; invalid source pixels are NaN
    dtype: str

    @property
    def valid(self) -> np.ndarray:
        return np.isfinite(self.elevation) & (self.elevation != -9999)


def read_dem(path: Path) -> DemDataset:
    path = Path(path)
    if not path.is_file():
        raise InvalidRasterError(f"GeoTIFF does not exist: {path}")
    try:
        with rasterio.open(path) as src:
            if src.count < 1 or src.width < 2 or src.height < 2:
                raise InvalidRasterError("DEM requires band 1 and at least 2 × 2 pixels.")
            if src.crs is None:
                raise MissingCRSError(f"{path} has no CRS.")
            if not src.transform.is_rectilinear:
                raise InvalidRasterError("Rotated or sheared raster grids are not supported in V0.4.")
            if src.bounds.right <= src.bounds.left or src.bounds.top <= src.bounds.bottom:
                raise InvalidRasterError("DEM bounds are invalid.")
            band = src.read(1, masked=True).astype(np.float32)
            elevation = np.asarray(band.filled(np.nan), dtype=np.float32)
            elevation[~np.isfinite(elevation) | (elevation == -9999)] = np.nan
            if not np.isfinite(elevation).any():
                raise NoDataError(f"{path} has no valid elevations.")
            return DemDataset(path, src.crs, src.transform,
                              (src.bounds.left, src.bounds.bottom, src.bounds.right, src.bounds.top),
                              src.width, src.height, src.nodata, elevation, src.dtypes[0])
    except (InvalidRasterError, MissingCRSError, NoDataError):
        raise
    except (rasterio.errors.RasterioError, OSError, ValueError) as exc:
        raise InvalidRasterError(f"Cannot read {path}: {exc}") from exc
