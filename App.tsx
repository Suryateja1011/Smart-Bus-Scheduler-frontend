import React, { useState, useEffect, useMemo, useRef } from 'react';
import { BusMap } from './components/BusMap';
import { NODES, EDGES } from './constants';
import { Route, BackendResponse, RouteAnalytics, RouteStats } from './types';
import { findPath } from './utils/graph';
import { Bus, MapPin, Play, AlertTriangle, Navigation, CheckCircle, Info, ChevronDown, BarChart3, Calculator, ScanEye, Bike, Clock, TrendingUp, Users, RotateCcw } from 'lucide-react';
import './index.css';


export default function App() {
  // Manual Mode State
  const [sourceId, setSourceId] = useState<string>('B1');
  const [targetId, setTargetId] = useState<string>('B7');
  const [isAnimating, setIsAnimating] = useState(false);
  
  // Backend & Simulation State
  const [customImages, setCustomImages] = useState<Record<string, string>>({});
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, File>>({});
  const [peopleCounts, setPeopleCounts] = useState<Record<string, number>>({});
  const [totalBuses, setTotalBuses] = useState<number>(5);
  const [totalCycles, setTotalCycles] = useState<number>(60); // Default to 60s for demo
  const [isPredicting, setIsPredicting] = useState<boolean>(false);
  
  // New Analytics Data
  const [simulationData, setSimulationData] = useState<BackendResponse | null>(null);
  const [simulationTime, setSimulationTime] = useState<number>(0);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [busStats, setBusStats] = useState<Record<number, RouteStats>>({});

  // Common UI State
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedNodeRef = useRef<string | null>(null);

  // ------------------------------------------------------------------
  // GLOBAL SIMULATION TIMER
  // ------------------------------------------------------------------
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isSimulating) {
        interval = setInterval(() => {
            setSimulationTime(prev => {
                if (prev >= totalCycles) {
                    setIsSimulating(false);
                    return prev;
                }
                return prev + 1;
            });
        }, 1000); // 1 Second Tick
    }
    return () => clearInterval(interval);
  }, [isSimulating, totalCycles]);


  // ------------------------------------------------------------------
  // DATA CALCS
  // ------------------------------------------------------------------
 const totalPassengers = useMemo(() => {
  return Object.values(peopleCounts).reduce(
    (acc: number, count: number) => acc + count,
    0
  );
}, [peopleCounts]);

  const activeRoute = useMemo<Route | null>(() => {
    const path = findPath(sourceId, targetId, EDGES);
    if (!path && sourceId !== targetId) return null;
    if (!path) return null;
    return {
      id: 999,
      name: `Express: ${sourceId} to ${targetId}`,
      path: path,
      color: '#3b82f6',
    };
  }, [sourceId, targetId]);

  const manualRoutePeopleCount = useMemo(() => {
    if (!activeRoute) return 0;
    return activeRoute.path.reduce((sum, nodeId) => sum + (peopleCounts[nodeId] || 0), 0);
  }, [activeRoute, peopleCounts]);

  // ------------------------------------------------------------------
  // HANDLERS
  // ------------------------------------------------------------------
  const handleStartAnimation = () => {
    if (!activeRoute) {
      setToastMessage("Cannot start: No valid route exists.");
      return;
    }
    if (isAnimating) return;
    setIsAnimating(true);
  };

  const handleAnimationComplete = () => {
    setIsAnimating(false);
  };

  const handleNodeClick = (nodeId: string) => {
    if (isAnimating || isSimulating) return;
    selectedNodeRef.current = nodeId;
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && selectedNodeRef.current) {
      setUploadedFiles(prev => ({ ...prev, [selectedNodeRef.current!]: file }));
      const reader = new FileReader();
      reader.onload = (e) => {
        setCustomImages(prev => ({ ...prev, [selectedNodeRef.current!]: e.target?.result as string }));
        setToastMessage(`Image staged for ${selectedNodeRef.current}`);
      };
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePredict = async () => {
      setIsPredicting(true);
      const formData = new FormData();
      formData.append('total_buses', totalBuses.toString());
      formData.append('total_cycles', totalCycles.toString());
      Object.entries(uploadedFiles).forEach(([nodeId, file]) => {
  if (file instanceof File) {
    formData.append(nodeId, file);
  }
});


      try {
          const response = await fetch("http://34.14.183.45:5000/count_people", {

              method: 'POST',
              body: formData,
          });

          if (!response.ok) throw new Error('Prediction failed');

          const data: BackendResponse = await response.json();
          
          setPeopleCounts(data.slot_counts);
          setSimulationData(data);
          setBusStats({}); // Reset stats
          
          setToastMessage("Analysis complete! Starting System Simulation...");
          
          // Reset and Start Simulation
          setSimulationTime(0);
          setIsSimulating(true);
          setIsAnimating(false); // Disable manual mode if active

      } catch (error) {
          console.error("Backend Error:", error);
          setToastMessage("Failed to connect to prediction server.");
      } finally {
          setIsPredicting(false);
      }
  };

  const handleSimulationUpdate = (stats: Record<number, RouteStats>) => {
      setBusStats(stats);
  };

  const handleStopSimulation = () => {
      // Reset everything to default state
      setIsSimulating(false);
      setSimulationTime(0);
      setSimulationData(null); // This hides the analytics and shows manual planner
      
      // Clear data
      setCustomImages({});
      setUploadedFiles({});
      setPeopleCounts({});
      setBusStats({});
      
      setToastMessage("Simulation stopped. System reset to manual mode.");
  };

  const nodeList = Object.values(NODES);
  
  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-gray-100 text-slate-800 font-sans">
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />

      {/* Toast */}
      {toastMessage && (
        <div className="fixed top-6 left-1/2 transform -translate-x-1/2 z-50 animate-bounce">
            <div className="bg-slate-900 text-white px-6 py-4 rounded-full shadow-2xl flex items-center gap-3 border border-slate-700">
                <AlertTriangle size={24} className="text-yellow-400" />
                <span className="font-bold text-base tracking-wide">{toastMessage}</span>
            </div>
        </div>
      )}

      {/* Sidebar */}
      <aside className="w-full md:w-[450px] bg-white border-r border-gray-200 shadow-2xl z-20 flex flex-col h-auto md:h-screen sticky top-0">
        
        {/* Header */}
        <div className="p-8 bg-slate-900 text-white relative overflow-hidden shrink-0">
          <div className="absolute top-0 right-0 p-4 opacity-10 transform translate-x-8 -translate-y-8 rotate-12"><Bus size={180} /></div>
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
               <div className="bg-indigo-600 p-2.5 rounded-xl shadow-lg"><Bus className="text-white h-7 w-7" /></div>
               <span className="text-xs font-black tracking-[0.2em] text-indigo-200 uppercase bg-indigo-900/50 px-2 py-1 rounded">TransitOS v3.0</span>
            </div>
            <h1 className="text-5xl font-black tracking-tight leading-none mb-2">Metro<span className="text-indigo-400">Flow</span></h1>
            <p className="text-slate-400 font-medium text-base">Crowd-Aware Network Simulation</p>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-gray-50/50">
          
          {/* Inputs Section */}
          <section className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
             <div className="flex justify-between items-center">
                <h2 className="text-xs font-black uppercase text-slate-400 flex items-center gap-2 tracking-widest"><BarChart3 size={18} /> System Config</h2>
                <div className="flex items-center gap-1.5 bg-slate-100 px-2 py-1 rounded-md">
                    <Users size={14} className="text-slate-500"/>
                    <span className="text-xs font-bold text-slate-600">Demand: {totalPassengers}</span>
                </div>
             </div>
             <div className="grid grid-cols-2 gap-4">
                 <div className="group relative">
                    <label className="block text-[10px] font-extrabold text-slate-500 uppercase mb-1">Total Buses</label>
                    <div className="relative bg-slate-50 rounded-xl border border-gray-200 flex items-center p-2">
                        <Calculator className="text-slate-400" size={16} />
                        <input type="number" value={totalBuses} onChange={(e) => setTotalBuses(parseInt(e.target.value) || 0)} className="w-full bg-transparent border-none focus:ring-0 font-bold text-lg text-slate-700 p-1" />
                    </div>
                 </div>
                 <div className="group relative">
                    <label className="block text-[10px] font-extrabold text-slate-500 uppercase mb-1">Cycle Duration (s)</label>
                    <div className="relative bg-slate-50 rounded-xl border border-gray-200 flex items-center p-2">
                        <Clock className="text-slate-400" size={16} />
                        <input type="number" value={totalCycles} onChange={(e) => setTotalCycles(parseInt(e.target.value) || 0)} className="w-full bg-transparent border-none focus:ring-0 font-bold text-lg text-slate-700 p-1" />
                    </div>
                 </div>
             </div>
          </section>

          {/* SIMULATION ACTIVE: Analytics Table */}
          {simulationData && (
             <div className="animate-fade-in space-y-6">
                
                {/* Global Timer */}
                <div className="bg-slate-800 rounded-2xl p-6 text-white relative overflow-hidden shadow-xl">
                    <div className="flex justify-between items-center z-10 relative">
                        <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Live Simulation Timer</span>
                            <div className="text-5xl font-black font-mono tracking-tighter tabular-nums text-indigo-300">
                                {simulationTime.toString().padStart(2, '0')}<span className="text-xl text-slate-500">/{totalCycles}s</span>
                            </div>
                        </div>
                        {isSimulating ? (
                             <div className="h-10 w-10 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                             <CheckCircle className="text-emerald-400 w-10 h-10" />
                        )}
                    </div>
                    {/* Progress Bar */}
                    <div className="absolute bottom-0 left-0 h-1 bg-indigo-500 transition-all duration-1000 ease-linear" style={{ width: `${(simulationTime / totalCycles) * 100}%` }}></div>
                </div>

                {/* Saved Buses Alert */}
                {simulationData.saved_buses > 0 && (
                     <div className="bg-emerald-100 border-2 border-emerald-500/20 p-4 rounded-xl flex items-center gap-3 shadow-lg animate-pulse">
                        <div className="bg-emerald-500 p-2 rounded-full text-white"><TrendingUp size={20} /></div>
                        <div>
                            <span className="block text-emerald-800 font-black text-lg">Efficiency Boost!</span>
                            <span className="text-emerald-700 font-bold text-sm">Saved {simulationData.saved_buses} buses of resources.</span>
                        </div>
                     </div>
                )}

                {/* Data Table */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
                        <span className="text-xs font-black text-gray-500 uppercase tracking-wider">Route Analytics</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 text-[10px] uppercase text-gray-500 font-bold">
                                <tr>
                                    <th className="px-4 py-3">Route</th>
                                    <th className="px-4 py-3 text-center text-slate-400">Ppl</th>
                                    <th className="px-4 py-3 text-center text-slate-400">Prob</th>
                                    <th className="px-4 py-3 text-center text-slate-400">Freq</th>
                                    <th className="px-4 py-3 text-center text-slate-800">Total (Alloc)</th>
                                    <th className="px-4 py-3 text-center text-indigo-600">Active</th>
                                    <th className="px-4 py-3 text-center text-emerald-600">Done</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {simulationData.routes.map((route) => {
                                    const stats = busStats[route.route_id] || { active: 0, completed: 0 };
                                    return (
                                        <tr key={route.route_id} className="hover:bg-indigo-50/50 transition-colors text-xs font-medium text-slate-700">
                                            <td className="px-4 py-3">
                                                <div className="font-bold text-indigo-900">{route.route_name.split(':')[0]}</div>
                                            </td>
                                            <td className="px-4 py-3 text-center font-bold">{route.total_people}</td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-[10px] font-bold">
                                                    {route.probability.toFixed(0)}%
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-center font-mono text-slate-500">{route.frequency_minutes}s</td>
                                            <td className="px-4 py-3 text-center font-bold text-slate-800">{route.buses_allocated}</td>
                                            <td className="px-4 py-3 text-center font-bold text-indigo-600 bg-indigo-50/50">{stats.active}</td>
                                            <td className="px-4 py-3 text-center font-bold text-emerald-600 bg-emerald-50/50">{stats.completed}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
             </div>
          )}

          {/* Fallback to Manual if no data */}
          {!simulationData && (
              <section className={!!simulationData ? "opacity-50 pointer-events-none filter grayscale transition-all" : "bg-white p-5 rounded-2xl border border-gray-200 shadow-sm transition-all"}>
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xs font-black uppercase text-slate-400 flex items-center gap-2 tracking-widest">
                        <Navigation size={18} /> Manual Planner
                    </h2>
                    {activeRoute && !simulationData && (
                        <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-1 rounded">
                            Wait Count: {manualRoutePeopleCount}
                        </span>
                    )}
                  </div>
                  
                  <div className="space-y-3">
                      <div className="relative">
                          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Origin Station</label>
                          <div className="relative">
                            <select 
                                value={sourceId} 
                                onChange={(e) => setSourceId(e.target.value)}
                                className="w-full appearance-none bg-slate-50 border border-gray-200 text-slate-700 text-sm font-bold rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all cursor-pointer"
                            >
                                {nodeList.map(n => <option key={n.id} value={n.id}>{n.label} {peopleCounts[n.id] > 0 ? `(${peopleCounts[n.id]} waiting)` : ''}</option>)}
                            </select>
                             <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                          </div>
                      </div>

                      <div className="flex justify-center -my-2 relative z-10">
                          <div className="bg-white p-1 rounded-full shadow-sm border border-gray-100">
                             <div className="h-4 w-0.5 bg-gray-200"></div>
                          </div>
                      </div>

                      <div className="relative">
                          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Target Destination</label>
                          <div className="relative">
                             <select 
                                value={targetId} 
                                onChange={(e) => setTargetId(e.target.value)}
                                className="w-full appearance-none bg-slate-50 border border-gray-200 text-slate-700 text-sm font-bold rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all cursor-pointer"
                            >
                                {nodeList.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                          </div>
                      </div>
                  </div>
                  
                  {activeRoute && !simulationData && (
                     <div className="mt-4 p-3 bg-blue-50 rounded-xl border border-blue-100 flex items-start gap-2">
                        <Info size={16} className="text-blue-500 mt-0.5" />
                        <div>
                            <p className="text-xs font-bold text-blue-800">Route Confirmed</p>
                            <p className="text-[10px] text-blue-600 font-medium">{activeRoute.path.join(' → ')}</p>
                        </div>
                     </div>
                  )}
              </section>
          )}

        </div>

        {/* Footer Actions */}
        <div className="p-6 bg-white border-t border-gray-100 z-30 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] grid grid-cols-2 gap-4">
           {/* Predict Button */}
           <button
              onClick={handlePredict}
              disabled={isPredicting || isSimulating}
              className={`
                 py-4 px-4 rounded-xl font-bold text-sm uppercase tracking-wider
                 flex flex-col items-center justify-center gap-1 border-2 transition-all
                 ${isPredicting 
                    ? 'bg-slate-50 border-slate-200 text-slate-400' 
                    : isSimulating
                        ? 'bg-slate-50 border-slate-200 text-slate-400'
                        : 'bg-white border-indigo-200 text-indigo-700 hover:bg-indigo-50 hover:border-indigo-400'
                 }
              `}
           >
              {isPredicting ? <span className="w-5 h-5 border-2 border-slate-400 border-t-indigo-600 rounded-full animate-spin mb-1"></span> : <ScanEye size={24} className="mb-1" />}
              {isPredicting ? 'Analyzing...' : 'Predict & Sim'}
           </button>

           {/* Manual Start (Disabled in Sim Mode for clarity) */}
           <button
            onClick={handleStartAnimation}
            disabled={!activeRoute || isAnimating || isSimulating || !!simulationData}
            className={`
              py-4 px-4 rounded-xl font-black text-sm uppercase tracking-widest shadow-xl
              flex flex-col items-center justify-center gap-1 relative overflow-hidden
              ${!!simulationData ? 'hidden' : 'bg-gradient-to-r from-gray-700 to-gray-800 text-white'}
            `}
          >
            <Play fill="currentColor" size={24} className="mb-1" />
            <span>Manual Trip</span>
          </button>
           
           {/* Stop Sim Button (Only visible if simulating) */}
           {simulationData && (
                <button
                    onClick={handleStopSimulation}
                    className="bg-red-50 text-red-600 border-2 border-red-100 hover:bg-red-100 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2"
                >
                    <RotateCcw size={18} />
                    Reset & Stop
                </button>
           )}
        </div>
      </aside>

      {/* Main Map */}
      <main className="flex-1 p-4 md:p-8 bg-slate-200 h-[60vh] md:h-screen flex flex-col relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full opacity-30 pointer-events-none">
           <div className="absolute top-10 left-10 w-96 h-96 bg-indigo-300/30 rounded-full blur-3xl mix-blend-multiply filter animate-blob"></div>
           <div className="absolute bottom-10 right-10 w-96 h-96 bg-pink-300/30 rounded-full blur-3xl mix-blend-multiply filter animate-blob animation-delay-2000"></div>
        </div>

        <div className="flex-1 w-full relative z-10 shadow-2xl rounded-[3rem] overflow-hidden border-[8px] border-white bg-white/80 backdrop-blur-sm">
            <BusMap 
                activeRoute={activeRoute}
                isAnimating={isAnimating}
                onAnimationComplete={handleAnimationComplete}
                onStopReached={() => {}}
                customImages={customImages}
                onNodeClick={handleNodeClick}
                peopleCounts={peopleCounts}
                simulationMode={isSimulating || !!simulationData}
                simulationTime={simulationTime}
                totalCycles={totalCycles}
                routesAnalytics={simulationData?.routes || []}
                onSimulationUpdate={handleSimulationUpdate}
            />
        </div>
      </main>
    </div>
  );
}