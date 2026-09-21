"""Read GeoJSON vector sources without modifying the original file."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .utils import VectorReadError


@dataclass(frozen=True)
class VectorDataset:
    path: Path
    crs: str
    features: list[dict[str, Any]]
    warnings: tuple[str, ...] = ()


@dataclass(frozen=True)
class VectorInspection:
    path: Path
    crs: str
    feature_count: int
    geometry_types: dict[str, int]
    bounds: tuple[float, float, float, float] | None
    property_keys: tuple[str, ...]
    invalid_geometries: int
    empty_geometries: int
    warnings: tuple[str, ...]


def read_vector(path: Path) -> VectorDataset:
    path = Path(path)
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise VectorReadError(f"Could not read GeoJSON {path}: {exc}") from exc
    if document.get("type") != "FeatureCollection" or not isinstance(document.get("features"), list):
        raise VectorReadError("GeoJSON root must be a FeatureCollection with a features array.")
    crs = _read_crs(document)
    warnings: list[str] = []
    if crs is None:
        crs = "EPSG:4326"
        warnings.append("MISSING_GEOJSON_CRS_ASSUMED_EPSG4326")
    features: list[dict[str, Any]] = []
    for index, feature in enumerate(document["features"]):
        if not isinstance(feature, dict) or feature.get("type") != "Feature":
            warnings.append(f"INVALID_FEATURE[{index}]: skipped non-Feature object")
            continue
        features.append(feature)
    return VectorDataset(path, crs, features, tuple(warnings))


def inspect_vector(path: Path) -> VectorInspection:
    dataset = read_vector(path)
    geometry_types: dict[str, int] = {}
    property_keys: set[str] = set()
    invalid = 0
    empty = 0
    bounds: list[float] | None = None
    for feature in dataset.features:
        properties = feature.get("properties")
        if isinstance(properties, dict):
            property_keys.update(str(key) for key in properties)
        geometry = feature.get("geometry")
        if not isinstance(geometry, dict) or not isinstance(geometry.get("type"), str):
            invalid += 1
            continue
        geometry_type = geometry["type"]
        geometry_types[geometry_type] = geometry_types.get(geometry_type, 0) + 1
        coordinates = geometry.get("coordinates")
        points = list(_coordinate_pairs(coordinates))
        if not points:
            empty += 1
            continue
        if any(not (_finite(x) and _finite(y)) for x, y in points):
            invalid += 1
            continue
        xs = [point[0] for point in points]
        ys = [point[1] for point in points]
        current = [min(xs), min(ys), max(xs), max(ys)]
        bounds = current if bounds is None else [min(bounds[0], current[0]), min(bounds[1], current[1]),
                                                  max(bounds[2], current[2]), max(bounds[3], current[3])]
    return VectorInspection(dataset.path, dataset.crs, len(dataset.features), geometry_types,
                            tuple(bounds) if bounds else None, tuple(sorted(property_keys)), invalid,
                            empty, dataset.warnings)


def _read_crs(document: dict[str, Any]) -> str | None:
    crs = document.get("crs")
    if not isinstance(crs, dict):
        return None
    properties = crs.get("properties")
    if not isinstance(properties, dict):
        return None
    name = properties.get("name")
    if not isinstance(name, str):
        return None
    upper = name.upper()
    if "EPSG::" in upper:
        return f"EPSG:{upper.rsplit('EPSG::', 1)[1]}"
    if "EPSG:" in upper:
        return f"EPSG:{upper.rsplit('EPSG:', 1)[1]}"
    return name


def _coordinate_pairs(value: Any):
    if isinstance(value, (list, tuple)):
        if len(value) >= 2 and isinstance(value[0], (int, float)) and isinstance(value[1], (int, float)):
            yield float(value[0]), float(value[1])
        else:
            for item in value:
                yield from _coordinate_pairs(item)


def _finite(value: float) -> bool:
    return value == value and abs(value) != float("inf")
