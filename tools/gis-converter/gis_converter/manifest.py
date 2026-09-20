"""Atomically add generated packages to the existing V0.2 terrain manifest."""

from __future__ import annotations

import json
import os
import shutil
import tempfile
from pathlib import Path
from uuid import uuid4

from .utils import ManifestUpdateError, write_json


def update_manifest(manifest_path: Path, terrain_dir: Path, terrain_id: str,
                    resolution: int) -> Path:
    manifest_path, terrain_dir = Path(manifest_path).resolve(), Path(terrain_dir).resolve()
    try:
        relative = terrain_dir.relative_to(manifest_path.parent).as_posix()
    except ValueError as exc:
        raise ManifestUpdateError("Generated output must be under the manifest's map directory.") from exc
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if manifest.get("version") != 2 or not isinstance(manifest.get("terrains"), list):
            raise ManifestUpdateError("Expected a v2 terrain manifest.")
        if any(entry.get("id") == terrain_id for entry in manifest["terrains"]):
            raise ManifestUpdateError(f"Terrain ID already exists: {terrain_id}")
        manifest["terrains"].append({"id": terrain_id, "name": terrain_id, "type": "glb",
                                     "source": f"{relative}/terrain.glb",
                                     "data": f"{relative}/terrain.json",
                                     "metadata": f"{relative}/metadata.json",
                                     "samplingResolution": resolution})
        backup = manifest_path.with_name(manifest_path.name + f".bak-{uuid4().hex[:8]}")
        shutil.copy2(manifest_path, backup)
        fd, temporary_name = tempfile.mkstemp(prefix=".manifest-", suffix=".json", dir=manifest_path.parent)
        os.close(fd)
        temporary = Path(temporary_name)
        try:
            write_json(temporary, manifest)
            os.replace(temporary, manifest_path)
        finally:
            temporary.unlink(missing_ok=True)
        return backup
    except ManifestUpdateError:
        raise
    except (OSError, ValueError, TypeError, KeyError, json.JSONDecodeError) as exc:
        raise ManifestUpdateError(f"Could not update manifest: {exc}") from exc
