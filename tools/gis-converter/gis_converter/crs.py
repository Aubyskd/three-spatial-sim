"""Detect a suitable local metre CRS and warn about UTM limitations."""

from __future__ import annotations

import math
from dataclasses import dataclass

from pyproj import CRS, Transformer

from .dem_reader import DemDataset
from .utils import UnsupportedCRSError


@dataclass(frozen=True)
class CRSDecision:
    source_crs: str
    target_crs: str
    center_lon: float
    center_lat: float
    warnings: tuple[str, ...]


def auto_utm_epsg(longitude: float, latitude: float) -> int:
    if not (-80 <= latitude <= 84) or not (-180 <= longitude <= 180):
        raise UnsupportedCRSError("Automatic UTM requires longitude [-180, 180] and latitude [-80, 84].")
    zone = max(1, min(60, math.floor((longitude + 180) / 6) + 1))
    return (32600 if latitude >= 0 else 32700) + zone


def is_metre_projected(crs: CRS) -> bool:
    return bool(crs.is_projected and crs.axis_info and all(
        axis.unit_conversion_factor is not None and math.isclose(axis.unit_conversion_factor, 1.0, rel_tol=1e-7)
        for axis in crs.axis_info[:2]
    ))


def choose_target_crs(dem: DemDataset, requested: str = "auto") -> CRSDecision:
    source = CRS.from_user_input(dem.crs)
    west, south, east, north = dem.bounds
    to_geographic = Transformer.from_crs(source, CRS.from_epsg(4326), always_xy=True)
    longitudes, latitudes = to_geographic.transform([west, east, west, east], [south, south, north, north])
    if not all(math.isfinite(v) for v in (*longitudes, *latitudes)):
        raise UnsupportedCRSError("Cannot transform DEM bounds to longitude/latitude.")
    center_lon, center_lat = to_geographic.transform((west + east) / 2, (south + north) / 2)
    suggested = None if is_metre_projected(source) else CRS.from_epsg(auto_utm_epsg(center_lon, center_lat))
    if requested.lower() == "auto":
        target = source if suggested is None else suggested
    else:
        try:
            target = CRS.from_user_input(requested)
        except (ValueError, TypeError) as exc:
            raise UnsupportedCRSError(f"Invalid target CRS: {requested}") from exc
        if not is_metre_projected(target):
            raise UnsupportedCRSError("Target CRS must be projected with metre units.")
    zones = {auto_utm_epsg(lon, lat) for lon, lat in zip(longitudes, latitudes)} if suggested is not None else set()
    east_west_km = abs(max(longitudes) - min(longitudes)) * 111.32 * max(0.01, math.cos(math.radians(center_lat)))
    north_south_km = abs(max(latitudes) - min(latitudes)) * 110.57
    warnings = ("AUTO_UTM_MAY_BE_INAPPROPRIATE: area crosses UTM zones or exceeds 100 km; specify --target-crs manually.",) if requested.lower() == "auto" and (len(zones) > 1 or max(east_west_km, north_south_km) > 100) else ()
    return CRSDecision(source.to_string(), target.to_string(), center_lon, center_lat, warnings)
