from __future__ import annotations

from dataclasses import replace

import pytest

from gis_converter.crs import auto_utm_epsg, choose_target_crs
from gis_converter.dem_reader import read_dem
from gis_converter.metadata import gis_to_local, local_to_gis


def test_auto_utm_north() -> None:
    assert auto_utm_epsg(-73.75, 40.75) == 32618


def test_auto_utm_south() -> None:
    assert auto_utm_epsg(18.5, -33.9) == 32734


def test_local_coordinate_conversion() -> None:
    metadata = {"localOrigin": {"easting": 604832.0, "northing": 4512782.0,
                                "elevation": -4.0}, "verticalScale": 2.0}
    point = (604900.0, 4512700.0, 19.5)
    assert local_to_gis(*gis_to_local(*point, metadata), metadata) == pytest.approx(point)


def test_choose_target_crs(synthetic_aw3d30) -> None:
    source = read_dem(synthetic_aw3d30)
    assert choose_target_crs(source).target_crs == "EPSG:32618"
    assert choose_target_crs(source, "EPSG:32617").target_crs == "EPSG:32617"
    assert replace(source, crs=source.crs).width == 59
