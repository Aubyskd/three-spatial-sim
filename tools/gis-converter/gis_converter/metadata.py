"""Provenance and reversible GIS ↔ local coordinate mapping."""

from __future__ import annotations

import math
from typing import Any

from .crs import CRSDecision
from .dem_reader import DemDataset
from .resample import HeightGrid


def gis_to_local(easting: float, northing: float, elevation: float,
                 metadata: dict[str, Any]) -> tuple[float, float, float]:
    origin = metadata["localOrigin"]
    scale = float(metadata["verticalScale"])
    return easting - origin["easting"], (elevation - origin["elevation"]) * scale, origin["northing"] - northing


def local_to_gis(x: float, y: float, z: float,
                 metadata: dict[str, Any]) -> tuple[float, float, float]:
    origin = metadata["localOrigin"]
    scale = float(metadata["verticalScale"])
    return x + origin["easting"], origin["northing"] - z, y / scale + origin["elevation"]


def build_metadata(source: DemDataset, grid: HeightGrid, decision: CRSDecision,
                   terrain: dict[str, Any], local_origin: dict[str, float],
                   vertical_scale: float, origin_mode: str, resampling: str) -> dict[str, Any]:
    west, south, east, north = source.bounds
    p_west, p_south, p_east, p_north = grid.bounds
    valid_source = source.elevation[source.valid]
    return {
        "terrainId": terrain["terrainId"],
        "source": {"file": source.path.name, "sourceCRS": decision.source_crs,
                   "rasterWidth": source.width, "rasterHeight": source.height,
                   "dtype": source.dtype, "nodata": source.nodata if source.nodata is None or math.isfinite(source.nodata) else None},
        "projectedCRS": decision.target_crs,
        "units": "meters",
        "localCoordinateConvention": {"x": "east", "y": "up", "z": "south"},
        "localOrigin": local_origin,
        "originMode": origin_mode,
        "verticalScale": vertical_scale,
        "resampling": resampling,
        "sourceBounds": {"west": west, "south": south, "east": east, "north": north},
        "projectedBounds": {"west": p_west, "south": p_south, "east": p_east, "north": p_north},
        "localBounds": {"origin": terrain["origin"], "width": terrain["width"],
                        "depth": terrain["depth"], "minHeight": terrain["minHeight"],
                        "maxHeight": terrain["maxHeight"]},
        "grid": {"rows": terrain["rows"], "cols": terrain["cols"]},
        "elevation": {"min": float(valid_source.min()), "max": float(valid_source.max())},
        "noData": {"sourceRatio": float(1 - source.valid.mean()),
                   "resampledRatio": grid.original_nodata_ratio,
                   "maskedRatio": grid.masked_nodata_ratio},
        "centerLongitudeLatitude": {"longitude": decision.center_lon, "latitude": decision.center_lat},
        "warnings": list((*decision.warnings, *grid.warnings)),
    }
