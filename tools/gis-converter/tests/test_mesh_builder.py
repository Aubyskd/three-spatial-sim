from __future__ import annotations

import numpy as np

from gis_converter.mesh_builder import build_mesh
from gis_converter.resample import HeightGrid
from gis_converter.terrain_data import build_terrain_data


def test_mesh_vertex_count() -> None:
    grid = HeightGrid(np.arange(12, dtype=np.float32).reshape(3, 4),
                      np.ones((3, 4), dtype=bool), (100, 200, 130, 220), 0, 0, ())
    terrain, _ = build_terrain_data(grid, "mesh-test")
    mesh = build_mesh(terrain)
    assert len(mesh.vertices) == 12
    assert len(mesh.faces) == 12
    assert (mesh.face_normals[:, 1] > 0).all()
    assert np.allclose(mesh.bounds, [[-15, 0, -10], [15, 11, 10]])


def test_mesh_face_count() -> None:
    grid = HeightGrid(np.ones((4, 7), dtype=np.float32),
                      np.ones((4, 7), dtype=bool), (0, 0, 60, 30), 0, 0, ())
    terrain, _ = build_terrain_data(grid, "faces")
    assert len(build_mesh(terrain).faces) == 2 * 3 * 6
