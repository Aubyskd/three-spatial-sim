"""Convert a projected height grid into the front-end TerrainData schema."""

from __future__ import annotations

import math
from typing import Any

import numpy as np

from .resample import HeightGrid
from .utils import ValidationError, validate_terrain_id


def local_origin(grid: HeightGrid, mode: str) -> dict[str, float]:
    west, south, east, north = grid.bounds
    if mode == "center":
        easting, northing = (west + east) / 2, (south + north) / 2
    elif mode == "southwest":
        easting, northing = west, south
    elif mode == "min":
        # Minimum local X and Z at zero: projected north-west corner.
        easting, northing = west, north
    else:
        raise ValidationError(f"Unknown origin mode: {mode}")
    return {"easting": float(easting), "northing": float(northing),
            "elevation": float(np.min(grid.elevation))}


def build_terrain_data(grid: HeightGrid, terrain_id: str, vertical_scale: float = 1.0,
                       origin_mode: str = "center") -> tuple[dict[str, Any], dict[str, float]]:
    validate_terrain_id(terrain_id)
    if not math.isfinite(vertical_scale) or vertical_scale <= 0:
        raise ValidationError("Vertical scale must be finite and positive.")
    west, south, east, north = grid.bounds
    origin = local_origin(grid, origin_mode)
    width, depth = east - west, north - south
    origin_x, origin_z = west - origin["easting"], origin["northing"] - north
    heights = ((grid.elevation.astype(np.float64) - origin["elevation"]) * vertical_scale).astype(np.float32)
    if not np.isfinite(heights).all():
        raise ValidationError("Terrain heights contain non-finite values.")
    center_x, center_z = origin_x + width / 2, origin_z + depth / 2
    terrain = {
        "terrainId": terrain_id,
        "width": float(width), "depth": float(depth),
        "rows": grid.rows, "cols": grid.cols,
        "origin": {"x": float(origin_x), "y": 0.0, "z": float(origin_z)},
        "minHeight": float(heights.min()), "maxHeight": float(heights.max()),
        "heights": heights.ravel(order="C").tolist(),
        "sampleCoverage": grid.coverage.astype(np.uint8).ravel(order="C").tolist(),
        "waterRegions": [],
        "semanticRegions": [{"id": "terrain-land", "type": "grass", "walkable": True,
                             "movementCost": 1.3,
                             "shape": {"kind": "rectangle", "center": {"x": float(center_x), "z": float(center_z)},
                                       "width": float(width), "depth": float(depth)}}],
        "detectedMeshes": [{"name": "GIS DEM terrain", "role": "land", "vertices": grid.rows * grid.cols}],
        "revision": 0,
        "source": {"type": "gis-dem"},
    }
    return terrain, origin
