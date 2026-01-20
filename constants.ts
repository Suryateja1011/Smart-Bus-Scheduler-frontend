import { Node, Edge, Route } from './types';

// Canvas Dimensions
export const CANVAS_WIDTH = 1000;
export const CANVAS_HEIGHT = 700;

export const NODES: Record<string, Node> = {
  B1: { id: 'B1', label: 'B1', x: 100, y: 350, type: 'terminal' },
  B2: { id: 'B2', label: 'B2', x: 250, y: 350, type: 'stop' },
  B3: { id: 'B3', label: 'B3', x: 400, y: 350, type: 'hub' },
  
  // Upper Branch
  B4: { id: 'B4', label: 'B4', x: 550, y: 200, type: 'stop' },
  B5: { id: 'B5', label: 'B5', x: 750, y: 200, type: 'terminal' },
  
  // Lower/Middle Branch
  B6: { id: 'B6', label: 'B6', x: 550, y: 500, type: 'hub' },
  
  // Sub-branches from B6
  B7: { id: 'B7', label: 'B7', x: 750, y: 350, type: 'terminal' },
  B8: { id: 'B8', label: 'B8', x: 750, y: 500, type: 'stop' },
  B10: { id: 'B10', label: 'B10', x: 750, y: 650, type: 'terminal' },
  
  // End of B8
  B9: { id: 'B9', label: 'B9', x: 900, y: 500, type: 'terminal' },
};

// Edges with curvature offsets to create organic looking roads
// Offset {x: 0, y: 0} is a straight line.
export const EDGES: Edge[] = [
  { from: 'B1', to: 'B2', controlPointOffset: { x: 0, y: -20 } },
  { from: 'B2', to: 'B3', controlPointOffset: { x: 0, y: 20 } },
  
  // B3 splits
  { from: 'B3', to: 'B4', controlPointOffset: { x: -20, y: 50 } }, // Curves up
  { from: 'B3', to: 'B6', controlPointOffset: { x: -20, y: -50 } }, // Curves down
  
  // Upper
  { from: 'B4', to: 'B5', controlPointOffset: { x: 0, y: -30 } },
  
  // B6 splits
  { from: 'B6', to: 'B7', controlPointOffset: { x: -50, y: 50 } }, // Up towards middle
  { from: 'B6', to: 'B8', controlPointOffset: { x: 0, y: 20 } },    // Straight-ish
  { from: 'B6', to: 'B10', controlPointOffset: { x: -50, y: -50 } }, // Down
  
  // Extension
  { from: 'B8', to: 'B9', controlPointOffset: { x: 0, y: -20 } },
];

export const ROUTES: Route[] = [
  {
    id: 2,
    name: 'Route 2: Central Link',
    path: ['B1', 'B2', 'B3', 'B6', 'B7'],
    color: '#3b82f6', // Blue
  },
  {
    id: 1,
    name: 'Route 1: Northern Express',
    path: ['B1', 'B2', 'B3', 'B4', 'B5'],
    color: '#10b981', // Emerald
  },
  {
    id: 3,
    name: 'Route 3: Long Haul South',
    path: ['B1', 'B2', 'B3', 'B6', 'B8', 'B9'],
    color: '#f59e0b', // Amber
  },
  {
    id: 4,
    name: 'Route 4: Southern Edge',
    path: ['B1', 'B2', 'B3', 'B6', 'B10'],
    color: '#8b5cf6', // Violet
  },
];
