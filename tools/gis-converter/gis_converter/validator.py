"""Validate generated TerrainData, metadata and GLB against each other."""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import trimesh

from .utils import ValidationError


@dataclass(frozen=True)
class ValidationReport:
    terrain_id: str
    vertices: int
    triangles: int
    warnings: tuple[str, ...]


def validate_package(directory: Path) -> ValidationReport:
    directory = Path(directory)
    paths = {name: directory / name for name in ("terrain.json", "terrain.glb", "metadata.json")}
    for name, path in paths.items():
        if not path.is_file():
            raise ValidationError(f"Missing {name} in {directory}")
    try:
        terrain = json.loads(paths["terrain.json"].read_text(encoding="utf-8"))
        metadata = json.loads(paths["metadata.json"].read_text(encoding="utf-8"))
        rows, cols = int(terrain["rows"]), int(terrain["cols"])
        width, depth = float(terrain["width"]), float(terrain["depth"])
        origin = terrain["origin"]
        ox, oz = float(origin["x"]), float(origin["z"])
        heights = np.asarray(terrain["heights"], dtype=np.float64)
        coverage = np.asarray(terrain["sampleCoverage"], dtype=np.int64)
    except (ValueError, TypeError, KeyError, json.JSONDecodeError) as exc:
        raise ValidationError(f"Malformed terrain.json or metadata.json: {exc}") from exc
    if rows < 2 or cols < 2 or heights.size != rows * cols or coverage.size != heights.size:
        raise ValidationError("TerrainData rows/cols/heights/sampleCoverage lengths disagree.")
    if not math.isfinite(width) or not math.isfinite(depth) or width <= 0 or depth <= 0:
        raise ValidationError("TerrainData dimensions must be finite and positive.")
    if not np.isfinite(heights).all() or not np.isin(coverage, [0, 1]).all():
        raise ValidationError("TerrainData has NaN/Inf heights or an invalid coverage mask.")
    if not coverage.any():
        raise ValidationError("TerrainData has no supported samples.")
    if heights.min() < -1e5 or heights.max() > 1e5:
        raise ValidationError("TerrainData contains suspicious NoData-height spikes.")
    if not np.isclose(heights.min(), terrain["minHeight"], atol=1e-4) or not np.isclose(heights.max(), terrain["maxHeight"], atol=1e-4):
        raise ValidationError("TerrainData minHeight/maxHeight do not match the grid.")
    if metadata.get("terrainId") != terrain.get("terrainId") or metadata.get("grid") != {"rows": rows, "cols": cols}:
        raise ValidationError("Metadata terrain ID or grid dimensions disagree with TerrainData.")
    if metadata.get("units") != "meters" or metadata.get("localCoordinateConvention") != {"x": "east", "y": "up", "z": "south"}:
        raise ValidationError("Metadata coordinate units/convention are invalid.")
    try:
        scene = trimesh.load(paths["terrain.glb"], file_type="glb", force="scene", process=False)
        mesh = scene.to_geometry()
    except (ValueError, TypeError, OSError, RuntimeError) as exc:
        raise ValidationError(f"Could not load terrain.glb: {exc}") from exc
    if not isinstance(mesh, trimesh.Trimesh) or len(mesh.vertices) != rows * cols or len(mesh.faces) != 2 * (rows - 1) * (cols - 1):
        raise ValidationError("GLB vertex/face counts do not match TerrainData grid.")
    if not np.isfinite(mesh.vertices).all() or not np.isfinite(mesh.face_normals).all() or not (mesh.face_normals[:, 1] > 0).all():
        raise ValidationError("GLB has invalid vertices/faces or downward-facing normals.")
    expected = np.array([[ox, heights.min(), oz], [ox + width, heights.max(), oz + depth]])
    tolerance = np.maximum(1e-3, (expected[1] - expected[0]) * 1e-5)
    if not np.allclose(mesh.bounds, expected, rtol=0, atol=tolerance):
        raise ValidationError(f"GLB bounds {mesh.bounds.tolist()} do not match TerrainData bounds {expected.tolist()}.")
    warnings: list[str] = []
    if max(width, depth) > 10000 or min(width, depth) < 0.1:
        warnings.append("SUSPICIOUS_TERRAIN_SIZE: verify the source CRS and metre units.")
    return ValidationReport(str(terrain["terrainId"]), len(mesh.vertices), len(mesh.faces), tuple(warnings))
