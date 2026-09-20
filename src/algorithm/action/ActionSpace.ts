import type { EnvironmentAction } from './Action';

export const ACTION_TYPES: readonly EnvironmentAction['type'][] = ['PLACE_ASSET', 'REMOVE_ASSET', 'MOVE_ASSET', 'NO_OP'];

export interface AvailableAction {
  type: EnvironmentAction['type'];
  assetTypes?: string[];
  description: string;
}

export function createSignalTowerActionSpace(): AvailableAction[] {
  return [
    { type: 'PLACE_ASSET', assetTypes: ['signal-tower'], description: 'Place a validated signal tower.' },
    { type: 'REMOVE_ASSET', description: 'Remove an existing tower by id.' },
    { type: 'MOVE_ASSET', assetTypes: ['signal-tower'], description: 'Move an existing tower after revalidation.' },
    { type: 'NO_OP', description: 'Advance the episode without changing the world.' },
  ];
}
