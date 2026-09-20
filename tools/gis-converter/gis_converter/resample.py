"""Aspect-preserving DEM resampling and explicit NoData coverage."""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass

import numpy as np
from affine import Affine
from rasterio.warp import Resampling, reproject

from .dem_reader import DemDataset
from .utils import NoDataError, ReprojectionError, ValidationError


@dataclass(frozen=True)
class HeightGrid:
    elevation: np.ndarray  # rows × cols, projected elevation; always finite
    coverage: np.ndarray  # rows × cols bool; large/edge gaps remain false
    bounds: tuple[float, float, float, float]
    original_nodata_ratio: float
    masked_nodata_ratio: float
    warnings: tuple[str, ...]

    @property
    def rows(self) -> int:
        return int(self.elevation.shape[0])

    @property
    def cols(self) -> int:
        return int(self.elevation.shape[1])


def output_shape(bounds: tuple[float, float, float, float], resolution: int) -> tuple[int, int]:
    if resolution < 2 or resolution > 4096:
        raise ValidationError("Resolution must be between 2 and 4096.")
    west, south, east, north = bounds
    width, depth = east - west, north - south
    if not np.isfinite([width, depth]).all() or width <= 0 or depth <= 0:
        raise ValidationError("Projected DEM bounds are invalid.")
    if width >= depth:
        return max(2, round((resolution - 1) * depth / width) + 1), resolution
    return resolution, max(2, round((resolution - 1) * width / depth) + 1)


def _interpolate_small_holes(values: np.ndarray, valid: np.ndarray, max_hole: int = 9) -> tuple[np.ndarray, np.ndarray]:
    rows, cols = values.shape
    coverage = valid.copy()
    seen = np.zeros_like(valid)
    for start_row in range(rows):
        for start_col in range(cols):
            if valid[start_row, start_col] or seen[start_row, start_col]:
                continue
            queue = [(start_row, start_col)]
            seen[start_row, start_col] = True
            component: list[tuple[int, int]] = []
            touches_edge = False
            while queue:
                row, col = queue.pop()
                component.append((row, col))
                touches_edge |= row in (0, rows - 1) or col in (0, cols - 1)
                for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                    nr, nc = row + dr, col + dc
                    if 0 <= nr < rows and 0 <= nc < cols and not valid[nr, nc] and not seen[nr, nc]:
                        seen[nr, nc] = True
                        queue.append((nr, nc))
            if touches_edge or len(component) > max_hole:
                continue
            pending = set(component)
            while pending:
                progressed = False
                for row, col in tuple(pending):
                    neighbors = [values[nr, nc] for dr in (-1, 0, 1) for dc in (-1, 0, 1)
                                 if (dr or dc) and 0 <= (nr := row + dr) < rows
                                 and 0 <= (nc := col + dc) < cols and coverage[nr, nc]]
                    if neighbors:
                        values[row, col] = float(np.mean(neighbors))
                        coverage[row, col] = True
                        pending.remove((row, col))
                        progressed = True
                if not progressed:
                    break
    return values, coverage


def _fill_masked_with_nearest(values: np.ndarray, coverage: np.ndarray) -> np.ndarray:
    if not coverage.any():
        raise NoDataError("Resampled grid contains no valid elevation.")
    rows, cols = values.shape
    filled = coverage.copy()
    queue = deque((int(r), int(c)) for r, c in np.argwhere(coverage))
    while queue:
        row, col = queue.popleft()
        for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nr, nc = row + dr, col + dc
            if 0 <= nr < rows and 0 <= nc < cols and not filled[nr, nc]:
                values[nr, nc] = values[row, col]
                filled[nr, nc] = True
                queue.append((nr, nc))
    return values


def resample_dem(dem: DemDataset, resolution: int = 128, method: str = "bilinear") -> HeightGrid:
    try:
        resampling = {"nearest": Resampling.nearest, "bilinear": Resampling.bilinear,
                      "cubic": Resampling.cubic}[method]
    except KeyError as exc:
        raise ValidationError(f"Unsupported resampling method: {method}") from exc
    rows, cols = output_shape(dem.bounds, resolution)
    west, south, east, north = dem.bounds
    dx, dz = (east - west) / (cols - 1), (north - south) / (rows - 1)
    # Rasterio samples pixel centres. Extend the destination pixel footprint by
    # half a grid step so the centres match the GLB/TerrainData vertices exactly.
    transform = Affine(dx, 0, west - dx / 2, 0, -dz, north + dz / 2)
    values = np.full((rows, cols), np.nan, dtype=np.float32)
    try:
        reproject(source=dem.elevation, destination=values, src_transform=dem.transform,
                  src_crs=dem.crs, src_nodata=np.nan, dst_transform=transform,
                  dst_crs=dem.crs, dst_nodata=np.nan, resampling=resampling,
                  init_dest_nodata=True)
    except (ValueError, RuntimeError) as exc:
        raise ReprojectionError(f"Could not resample {dem.path}: {exc}") from exc
    valid = np.isfinite(values) & (values != -9999)
    original_ratio = float(1 - valid.mean())
    values[~valid] = np.nan
    values, coverage = _interpolate_small_holes(values, valid)
    masked_ratio = float(1 - coverage.mean())
    values = _fill_masked_with_nearest(values, coverage)
    warnings: list[str] = []
    if original_ratio > 0.2:
        warnings.append(f"HIGH_NODATA_RATIO: {original_ratio:.1%} of output samples were NoData.")
    if masked_ratio > 0:
        warnings.append(f"MASKED_NODATA: {masked_ratio:.1%} of grid samples remain outside valid support; nearest heights are used only for finite mesh/physics geometry.")
    return HeightGrid(values, coverage, dem.bounds, original_ratio, masked_ratio, tuple(warnings))
