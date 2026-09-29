import * as THREE from 'three';
import type { TerrainPhysicsWorld } from '../physics/TerrainPhysicsWorld';
import type { SemanticMap } from '../semantic/SemanticMap';
import type { PlacedAsset, TerrainRuntimeState } from '../terrain/TerrainTypes';
import { AssetRegistry } from './AssetRegistry';
import { GeneratedAssetFactory } from './GeneratedAssetFactory';
import { PlacementValidator, type PlacementValidation } from './PlacementValidator';

export class AssetPlacementManager {
  readonly group = new THREE.Group();
  private readonly registry = new AssetRegistry();
  private readonly factory = new GeneratedAssetFactory();
  private readonly validator: PlacementValidator;
  private serial = 0;

  constructor(private readonly state: TerrainRuntimeState, semantics: SemanticMap, private readonly physics: TerrainPhysicsWorld) {
    this.group.name = `assets-${state.terrainId}`;
    this.validator = new PlacementValidator(state.terrainData, semantics, state.placedAssets);
    this.restore();
  }

  validate(definitionId: string, x: number, z: number): PlacementValidation {
    const definition = this.registry.get(definitionId);
    return definition ? this.validator.validate(definition, x, z) : { valid: false, reason: 'unknown asset' };
  }

  place(definitionId: string, x: number, z: number, rotationY = 0): PlacedAsset | null {
    const validation = this.validate(definitionId, x, z);
    if (!validation.valid || validation.height === undefined) return null;
    return this.placeAt(definitionId, { x, y: validation.height, z }, rotationY, validation, 'terrain');
  }

  placeAt(definitionId: string, position: { x: number; y: number; z: number }, rotationY = 0, previousValidation?: PlacementValidation, heightMode: PlacedAsset['heightMode'] = 'manual'): PlacedAsset | null {
    if (![position.x, position.y, position.z, rotationY].every(Number.isFinite)) return null;
    const validation = previousValidation ?? this.validate(definitionId, position.x, position.z);
    if (!validation.valid) return null;
    const asset: PlacedAsset = { id: `${definitionId}-${Date.now()}-${++this.serial}`, terrainId: this.state.terrainId, definitionId, position: { ...position }, rotationY, createdAt: Date.now(), heightMode };
    this.state.placedAssets.push(asset); this.state.assetsDirty = true;
    this.group.add(this.factory.create(asset)); this.physics.addSignalTower(asset);
    return asset;
  }

  remove(id: string): boolean {
    const index = this.state.placedAssets.findIndex((asset) => asset.id === id);
    if (index < 0) return false;
    this.state.placedAssets.splice(index, 1); this.group.getObjectByName(id)?.removeFromParent(); this.physics.removeAsset(id); this.state.assetsDirty = true; return true;
  }

  move(id: string, x: number, z: number, rotationY = 0): PlacedAsset | null {
    const asset = this.state.placedAssets.find((item) => item.id === id);
    const definition = asset ? this.registry.get(asset.definitionId) : undefined;
    if (!asset || !definition) return null;
    const validation = this.validator.validate(definition, x, z, id);
    if (!validation.valid || validation.height === undefined) return null;
    asset.position = { x, y: validation.height, z }; asset.rotationY = rotationY; asset.heightMode = 'terrain'; asset.invalidPlacement = false; this.state.assetsDirty = true;
    const old = this.group.getObjectByName(id); if (old) { old.removeFromParent(); this.disposeObject(old); }
    this.physics.removeAsset(id); this.group.add(this.factory.create(asset)); this.physics.addSignalTower(asset);
    return structuredClone(asset);
  }

  clear(): void { for (const asset of [...this.state.placedAssets]) this.remove(asset.id); }

  getPlacedAssets(): PlacedAsset[] { return structuredClone(this.state.placedAssets); }

  private restore(): void {
    for (const asset of this.state.placedAssets) {
      const validation = this.validate(asset.definitionId, asset.position.x, asset.position.z);
      asset.invalidPlacement = !validation.valid;
      if (!asset.invalidPlacement) { if (asset.heightMode !== 'manual') asset.position.y = validation.height ?? asset.position.y; this.group.add(this.factory.create(asset)); this.physics.addSignalTower(asset); }
    }
  }

  dispose(): void {
    this.group.traverse((object) => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); if (Array.isArray(object.material)) object.material.forEach((m) => m.dispose()); else object.material.dispose(); } });
    this.group.removeFromParent();
  }

  private disposeObject(root: THREE.Object3D): void {
    root.traverse((object) => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose()); else object.material.dispose(); } });
  }
}
