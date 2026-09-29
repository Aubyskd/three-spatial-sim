"""Convert OSM road LineString/MultiLineString features into terrain-local ribbons."""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .geometry_utils import Point, clean_line, clip_polyline_to_bounds, densify_line
from .terrain_sampler import TerrainSampler
from .utils import InvalidRoadGeometryError, VectorOutputError, write_json
from .vector_crs import create_transformer, read_terrain_metadata
from .vector_reader import read_vector
from .vector_transform import local_bounds, source_to_local
from .vector_validator import validate_line, validate_road_collection

ROAD_WIDTHS = {
    "motorway": 12.0, "trunk": 11.0, "primary": 10.0, "secondary": 8.0,
    "tertiary": 7.0, "residential": 6.0, "service": 4.0, "living_street": 4.0,
    "cycleway": 2.5, "footway": 2.0, "path": 1.5, "track": 3.0,
}


@dataclass(frozen=True)
class RoadConversionReport:
    input_path: Path
    output_path: Path
    terrain_id: str
    target_crs: str
    source_features: int
    linestring_count: int
    multilinestring_count: int
    output_features: int
    invalid: int
    skipped: int
    masked_features: int
    warnings: tuple[str, ...]


def road_width(properties: dict[str, Any]) -> float:
    highway = str(properties.get("highway") or "").split(";")[0]
    width = ROAD_WIDTHS.get(highway, 4.0)
    lanes = _parse_number(properties.get("lanes"))
    if lanes is not None and lanes > 0 and highway not in {"cycleway", "footway", "path", "track"}:
        width = max(width, lanes * 3.2)
    return width


def convert_roads(input_path: Path, metadata_path: Path, terrain_path: Path, output_path: Path,
                  height_offset: float = 0.05, max_segment_length: float = 10.0) -> RoadConversionReport:
    if max_segment_length <= 0 or not math.isfinite(height_offset):
        raise InvalidRoadGeometryError("Road max segment length must be positive and offset finite.")
    if Path(input_path).resolve() == Path(output_path).resolve():
        raise VectorOutputError("Refusing to overwrite the source GeoJSON.")
    dataset = read_vector(input_path)
    metadata = read_terrain_metadata(metadata_path)
    terrain = TerrainSampler.from_json(terrain_path)
    if terrain.terrain_id != metadata.get("terrainId"):
        raise InvalidRoadGeometryError("TerrainData and metadata terrainId do not match.")
    transformer = create_transformer(dataset.crs, metadata)
    bounds = local_bounds(metadata)
    output: list[dict[str, Any]] = []
    invalid = skipped = masked_features = linestring_count = multilinestring_count = 0
    warnings = list(dataset.warnings)
    for index, feature in enumerate(dataset.features):
        geometry = feature.get("geometry")
        geometry_type = geometry.get("type") if isinstance(geometry, dict) else None
        if geometry_type == "LineString":
            lines = [geometry.get("coordinates")]
            linestring_count += 1
        elif geometry_type == "MultiLineString":
            lines = geometry.get("coordinates")
            multilinestring_count += 1
        else:
            warnings.append(f"UNSUPPORTED_GEOMETRY[{index}]: {geometry_type}; skipped road")
            skipped += 1
            continue
        if not isinstance(lines, list):
            invalid += 1; skipped += 1
            warnings.append(f"INVALID_ROAD[{index}]: missing line coordinates")
            continue
        properties = feature.get("properties") if isinstance(feature.get("properties"), dict) else {}
        source_id = str(feature.get("id", properties.get("@id", index)))
        for part_index, source_line in enumerate(lines):
            try:
                local_line = clean_line(source_to_local(point[0], point[1], transformer, metadata)
                                        for point in source_line if isinstance(point, (list, tuple)) and len(point) >= 2)
            except (TypeError, ValueError) as exc:
                warnings.append(f"INVALID_ROAD[{source_id}:{part_index}]: {exc}")
                invalid += 1; skipped += 1
                continue
            validation = validate_line(local_line)
            if not validation.valid:
                warnings.append(f"INVALID_ROAD[{source_id}:{part_index}]: {validation.reason}")
                invalid += 1; skipped += 1
                continue
            clipped_parts = clip_polyline_to_bounds(local_line, bounds)
            if not clipped_parts:
                skipped += 1
                continue
            for clip_index, clipped in enumerate(clipped_parts):
                dense = densify_line(clipped, max_segment_length)
                samples = [terrain.sample(x, z) for x, z in dense]
                if any(sample.masked for sample in samples):
                    masked_features += 1
                centerline = [[x, sample.height + height_offset, z] for (x, z), sample in zip(dense, samples)]
                normalized_properties = {
                    "highway": properties.get("highway"), "name": properties.get("name"),
                    "lanes": properties.get("lanes"), "surface": properties.get("surface"),
                    "maxspeed": properties.get("maxspeed"), "oneway": properties.get("oneway"),
                    "bridge": properties.get("bridge"), "tunnel": properties.get("tunnel"),
                    "layer": properties.get("layer"),
                    "raw": properties,
                }
                output.append({
                    "id": f"{source_id}-part-{part_index}-{clip_index}", "type": "road",
                    "centerline": centerline, "properties": normalized_properties,
                    "width": road_width(properties), "sourceFeatureId": source_id,
                    "sourceType": geometry_type, "sourceProperties": properties,
                })
    if masked_features:
        warnings.append(f"VECTOR_ON_MASKED_TERRAIN: {masked_features} road parts use finite fallback terrain heights")
    collection = {
        "type": "RoadCollection", "terrainId": terrain.terrain_id,
        "projectedCRS": metadata["projectedCRS"],
        "coordinateConvention": {"x": "east", "y": "up", "z": "south"},
        "features": output, "warnings": warnings,
    }
    validate_road_collection(collection)
    try:
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        write_json(Path(output_path), collection)
    except OSError as exc:
        raise VectorOutputError(f"Could not write roads output {output_path}: {exc}") from exc
    return RoadConversionReport(Path(input_path), Path(output_path), terrain.terrain_id,
                                str(metadata["projectedCRS"]), len(dataset.features), linestring_count,
                                multilinestring_count, len(output), invalid, skipped, masked_features,
                                tuple(warnings))


def _parse_number(value: Any) -> float | None:
    if isinstance(value, (int, float)) and math.isfinite(float(value)):
        return float(value)
    if isinstance(value, str):
        match = re.search(r"[-+]?\d+(?:\.\d+)?", value.replace(",", "."))
        return float(match.group()) if match else None
    return None
