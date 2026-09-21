"""CRS handling for vector data, driven by terrain metadata."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from pyproj import CRS, Transformer

from .utils import VectorCRSError


def read_terrain_metadata(path: Path) -> dict[str, Any]:
    try:
        metadata = json.loads(Path(path).read_text(encoding="utf-8"))
        projected = metadata["projectedCRS"]
        origin = metadata["localOrigin"]
        convention = metadata["localCoordinateConvention"]
        CRS.from_user_input(projected)
        for key in ("easting", "northing", "elevation"):
            if not isinstance(origin[key], (int, float)):
                raise TypeError(f"localOrigin.{key} is not numeric")
        if convention != {"x": "east", "y": "up", "z": "south"}:
            raise VectorCRSError("Terrain metadata must declare X=east, Y=up, Z=south.")
        return metadata
    except VectorCRSError:
        raise
    except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise VectorCRSError(f"Invalid terrain metadata {path}: {exc}") from exc


def create_transformer(source_crs: str, metadata: dict[str, Any]) -> Transformer:
    try:
        source = CRS.from_user_input(source_crs)
        target = CRS.from_user_input(metadata["projectedCRS"])
        if not target.is_projected:
            raise VectorCRSError(f"Terrain projectedCRS is not projected: {target.to_string()}")
        return Transformer.from_crs(source, target, always_xy=True)
    except VectorCRSError:
        raise
    except (KeyError, ValueError) as exc:
        raise VectorCRSError(f"Could not create vector CRS transform: {exc}") from exc
