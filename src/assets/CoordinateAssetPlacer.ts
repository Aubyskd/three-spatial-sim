import type { GeographicCoordinate, LocalCoordinate, ProjectedCoordinate } from '../spatial/CoordinateService';
import { CoordinateService, CoordinateServiceError } from '../spatial/CoordinateService';
import { TerrainHeightProvider } from '../gis/TerrainHeightProvider';
import type { PlacedAsset } from '../terrain/TerrainTypes';
import type { PlacementValidation } from './PlacementValidator';

export type CoordinateMode = 'local' | 'projected' | 'geographic';
export type CoordinateYMode = 'auto' | 'manual';

export interface CoordinatePlacementInput {
  assetType: string;
  coordinateMode: CoordinateMode;
  first: string | number;
  second: string | number;
  yMode: CoordinateYMode;
  y?: string | number;
  rotationY?: number;
}

export interface CoordinatePlacementResult {
  success: boolean;
  code: string;
  message: string;
  local?: LocalCoordinate;
  projected?: ProjectedCoordinate;
  geographic?: GeographicCoordinate;
  validation?: PlacementValidation;
  asset?: PlacedAsset;
}

interface CoordinatePlacementManager {
  validate(definitionId: string, x: number, z: number): PlacementValidation;
  placeAt(definitionId: string, position: LocalCoordinate, rotationY?: number, validation?: PlacementValidation, heightMode?: PlacedAsset['heightMode']): PlacedAsset | null;
}

export class CoordinateAssetPlacer {
  constructor(
    private readonly coordinates: CoordinateService,
    private readonly heights: TerrainHeightProvider,
    private readonly assets: CoordinatePlacementManager,
  ) {}

  preview(input: CoordinatePlacementInput): CoordinatePlacementResult { return this.resolveAndValidate(input); }

  deploy(input: CoordinatePlacementInput): CoordinatePlacementResult {
    const result = this.resolveAndValidate(input);
    if (!result.success || !result.local || !result.validation) return result;
    const asset = this.assets.placeAt(input.assetType, result.local, input.rotationY ?? 0, result.validation, input.yMode === 'manual' ? 'manual' : 'terrain');
    return asset ? { ...result, asset, message: 'Asset deployed.' }
      : { ...result, success: false, code: 'PLACEMENT_FAILED', message: 'Placement failed while creating the asset.' };
  }

  private resolveAndValidate(input: CoordinatePlacementInput): CoordinatePlacementResult {
    try {
      if (!input.assetType) return failure('UNKNOWN_ASSET', 'Select an asset type.');
      const first = finiteInput(input.first, 'First coordinate');
      const second = finiteInput(input.second, 'Second coordinate');
      const manualY = input.yMode === 'manual' ? finiteInput(input.y, 'Y / elevation') : undefined;
      let local: LocalCoordinate;
      if (input.coordinateMode === 'local') local = { x: first, y: manualY ?? 0, z: second };
      else if (input.coordinateMode === 'projected') local = this.coordinates.projectedToLocal({ easting: first, northing: second, elevation: manualY });
      else local = this.coordinates.geographicToLocal({ longitude: first, latitude: second, elevation: manualY });
      this.coordinates.assertWithinLocalBounds(local);
      if (input.yMode === 'auto') {
        const height = this.heights.heightAt(local.x, local.z);
        if (!Number.isFinite(height)) return failure('NO_TERRAIN_HEIGHT', 'Could not sample terrain height at this coordinate.', local);
        local.y = height;
      }
      const validation = this.assets.validate(input.assetType, local.x, local.z);
      if (!validation.valid) return { ...coordinateResult(this.coordinates, local), success: false, code: placementCode(validation.reason), message: validation.reason ?? 'Placement rejected.', validation };
      return { ...coordinateResult(this.coordinates, local), success: true, code: 'OK', message: 'Coordinate is valid for placement.', validation };
    } catch (error) {
      if (error instanceof CoordinateServiceError) return failure(error.code, error.message);
      return failure('INVALID_COORDINATE', error instanceof Error ? error.message : String(error));
    }
  }
}

export function coordinateResult(coordinates: CoordinateService, local: LocalCoordinate): Omit<CoordinatePlacementResult, 'success' | 'code' | 'message'> {
  if (!coordinates.hasProjectedCoordinates()) return { local };
  const projected = coordinates.localToProjected(local);
  return { local, projected, geographic: coordinates.projectedToGeographic(projected) };
}

function finiteInput(value: string | number | undefined, label: string): number {
  if (typeof value === 'string' && value.trim() === '') throw new CoordinateServiceError('INVALID_COORDINATE', `${label} cannot be empty.`);
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) throw new CoordinateServiceError('INVALID_COORDINATE', `${label} must be a finite number.`);
  return number;
}
function placementCode(reason?: string): string {
  if (!reason) return 'PLACEMENT_REJECTED';
  if (reason === 'outsideTerrainBounds') return 'OUTSIDE_TERRAIN_BOUNDS';
  if (reason === 'obstacle') return 'BUILDING_COLLISION';
  if (reason === 'restricted') return 'NON_WALKABLE';
  if (reason === 'noTerrainSupport') return 'NO_TERRAIN_SUPPORT';
  if (reason === 'water') return 'WATER';
  if (reason === 'collision') return 'ASSET_COLLISION';
  if (reason.startsWith('slope')) return 'SLOPE_TOO_STEEP';
  if (reason === 'unknown asset') return 'UNKNOWN_ASSET';
  return reason.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}
function coordinateResultOrLocal(local?: LocalCoordinate): Pick<CoordinatePlacementResult, 'local'> { return local ? { local } : {}; }
function failure(code: string, message: string, local?: LocalCoordinate): CoordinatePlacementResult {
  return { success: false, code, message, ...coordinateResultOrLocal(local) };
}
