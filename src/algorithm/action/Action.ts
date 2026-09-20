export interface PlaceAssetAction {
  type: 'PLACE_ASSET';
  assetType: string;
  position: { x: number; z: number };
  rotationY?: number;
}

export interface RemoveAssetAction {
  type: 'REMOVE_ASSET';
  assetId: string;
}

export interface MoveAssetAction {
  type: 'MOVE_ASSET';
  assetId: string;
  position: { x: number; z: number };
  rotationY?: number;
}

export interface NoOpAction {
  type: 'NO_OP';
  endEpisode?: boolean;
}

export type EnvironmentAction = PlaceAssetAction | RemoveAssetAction | MoveAssetAction | NoOpAction;
