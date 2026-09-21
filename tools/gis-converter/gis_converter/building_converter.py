"""Convert OSM building Polygon/MultiPolygon features into terrain-local JSON."""

from __future__ import annotations

import math
import re
import statistics
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .geometry_utils import Point, clean_ring, clip_ring_to_bounds
from .terrain_sampler import TerrainSampler
from .utils import InvalidBuildingGeometryError, VectorOutputError, write_json
from .vector_crs import create_transformer, read_terrain_metadata
from .vector_reader import read_vector
from .vector_transform import local_bounds, source_to_local
from .vector_validator import validate_building_collection, validate_ring


@dataclass(frozen=True)
class BuildingConversionReport:
    input_path: Path
    output_path: Path
    terrain_id: str
    target_crs: str
    source_features: int
    polygon_count: int
    multipolygon_count: int
    output_features: int
    invalid: int
    skipped: int
    masked_features: int
    warnings: tuple[str, ...]


def building_height(properties: dict[str, Any], default_floor_height: float = 3.0,
                    default_building_height: float = 9.0) -> float:
    explicit = _parse_length(properties.get("height"))
    if explicit is not None and explicit > 0:
        return explicit
    levels = _parse_number(properties.get("building:levels"))
    if levels is not None and levels > 0:
        return levels * default_floor_height
    return default_building_height


def building_base_height(vertex_heights: list[float], strategy: str = "median") -> float:
    if not vertex_heights or not all(math.isfinite(value) for value in vertex_heights):
        raise InvalidBuildingGeometryError("Building footprint has no finite terrain heights.")
    if strategy == "median":
        return float(statistics.median(vertex_heights))
    if strategy == "mean":
        return float(statistics.fmean(vertex_heights))
    if strategy == "min":
        return min(vertex_heights)
    raise InvalidBuildingGeometryError(f"Unsupported building base strategy: {strategy}")


def convert_buildings(input_path: Path, metadata_path: Path, terrain_path: Path, output_path: Path,
                      default_floor_height: float = 3.0, default_building_height: float = 9.0,
                      base_strategy: str = "median") -> BuildingConversionReport:
    if default_floor_height <= 0 or default_building_height <= 0:
        raise InvalidBuildingGeometryError("Building height defaults must be greater than zero.")
    if Path(input_path).resolve() == Path(output_path).resolve():
        raise VectorOutputError("Refusing to overwrite the source GeoJSON.")
    dataset = read_vector(input_path)
    metadata = read_terrain_metadata(metadata_path)
    terrain = TerrainSampler.from_json(terrain_path)
    if terrain.terrain_id != metadata.get("terrainId"):
        raise InvalidBuildingGeometryError("TerrainData and metadata terrainId do not match.")
    transformer = create_transformer(dataset.crs, metadata)
    bounds = local_bounds(metadata)
    output: list[dict[str, Any]] = []
    invalid = skipped = masked_features = polygon_count = multipolygon_count = 0
    warnings = list(dataset.warnings)
    for index, feature in enumerate(dataset.features):
        geometry = feature.get("geometry")
        geometry_type = geometry.get("type") if isinstance(geometry, dict) else None
        if geometry_type == "Polygon":
            polygons = [geometry.get("coordinates")]
            polygon_count += 1
        elif geometry_type == "MultiPolygon":
            polygons = geometry.get("coordinates")
            multipolygon_count += 1
        else:
            warnings.append(f"UNSUPPORTED_GEOMETRY[{index}]: {geometry_type}; skipped building")
            skipped += 1
            continue
        if not isinstance(polygons, list):
            invalid += 1; skipped += 1
            warnings.append(f"INVALID_BUILDING[{index}]: missing polygon coordinates")
            continue
        properties = feature.get("properties") if isinstance(feature.get("properties"), dict) else {}
        source_id = str(feature.get("id", properties.get("@id", index)))
        for part_index, polygon in enumerate(polygons):
            if not isinstance(polygon, list) or not polygon:
                invalid += 1; skipped += 1
                warnings.append(f"INVALID_BUILDING[{source_id}:{part_index}]: empty polygon")
                continue
            rings: list[list[Point]] = []
            failed = False
            invalid_geometry = False
            for ring_index, source_ring in enumerate(polygon):
                try:
                    local_ring = clean_ring(source_to_local(point[0], point[1], transformer, metadata)
                                            for point in source_ring if isinstance(point, (list, tuple)) and len(point) >= 2)
                except (TypeError, ValueError) as exc:
                    warnings.append(f"INVALID_BUILDING[{source_id}:{part_index}]: {exc}")
                    failed = True; invalid_geometry = True; break
                validation = validate_ring(local_ring)
                if not validation.valid:
                    warnings.append(f"INVALID_BUILDING[{source_id}:{part_index}:{ring_index}]: {validation.reason}")
                    failed = True; invalid_geometry = True; break
                clipped = clip_ring_to_bounds(local_ring, bounds)
                if ring_index == 0 and not clipped:
                    failed = True; break
                if clipped:
                    rings.append(clipped)
            if failed or not rings:
                if invalid_geometry: invalid += 1
                skipped += 1
                continue
            samples = [terrain.sample(x, z) for ring in rings for x, z in ring[:-1]]
            if any(sample.masked for sample in samples):
                masked_features += 1
            base_height = building_base_height([sample.height for sample in samples], base_strategy)
            extrude_height = building_height(properties, default_floor_height, default_building_height)
            normalized_properties = {
                "building": properties.get("building"), "name": properties.get("name"),
                "height": properties.get("height"), "building:levels": properties.get("building:levels"),
                "addr:street": properties.get("addr:street"), "addr:housenumber": properties.get("addr:housenumber"),
                "raw": properties,
            }
            output.append({
                "id": f"{source_id}-part-{part_index}", "type": "building",
                "rings": [[[x, z] for x, z in ring] for ring in rings],
                "properties": normalized_properties, "baseHeight": base_height,
                "extrudeHeight": extrude_height,
                "terrainHeights": [[terrain.height_at(x, z) for x, z in ring] for ring in rings],
                "sourceFeatureId": source_id,
                "sourceType": geometry_type, "sourceProperties": properties,
            })
    if masked_features:
        warnings.append(f"VECTOR_ON_MASKED_TERRAIN: {masked_features} building parts use finite fallback terrain heights")
    collection = {
        "type": "BuildingCollection", "terrainId": terrain.terrain_id,
        "projectedCRS": metadata["projectedCRS"],
        "coordinateConvention": {"x": "east", "y": "up", "z": "south"},
        "features": output, "warnings": warnings,
    }
    validate_building_collection(collection)
    try:
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        write_json(Path(output_path), collection)
    except OSError as exc:
        raise VectorOutputError(f"Could not write buildings output {output_path}: {exc}") from exc
    return BuildingConversionReport(Path(input_path), Path(output_path), terrain.terrain_id,
                                    str(metadata["projectedCRS"]), len(dataset.features), polygon_count,
                                    multipolygon_count, len(output), invalid, skipped, masked_features,
                                    tuple(warnings))


def _parse_number(value: Any) -> float | None:
    if isinstance(value, (int, float)) and math.isfinite(float(value)):
        return float(value)
    if isinstance(value, str):
        match = re.search(r"[-+]?\d+(?:\.\d+)?", value.replace(",", "."))
        if match:
            return float(match.group())
    return None


def _parse_length(value: Any) -> float | None:
    number = _parse_number(value)
    if number is None:
        return None
    text = str(value).lower()
    if "ft" in text or "feet" in text or "'" in text:
        return number * 0.3048
    return number
