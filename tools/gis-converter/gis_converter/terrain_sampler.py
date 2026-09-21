"""Bilinear local-height sampling from TerrainData JSON."""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .utils import TerrainSamplingError


@dataclass(frozen=True)
class HeightSample:
    height: float
    masked: bool


class TerrainSampler:
    def __init__(self, terrain: dict[str, Any]):
        try:
            self.terrain_id = str(terrain["terrainId"])
            self.width = float(terrain["width"])
            self.depth = float(terrain["depth"])
            self.rows = int(terrain["rows"])
            self.cols = int(terrain["cols"])
            self.origin_x = float(terrain["origin"]["x"])
            self.origin_z = float(terrain["origin"]["z"])
            self.heights = [float(value) for value in terrain["heights"]]
            coverage = terrain.get("sampleCoverage")
            self.coverage = [int(value) for value in coverage] if coverage is not None else None
            if self.rows < 2 or self.cols < 2 or self.width <= 0 or self.depth <= 0:
                raise ValueError("invalid grid dimensions")
            if len(self.heights) != self.rows * self.cols or not all(math.isfinite(value) for value in self.heights):
                raise ValueError("heights do not match rows × cols or contain non-finite values")
            if self.coverage is not None and (len(self.coverage) != len(self.heights) or any(value not in (0, 1) for value in self.coverage)):
                raise ValueError("sampleCoverage does not match the height grid")
        except (KeyError, TypeError, ValueError) as exc:
            raise TerrainSamplingError(f"Invalid TerrainData: {exc}") from exc

    @classmethod
    def from_json(cls, path: Path) -> "TerrainSampler":
        try:
            return cls(json.loads(Path(path).read_text(encoding="utf-8")))
        except TerrainSamplingError:
            raise
        except (OSError, json.JSONDecodeError) as exc:
            raise TerrainSamplingError(f"Could not read TerrainData {path}: {exc}") from exc

    @property
    def bounds(self) -> tuple[float, float, float, float]:
        return self.origin_x, self.origin_z, self.origin_x + self.width, self.origin_z + self.depth

    def height_at(self, x: float, z: float) -> float:
        return self.sample(x, z).height

    def sample(self, x: float, z: float) -> HeightSample:
        if not math.isfinite(x) or not math.isfinite(z):
            raise TerrainSamplingError("Cannot sample a non-finite coordinate.")
        min_x, min_z, max_x, max_z = self.bounds
        if x < min_x - 1e-8 or x > max_x + 1e-8 or z < min_z - 1e-8 or z > max_z + 1e-8:
            raise TerrainSamplingError(f"Coordinate ({x:.3f}, {z:.3f}) is outside terrain bounds.")
        u = min(self.cols - 1.0, max(0.0, (x - min_x) / self.width * (self.cols - 1)))
        v = min(self.rows - 1.0, max(0.0, (z - min_z) / self.depth * (self.rows - 1)))
        c0, r0 = int(math.floor(u)), int(math.floor(v))
        c1, r1 = min(self.cols - 1, c0 + 1), min(self.rows - 1, r0 + 1)
        tx, tz = u - c0, v - r0
        indices = (r0 * self.cols + c0, r0 * self.cols + c1,
                   r1 * self.cols + c0, r1 * self.cols + c1)
        a = self.heights[indices[0]] * (1 - tx) + self.heights[indices[1]] * tx
        b = self.heights[indices[2]] * (1 - tx) + self.heights[indices[3]] * tx
        masked = self.coverage is not None and any(self.coverage[index] == 0 for index in indices)
        return HeightSample(a * (1 - tz) + b * tz, masked)
