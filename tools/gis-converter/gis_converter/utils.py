"""Shared errors, paths, and JSON utilities."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any


class GISConverterError(Exception):
    code = "GIS_CONVERTER_ERROR"

    def __str__(self) -> str:
        return f"{self.code}: {super().__str__()}"


class MissingCRSError(GISConverterError):
    code = "MISSING_CRS"


class UnsupportedCRSError(GISConverterError):
    code = "UNSUPPORTED_CRS"


class ReprojectionError(GISConverterError):
    code = "REPROJECTION_FAILED"


class InvalidRasterError(GISConverterError):
    code = "INVALID_RASTER"


class NoDataError(GISConverterError):
    code = "NO_VALID_ELEVATION"


class MeshBuildError(GISConverterError):
    code = "MESH_BUILD_FAILED"


class GLBExportError(GISConverterError):
    code = "GLB_EXPORT_FAILED"


class ValidationError(GISConverterError):
    code = "VALIDATION_FAILED"


class ManifestUpdateError(GISConverterError):
    code = "MANIFEST_UPDATE_FAILED"


class OutputExistsError(GISConverterError):
    code = "OUTPUT_EXISTS"


class VectorReadError(GISConverterError):
    code = "VECTOR_READ_ERROR"


class UnsupportedGeometryError(GISConverterError):
    code = "UNSUPPORTED_GEOMETRY"


class VectorCRSError(GISConverterError):
    code = "VECTOR_CRS_ERROR"


class VectorTransformError(GISConverterError):
    code = "VECTOR_TRANSFORM_ERROR"


class TerrainSamplingError(GISConverterError):
    code = "TERRAIN_SAMPLING_ERROR"


class InvalidBuildingGeometryError(GISConverterError):
    code = "INVALID_BUILDING_GEOMETRY"


class InvalidRoadGeometryError(GISConverterError):
    code = "INVALID_ROAD_GEOMETRY"


class VectorOutputError(GISConverterError):
    code = "VECTOR_OUTPUT_ERROR"


def validate_terrain_id(value: str) -> str:
    if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_-]*", value):
        raise ValidationError("Terrain ID must contain only letters, numbers, _ or -.")
    return value


def write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
