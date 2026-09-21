import RAPIER from '@dimforge/rapier3d-compat';
import type { BuildingColliderBox } from '../gis/VectorFeatureTypes';
import type { PlacedAsset, TerrainData } from '../terrain/TerrainTypes';

export class TerrainPhysicsWorld {
  readonly world: RAPIER.World;
  readonly rapier = RAPIER;
  private terrainBody?: RAPIER.RigidBody;
  private readonly assetBodies = new Map<string, RAPIER.RigidBody>();
  private buildingBody?: RAPIER.RigidBody;

  private constructor() { this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 }); }

  static async create(data: TerrainData): Promise<TerrainPhysicsWorld> {
    await RAPIER.init();
    const physics = new TerrainPhysicsWorld();
    physics.rebuildTerrain(data);
    return physics;
  }

  rebuildTerrain(data: TerrainData): void {
    if (this.terrainBody) this.world.removeRigidBody(this.terrainBody);
    const centerX = data.origin.x + data.width / 2;
    const centerZ = data.origin.z + data.depth / 2;
    // TerrainData is row-major (z * cols + x); Rapier expects column-major (x * rows + z).
    const heights = new Float32Array(data.heights.length);
    for (let row = 0; row < data.rows; row += 1) {
      for (let col = 0; col < data.cols; col += 1) {
        heights[col * data.rows + row] = data.heights[row * data.cols + col];
      }
    }
    this.terrainBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(centerX, 0, centerZ));
    this.world.createCollider(
      RAPIER.ColliderDesc.heightfield(data.rows - 1, data.cols - 1, heights, { x: data.width, y: 1, z: data.depth }).setFriction(1),
      this.terrainBody,
    );
  }

  addSignalTower(asset: PlacedAsset): void {
    this.removeAsset(asset.id);
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(asset.position.x, asset.position.y + 5.25, asset.position.z).setRotation({ x: 0, y: Math.sin(asset.rotationY / 2), z: 0, w: Math.cos(asset.rotationY / 2) }));
    this.world.createCollider(RAPIER.ColliderDesc.cylinder(5.25, 1.2).setFriction(0.9), body);
    this.assetBodies.set(asset.id, body);
  }

  removeAsset(id: string): void {
    const body = this.assetBodies.get(id);
    if (body) this.world.removeRigidBody(body);
    this.assetBodies.delete(id);
  }

  restoreAssets(assets: PlacedAsset[]): void { assets.filter((asset) => !asset.invalidPlacement).forEach((asset) => this.addSignalTower(asset)); }
  setBuildingColliders(boxes: readonly BuildingColliderBox[]): void {
    if (this.buildingBody) this.world.removeRigidBody(this.buildingBody);
    this.buildingBody = undefined;
    if (!boxes.length) return;
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    for (const box of boxes) {
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(box.size.x / 2, box.size.y / 2, box.size.z / 2)
        .setTranslation(box.center.x, box.center.y, box.center.z).setFriction(0.9), body);
    }
    this.buildingBody = body;
  }
  step(dt: number): void { this.world.timestep = dt; this.world.step(); }
  debugGeometry(): { vertices: Float32Array; colors: Float32Array } { return this.world.debugRender(); }
  dispose(): void { this.world.free(); }
}
