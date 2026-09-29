import * as THREE from 'three';
import proj4 from 'proj4';

export interface GeographicCoordinate {
  longitude: number;
  latitude: number;
  elevation?: number;
}

export interface ProjectedCoordinate {
  easting: number;
  northing: number;
  elevation?: number;
}

export interface LocalCoordinate {
  x: number;
  y: number;
  z: number;
}

export interface ScreenCoordinate { x: number; y: number; }

export interface TerrainSpatialMetadata {
  terrainId: string;
  projectedCRS: string;
  units: 'meters';
  localCoordinateConvention: { x: 'east'; y: 'up'; z: 'south' };
  localOrigin: { easting: number; northing: number; elevation: number };
  localBounds: {
    origin: LocalCoordinate;
    width: number;
    depth: number;
    minHeight: number;
    maxHeight: number;
  };
  verticalScale: number;
}

export interface CoordinateReference {
  projectedCRS: string | null;
  units: 'meters';
  localOrigin: TerrainSpatialMetadata['localOrigin'] | null;
  coordinateConvention: { x: 'east'; y: 'up'; z: 'south' };
  verticalScale: number;
  localBounds: TerrainSpatialMetadata['localBounds'];
}

export class CoordinateServiceError extends Error {
  constructor(readonly code: 'NOT_CONFIGURED' | 'CRS_NOT_CONFIGURED' | 'INVALID_COORDINATE' | 'OUTSIDE_TERRAIN_BOUNDS', message: string) {
    super(message); this.name = 'CoordinateServiceError';
  }
}

export class CoordinateService {
  private metadata?: TerrainSpatialMetadata;
  private localBounds?: TerrainSpatialMetadata['localBounds'];
  private projectForward?: (coordinate: [number, number]) => [number, number];
  private projectInverse?: (coordinate: [number, number]) => [number, number];
  private readonly projectionPoint = new THREE.Vector3();
  private readonly screenNdc = new THREE.Vector2();
  private readonly screenRaycaster = new THREE.Raycaster();

  configure(metadata: TerrainSpatialMetadata): void {
    validateMetadata(metadata);
    // Construct the projection once. Pointer movement reuses this converter.
    const converter = proj4('EPSG:4326', metadata.projectedCRS);
    this.projectForward = (coordinate) => converter.forward(coordinate) as [number, number];
    this.projectInverse = (coordinate) => converter.inverse(coordinate) as [number, number];
    this.metadata = structuredClone(metadata);
    this.localBounds = structuredClone(metadata.localBounds);
  }

  configureLocalOnly(bounds: TerrainSpatialMetadata['localBounds']): void {
    validateBounds(bounds);
    this.metadata = undefined;
    this.projectForward = undefined; this.projectInverse = undefined;
    this.localBounds = structuredClone(bounds);
  }

  hasProjectedCoordinates(): boolean { return Boolean(this.metadata); }
  getProjectedCRS(): string | undefined { return this.metadata?.projectedCRS; }

  localToProjected(local: LocalCoordinate): ProjectedCoordinate {
    const metadata = this.requireMetadata(); validateLocal(local);
    return {
      easting: local.x + metadata.localOrigin.easting,
      northing: metadata.localOrigin.northing - local.z,
      elevation: metadata.localOrigin.elevation + local.y / metadata.verticalScale,
    };
  }

  projectedToLocal(projected: ProjectedCoordinate): LocalCoordinate {
    const metadata = this.requireMetadata(); validateProjected(projected);
    return {
      x: projected.easting - metadata.localOrigin.easting,
      y: projected.elevation === undefined ? 0 : (projected.elevation - metadata.localOrigin.elevation) * metadata.verticalScale,
      z: metadata.localOrigin.northing - projected.northing,
    };
  }

  projectedToGeographic(projected: ProjectedCoordinate): GeographicCoordinate {
    this.requireMetadata(); validateProjected(projected);
    const [longitude, latitude] = this.projectInverse!([projected.easting, projected.northing]);
    const result = { longitude, latitude, elevation: projected.elevation };
    validateGeographic(result); return result;
  }

  geographicToProjected(geographic: GeographicCoordinate): ProjectedCoordinate {
    this.requireMetadata(); validateGeographic(geographic);
    const [easting, northing] = this.projectForward!([geographic.longitude, geographic.latitude]);
    const result = { easting, northing, elevation: geographic.elevation };
    validateProjected(result); return result;
  }

  localToGeographic(local: LocalCoordinate): GeographicCoordinate {
    return this.projectedToGeographic(this.localToProjected(local));
  }

  geographicToLocal(geographic: GeographicCoordinate): LocalCoordinate {
    return this.projectedToLocal(this.geographicToProjected(geographic));
  }

  containsLocal(local: Pick<LocalCoordinate, 'x' | 'z'>): boolean {
    if (!Number.isFinite(local.x) || !Number.isFinite(local.z)) return false;
    const bounds = this.requireBounds();
    return local.x >= bounds.origin.x && local.x <= bounds.origin.x + bounds.width
      && local.z >= bounds.origin.z && local.z <= bounds.origin.z + bounds.depth;
  }

  assertWithinLocalBounds(local: Pick<LocalCoordinate, 'x' | 'z'>): void {
    if (!this.containsLocal(local)) throw new CoordinateServiceError('OUTSIDE_TERRAIN_BOUNDS', 'Coordinate is outside the active terrain bounds.');
  }

