"""Transactional single-DEM conversion orchestration."""

from __future__ import annotations

import os
import tempfile
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

from .config import ConversionConfig
from .crs import choose_target_crs
from .dem_reader import read_dem
from .glb_exporter import export_glb
from .manifest import update_manifest
from .mesh_builder import build_mesh
from .metadata import build_metadata
from .reproject import reproject_dem, save_reprojected_tif
from .resample import resample_dem
from .terrain_data import build_terrain_data
from .utils import OutputExistsError, ValidationError, validate_terrain_id, write_json
from .validator import ValidationReport, validate_package


@dataclass(frozen=True)
class ConversionResult:
    input_path: Path
    output_dir: Path
    source_crs: str
    target_crs: str
    input_width: int
    input_height: int
    grid_rows: int
    grid_cols: int
    terrain_width: float
    terrain_depth: float
    source_min: float
    source_max: float
    nodata_ratio: float
    validation: ValidationReport
    warnings: tuple[str, ...]
    replaced_output_backup: Path | None = None
    manifest_backup: Path | None = None


def convert(config: ConversionConfig) -> ConversionResult:
    validate_terrain_id(config.terrain_id)
    output_dir = config.output_dir.resolve()
    if output_dir.exists() and not output_dir.is_dir():
        raise ValidationError(f"Output target is not a directory: {output_dir}")
    if output_dir.exists() and not config.overwrite:
        raise OutputExistsError(f"{output_dir} exists; use --overwrite to replace it.")
    if config.resolution < 2 or config.resolution > 4096:
        raise ValidationError("Resolution must be between 2 and 4096.")
    source = read_dem(config.input_path)
    decision = choose_target_crs(source, config.target_crs)
    projected = reproject_dem(source, decision.target_crs)
    grid = resample_dem(projected, config.resolution, config.resampling)
    terrain, local_origin = build_terrain_data(grid, config.terrain_id,
                                               config.vertical_scale, config.origin_mode)
    metadata = build_metadata(source, grid, decision, terrain, local_origin,
                              config.vertical_scale, config.origin_mode, config.resampling)
    mesh = build_mesh(terrain)
    output_dir.parent.mkdir(parents=True, exist_ok=True)
    replaced_backup: Path | None = None
    manifest_backup: Path | None = None
    with tempfile.TemporaryDirectory(prefix=f".{output_dir.name}-", dir=output_dir.parent) as staging_root:
        staging = Path(staging_root) / output_dir.name
        staging.mkdir()
        write_json(staging / "terrain.json", terrain)
        write_json(staging / "metadata.json", metadata)
        export_glb(mesh, staging / "terrain.glb")
        if config.save_reprojected_tif:
            save_reprojected_tif(projected, staging / "reprojected.tif")
        validation = validate_package(staging)
        if output_dir.exists():
            replaced_backup = output_dir.with_name(output_dir.name + f".bak-{uuid4().hex[:8]}")
            os.replace(output_dir, replaced_backup)
        try:
            os.replace(staging, output_dir)
        except OSError:
            if replaced_backup is not None:
                os.replace(replaced_backup, output_dir)
            raise
    if config.update_manifest:
        manifest_backup = update_manifest(config.manifest_path, output_dir,
                                          config.terrain_id, max(grid.rows, grid.cols))
    return ConversionResult(source.path, output_dir, decision.source_crs, decision.target_crs,
                            source.width, source.height, grid.rows, grid.cols,
                            terrain["width"], terrain["depth"],
                            metadata["elevation"]["min"], metadata["elevation"]["max"],
                            grid.original_nodata_ratio, validation,
                            (*decision.warnings, *grid.warnings, *validation.warnings),
                            replaced_backup, manifest_backup)


def format_report(result: ConversionResult) -> str:
    lines = ["=== GIS Conversion Report ===", f"Input: {result.input_path}",
             f"Source CRS: {result.source_crs}", f"Target CRS: {result.target_crs}",
             f"Input raster: {result.input_width} × {result.input_height}",
             f"Output grid: {result.grid_cols} × {result.grid_rows}",
             f"Terrain size: {result.terrain_width:.1f}m × {result.terrain_depth:.1f}m",
             f"Elevation: {result.source_min:.2f}m → {result.source_max:.2f}m",
             f"Vertices: {result.validation.vertices}",
             f"Triangles: {result.validation.triangles}",
             f"NoData: {result.nodata_ratio:.1%}",
             "terrain.json: OK", "terrain.glb: OK", "metadata.json: OK",
             f"Output: {result.output_dir}"]
    lines.extend(f"WARNING {warning}" for warning in result.warnings)
    if result.replaced_output_backup:
        lines.append(f"Previous output backup: {result.replaced_output_backup}")
    if result.manifest_backup:
        lines.append(f"Manifest backup: {result.manifest_backup}")
    return "\n".join(lines)
