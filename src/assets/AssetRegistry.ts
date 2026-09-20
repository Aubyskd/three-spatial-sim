export interface AssetDefinition {
  id: string;
  name: string;
  footprintRadius: number;
  maxSlopeDegrees: number;
}

export class AssetRegistry {
  private readonly definitions = new Map<string, AssetDefinition>([
    ['signal-tower', { id: 'signal-tower', name: 'Signal Tower', footprintRadius: ALGORITHM_DEFAULTS.signalTowerFootprintRadius, maxSlopeDegrees: ALGORITHM_DEFAULTS.maxSlopeDegrees }],
  ]);
  get(id: string): AssetDefinition | undefined { return this.definitions.get(id); }
  getAll(): AssetDefinition[] { return [...this.definitions.values()]; }
}
import { ALGORITHM_DEFAULTS } from '../algorithm/EnvironmentConfig';
