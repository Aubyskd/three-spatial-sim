export interface Vector3Data {
  x: number;
  y: number;
  z: number;
}

export interface Size2D {
  width: number;
  depth: number;
}

export type PathStatus = 'idle' | 'planning' | 'moving' | 'arrived' | 'blocked' | 'error';

export const cloneVector = (value: Vector3Data): Vector3Data => ({ ...value });
