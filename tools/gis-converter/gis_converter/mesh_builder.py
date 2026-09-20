"""Build a Y-up, north-to-south terrain mesh from the same TerrainData grid."""

from __future__ import annotations

from typing import Any

import numpy as np
import trimesh

from .utils import MeshBuildError


def build_mesh(terrain: dict[str, Any]) -> trimesh.Trimesh:
    rows, cols = int(terrain["rows"]), int(terrain["cols"])
    width, depth = float(terrain["width"]), float(terrain["depth"])
    origin = terrain["origin"]
    heights = np.asarray(terrain["heights"], dtype=np.float64)
    if rows < 2 or cols < 2 or heights.size != rows * cols or not np.isfinite(heights).all():
        raise MeshBuildError("Terrain grid is invalid or contains non-finite heights.")
    xx = float(origin["x"]) + np.arange(cols, dtype=np.float64) * width / (cols - 1)
    zz = float(origin["z"]) + np.arange(rows, dtype=np.float64) * depth / (rows - 1)
    x_grid, z_grid = np.meshgrid(xx, zz)
    vertices = np.stack((x_grid.ravel(), heights, z_grid.ravel()), axis=1)
    faces = np.empty(((rows - 1) * (cols - 1) * 2, 3), dtype=np.int64)
    index = 0
    for row in range(rows - 1):
        for col in range(cols - 1):
            a = row * cols + col
            b, c, d = a + 1, a + cols, a + cols + 1
            faces[index] = (a, c, d)
            faces[index + 1] = (a, d, b)
            index += 2
    mesh = trimesh.Trimesh(vertices=vertices, faces=faces, process=False, validate=False)
    if not np.isfinite(mesh.vertices).all() or not np.isfinite(mesh.face_normals).all():
        raise MeshBuildError("Mesh vertices or normals are non-finite.")
    if np.any(mesh.face_normals[:, 1] <= 0):
        raise MeshBuildError("Terrain surface normals must point upward (+Y).")
    return mesh
