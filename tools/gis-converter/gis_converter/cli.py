"""Command-line entry point: convert, batch, inspect and validate."""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

import numpy as np

from .batch import batch_convert
from .config import DEFAULT_MANIFEST, ConversionConfig
from .converter import convert, format_report
from .crs import choose_target_crs
from .dem_reader import read_dem
from .utils import GISConverterError
from .validator import validate_package


def _conversion_options(parser: argparse.ArgumentParser, *, batch: bool) -> None:
    parser.add_argument("--input", required=True, type=Path, help="GeoTIFF file or batch directory")
    parser.add_argument("--output", required=True, type=Path, help="Output package or batch root directory")
    if not batch:
        parser.add_argument("--terrain-id", required=True)
    parser.add_argument("--resolution", type=int, default=128, help="Vertices along the longer edge (default: 128)")
    parser.add_argument("--target-crs", default="auto", help="auto or a metre-based projected CRS, e.g. EPSG:32618")
    parser.add_argument("--vertical-scale", type=float, default=1.0)
    parser.add_argument("--origin-mode", choices=("center", "southwest", "min"), default="center")
    parser.add_argument("--resampling", choices=("nearest", "bilinear", "cubic"), default="bilinear")
    parser.add_argument("--overwrite", action="store_true", help="Replace existing output; keep a backup")
    parser.add_argument("--update-manifest", action="store_true", help="Add successful output to terrain manifest")
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--save-reprojected-tif", action="store_true")
    parser.add_argument("--verbose", action="store_true")


def create_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m gis_converter.cli",
                                     description="GeoTIFF DEM → reproducible TerrainData, GLB and GIS metadata")
    commands = parser.add_subparsers(dest="command", required=True)
    _conversion_options(commands.add_parser("convert", help="Convert one GeoTIFF"), batch=False)
    _conversion_options(commands.add_parser("batch", help="Convert all .tif/.tiff files"), batch=True)
    commands.add_parser("inspect", help="Inspect source CRS, bounds, elevation and suggested CRS").add_argument("--input", required=True, type=Path)
    commands.add_parser("validate", help="Validate one generated package").add_argument("--terrain", required=True, type=Path)
    return parser


def _config(args: argparse.Namespace) -> ConversionConfig:
    return ConversionConfig(input_path=args.input, output_dir=args.output,
                            terrain_id=getattr(args, "terrain_id", "batch-template"),
                            resolution=args.resolution, target_crs=args.target_crs,
                            vertical_scale=args.vertical_scale, origin_mode=args.origin_mode,
                            resampling=args.resampling, overwrite=args.overwrite,
                            update_manifest=args.update_manifest, manifest_path=args.manifest,
                            save_reprojected_tif=args.save_reprojected_tif)


def _inspect(path: Path) -> None:
    dem = read_dem(path)
    decision = choose_target_crs(dem)
    valid = dem.elevation[dem.valid]
    west, south, east, north = dem.bounds
    print("=== GIS DEM Inspection ===")
    print(f"Input: {dem.path}")
    print(f"CRS: {decision.source_crs}")
    print(f"Bounds: west={west:.8f}, south={south:.8f}, east={east:.8f}, north={north:.8f}")
    print(f"Raster: {dem.width} × {dem.height}; dtype={dem.dtype}")
    print(f"Pixel size: {abs(dem.transform.a):.8f} × {abs(dem.transform.e):.8f}")
    print(f"NoData: {dem.nodata}; missing ratio={1 - dem.valid.mean():.1%}")
    print(f"Elevation: {float(np.min(valid)):.2f}m → {float(np.max(valid)):.2f}m")
    print(f"Center longitude/latitude: {decision.center_lon:.6f}, {decision.center_lat:.6f}")
    print(f"Suggested target CRS: {decision.target_crs}")
    for warning in decision.warnings:
        print(f"WARNING {warning}")


def main(argv: list[str] | None = None) -> int:
    args = create_parser().parse_args(argv)
    logging.basicConfig(level=logging.DEBUG if getattr(args, "verbose", False) else logging.INFO,
                        format="%(levelname)s %(message)s")
    try:
        if args.command == "inspect":
            _inspect(args.input)
        elif args.command == "validate":
            report = validate_package(args.terrain)
            print(f"VALID {report.terrain_id}: {report.vertices} vertices, {report.triangles} triangles")
            for warning in report.warnings:
                print(f"WARNING {warning}")
        elif args.command == "convert":
            print(format_report(convert(_config(args))))
        elif args.command == "batch":
            summary = batch_convert(args.input, args.output, _config(args))
            print(f"Batch Summary: success={len(summary.successes)}, failed={len(summary.failures)}")
            for source, error in summary.failures:
                print(f"ERROR {source.name}: {error}")
            print(f"Log: {summary.log_path}")
            return 1 if summary.failures else 0
        return 0
    except GISConverterError as exc:
        logging.error("%s", exc)
        return 1
    except OSError as exc:
        logging.error("FILE_IO_ERROR: %s", exc)
        return 1


if __name__ == "__main__":
    sys.exit(main())
