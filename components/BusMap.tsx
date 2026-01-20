import React, { useEffect, useRef, useState } from 'react';
import { MapPin, Building2, Store } from 'lucide-react';
import { NODES, EDGES, CANVAS_WIDTH, CANVAS_HEIGHT, ROUTES } from '../constants';
import { Route, BusState, Point, RouteAnalytics, SimulatedBus, RouteStats } from '../types';
import {
  getQuadraticBezierPoint,
  getQuadraticBezierAngle,
  calculateControlPoint,
} from '../utils/geometry';

interface BusMapProps {
  // Manual Mode Props
  activeRoute: Route | null;
  isAnimating: boolean;
  onAnimationComplete: () => void;
  onStopReached: (stopName: string) => void;
  
  // Shared Props
  customImages: Record<string, string>;
  onNodeClick: (nodeId: string) => void;
  peopleCounts: Record<string, number>;
  
  // Simulation Mode Props
  simulationMode: boolean;
  simulationTime: number; // Current second in the simulation
  totalCycles: number;    // Total duration of simulation
  routesAnalytics: RouteAnalytics[];
  onSimulationUpdate?: (stats: Record<number, RouteStats>) => void;
}

const STOP_DURATION = 1000; 
const DESTINATION_WAIT = 2000;
const TRAVEL_DURATION = 2000; 