  worldToScreen(world: LocalCoordinate, camera: THREE.Camera, viewport: Pick<DOMRectReadOnly, 'left' | 'top' | 'width' | 'height'>): ScreenCoordinate {
    validateLocal(world); camera.updateMatrixWorld();
    const projected = this.projectionPoint.set(world.x, world.y, world.z).project(camera);
    return { x: viewport.left + (projected.x + 1) * viewport.width / 2, y: viewport.top + (1 - projected.y) * viewport.height / 2 };
  }

  screenToWorldRay(screen: ScreenCoordinate, camera: THREE.Camera, viewport: Pick<DOMRectReadOnly, 'left' | 'top' | 'width' | 'height'>): THREE.Ray {
    if (![screen.x, screen.y, viewport.left, viewport.top, viewport.width, viewport.height].every(Number.isFinite) || viewport.width <= 0 || viewport.height <= 0) {
      throw new CoordinateServiceError('INVALID_COORDINATE', 'Screen coordinate or viewport is invalid.');
    }
    camera.updateMatrixWorld();
    this.screenNdc.set(((screen.x - viewport.left) / viewport.width) * 2 - 1, -((screen.y - viewport.top) / viewport.height) * 2 + 1);
    this.screenRaycaster.setFromCamera(this.screenNdc, camera);
    return this.screenRaycaster.ray.clone();
  }

  exportReference(): CoordinateReference {
    const bounds = this.requireBounds();
    return {
      projectedCRS: this.metadata?.projectedCRS ?? null,
      units: 'meters',
      localOrigin: this.metadata ? structuredClone(this.metadata.localOrigin) : null,
      coordinateConvention: { x: 'east', y: 'up', z: 'south' },
      verticalScale: this.metadata?.verticalScale ?? 1,
      localBounds: structuredClone(bounds),
    };
  }

  private requireMetadata(): TerrainSpatialMetadata {
    if (!this.localBounds) throw new CoordinateServiceError('NOT_CONFIGURED', 'Coordinate service has no active terrain.');
    if (!this.metadata) throw new CoordinateServiceError('CRS_NOT_CONFIGURED', 'The active terrain has no GIS metadata; use Local coordinates.');
    return this.metadata;
  }
  private requireBounds(): TerrainSpatialMetadata['localBounds'] {
    if (!this.localBounds) throw new CoordinateServiceError('NOT_CONFIGURED', 'Coordinate service has no active terrain.');
    return this.localBounds;
  }
}

export function parseTerrainSpatialMetadata(value: unknown, terrainId: string): TerrainSpatialMetadata {
  const metadata = value as Partial<TerrainSpatialMetadata>;
  if (metadata.terrainId !== terrainId || typeof metadata.projectedCRS !== 'string' || metadata.projectedCRS.trim() === ''
    || metadata.units !== 'meters' || metadata.localCoordinateConvention?.x !== 'east'
    || metadata.localCoordinateConvention?.y !== 'up' || metadata.localCoordinateConvention?.z !== 'south'
    || !metadata.localOrigin || ![metadata.localOrigin.easting, metadata.localOrigin.northing, metadata.localOrigin.elevation].every(Number.isFinite)
    || !metadata.localBounds || !Number.isFinite(metadata.verticalScale) || (metadata.verticalScale ?? 0) <= 0) {
    throw new CoordinateServiceError('INVALID_COORDINATE', `Invalid spatial metadata for terrain ${terrainId}.`);
  }
  validateBounds(metadata.localBounds);
  return metadata as TerrainSpatialMetadata;
}

function validateMetadata(metadata: TerrainSpatialMetadata): void {
  parseTerrainSpatialMetadata(metadata, metadata.terrainId);
}

function validateBounds(bounds: TerrainSpatialMetadata['localBounds']): void {
  if (!bounds?.origin || ![bounds.origin.x, bounds.origin.y, bounds.origin.z, bounds.width, bounds.depth, bounds.minHeight, bounds.maxHeight].every(Number.isFinite)
    || bounds.width <= 0 || bounds.depth <= 0 || bounds.maxHeight < bounds.minHeight) {
    throw new CoordinateServiceError('INVALID_COORDINATE', 'Terrain local bounds are invalid.');
  }
}
function validateLocal(value: LocalCoordinate): void {
  if (![value.x, value.y, value.z].every(Number.isFinite)) throw new CoordinateServiceError('INVALID_COORDINATE', 'Local coordinate must contain finite X, Y and Z.');
}
function validateProjected(value: ProjectedCoordinate): void {
  if (![value.easting, value.northing].every(Number.isFinite) || (value.elevation !== undefined && !Number.isFinite(value.elevation))) {
    throw new CoordinateServiceError('INVALID_COORDINATE', 'Projected coordinate must contain finite Easting, Northing and elevation.');
  }
}
function validateGeographic(value: GeographicCoordinate): void {
  if (!Number.isFinite(value.longitude) || !Number.isFinite(value.latitude) || value.longitude < -180 || value.longitude > 180
    || value.latitude < -90 || value.latitude > 90 || (value.elevation !== undefined && !Number.isFinite(value.elevation))) {
    throw new CoordinateServiceError('INVALID_COORDINATE', 'Longitude must be -180…180 and latitude must be -90…90.');
  }
}
