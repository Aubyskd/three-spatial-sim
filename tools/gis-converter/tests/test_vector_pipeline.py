import json
from pathlib import Path

import pytest
from pyproj import Transformer

from gis_converter.building_converter import building_base_height, building_height, convert_buildings
from gis_converter.road_converter import road_width, convert_roads
from gis_converter.terrain_sampler import TerrainSampler
from gis_converter.vector_crs import create_transformer, read_terrain_metadata
from gis_converter.vector_reader import read_vector
from gis_converter.vector_transform import projected_to_local, source_to_local


def metadata():
    return {
        "terrainId": "test", "projectedCRS": "EPSG:32613", "verticalScale": 1,
        "localCoordinateConvention": {"x": "east", "y": "up", "z": "south"},
        "localOrigin": {"easting": 500000, "northing": 4400000, "elevation": 2000},
        "localBounds": {"origin": {"x": -10, "y": 0, "z": -10}, "width": 20, "depth": 20},
    }


def terrain():
    return {
        "terrainId": "test", "width": 20, "depth": 20, "rows": 3, "cols": 3,
        "origin": {"x": -10, "y": 0, "z": -10},
        "heights": [0, 10, 20, 10, 20, 30, 20, 30, 40],
        "sampleCoverage": [1] * 9,
    }


def write_fixture(tmp_path: Path, features):
    metadata_path = tmp_path / "metadata.json"
    terrain_path = tmp_path / "terrain.json"
    source_path = tmp_path / "source.geojson"
    metadata_path.write_text(json.dumps(metadata()), encoding="utf-8")
    terrain_path.write_text(json.dumps(terrain()), encoding="utf-8")
    source_path.write_text(json.dumps({"type": "FeatureCollection", "features": features}), encoding="utf-8")
    return source_path, metadata_path, terrain_path


def lonlat(easting, northing):
    return Transformer.from_crs("EPSG:32613", "EPSG:4326", always_xy=True).transform(easting, northing)


def test_vector_crs_transform():
    transform = create_transformer("EPSG:4326", metadata())
    lon, lat = lonlat(500025, 4399950)
    easting, northing = transform.transform(lon, lat)
    assert easting == pytest.approx(500025, abs=1e-4)
    assert northing == pytest.approx(4399950, abs=1e-4)


def test_projected_to_local():
    assert projected_to_local(500030, 4399960, metadata(), 2012) == pytest.approx((30, 12, 40))


def test_z_south_convention():
    assert projected_to_local(500000, 4400100, metadata()) == pytest.approx((0, -100))
    assert projected_to_local(500000, 4399900, metadata()) == pytest.approx((0, 100))


def test_building_height_from_height():
    assert building_height({"height": "12.5 m"}) == pytest.approx(12.5)
    assert building_height({"height": "30 ft"}) == pytest.approx(9.144)


def test_building_height_from_levels():
    assert building_height({"building:levels": "4"}, default_floor_height=3.2) == pytest.approx(12.8)


def test_building_fallback_height():
    assert building_height({}, default_building_height=8.5) == pytest.approx(8.5)


def test_building_base_height_median():
    assert building_base_height([1, 100, 3, 5], "median") == pytest.approx(4)


def test_road_width_mapping():
    assert road_width({"highway": "motorway"}) == 12
    assert road_width({"highway": "residential", "lanes": "3"}) == pytest.approx(9.6)
    assert road_width({"highway": "unknown"}) == 4


def test_road_height_sampling():
    sampler = TerrainSampler(terrain())
    assert sampler.height_at(0, 0) == pytest.approx(20)
    assert sampler.height_at(-5, -5) == pytest.approx(10)


def test_polygon_holes(tmp_path):
    outer = [lonlat(499995, 4400005), lonlat(500005, 4400005), lonlat(500005, 4399995), lonlat(499995, 4399995), lonlat(499995, 4400005)]
    hole = [lonlat(499998, 4400002), lonlat(500002, 4400002), lonlat(500002, 4399998), lonlat(499998, 4399998), lonlat(499998, 4400002)]
    feature = {"type": "Feature", "id": "hole", "properties": {"building": "yes"},
               "geometry": {"type": "Polygon", "coordinates": [outer, hole]}}
    source, meta, data = write_fixture(tmp_path, [feature])
    output = tmp_path / "buildings.json"
    report = convert_buildings(source, meta, data, output)
    document = json.loads(output.read_text())
    assert report.output_features == 1
    assert len(document["features"][0]["rings"]) == 2


def test_multipolygon(tmp_path):
    def square(cx):
        return [[lonlat(cx - 1, 4400001), lonlat(cx + 1, 4400001), lonlat(cx + 1, 4399999), lonlat(cx - 1, 4399999), lonlat(cx - 1, 4400001)]]
    feature = {"type": "Feature", "id": "multi", "properties": {},
               "geometry": {"type": "MultiPolygon", "coordinates": [square(499996), square(500004)]}}
    source, meta, data = write_fixture(tmp_path, [feature])
    report = convert_buildings(source, meta, data, tmp_path / "buildings.json")
    assert report.output_features == 2


def test_multilinestring(tmp_path):
    feature = {"type": "Feature", "id": "roads", "properties": {"highway": "service"},
               "geometry": {"type": "MultiLineString", "coordinates": [
                   [lonlat(499995, 4400000), lonlat(500000, 4400000)],
                   [lonlat(500000, 4400000), lonlat(500005, 4400000)],
               ]}}
    source, meta, data = write_fixture(tmp_path, [feature])
    report = convert_roads(source, meta, data, tmp_path / "roads.json")
    assert report.output_features == 2


def test_out_of_bounds_filter(tmp_path):
    ring = [lonlat(500100, 4400100), lonlat(500110, 4400100), lonlat(500110, 4400090), lonlat(500100, 4400090), lonlat(500100, 4400100)]
    feature = {"type": "Feature", "properties": {}, "geometry": {"type": "Polygon", "coordinates": [ring]}}
    source, meta, data = write_fixture(tmp_path, [feature])
    report = convert_buildings(source, meta, data, tmp_path / "buildings.json")
    assert report.output_features == 0
    assert report.skipped == 1


def test_aspen_vector_alignment():
    root = Path(__file__).resolve().parents[3]
    meta_path = root / "public/assets/maps/terrain-demo/generated/aspen/metadata.json"
    source_root = root / "tools/gis-converter/input/aspen/raw"
    if not meta_path.exists():
        pytest.skip("Aspen generated terrain package is unavailable")
    meta = read_terrain_metadata(meta_path)
    min_x = meta["localBounds"]["origin"]["x"]
    min_z = meta["localBounds"]["origin"]["z"]
    max_x = min_x + meta["localBounds"]["width"]
    max_z = min_z + meta["localBounds"]["depth"]
    for filename in ("aspen_buildings.geojson", "aspen_roads.geojson"):
        dataset = read_vector(source_root / filename)
        transformer = create_transformer(dataset.crs, meta)
        samples = []
        for feature in dataset.features:
            coordinates = feature["geometry"]["coordinates"]
            while isinstance(coordinates[0][0], (list, tuple)):
                coordinates = coordinates[0]
            samples.append(source_to_local(coordinates[0][0], coordinates[0][1], transformer, meta))
        inside = sum(min_x <= x <= max_x and min_z <= z <= max_z for x, z in samples)
        assert inside / len(samples) > 0.85
