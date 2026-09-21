"""Transform projected GIS coordinates into the terrain's exact local frame."""

from __future__ import annotations

import math
from typing import Any

from pyproj import Transformer

from .utils import VectorTransformError


def projected_to_local(easting: float, northing: float, metadata: dict[str, Any],
                       elevation: float | None = None) -> tuple[float, float] | tuple[float, float, float]:
    origin = metadata["localOrigin"]
    x = float(easting) - float(origin["easting"])
    z = float(origin["northing"]) - float(northing)
    if not math.isfinite(x) or not math.isfinite(z):
        raise VectorTransformError("Projected coordinate produced a non-finite local coordinate.")
    if elevation is None:
        return x, z
    y = (float(elevation) - float(origin["elevation"])) * float(metadata.get("verticalScale", 1.0))
    if not math.isfinite(y):
        raise VectorTransformError("Elevation produced a non-finite local Y coordinate.")
    return x, y, z


def source_to_local(x: float, y: float, transformer: Transformer,
                    metadata: dict[str, Any]) -> tuple[float, float]:
    try:
        easting, northing = transformer.transform(float(x), float(y))
        local = projected_to_local(easting, northing, metadata)
        return float(local[0]), float(local[1])
    except VectorTransformError:
        raise
    except (TypeError, ValueError, OverflowError) as exc:
        raise VectorTransformError(f"Could not transform vector coordinate ({x}, {y}): {exc}") from exc


def local_bounds(metadata: dict[str, Any]) -> tuple[float, float, float, float]:
    bounds = metadata["localBounds"]
    origin = bounds["origin"]
    return (float(origin["x"]), float(origin["z"]),
            float(origin["x"]) + float(bounds["width"]),
            float(origin["z"]) + float(bounds["depth"]))
