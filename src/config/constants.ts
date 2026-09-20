export const SIMULATION = {
  fixedTimeStep: 1 / 60,
  agentSpeed: 4.2,
  agentRadius: 0.45,
  agentHalfHeight: 0.45,
} as const;

export const COLORS = {
  background: 0xffffff,
  ground: 0xe6eee8,
  agent: 0x83b9a7,
  target: 0xe2b586,
  path: 0xd4ab7c,
  road: 0xb5c9c3,
  grass: 0xc5ddc8,
  water: 0xa7cadc,
  obstacle: 0xdfaba9,
  restricted: 0xd9a9be,
} as const;
