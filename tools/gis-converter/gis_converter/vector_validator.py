"""Geometry validation shared by building and road conversion."""

from __future__ import annotations

import math
from dataclasses import dataclass

from .geometry_utils import Point, clean_line, clean_ring, ring_area, ring_self_intersects
from .utils import ValidationError


@dataclass(frozen=True)
class GeometryValidation:
    valid: bool
    reason: str | None = None


def validate_ring(points: list[Point]) -> GeometryValidation:
    ring = clean_ring(points)
    if len(ring) < 4:
        return GeometryValidation(False, "polygon ring has fewer than three unique vertices")
    if not all(math.isfinite(value) and abs(value) < 10_000_000 for point in ring for value in point):
        return GeometryValidation(False, "polygon contains non-finite or extreme coordinates")
    if abs(ring_area(ring)) <= 1e-6:
        return GeometryValidation(False, "polygon ring area is zero")
    if ring_self_intersects(ring):
        return GeometryValidation(False, "polygon ring self-intersects")
    return GeometryValidation(True)


def validate_line(points: list[Point]) -> GeometryValidation:
    line = clean_line(points)
    if len(line) < 2:
        return GeometryValidation(False, "line has fewer than two unique vertices")
    if not all(math.isfinite(value) and abs(value) < 10_000_000 for point in line for value in point):
        return GeometryValidation(False, "line contains non-finite or extreme coordinates")
    return GeometryValidation(True)


def validate_building_collection(collection: dict) -> None:
    _validate_collection_header(collection, "BuildingCollection")
    for feature in collection["features"]:
        if feature.get("type") != "building" or not math.isfinite(feature.get("baseHeight", math.nan)) \
                or not math.isfinite(feature.get("extrudeHeight", math.nan)) or feature["extrudeHeight"] <= 0:
            raise ValidationError(f"Invalid processed building feature: {feature.get('id')}")
        rings = feature.get("rings")
        if not isinstance(rings, list) or not rings or not all(validate_ring([tuple(point[:2]) for point in ring]).valid for ring in rings):
            raise ValidationError(f"Invalid processed building rings: {feature.get('id')}")


def validate_road_collection(collection: dict) -> None:
    _validate_collection_header(collection, "RoadCollection")
    for feature in collection["features"]:
        centerline = feature.get("centerline")
        if feature.get("type") != "road" or not math.isfinite(feature.get("width", math.nan)) or feature["width"] <= 0 \
                or not isinstance(centerline, list) or len(centerline) < 2 \
                or not all(len(point) >= 3 and all(math.isfinite(float(value)) for value in point[:3]) for point in centerline):
            raise ValidationError(f"Invalid processed road feature: {feature.get('id')}")


def _validate_collection_header(collection: dict, expected_type: str) -> None:
    if collection.get("type") != expected_type or not isinstance(collection.get("terrainId"), str) \
            or not isinstance(collection.get("projectedCRS"), str) or not isinstance(collection.get("features"), list):
        raise ValidationError(f"Invalid {expected_type} header.")
    if collection.get("coordinateConvention") != {"x": "east", "y": "up", "z": "south"}:
        raise ValidationError(f"{expected_type} has the wrong coordinate convention.")
