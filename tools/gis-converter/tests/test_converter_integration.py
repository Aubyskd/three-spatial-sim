from __future__ import annotations

import json
from pathlib import Path

import pytest

from gis_converter.batch import batch_convert
from gis_converter.config import ConversionConfig
from gis_converter.converter import convert
from gis_converter.dem_reader import read_dem
from gis_converter.manifest import update_manifest
from gis_converter.metadata import gis_to_local, local_to_gis
from gis_converter.utils import ManifestUpdateError, OutputExistsError, ValidationError
from gis_converter.validator import validate_package
from gis_converter.cli import main


def test_metadata_roundtrip(synthetic_aw3d30: Path, tmp_path: Path) -> None:
    output = tmp_path / "generated" / "synthetic"
    result = convert(ConversionConfig(synthetic_aw3d30, output, "synthetic", resolution=64))
    terrain = json.loads((output / "terrain.json").read_text(encoding="utf-8"))
    metadata = json.loads((output / "metadata.json").read_text(encoding="utf-8"))
    assert result.target_crs == "EPSG:32618"
    assert 1200 < terrain["width"] < 1600
    assert 1000 < terrain["depth"] < 1400
    assert len(terrain["heights"]) == terrain["rows"] * terrain["cols"]
    # UTM reprojection adds masked corners around the rotated source footprint.
    assert metadata["noData"]["maskedRatio"] < 0.10
    assert validate_package(output).vertices == len(terrain["heights"])
    assert local_to_gis(*gis_to_local(604900, 4512700, 20, metadata), metadata) == pytest.approx(
        (604900, 4512700, 20))
    with pytest.raises(OutputExistsError):
        convert(ConversionConfig(synthetic_aw3d30, output, "synthetic", resolution=64))


def test_batch_continues_after_failure(synthetic_aw3d30: Path, tmp_path: Path) -> None:
    inputs = tmp_path / "input"
    inputs.mkdir()
    (inputs / "good.tif").write_bytes(synthetic_aw3d30.read_bytes())
    (inputs / "second.tiff").write_bytes(synthetic_aw3d30.read_bytes())
    (inputs / "bad.tif").write_text("not a GeoTIFF", encoding="utf-8")
    output = tmp_path / "output"
    template = ConversionConfig(inputs, output, "unused", resolution=32)
    summary = batch_convert(inputs, output, template)
    assert len(summary.successes) == 2
    assert len(summary.failures) == 1
    assert summary.log_path.is_file()
    assert validate_package(output / "good").terrain_id == "good"
    assert validate_package(output / "second").terrain_id == "second"


def test_manifest_update_is_backed_up(synthetic_aw3d30: Path, tmp_path: Path) -> None:
    map_dir = tmp_path / "map"
    generated = map_dir / "generated" / "sample"
    manifest = map_dir / "manifest.json"
    map_dir.mkdir()
    original = {"name": "test", "version": 2, "units": "meters", "defaultTerrain": "old",
                "terrains": [{"id": "old", "name": "old", "type": "glb", "source": "source/old.glb",
                              "samplingResolution": 32}]}
    manifest.write_text(json.dumps(original), encoding="utf-8")
    convert(ConversionConfig(synthetic_aw3d30, generated, "sample", resolution=32))
    backup = update_manifest(manifest, generated, "sample", 32)
    assert json.loads(backup.read_text(encoding="utf-8")) == original
    assert json.loads(manifest.read_text(encoding="utf-8"))["terrains"][-1]["data"] == "generated/sample/terrain.json"
    with pytest.raises(ManifestUpdateError):
        update_manifest(manifest, generated, "sample", 32)


def test_cli_inspect_convert_validate(synthetic_aw3d30: Path, tmp_path: Path, capsys) -> None:
    output = tmp_path / "cli-output"
    assert main(["inspect", "--input", str(synthetic_aw3d30)]) == 0
    assert "EPSG:32618" in capsys.readouterr().out
    assert main(["convert", "--input", str(synthetic_aw3d30), "--output", str(output),
                 "--terrain-id", "cli-output", "--resolution", "32"]) == 0
    assert "terrain.glb: OK" in capsys.readouterr().out
    assert main(["validate", "--terrain", str(output)]) == 0
    assert "VALID cli-output" in capsys.readouterr().out


def test_validator_detects_corrupt_grid(synthetic_aw3d30: Path, tmp_path: Path) -> None:
    output = tmp_path / "corrupt"
    convert(ConversionConfig(synthetic_aw3d30, output, "corrupt", resolution=32))
    path = output / "terrain.json"
    terrain = json.loads(path.read_text(encoding="utf-8"))
    terrain["heights"].pop()
    path.write_text(json.dumps(terrain), encoding="utf-8")
    with pytest.raises(ValidationError):
        validate_package(output)


@pytest.mark.skipif(not (Path(__file__).resolve().parents[1] / "input/output_AW3D30.tif").exists(),
                    reason="Ground-truth output_AW3D30.tif was not supplied")
def test_integration_aw3d30(tmp_path: Path) -> None:
    source = Path(__file__).resolve().parents[1] / "input/output_AW3D30.tif"
    assert read_dem(source).crs.to_string() == "EPSG:4326"
    result = convert(ConversionConfig(source, tmp_path / "aw3d30", "aw3d30", resolution=128))
    assert result.target_crs == "EPSG:32618"
    # The supplied AW3D30 tile covers about 0.20° × 0.096° near 42°N:
    # its projected size is roughly 16.7 km × 10.7 km, not 1/10 of that.
    assert 16000 < result.terrain_width < 17500
    assert 10000 < result.terrain_depth < 11500
    assert validate_package(result.output_dir).vertices == result.grid_rows * result.grid_cols
