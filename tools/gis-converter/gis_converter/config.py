"""Conversion settings shared by single and batch commands."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


DEFAULT_MANIFEST = Path(__file__).resolve().parents[3] / "public/assets/maps/terrain-demo/manifest.json"


@dataclass(frozen=True)
class ConversionConfig:
    input_path: Path
    output_dir: Path
    terrain_id: str
    resolution: int = 128
    target_crs: str = "auto"
    vertical_scale: float = 1.0
    origin_mode: str = "center"
    resampling: str = "bilinear"
    overwrite: bool = False
    update_manifest: bool = False
    manifest_path: Path = DEFAULT_MANIFEST
    save_reprojected_tif: bool = False
