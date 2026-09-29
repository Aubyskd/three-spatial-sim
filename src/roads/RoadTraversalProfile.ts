import type { LocalRoadFeature } from '../gis/VectorFeatureTypes';

export type RoadTraversalProfileName = 'pedestrian' | 'vehicle' | 'all';

export interface RoadTraversalProfile {
  mode: RoadTraversalProfileName;
  allowedHighwayTypes: readonly string[];
  allowBridge: boolean;
  allowTunnel: boolean;
}

export const ROAD_TRAVERSAL_PROFILES: Readonly<Record<RoadTraversalProfileName, RoadTraversalProfile>> = Object.freeze({
  pedestrian: Object.freeze({
    mode: 'pedestrian',
    allowedHighwayTypes: Object.freeze([
      'residential', 'service', 'living_street', 'pedestrian', 'footway', 'path', 'steps', 'track',
      'unclassified', 'tertiary', 'tertiary_link', 'secondary', 'secondary_link', 'primary', 'primary_link',
    ]),
    allowBridge: true,
    allowTunnel: true,
  }),
  vehicle: Object.freeze({
    mode: 'vehicle',
    allowedHighwayTypes: Object.freeze([
      'residential', 'service', 'living_street', 'unclassified', 'tertiary', 'tertiary_link',
      'secondary', 'secondary_link', 'primary', 'primary_link', 'trunk', 'trunk_link', 'motorway', 'motorway_link',
    ]),
    allowBridge: true,
    allowTunnel: true,
  }),
  all: Object.freeze({ mode: 'all', allowedHighwayTypes: Object.freeze([]), allowBridge: true, allowTunnel: true }),
});

export function resolveTraversalProfile(profile: RoadTraversalProfileName | RoadTraversalProfile): RoadTraversalProfile {
  return typeof profile === 'string' ? ROAD_TRAVERSAL_PROFILES[profile] : profile;
}

export function roadProperty(road: LocalRoadFeature, key: string): unknown {
  const direct = road.properties?.[key];
  if (direct !== undefined && direct !== null && direct !== '') return direct;
  const raw = road.properties?.raw;
  if (raw && typeof raw === 'object' && key in raw) return (raw as Record<string, unknown>)[key];
  return road.sourceProperties?.[key];
}

export function roadBoolean(road: LocalRoadFeature, key: 'bridge' | 'tunnel'): boolean {
  const value = roadProperty(road, key);
  if (typeof value === 'boolean') return value;
  return ['yes', 'true', '1'].includes(String(value ?? '').toLowerCase());
}

export function roadLayer(road: LocalRoadFeature): number {
  const value = Number(roadProperty(road, 'layer') ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export function isRoadTraversable(road: LocalRoadFeature, profile: RoadTraversalProfile): boolean {
  const highway = String(roadProperty(road, 'highway') ?? '').toLowerCase();
  if (profile.mode !== 'all' && !profile.allowedHighwayTypes.includes(highway)) return false;
  if (!profile.allowBridge && roadBoolean(road, 'bridge')) return false;
  if (!profile.allowTunnel && roadBoolean(road, 'tunnel')) return false;
  return road.centerline.length >= 2;
}
