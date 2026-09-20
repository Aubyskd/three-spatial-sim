import type { PlacedAsset } from '../../terrain/TerrainTypes';
import type { ConstraintContext } from '../constraint/Constraint';
import { ConstraintEngine } from '../constraint/ConstraintEngine';
import type { ConstraintValidation } from '../constraint/ConstraintResult';
import type { EnvironmentAction } from './Action';
import { ACTION_TYPES } from './ActionSpace';

export class ActionValidator {
  constructor(private readonly constraints: ConstraintEngine) {}

  validate(action: EnvironmentAction, context: ConstraintContext): ConstraintValidation {
    const shapeFailure = this.validateShape(action);
    if (shapeFailure) return shapeFailure;
    if (action.type === 'REMOVE_ASSET' || action.type === 'MOVE_ASSET') {
      const exists = context.assets.some((asset: PlacedAsset) => asset.id === action.assetId);
      if (!exists) return { valid: false, results: [{ constraintId: 'ASSET_EXISTS', valid: false, reason: `Asset ${action.assetId} does not exist.` }] };
    }
    if ((action.type === 'PLACE_ASSET' || action.type === 'MOVE_ASSET') && action.type === 'PLACE_ASSET' && action.assetType !== 'signal-tower') {
      return { valid: false, results: [{ constraintId: 'ASSET_TYPE_SUPPORTED', valid: false, reason: `Unsupported asset type: ${action.assetType}.` }] };
    }
    return this.constraints.validate(action, { ...context, ignoredAssetId: action.type === 'MOVE_ASSET' ? action.assetId : undefined });
  }

  private validateShape(action: EnvironmentAction): ConstraintValidation | undefined {
    if (!action || !ACTION_TYPES.includes(action.type)) return { valid: false, results: [{ constraintId: 'INVALID_ACTION', valid: false, reason: 'Unknown action type.' }] };
    if ((action.type === 'PLACE_ASSET' || action.type === 'MOVE_ASSET') && (!Number.isFinite(action.position?.x) || !Number.isFinite(action.position?.z))) {
      return { valid: false, results: [{ constraintId: 'INVALID_ACTION', valid: false, reason: 'Placement position must contain finite x and z coordinates.' }] };
    }
    return undefined;
  }
}
