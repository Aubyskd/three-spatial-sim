"""Future vector and imagery stages; V0.4 deliberately does not implement them."""

from __future__ import annotations

from pathlib import Path
from typing import Protocol


class VectorImporter(Protocol):
    def import_file(self, path: Path, projected_crs: str) -> object: ...


class GeoJSONImporter(VectorImporter, Protocol):
    pass


class OSMImporter(VectorImporter, Protocol):
    pass


class WaterSemanticBuilder(Protocol):
    def build(self, features: object) -> list[dict]: ...


class RoadSemanticBuilder(Protocol):
    def build(self, features: object) -> list[dict]: ...


class BuildingExtruder(Protocol):
    def extrude(self, features: object) -> object: ...


class TextureGenerator(Protocol):
    def generate(self, terrain: object) -> object: ...
