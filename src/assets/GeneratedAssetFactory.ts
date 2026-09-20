import type { PlacedAsset } from '../terrain/TerrainTypes';
import { SignalTowerFactory } from './SignalTowerFactory';

export class GeneratedAssetFactory {
  private readonly signalTower = new SignalTowerFactory();
  create(asset: PlacedAsset, preview = false) {
    if (asset.definitionId !== 'signal-tower') throw new Error(`Unknown generated asset: ${asset.definitionId}`);
    return this.signalTower.create(asset, preview);
  }
}
