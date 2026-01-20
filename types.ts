export interface Point {
  x: number;
  y: number;
}

export interface Node {
  id: string;
  label: string;
  x: number;
  y: number;
  type?: 'terminal' | 'stop' | 'hub';
}

export interface Edge {
  from: string;
  to: string;
  controlPointOffset: Point; // Offset from midpoint to create curve
}

export interface Route {
  id: number;
  name: string;
  path: string[]; // Array of Node IDs
  color: string;
}

// Single Bus State (Manual Mode)
export interface BusState {
  x: number;
  y: number;
  rotation: number;
  isVisible: boolean;
  currentStopLabel?: string;
}

// Backend Analytics Data
export interface RouteAnalytics {
  route_id: number;
  route_name: string;
  total_people: number;
  probability: number;
  buses_allocated: number;
  frequency_minutes: number; // Treated as seconds for simulation
}

export interface BackendResponse {
  slot_counts: Record<string, number>;
  routes: RouteAnalytics[];
  saved_buses: number;
}

// Multi-Bus Simulation State
export interface SimulatedBus {
  id: string;
  routeId: number;
  color: string;
  path: string[];
  
  // Animation State
  currentSegment: number;
  state: 'MOVING' | 'WAITING' | 'WAITING_FINAL' | 'FINISHED';
  lastStateChangeTime: number; // timestamp
  
  // Visual Position
  x: number;
  y: number;
  rotation: number;
}

// Real-time Telemetry
export interface RouteStats {
  active: number;
  completed: number;
}