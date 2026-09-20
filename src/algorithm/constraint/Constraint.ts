import type { EnvironmentAction } from '../action/Action';
import type { PlacedAsset, TerrainData } from '../../terrain/TerrainTypes';
import type { ConstraintResult } from './ConstraintResult';

export interface ConstraintContext {
  terrain: TerrainData;
  assets: readonly PlacedAsset[];
  semanticAt(x: number, z: number): { type: string; walkable: boolean } | undefined;
  ignoredAssetId?: string;
}

export interface Constraint {
  id: string;
  validate(action: EnvironmentAction, context: ConstraintContext): ConstraintResult;
}