export const BusMap: React.FC<BusMapProps> = ({
  activeRoute,
  isAnimating,
  onAnimationComplete,
  onStopReached,
  customImages,
  onNodeClick,
  peopleCounts,
  simulationMode,
  simulationTime,
  totalCycles,
  routesAnalytics,
  onSimulationUpdate,
}) => {
  // ---------------------------------------------------------
  // MANUAL MODE STATE (Single Bus)
  // ---------------------------------------------------------
  const [singleBusState, setSingleBusState] = useState<BusState>({
    x: 0, y: 0, rotation: 0, isVisible: false,
  });
  
  // ---------------------------------------------------------
  // SIMULATION MODE STATE (Multi Bus)
  // ---------------------------------------------------------
  const [simulatedBuses, setSimulatedBuses] = useState<SimulatedBus[]>([]);
  const busesRef = useRef<SimulatedBus[]>([]); // Mutable ref for animation loop
  const completedCountsRef = useRef<Record<number, number>>({}); // Track completed buses by route ID
  
  // Schedule: Time (second) -> Array of Route IDs to dispatch
  const [dispatchSchedule, setDispatchSchedule] = useState<Record<number, number[]>>({});

  // Refs for loop control
  const requestRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null); // Only for single bus
  const pauseTimeRef = useRef<number | null>(null); // Only for single bus
  const currentSegmentRef = useRef<number>(0);      // Only for single bus
  const stateRef = useRef<'MOVING' | 'WAITING' | 'WAITING_FINAL'>('MOVING'); // Only for single bus

  // Reset counters when simulation starts/stops
  useEffect(() => {
    if (simulationMode) {
      completedCountsRef.current = {};
      generateDispatchSchedule();
    } else {
      setSimulatedBuses([]);
      busesRef.current = [];
      setDispatchSchedule({});
    }
  }, [simulationMode, routesAnalytics, totalCycles]);

  // ---------------------------------------------------------
  // SCHEDULE GENERATOR
  // ---------------------------------------------------------
  const generateDispatchSchedule = () => {
    const schedule: Record<number, number[]> = {};

    routesAnalytics.forEach((route) => {
      const allocated = route.buses_allocated;
      const freq = route.frequency_minutes; // Treated as seconds
      const maxPossibleWindows = Math.floor(totalCycles / freq);
      
      // We only schedule up to the allocated amount, or the max time windows allow
      const busesToSchedule = Math.min(allocated, maxPossibleWindows);

      for (let i = 0; i < busesToSchedule; i++) {
        // Define Window [start, end)
        const windowStart = i * freq;
        const windowEnd = (i + 1) * freq;
        
        // Pick random time in window
        // Ensure we don't pick a time > totalCycles
        const maxTime = Math.min(windowEnd, totalCycles);
        const minTime = windowStart;
        
        if (maxTime > minTime) {
            const dispatchTime = Math.floor(Math.random() * (maxTime - minTime)) + minTime;
            
            if (!schedule[dispatchTime]) {
                schedule[dispatchTime] = [];
            }
            schedule[dispatchTime].push(route.route_id);
        }
      }
    });
    
    setDispatchSchedule(schedule);
    console.log("Generated Dispatch Schedule:", schedule);
  };

  // ---------------------------------------------------------
  // SIMULATION SPAWNER (Effect)
  // ---------------------------------------------------------
  useEffect(() => {
    if (!simulationMode) return;

    // Check schedule for current time
    const routesToSpawn = dispatchSchedule[simulationTime];

    if (routesToSpawn && routesToSpawn.length > 0) {
        const newBuses: SimulatedBus[] = [];

        routesToSpawn.forEach(routeId => {
            // Double check allocation limit (redundant but safe)
            // Actually schedule generator handles this, so we trust schedule.
            
            const staticRoute = ROUTES.find(r => r.id === routeId);
            if (staticRoute && staticRoute.path.length > 0) {
                const startNode = NODES[staticRoute.path[0]];
                newBuses.push({
                    id: `bus-${routeId}-${simulationTime}-${Math.random()}`,
                    routeId: routeId,
                    color: staticRoute.color,
                    path: staticRoute.path,
                    currentSegment: 0,
                    state: 'MOVING',
                    lastStateChangeTime: performance.now(),
                    x: startNode.x,
                    y: startNode.y,
                    rotation: 0
                });
            }
        });

        if (newBuses.length > 0) {
            busesRef.current = [...busesRef.current, ...newBuses];
            setSimulatedBuses([...busesRef.current]);
        }
    }
  }, [simulationTime, simulationMode, dispatchSchedule]);


  // ---------------------------------------------------------
  // ANIMATION LOOP (Handles Both Modes)
  // ---------------------------------------------------------
  useEffect(() => {
    const animate = (time: number) => {
      // 1. MANUAL MODE LOGIC
      if (!simulationMode && isAnimating && activeRoute) {
         if (!startTimeRef.current) startTimeRef.current = time;
         handleSingleBusAnimation(time);
      }

      // 2. SIMULATION MODE LOGIC (Multi-Bus)
      if (simulationMode && busesRef.current.length > 0) {
         handleMultiBusAnimation(time);
      }

      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isAnimating, activeRoute, simulationMode]);


  // ---------------------------------------------------------
  // HELPER: Single Bus Logic (Legacy)
  // ---------------------------------------------------------
  const handleSingleBusAnimation = (time: number) => {
      if (stateRef.current === 'WAITING' || stateRef.current === 'WAITING_FINAL') {
          if (!pauseTimeRef.current) pauseTimeRef.current = time;
          const elapsedPause = time - pauseTimeRef.current;
          const duration = stateRef.current === 'WAITING_FINAL' ? DESTINATION_WAIT : STOP_DURATION;

          if (elapsedPause >= duration) {
              if (stateRef.current === 'WAITING_FINAL') {
                  onAnimationComplete();
                  return;
              }
              stateRef.current = 'MOVING';
              startTimeRef.current = time;
              pauseTimeRef.current = null;
              currentSegmentRef.current += 1;
          } else {
              return;
          }
      }

      if (!activeRoute) return;
      const segmentIndex = currentSegmentRef.current;
      if (segmentIndex >= activeRoute.path.length - 1) {
          onAnimationComplete();
          return;
      }

      const fromId = activeRoute.path[segmentIndex];
      const toId = activeRoute.path[segmentIndex + 1];
      const fromNode = NODES[fromId];
      const toNode = NODES[toId];
      const edge = EDGES.find(e => e.from === fromId && e.to === toId);
      
      if (!edge) return;

      const controlPoint = calculateControlPoint(
          { x: fromNode.x, y: fromNode.y },
          { x: toNode.x, y: toNode.y },
          edge.controlPointOffset
      );

      const elapsed = time - (startTimeRef.current || time);
      const t = Math.min(elapsed / TRAVEL_DURATION, 1);
      const pos = getQuadraticBezierPoint(t, fromNode, controlPoint, toNode);
      const rot = getQuadraticBezierAngle(t, fromNode, controlPoint, toNode);

      setSingleBusState({
          x: pos.x, y: pos.y, rotation: rot, isVisible: true, 
          currentStopLabel: t >= 1 ? toNode.label : undefined 
      });

      if (t >= 1) {
          onStopReached(toNode.label);
          const isFinal = segmentIndex + 1 === activeRoute.path.length - 1;
          stateRef.current = isFinal ? 'WAITING_FINAL' : 'WAITING';
          pauseTimeRef.current = null;
      }
  };


  // ---------------------------------------------------------
  // HELPER: Multi-Bus Logic
  // ---------------------------------------------------------
  const handleMultiBusAnimation = (time: number) => {
    const activeFleet = busesRef.current;
    
    // Filter out already finished buses (sanity check)
    // We iterate over everything to update physics
    const ongoingBuses = activeFleet.filter(bus => bus.state !== 'FINISHED');
    let busesFinishedThisFrame: number[] = [];

    ongoingBuses.forEach(bus => {
        // Handle Waiting
        if (bus.state === 'WAITING' || bus.state === 'WAITING_FINAL') {
            const elapsedWait = time - bus.lastStateChangeTime;
            const duration = bus.state === 'WAITING_FINAL' ? DESTINATION_WAIT : STOP_DURATION;
            
            if (elapsedWait > duration) {
                if (bus.state === 'WAITING_FINAL') {
                    bus.state = 'FINISHED';
                    busesFinishedThisFrame.push(bus.routeId);
                } else {
                    bus.state = 'MOVING';
                    bus.currentSegment += 1;
                    bus.lastStateChangeTime = time;
                }
            }
            return; // Bus is stationary
        }

        // Handle Moving
        const segmentIndex = bus.currentSegment;
        
        // Safety check
        if (segmentIndex >= bus.path.length - 1) {
            bus.state = 'FINISHED';
            busesFinishedThisFrame.push(bus.routeId);
            return;
        }

        const fromId = bus.path[segmentIndex];
        const toId = bus.path[segmentIndex + 1];
        const fromNode = NODES[fromId];
        const toNode = NODES[toId];
        const edge = EDGES.find(e => e.from === fromId && e.to === toId);

        if (!edge) { 
            bus.state = 'FINISHED'; 
            busesFinishedThisFrame.push(bus.routeId);
            return; 
        }

        const cp = calculateControlPoint(
            {x: fromNode.x, y: fromNode.y}, 
            {x: toNode.x, y: toNode.y}, 
            edge.controlPointOffset
        );

        const elapsed = time - bus.lastStateChangeTime;
        const t = Math.min(elapsed / TRAVEL_DURATION, 1);
        
        const pos = getQuadraticBezierPoint(t, fromNode, cp, toNode);
        const rot = getQuadraticBezierAngle(t, fromNode, cp, toNode);

        // --- LANE OFFSET LOGIC (Visual Anti-Stacking) ---
        // Calculate normal vector to the curve
        const angleRad = (rot * Math.PI) / 180;
        const normalRad = angleRad + Math.PI / 2; // 90 degrees offset

        // Define lane offset based on Route ID
        // (Assuming Route IDs are 1, 2, 3, 4...)
        // We shift them: R1: -1.5 units, R2: -0.5 units, R3: 0.5 units, R4: 1.5 units
        const laneWidth = 14; 
        const laneIndex = (bus.routeId - 1) % 4; // 0, 1, 2, 3
        const laneOffset = (laneIndex - 1.5) * laneWidth; // -21, -7, 7, 21

        const offsetX = laneOffset * Math.cos(normalRad);
        const offsetY = laneOffset * Math.sin(normalRad);

        // Update visuals with offset
        bus.x = pos.x + offsetX;
        bus.y = pos.y + offsetY;
        bus.rotation = rot;

        if (t >= 1) {
            // Arrived at node
            const isFinal = segmentIndex + 1 === bus.path.length - 1;
            bus.state = isFinal ? 'WAITING_FINAL' : 'WAITING';
            bus.lastStateChangeTime = time;
            // Snap to exact node (remove offset while stopped? No, keep it for clarity)
            bus.x = toNode.x + offsetX; 
            bus.y = toNode.y + offsetY;
        }
    });

    // Update Global Stats if any bus finished
    if (busesFinishedThisFrame.length > 0) {
        busesFinishedThisFrame.forEach(rId => {
            completedCountsRef.current[rId] = (completedCountsRef.current[rId] || 0) + 1;
        });
    }

    // Cleanup finished buses from array
    const remainingBuses = ongoingBuses.filter(b => b.state !== 'FINISHED');
    busesRef.current = remainingBuses;
    setSimulatedBuses([...remainingBuses]);

    // Send Telemetry to Parent
    if (onSimulationUpdate) {
        const activeCounts: Record<number, number> = {};
        remainingBuses.forEach(b => {
            activeCounts[b.routeId] = (activeCounts[b.routeId] || 0) + 1;
        });
        
        const stats: Record<number, RouteStats> = {};
        // Ensure we send stats for all routes even if 0
        routesAnalytics.forEach(r => {
            stats[r.route_id] = {
                active: activeCounts[r.route_id] || 0,
                completed: completedCountsRef.current[r.route_id] || 0
            };
        });
        onSimulationUpdate(stats);
    }
  };

  // ---------------------------------------------------------
  // RENDER HELPERS
  // ---------------------------------------------------------
  const renderEdge = (edge: typeof EDGES[0]) => {
    const start = NODES[edge.from];
    const end = NODES[edge.to];
    const cp = calculateControlPoint(start, end, edge.controlPointOffset);
    
    let isRouteEdge = false;
    let edgeColor = undefined;
    
    if (!simulationMode && activeRoute) {
      for (let i = 0; i < activeRoute.path.length - 1; i++) {
        if (activeRoute.path[i] === edge.from && activeRoute.path[i+1] === edge.to) {
          isRouteEdge = true;
          edgeColor = activeRoute.color;
          break;
        }
      }
    }

    return (
      <g key={`${edge.from}-${edge.to}`}>
        <path d={`M ${start.x} ${start.y} Q ${cp.x} ${cp.y} ${end.x} ${end.y}`} fill="none" stroke="#374151" strokeWidth="34" strokeLinecap="round" />
        <path d={`M ${start.x} ${start.y} Q ${cp.x} ${cp.y} ${end.x} ${end.y}`} fill="none" stroke="#1f2937" strokeWidth="38" strokeLinecap="round" className="opacity-20" style={{ transform: 'translateZ(-1px)' }} />
        <path d={`M ${start.x} ${start.y} Q ${cp.x} ${cp.y} ${end.x} ${end.y}`} fill="none" stroke={edgeColor || "#e5e7eb"} strokeWidth="2" strokeDasharray="12 12" strokeOpacity={isRouteEdge ? 1 : 0.6} className="transition-colors duration-500" />
        <DirectionArrow t={0.5} p0={start} p1={cp} p2={end} color={edgeColor || "#9ca3af"} />
      </g>
    );
  };

  // Which buses to render?
  const busesToRender = simulationMode 
     ? simulatedBuses 
     : (singleBusState.isVisible ? [{ ...singleBusState, color: activeRoute?.color || '#eab308', routeId: activeRoute?.id }] : []);

  return (
    <div className="w-full h-full bg-emerald-50 rounded-xl overflow-hidden relative">
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23059669\' fill-opacity=\'0.05\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }}></div>
      <svg viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`} className="w-full h-full" style={{ touchAction: 'none' }}>
        {EDGES.map(renderEdge)}
        
        {Object.values(NODES).map((node) => {
            const hasCustomImage = !!customImages[node.id];
            const peopleCount = peopleCounts[node.id] || 0;
            return (
              <g key={node.id} transform={`translate(${node.x}, ${node.y})`} onClick={() => onNodeClick(node.id)} className="cursor-pointer hover:opacity-90 transition-opacity">
                <ellipse cx="0" cy="18" rx="22" ry="8" fill="rgba(0,0,0,0.3)" />
                <circle r="18" fill={hasCustomImage ? '#fff' : '#f3f4f6'} stroke="#1f2937" strokeWidth="3" />
                {hasCustomImage ? (
                   <image href={customImages[node.id]} x="-18" y="-18" height="36" width="36" clipPath="inset(0 0 0 0 round 50%)" preserveAspectRatio="xMidYMid slice" />
                ) : (
                    <g transform="translate(-10, -10)">
                        {node.type === 'terminal' ? <Building2 size={20} color="#1f2937" /> : (node.type === 'hub' ? <Store size={20} color="#1f2937" /> : <MapPin size={20} color="#1f2937" />)}
                    </g>
                )}
                <g transform="translate(12, -18)">
                   <circle r="10" fill={peopleCount > 0 ? (peopleCount > 15 ? "#ef4444" : "#f59e0b") : "#374151"} stroke="white" strokeWidth="2" />
                   <text y="3.5" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">{peopleCount}</text>
                </g>
                <g transform="translate(0, -38)">
                    <rect x="-22" y="-14" width="44" height="22" rx="4" fill="#1f2937" />
                    <text x="0" y="2" textAnchor="middle" fill="white" fontSize="12" fontWeight="bold">{node.label}</text>
                    <path d="M -4 8 L 4 8 L 0 14 Z" fill="#1f2937" />
                </g>
              </g>
            );
        })}

        {/* Render All Active Buses */}
        {busesToRender.map((bus: any, i) => (
          <g key={bus.id || i} transform={`translate(${bus.x}, ${bus.y}) rotate(${bus.rotation})`}>
             <rect x="-18" y="-8" width="36" height="16" rx="4" fill="rgba(0,0,0,0.4)" transform="translate(0, 10)" filter="blur(2px)"/>
            <rect x="-20" y="-10" width="40" height="20" rx="4" fill={bus.color} stroke="#fff" strokeWidth="2" />
            
            {/* Bus Details */}
            <rect x="-14" y="-7" width="8" height="14" fill="#374151" rx="1" />
            <rect x="-2" y="-7" width="8" height="14" fill="#374151" rx="1" />
            <rect x="10" y="-7" width="6" height="14" fill="#93c5fd" rx="1" />
            
            {/* Wheels */}
            <rect x="-12" y="-12" width="6" height="3" fill="#000" />
            <rect x="6" y="-12" width="6" height="3" fill="#000" />
            <rect x="-12" y="9" width="6" height="3" fill="#000" />
            <rect x="6" y="9" width="6" height="3" fill="#000" />

            {/* Label - Counter Rotated for readability */}
            {bus.routeId && (
                <g transform={`rotate(${-bus.rotation})`}>
                    <text x="0" y="1" textAnchor="middle" fill="white" fontSize="10" fontWeight="800" style={{ textShadow: '0px 1px 2px rgba(0,0,0,0.8)' }}>
                        R{bus.routeId}
                    </text>
                </g>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
};

const DirectionArrow = ({ t, p0, p1, p2, color }: { t: number, p0: Point, p1: Point, p2: Point, color: string | undefined }) => {
    const pos = getQuadraticBezierPoint(t, p0, p1, p2);
    const angle = getQuadraticBezierAngle(t, p0, p1, p2);
    return (
        <g transform={`translate(${pos.x}, ${pos.y}) rotate(${angle})`}>
            <path d="M -4 -4 L 4 0 L -4 4" fill="none" stroke={color || "#9ca3af"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </g>
    )
}