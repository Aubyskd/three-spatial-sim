"""Batch GeoTIFF conversion with per-file failure isolation and a run log."""

from __future__ import annotations

from dataclasses import dataclass, replace
from pathlib import Path

from .config import ConversionConfig
from .converter import ConversionResult, convert, format_report
from .utils import GISConverterError, InvalidRasterError


@dataclass(frozen=True)
class BatchSummary:
    successes: tuple[ConversionResult, ...]
    failures: tuple[tuple[Path, str], ...]
    log_path: Path


def batch_convert(input_dir: Path, output_dir: Path, template: ConversionConfig) -> BatchSummary:
    input_dir, output_dir = Path(input_dir), Path(output_dir)
    if not input_dir.is_dir():
        raise InvalidRasterError(f"Batch input directory does not exist: {input_dir}")
    files = sorted(path for path in input_dir.iterdir()
                   if path.is_file() and path.suffix.lower() in {".tif", ".tiff"})
    if not files:
        raise InvalidRasterError(f"No .tif or .tiff files found in {input_dir}")
    output_dir.mkdir(parents=True, exist_ok=True)
    successes: list[ConversionResult] = []
    failures: list[tuple[Path, str]] = []
    entries: list[str] = []
    for source in files:
        terrain_id = source.stem
        config = replace(template, input_path=source, output_dir=output_dir / terrain_id,
                         terrain_id=terrain_id)
        try:
            result = convert(config)
            successes.append(result)
            entries.append(f"INFO {source.name}: SUCCESS\n{format_report(result)}")
        except (GISConverterError, OSError, ValueError) as exc:
            failures.append((source, str(exc)))
            entries.append(f"ERROR {source.name}: {exc}")
    log_path = output_dir / "conversion.log"
    log_path.write_text("\n\n".join(entries) + "\n", encoding="utf-8")
    return BatchSummary(tuple(successes), tuple(failures), log_path)
