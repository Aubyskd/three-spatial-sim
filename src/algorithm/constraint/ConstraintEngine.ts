import { ALGORITHM_DEFAULTS } from '../EnvironmentConfig';
import type { EnvironmentAction } from '../action/Action';
import { getTerrainSlope, hasTerrainSupport, isInferredWater, sampleTerrainHeight } from '../../terrain/TerrainDataUtils';
import type { Constraint, ConstraintContext } from './Constraint';
import type { ConstraintResult, ConstraintValidation } from './ConstraintResult';

function positionOf(action: EnvironmentAction): { x: number; z: number } | undefined {
  return action.type === 'PLACE_ASSET' || action.type === 'MOVE_ASSET' ? action.position : undefined;
}

function pass(id: string, metrics?: Record<string, number>): ConstraintResult { return { constraintId: id, valid: true, metrics }; }
function fail(id: string, reason: string, metrics?: Record<string, number>): ConstraintResult { return { constraintId: id, valid: false, reason, metrics }; }

class InsideTerrainConstraint implements Constraint {
  readonly id = 'INSIDE_TERRAIN';
  validate(action: EnvironmentAction, context: ConstraintContext): ConstraintResult {
    const position = positionOf(action); if (!position) return pass(this.id);
    const { terrain } = context;
    const inside = position.x >= terrain.origin.x && position.x <= terrain.origin.x + terrain.width && position.z >= terrain.origin.z && position.z <= terrain.origin.z + terrain.depth;
    return inside ? pass(this.id) : fail(this.id, 'Position is outside terrain bounds.');
  }
}

class GroundSupportConstraint implements Constraint {
  readonly id = 'GROUND_SUPPORT';
  validate(action: EnvironmentAction, context: ConstraintContext): ConstraintResult {
    const position = positionOf(action); if (!position) return pass(this.id);
    const height = sampleTerrainHeight(context.terrain, position.x, position.z);
    const supported = Number.isFinite(height) && hasTerrainSupport(context.terrain, position.x, position.z);
    return supported ? pass(this.id, { groundHeight: height }) : fail(this.id, 'No sampled terrain surface supports this position.');
  }
}

class SemanticConstraint implements Constraint {
  constructor(readonly id: 'NOT_IN_WATER' | 'NOT_IN_RESTRICTED_REGION', private readonly blockedType: string) {}
  validate(action: EnvironmentAction, context: ConstraintContext): ConstraintResult {
    const position = positionOf(action); if (!position) return pass(this.id);
    const region = context.semanticAt(position.x, position.z);
    const blocked = region?.type === this.blockedType || (this.blockedType === 'water' && isInferredWater(context.terrain, position.x, position.z));
    return blocked ? fail(this.id, `Position is inside ${this.blockedType}.`) : pass(this.id);
  }
}

class MaxSlopeConstraint implements Constraint {
  readonly id = 'MAX_SLOPE';
  validate(action: EnvironmentAction, context: ConstraintContext): ConstraintResult {
    const position = positionOf(action); if (!position) return pass(this.id);
    const slopeDegrees = getTerrainSlope(context.terrain, position.x, position.z);
    const metrics = { slopeDegrees, maxSlopeDegrees: ALGORITHM_DEFAULTS.maxSlopeDegrees };
    return slopeDegrees <= ALGORITHM_DEFAULTS.maxSlopeDegrees ? pass(this.id, metrics) : fail(this.id, 'Slope exceeds maximum.', metrics);
  }
}

class NoCollisionConstraint implements Constraint {
  readonly id = 'NO_COLLISION';
  validate(action: EnvironmentAction, context: ConstraintContext): ConstraintResult {
    const position = positionOf(action); if (!position) return pass(this.id);
    const semantic = context.semanticAt(position.x, position.z);
    if (semantic && !semantic.walkable && semantic.type !== 'water' && semantic.type !== 'restricted') return fail(this.id, `Position intersects ${semantic.type}.`);
    const minimum = ALGORITHM_DEFAULTS.signalTowerFootprintRadius * 2;
    const distance = context.assets.filter((asset) => asset.id !== context.ignoredAssetId).reduce((best, asset) => Math.min(best, Math.hypot(asset.position.x - position.x, asset.position.z - position.z)), Number.POSITIVE_INFINITY);
    return distance >= minimum ? pass(this.id, { nearestAssetDistance: distance, collisionDistance: minimum }) : fail(this.id, 'Asset footprint collides with an existing asset.', { nearestAssetDistance: distance, collisionDistance: minimum });
  }
}

class MinTowerDistanceConstraint implements Constraint {
  readonly id = 'MIN_TOWER_DISTANCE';
  validate(action: EnvironmentAction, context: ConstraintContext): ConstraintResult {
    const position = positionOf(action); if (!position) return pass(this.id);
    const distance = context.assets.filter((asset) => asset.id !== context.ignoredAssetId && asset.definitionId === 'signal-tower').reduce((best, asset) => Math.min(best, Math.hypot(asset.position.x - position.x, asset.position.z - position.z)), Number.POSITIVE_INFINITY);
    const metrics = { nearestTowerDistance: distance, minTowerDistance: ALGORITHM_DEFAULTS.minTowerDistance };
    return distance >= ALGORITHM_DEFAULTS.minTowerDistance ? pass(this.id, metrics) : fail(this.id, 'Tower is closer than the minimum tower distance.', metrics);
  }
}

export class ConstraintEngine {
  private readonly constraints: Constraint[] = [
    new InsideTerrainConstraint(),
    new GroundSupportConstraint(),
    new SemanticConstraint('NOT_IN_WATER', 'water'),
    new SemanticConstraint('NOT_IN_RESTRICTED_REGION', 'restricted'),
    new MaxSlopeConstraint(),
    new NoCollisionConstraint(),
    new MinTowerDistanceConstraint(),
  ];

  validate(action: EnvironmentAction, context: ConstraintContext): ConstraintValidation {
    if (action.type !== 'PLACE_ASSET' && action.type !== 'MOVE_ASSET') return { valid: true, results: [] };
    const results = this.constraints.map((constraint) => constraint.validate(action, context));
    return { valid: results.every((result) => result.valid), results };
  }
}
