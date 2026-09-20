import type { PathStatus, Vector3Data } from '../types';

export interface NearbyObject {
  id: string;
  type: string;
  distance: number;
  position: Vector3Data;
}

/** Runtime navigation observation retained for the interactive V0.1/V0.2 UI. */
export interface RuntimeObservation {
  agent: {
    position: Vector3Data;
    velocity: Vector3Data;
  };
  target: { position: Vector3Data } | null;
  nearbyObjects: NearbyObject[];
  currentRegion?: string;
  pathStatus: PathStatus;
}

export type Observation = RuntimeObservation;
