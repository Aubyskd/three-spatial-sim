"""Export the prepared Y-up metre mesh to GLB."""

from __future__ import annotations

from pathlib import Path

import trimesh

from .utils import GLBExportError


def export_glb(mesh: trimesh.Trimesh, path: Path) -> None:
    try:
        mesh = mesh.copy()
        mesh.metadata["units"] = "meters"
        scene = trimesh.Scene()
        scene.add_geometry(mesh, geom_name="GIS DEM terrain", node_name="GIS DEM terrain")
        scene.export(file_obj=path, file_type="glb")
        if not path.is_file() or path.stat().st_size < 100:
            raise GLBExportError(f"GLB export produced no usable file: {path}")
    except GLBExportError:
        raise
    except (OSError, ValueError, TypeError, RuntimeError) as exc:
        raise GLBExportError(f"Could not export GLB {path}: {exc}") from exc
