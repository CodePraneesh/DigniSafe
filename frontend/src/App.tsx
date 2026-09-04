import { useState, useEffect, useRef } from 'react';
import { 
  Shield, Users, Bell, Play, FileText, AlertTriangle, 
  Activity, Radio, Wifi, WifiOff, RefreshCw, EyeOff,
  User, CheckCircle, ChevronRight
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, 
  ResponsiveContainer
} from 'recharts';
import { api, Resident, EventLog, Alert, Metrics, ExperimentData, ErrorItem, getQueuedEvents } from './api';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'residents' | 'alerts' | 'simulator' | 'experiment' | 'errors'>('dashboard');
  const [residents, setResidents] = useState<Resident[]>([]);
  const [selectedResident, setSelectedResident] = useState<Resident | null>(null);
  const [residentDetail, setResidentDetail] = useState<any>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [experimentData, setExperimentData] = useState<ExperimentData | null>(null);
  const [errorAnalysis, setErrorAnalysis] = useState<ErrorItem[]>([]);
  
  // Simulator states
  const [simSelectedResId, setSimSelectedResId] = useState<string>("R003");
  const [simLog, setSimLog] = useState<string[]>([]);
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const [queuedCount, setQueuedCount] = useState<number>(0);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Poll rates and locks
  const pollTimer = useRef<any>(null);

  // Show Toast
  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Fetch all core data
  const fetchData = async () => {
    try {
      const isOnline = await api.getNetworkStatus();
      setIsOffline(!isOnline);
      setQueuedCount(getQueuedEvents().length);

      const resList = await api.getResidents();
      setResidents(resList);
      
      // Fetch events but we don't need to store it in state if not used
      await api.getEvents();

      const alertList = await api.getAlerts();
      setAlerts(alertList);

      const stats = await api.getMetrics();
      setMetrics(stats);

      const exp = await api.getExperiment();
      setExperimentData(exp);

      const errs = await api.getErrors();
      setErrorAnalysis(errs.errors);

      // Refresh selected items if they are currently viewed
      if (selectedResident) {
        const detail = await api.getResident(selectedResident.id);
        setResidentDetail(detail);
      }
      if (selectedAlert) {
        const freshAlert = await api.getAlert(selectedAlert.id);
        setSelectedAlert(freshAlert);
      }
    } catch (e) {
      console.error("Error polling server", e);
    }
  };

  useEffect(() => {
    fetchData();
    pollTimer.current = setInterval(fetchData, 4000);
    return () => clearInterval(pollTimer.current);
  }, [selectedResident, selectedAlert]);

  // Handle network toggle
  const handleNetworkToggle = async () => {
    const nextState = isOffline; // True if we are switching to online
    const success = await api.toggleNetwork(nextState);
    if (success) {
      setIsOffline(!nextState);
      if (nextState) {
        showToast("Network restored. Queued events synchronized!", "success");
      } else {
        showToast("Network offline. Store-and-forward active.", "info");
      }
      fetchData();
    }
  };

  // Human Review Action Handler
  const handleReviewAction = async (alertId: number, action: string, notes?: string) => {
    try {
      const updated = await api.reviewAlert(alertId, action, notes);
      setSelectedAlert(updated);
      showToast(`Alert status updated to: ${updated.status}`, "success");
      fetchData();
    } catch (e) {
      showToast("Failed to perform review action", "error");
    }
  };

  // Consent setting updater
  const handleConsentToggle = async (residentId: string, channel: string, currentValue: boolean) => {
    try {
      const patch: any = {};
      patch[`${channel}_enabled`] = !currentValue;
      await api.updateConsent(residentId, patch);
      showToast(`Consent setting updated for resident`, "success");
      fetchData();
    } catch (e) {
      showToast("Failed to update consent settings", "error");
    }
  };

  // Simulator Event Posting
  const postSimulatorEvent = async (type: string) => {
    const res = residents.find(r => r.id === simSelectedResId);
    if (!res) return;

    let sensorId = `GEN-${res.id}`;
    if (type.includes("movement") || type === "sensor_missing" || type === "sensor_noisy") {
      sensorId = `MVMT-${res.id}`;
    } else if (type.includes("door")) {
      sensorId = `DOOR-${res.id}`;
    } else if (type.includes("emergency") || type === "resident_response") {
      sensorId = `CALL-${res.id}`;
    } else if (type === "staff_check") {
      sensorId = `STAFF-${res.id}`;
    }

    // Network offline checks inside api.ts will handle queueing
    const timestamp = new Date().toISOString();
    
    // Log simulator event intent locally
    setSimLog(prev => [`[${new Date().toLocaleTimeString()}] Posting ${type} for ${res.name}...`, ...prev]);

    try {
      const result = await api.postEvent({
        resident_id: res.id,
        event_type: type,
        sensor_id: sensorId,
        timestamp
      });

      if (result.queued) {
        setSimLog(prev => [`↳ Store-and-forward queued event locally (Offline Mode)`, ...prev]);
        showToast("Network Offline: Event queued locally", "info");
      } else {
        setSimLog(prev => [`↳ Event processed successfully by backend`, ...prev]);
        showToast("Event sent successfully", "success");
      }
      fetchData();
    } catch (e) {
      setSimLog(prev => [`↳ Failed to post event: Connection timed out`, ...prev]);
      showToast("Event queue offline: Connection failed", "error");
    }
  };

  // Reset database helper
  const handleResetSimulator = async () => {
    if (window.confirm("Reset all logs, metrics, alerts, and database state to default?")) {
      const success = await api.resetSimulator();
      if (success) {
        showToast("Database state reset to seeding values", "success");
        setSelectedResident(null);
        setSelectedAlert(null);
        setSimLog([]);
        fetchData();
      }
    }
  };

  // Helper colors for status
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'HIGH PRIORITY': return 'bg-rose-100 text-rose-800 border-rose-200';
      case 'REVIEW REQUIRED': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'MONITOR': return 'bg-sky-100 text-sky-800 border-sky-200';
      default: return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    }
  };

  const getAlertStatusBadge = (status: string) => {
    switch (status) {
      case 'OPEN': return 'bg-rose-100 text-rose-800 border-rose-200';
      case 'UNDER_REVIEW': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'VERIFIED_INCIDENT': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'FALSE_ALARM': return 'bg-slate-100 text-slate-600 border-slate-200';
      default: return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800">
      {/* Toast Alert */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-6 py-4 rounded-xl shadow-2xl z-50 flex items-center gap-3 border transition-all duration-300 ${
          toast.type === 'success' ? 'bg-emerald-50 text-emerald-900 border-emerald-200' :
          toast.type === 'error' ? 'bg-rose-50 text-rose-900 border-rose-200' :
          'bg-cyan-50 text-cyan-900 border-cyan-200'
        }`}>
          <Shield className={`h-5 w-5 ${toast.type === 'success' ? 'text-emerald-600' : toast.type === 'error' ? 'text-rose-600' : 'text-cyan-600'}`} />
          <span className="font-semibold text-sm">{toast.message}</span>
        </div>
      )}

      {/* Top Header Navigation */}
      <header className="sticky top-0 bg-white border-b border-slate-200 z-40 px-6 py-4 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-cyan-700 text-white rounded-xl shadow-md">
            <Shield className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-cyan-950">DIGNISAFE</h1>
            <p className="text-xs text-slate-500 font-medium">A Dignity-Preserving Safety Monitor for Assisted-Living</p>
          </div>
        </div>

        {/* Global Toolbar */}
        <div className="flex items-center gap-3">
          {/* Reset database button */}
          <button 
            onClick={handleResetSimulator}
            className="flex items-center gap-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-lg transition-colors border border-slate-200"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Reset DB
          </button>

          {/* Store and Forward Queue indicator */}
          {queuedCount > 0 && (
            <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2 rounded-lg font-semibold animate-pulse">
              <Radio className="h-3.5 w-3.5 text-amber-600" />
              Store-and-Forward Active: {queuedCount} queued
            </div>
          )}

          {/* Network Simulator Toggle */}
          <button
            onClick={handleNetworkToggle}
            className={`flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-lg shadow-sm border transition-all duration-200 ${
              isOffline 
                ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
            }`}
          >
            {isOffline ? (
              <>
                <WifiOff className="h-4 w-4 text-rose-600" />
                Network: OFFLINE (Click to Restore)
              </>
            ) : (
              <>
                <Wifi className="h-4 w-4 text-emerald-600" />
                Network: ONLINE (Click to Cut)
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Body Layout */}
      <div className="flex-1 flex flex-col md:flex-row">
        {/* Sidebar Controls */}
        <nav className="w-full md:w-64 bg-white border-r border-slate-200 flex flex-col p-4 gap-1.5">
          <p className="text-[10px] font-bold text-slate-400 tracking-wider px-3 uppercase mb-2">Facility Dashboard</p>
          
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'dashboard' ? 'bg-cyan-50 text-cyan-800 shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Activity className="h-4.5 w-4.5" />
            Staff Dashboard
          </button>

          <button 
            onClick={() => setActiveTab('residents')}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'residents' ? 'bg-cyan-50 text-cyan-800 shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Users className="h-4.5 w-4.5" />
            Resident Profiles
          </button>

          <button 
            onClick={() => setActiveTab('alerts')}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'alerts' ? 'bg-cyan-50 text-cyan-800 shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Bell className="h-4.5 w-4.5" />
            Alert Review
            {alerts.filter(a => a.status === 'OPEN' || a.status === 'UNDER_REVIEW').length > 0 && (
              <span className="ml-auto bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                {alerts.filter(a => a.status === 'OPEN' || a.status === 'UNDER_REVIEW').length}
              </span>
            )}
          </button>

          <div className="h-px bg-slate-100 my-4"></div>
          <p className="text-[10px] font-bold text-slate-400 tracking-wider px-3 uppercase mb-2">Validation Suite</p>

          <button 
            onClick={() => setActiveTab('simulator')}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'simulator' ? 'bg-cyan-50 text-cyan-800 shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Play className="h-4.5 w-4.5 text-cyan-700" />
            Event Simulator
          </button>

          <button 
            onClick={() => setActiveTab('experiment')}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'experiment' ? 'bg-cyan-50 text-cyan-800 shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <FileText className="h-4.5 w-4.5" />
            Experiment Evaluation
          </button>

          <button 
            onClick={() => setActiveTab('errors')}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'errors' ? 'bg-cyan-50 text-cyan-800 shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <AlertTriangle className="h-4.5 w-4.5" />
            Error Analysis
          </button>

          <div className="mt-auto p-4 bg-slate-50 border border-slate-100 rounded-xl mt-6">
            <h4 className="text-[10px] font-bold text-slate-400 tracking-wider mb-2">PHILOSOPHY</h4>
            <blockquote className="text-xs text-slate-600 font-medium italic">
              "Monitor events, not people. Safety, dignity, and autonomy."
            </blockquote>
          </div>
        </nav>

        {/* Content Viewer Grid */}
        <main className="flex-1 p-6 md:p-8 overflow-y-auto">
          {/* TAB 1: Dashboard View */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              <div className="flex flex-col gap-1">
                <h2 className="text-2xl font-bold text-cyan-950">Staff Dashboard</h2>
                <p className="text-sm text-slate-500">Live safety monitoring, compliance status, and algorithmic metrics.</p>
              </div>

              {/* Stat Card Widgets */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                  <div className="p-3 bg-cyan-50 rounded-lg text-cyan-700">
                    <Users className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase">Residents</p>
                    <p className="text-2xl font-bold text-slate-800">{metrics?.total_residents || 0}</p>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                  <div className="p-3 bg-rose-50 rounded-lg text-rose-700">
                    <Bell className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase">Open Alerts</p>
                    <p className="text-2xl font-bold text-slate-800">{metrics?.open_alerts || 0}</p>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                  <div className="p-3 bg-purple-50 rounded-lg text-purple-700">
                    <CheckCircle className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase">Verified Incidents</p>
                    <p className="text-2xl font-bold text-slate-800">{metrics?.verified_incidents || 0}</p>
                  </div>
                </div>

                {/* Dignity metric cards */}
                <div className="bg-emerald-950 text-white p-5 rounded-xl shadow-sm flex items-center gap-4">
                  <div className="p-3 bg-emerald-900 rounded-lg text-emerald-300">
                    <EyeOff className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-emerald-300 uppercase">Intrusiveness</p>
                    <p className="text-2xl font-bold">{(metrics?.intrusiveness_score !== undefined ? (metrics.intrusiveness_score * 100).toFixed(0) : '0')}%</p>
                  </div>
                </div>
              </div>

              {/* Dignity & Privacy banner */}
              <div className="p-5 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl text-white shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-lg">Dignity-First Standard Active</h3>
                  <p className="text-sm opacity-90">Continuous Video, Continuous Audio, and Location Tracking are strictly <strong className="underline">OFF</strong>. Monitoring uses only passive, resident-consented event streams.</p>
                </div>
                <div className="flex gap-2">
                  <span className="bg-emerald-900 bg-opacity-40 text-emerald-100 text-xs font-bold px-3 py-1.5 rounded-lg border border-emerald-400 border-opacity-30">Camera: OFF</span>
                  <span className="bg-emerald-900 bg-opacity-40 text-emerald-100 text-xs font-bold px-3 py-1.5 rounded-lg border border-emerald-400 border-opacity-30">Audio: OFF</span>
                  <span className="bg-emerald-900 bg-opacity-40 text-emerald-100 text-xs font-bold px-3 py-1.5 rounded-lg border border-emerald-400 border-opacity-30">Location: OFF</span>
                </div>
              </div>

              {/* Residents and Alerts Lists */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* Residents List */}
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 xl:col-span-1 flex flex-col gap-4">
                  <h3 className="font-bold text-slate-800 text-base">Resident States</h3>
                  
                  <div className="flex flex-col gap-3">
                    {residents.map(res => (
                      <div 
                        key={res.id} 
                        onClick={() => { setSelectedResident(res); setActiveTab('residents'); }}
                        className="p-3 border border-slate-100 hover:border-cyan-200 rounded-xl hover:bg-slate-50 transition-all cursor-pointer flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="h-9 w-9 bg-slate-100 rounded-full flex items-center justify-center font-bold text-slate-600 text-sm">
                            {res.id}
                          </div>
                          <div>
                            <h4 className="font-bold text-slate-700 text-sm">{res.name}</h4>
                            <p className="text-xs text-slate-500 font-medium">Risk Score: {res.current_risk_score}/100</p>
                          </div>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-md border ${getStatusColor(res.current_status)}`}>
                          {res.current_status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Open Alerts and Accuracy Metrics */}
                <div className="xl:col-span-2 flex flex-col gap-6">
                  {/* Accuracy Card */}
                  <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
                    <h3 className="font-bold text-slate-800 text-base mb-4">Algorithmic Reliability (Live Data)</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                      <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                        <p className="text-xl font-extrabold text-cyan-800">{(metrics?.precision !== undefined ? metrics.precision * 100 : 0)}%</p>
                        <p className="text-[10px] font-bold text-slate-500 uppercase mt-1">Precision</p>
                      </div>
                      <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                        <p className="text-xl font-extrabold text-cyan-800">{(metrics?.recall !== undefined ? metrics.recall * 100 : 0)}%</p>
                        <p className="text-[10px] font-bold text-slate-500 uppercase mt-1">Recall</p>
                      </div>
                      <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                        <p className="text-xl font-extrabold text-cyan-800">{(metrics?.false_positive_rate !== undefined ? metrics.false_positive_rate * 100 : 0)}%</p>
                        <p className="text-[10px] font-bold text-slate-500 uppercase mt-1">False-Positive Rate</p>
                      </div>
                      <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                        <p className="text-xl font-extrabold text-rose-600">{metrics?.missed_incidents || 0}</p>
                        <p className="text-[10px] font-bold text-slate-500 uppercase mt-1">Missed Incidents</p>
                      </div>
                    </div>
                  </div>

                  {/* Open Alerts List */}
                  <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 flex-1 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-slate-800 text-base">Active Alerts Waiting Review</h3>
                      <span className="bg-rose-100 text-rose-800 font-bold text-xs px-2.5 py-0.5 rounded-full">
                        {alerts.filter(a => a.status === 'OPEN' || a.status === 'UNDER_REVIEW').length} Urgent
                      </span>
                    </div>

                    <div className="flex-1 overflow-y-auto max-h-[250px] flex flex-col gap-3">
                      {alerts.filter(a => a.status === 'OPEN' || a.status === 'UNDER_REVIEW').length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-400 bg-slate-50 border border-dashed border-slate-200 rounded-xl">
                          <CheckCircle className="h-8 w-8 text-emerald-500 mb-2" />
                          <p className="text-sm font-semibold">All Clear</p>
                          <p className="text-xs">No active alerts waiting caregiver review.</p>
                        </div>
                      ) : (
                        alerts.filter(a => a.status === 'OPEN' || a.status === 'UNDER_REVIEW').map(a => (
                          <div 
                            key={a.id}
                            onClick={() => { setSelectedAlert(a); setActiveTab('alerts'); }}
                            className="p-3.5 border border-slate-100 rounded-xl hover:bg-slate-50 cursor-pointer flex items-center justify-between"
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-800 text-sm">{residents.find(r => r.id === a.resident_id)?.name || a.resident_id}</span>
                                <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${getStatusColor(a.priority)}`}>{a.priority}</span>
                              </div>
                              <p className="text-xs text-slate-500 mt-1">Generated: {new Date(a.timestamp).toLocaleTimeString()}</p>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <p className="text-xs font-semibold text-slate-400">Risk Score</p>
                                <p className="text-sm font-extrabold text-slate-800">{a.risk_score}/100</p>
                              </div>
                              <ChevronRight className="h-4.5 w-4.5 text-slate-400" />
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Resident Profiles View */}
          {activeTab === 'residents' && (
            <div className="space-y-6">
              <div className="flex flex-col gap-1">
                <h2 className="text-2xl font-bold text-cyan-950">Resident Profiles & Consent</h2>
                <p className="text-sm text-slate-500">Configure passive sensory channels and audit privacy settings.</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Side: Resident Selector */}
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 flex flex-col gap-3">
                  <h3 className="font-bold text-slate-800 text-sm px-2 mb-2">Resident Roster</h3>
                  {residents.map(r => (
                    <div 
                      key={r.id}
                      onClick={() => { setSelectedResident(r); setResidentDetail(null); }}
                      className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                        selectedResident?.id === r.id 
                          ? 'bg-cyan-50 border-cyan-300 text-cyan-950'
                          : 'border-slate-100 hover:border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="h-8.5 w-8.5 bg-slate-100 rounded-full flex items-center justify-center font-bold text-slate-600 text-xs">
                          {r.id}
                        </div>
                        <div>
                          <h4 className="font-bold text-sm">{r.name}</h4>
                          <p className="text-xs opacity-75">{r.independence_level} Independence</p>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 opacity-50" />
                    </div>
                  ))}
                </div>

                {/* Right Side: Selected Resident Detail */}
                <div className="lg:col-span-2 space-y-6">
                  {selectedResident ? (
                    <>
                      {/* Profiles Detail Summary */}
                      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="flex items-center gap-4">
                          <div className="h-14 w-14 bg-cyan-700 text-white rounded-full flex items-center justify-center text-xl font-bold">
                            {selectedResident.id}
                          </div>
                          <div>
                            <h3 className="text-xl font-bold text-slate-800">{selectedResident.name}</h3>
                            <div className="flex flex-wrap gap-2 mt-1">
                              <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-md">Independence: {selectedResident.independence_level}</span>
                              <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-md">Expected Activity: {selectedResident.expected_activity}</span>
                              <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-md">Sensitivity: {selectedResident.alert_sensitivity}</span>
                            </div>
                          </div>
                        </div>

                        <div className="text-right flex items-center md:flex-col gap-3 md:gap-1">
                          <p className="text-xs font-semibold text-slate-400 uppercase">Live Risk State</p>
                          <span className={`text-xs font-bold px-3 py-1 rounded-md border ${getStatusColor(selectedResident.current_status)}`}>
                            {selectedResident.current_status} ({selectedResident.current_risk_score}/100)
                          </span>
                        </div>
                      </div>

                      {/* Consent & Privacy Section */}
                      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-6">
                        <div>
                          <h3 className="font-bold text-slate-800 text-base">Resident-Controlled Consent settings</h3>
                          <p className="text-xs text-slate-400 mt-1">Only enabled sensory metrics contribute to risk scores. Revoked categories are blocked and audited.</p>
                        </div>

                        {/* Interactive setting boxes */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {selectedResident.consent_settings && (
                            <>
                              <div className="p-4 border border-slate-100 rounded-xl flex items-center justify-between">
                                <div>
                                  <h4 className="text-sm font-bold text-slate-700">Movement Sensor</h4>
                                  <p className="text-xs text-slate-400 mt-0.5">Passive passive movement logs</p>
                                </div>
                                <button 
                                  onClick={() => handleConsentToggle(selectedResident.id, 'movement', selectedResident.consent_settings!.movement_enabled)}
                                  className={`text-xs font-bold px-3 py-1.5 rounded-lg border ${
                                    selectedResident.consent_settings.movement_enabled
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                      : 'bg-rose-50 text-rose-800 border-rose-200'
                                  }`}
                                >
                                  {selectedResident.consent_settings.movement_enabled ? 'ON' : 'BLOCKED'}
                                </button>
                              </div>

                              <div className="p-4 border border-slate-100 rounded-xl flex items-center justify-between">
                                <div>
                                  <h4 className="text-sm font-bold text-slate-700">Door Contacts</h4>
                                  <p className="text-xs text-slate-400 mt-0.5">Door open/close transitions</p>
                                </div>
                                <button 
                                  onClick={() => handleConsentToggle(selectedResident.id, 'door', selectedResident.consent_settings!.door_enabled)}
                                  className={`text-xs font-bold px-3 py-1.5 rounded-lg border ${
                                    selectedResident.consent_settings.door_enabled
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                      : 'bg-rose-50 text-rose-800 border-rose-200'
                                  }`}
                                >
                                  {selectedResident.consent_settings.door_enabled ? 'ON' : 'BLOCKED'}
                                </button>
                              </div>

                              <div className="p-4 border border-slate-100 rounded-xl flex items-center justify-between">
                                <div>
                                  <h4 className="text-sm font-bold text-slate-700">Emergency Call Buttons</h4>
                                  <p className="text-xs text-slate-400 mt-0.5">Manual emergency alerts</p>
                                </div>
                                <button 
                                  onClick={() => handleConsentToggle(selectedResident.id, 'emergency', selectedResident.consent_settings!.emergency_enabled)}
                                  className={`text-xs font-bold px-3 py-1.5 rounded-lg border ${
                                    selectedResident.consent_settings.emergency_enabled
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                      : 'bg-rose-50 text-rose-800 border-rose-200'
                                  }`}
                                >
                                  {selectedResident.consent_settings.emergency_enabled ? 'ON' : 'BLOCKED'}
                                </button>
                              </div>

                              <div className="p-4 border border-slate-100 rounded-xl flex items-center justify-between">
                                <div>
                                  <h4 className="text-sm font-bold text-slate-700">Staff Interaction Logs</h4>
                                  <p className="text-xs text-slate-400 mt-0.5">Caregiver rounds and checkins</p>
                                </div>
                                <button 
                                  onClick={() => handleConsentToggle(selectedResident.id, 'staff_interaction', selectedResident.consent_settings!.staff_interaction_enabled)}
                                  className={`text-xs font-bold px-3 py-1.5 rounded-lg border ${
                                    selectedResident.consent_settings.staff_interaction_enabled
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                      : 'bg-rose-50 text-rose-800 border-rose-200'
                                  }`}
                                >
                                  {selectedResident.consent_settings.staff_interaction_enabled ? 'ON' : 'BLOCKED'}
                                </button>
                              </div>
                            </>
                          )}
                        </div>

                        {/* Lock Indicators for Intrusion Channels */}
                        <div className="p-4 bg-slate-50 border border-slate-200 border-opacity-70 rounded-xl space-y-3">
                          <p className="text-xs font-bold text-slate-500 uppercase">🛡️ Restricted Channels (Mandatory Privacy Locks)</p>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="flex items-center gap-2 bg-white p-3 border border-slate-200 rounded-lg text-slate-500">
                              <EyeOff className="h-4 w-4 text-rose-600" />
                              <div className="text-[11px]">
                                <p className="font-bold text-slate-700">Continuous Camera</p>
                                <p className="font-semibold text-rose-600 uppercase">OFF (Blocked)</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 bg-white p-3 border border-slate-200 rounded-lg text-slate-500">
                              <EyeOff className="h-4 w-4 text-rose-600" />
                              <div className="text-[11px]">
                                <p className="font-bold text-slate-700">Continuous Audio</p>
                                <p className="font-semibold text-rose-600 uppercase">OFF (Blocked)</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 bg-white p-3 border border-slate-200 rounded-lg text-slate-500">
                              <EyeOff className="h-4 w-4 text-rose-600" />
                              <div className="text-[11px]">
                                <p className="font-bold text-slate-700">Location Tracker</p>
                                <p className="font-semibold text-rose-600 uppercase">OFF (Blocked)</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Event Timeline Logs */}
                      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
                        <h3 className="font-bold text-slate-800 text-base mb-4">Sensory Event Timeline (Recent)</h3>
                        
                        <div className="max-h-[300px] overflow-y-auto border border-slate-100 rounded-xl">
                          {residentDetail?.events?.length === 0 ? (
                            <p className="text-xs text-slate-400 text-center p-6">No events logged for this resident yet.</p>
                          ) : (
                            <table className="min-w-full text-xs text-left">
                              <thead className="bg-slate-50 text-slate-500 font-bold uppercase border-b border-slate-100">
                                <tr>
                                  <th className="p-3">Time</th>
                                  <th className="p-3">Sensor ID</th>
                                  <th className="p-3">Event Type</th>
                                  <th className="p-3">Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {residentDetail?.events?.slice(0, 20).map((e: EventLog) => (
                                  <tr key={e.id} className="border-b border-slate-100 hover:bg-slate-50">
                                    <td className="p-3 font-semibold text-slate-600">{new Date(e.timestamp).toLocaleTimeString()}</td>
                                    <td className="p-3 font-bold text-slate-700">{e.sensor_id}</td>
                                    <td className="p-3 font-medium text-slate-700">{e.event_type}</td>
                                    <td className="p-3">
                                      {e.blocked_by_consent ? (
                                        <span className="bg-rose-100 text-rose-800 text-[9px] font-bold px-2 py-0.5 rounded">BLOCKED BY CONSENT</span>
                                      ) : !e.processed ? (
                                        <span className="bg-amber-100 text-amber-800 text-[9px] font-bold px-2 py-0.5 rounded">FILTERED (DEBOUNCED)</span>
                                      ) : (
                                        <span className="bg-emerald-100 text-emerald-800 text-[9px] font-bold px-2 py-0.5 rounded">PROCESSED</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="h-64 flex flex-col items-center justify-center text-slate-400 bg-white border border-slate-200 rounded-xl shadow-sm">
                      <User className="h-10 w-10 mb-2" />
                      <p className="font-semibold text-sm">Select a resident to inspect details and privacy settings.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Alert Review View */}
          {activeTab === 'alerts' && (
            <div className="space-y-6">
              <div className="flex flex-col gap-1">
                <h2 className="text-2xl font-bold text-cyan-950">Caregiver Alert Review</h2>
                <p className="text-sm text-slate-500">Human-in-the-loop review workflow. Risk scores require human verification before logged as verified incidents.</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left side list of alerts */}
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 flex flex-col gap-3">
                  <h3 className="font-bold text-slate-800 text-sm px-2 mb-2">History</h3>
                  <div className="overflow-y-auto max-h-[500px] flex flex-col gap-2.5">
                    {alerts.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center p-4">No alerts generated yet.</p>
                    ) : (
                      alerts.map(a => (
                        <div 
                          key={a.id}
                          onClick={() => { setSelectedAlert(a); }}
                          className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col gap-1.5 ${
                            selectedAlert?.id === a.id
                              ? 'bg-cyan-50 border-cyan-300'
                              : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-700 text-sm">{residents.find(r => r.id === a.resident_id)?.name || a.resident_id}</span>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${getAlertStatusBadge(a.status)}`}>
                              {a.status}
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-500 font-medium">Risk: {a.risk_score}/100</span>
                            <span className="text-slate-400">{new Date(a.timestamp).toLocaleTimeString()}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Right side review actions */}
                <div className="lg:col-span-2">
                  {selectedAlert ? (
                    <div className="space-y-6">
                      {/* Alert Card Header */}
                      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <div>
                            <span className={`text-xs font-bold px-2.5 py-1 rounded border ${getStatusColor(selectedAlert.priority)}`}>
                              {selectedAlert.priority}
                            </span>
                            <h3 className="text-lg font-bold text-slate-800 mt-2">
                              Alert on {residents.find(r => r.id === selectedAlert.resident_id)?.name || selectedAlert.resident_id}
                            </h3>
                            <p className="text-xs text-slate-400">Triggered: {new Date(selectedAlert.timestamp).toLocaleString()}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-slate-400 uppercase font-semibold">Risk Score</p>
                            <p className="text-2xl font-extrabold text-slate-800">{selectedAlert.risk_score}/100</p>
                          </div>
                        </div>

                        {/* Explainability Breakdown */}
                        <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-3">
                          <p className="text-xs font-bold text-slate-500 uppercase">🔍 Algorithmic Explanation (Rule-based weights)</p>
                          <div className="space-y-2">
                            {selectedAlert.explanation && Object.entries(selectedAlert.explanation).map(([reason, weight]) => (
                              <div key={reason} className="flex justify-between items-center text-xs font-medium">
                                <span className="text-slate-600">{reason}</span>
                                <span className={`font-bold ${weight > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                  {weight > 0 ? `+${weight}` : weight}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Human In the Loop Actions */}
                        <div className="space-y-3.5 border-t border-slate-100 pt-4">
                          <h4 className="text-sm font-bold text-slate-700">Human Review Actions</h4>
                          
                          <div className="flex flex-wrap gap-2.5">
                            <button 
                              onClick={() => handleReviewAction(selectedAlert.id, 'Call Resident')}
                              className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold px-4 py-2.5 rounded-lg shadow-sm"
                            >
                              📞 Call Resident
                            </button>
                            <button 
                              onClick={() => handleReviewAction(selectedAlert.id, 'Check Room')}
                              className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold px-4 py-2.5 rounded-lg shadow-sm"
                            >
                              🚪 Check Room
                            </button>
                            <button 
                              onClick={() => handleReviewAction(selectedAlert.id, 'Verify Incident', 'Confirmed resident requires assistance.')}
                              className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold px-4 py-2.5 rounded-lg shadow-sm"
                            >
                              🚨 Verify Incident
                            </button>
                            <button 
                              onClick={() => handleReviewAction(selectedAlert.id, 'False Alarm')}
                              className="bg-slate-100 hover:bg-slate-250 text-slate-700 border border-slate-200 text-xs font-bold px-4 py-2.5 rounded-lg shadow-sm"
                            >
                              💡 False Alarm
                            </button>
                            <button 
                              onClick={() => handleReviewAction(selectedAlert.id, 'Dismiss')}
                              className="bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 text-xs font-bold px-4 py-2.5 rounded-lg"
                            >
                              Dismiss
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Audit Trail Log */}
                      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
                        <h4 className="font-bold text-slate-800 text-sm mb-4">Caregiver Audit Log</h4>
                        <div className="space-y-4">
                          {selectedAlert.human_reviews.length === 0 ? (
                            <p className="text-xs text-slate-400 italic">No human reviews logged yet. Pending action.</p>
                          ) : (
                            <div className="relative border-l border-slate-100 pl-4 space-y-4 text-xs">
                              {selectedAlert.human_reviews.map(review => (
                                <div key={review.id} className="relative">
                                  <div className="absolute -left-[21px] top-0 h-2.5 w-2.5 rounded-full bg-cyan-700 border-2 border-white"></div>
                                  <p className="font-bold text-slate-700">{review.action_taken}</p>
                                  <p className="text-[10px] text-slate-400">{new Date(review.timestamp).toLocaleString()}</p>
                                  {review.notes && <p className="text-slate-500 italic mt-1 font-medium bg-slate-50 p-2 rounded border border-slate-100">{review.notes}</p>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="h-64 flex flex-col items-center justify-center text-slate-400 bg-white border border-slate-200 rounded-xl shadow-sm">
                      <Bell className="h-10 w-10 mb-2" />
                      <p className="font-semibold text-sm">Select an alert to perform human review actions.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Event Simulator */}
          {activeTab === 'simulator' && (
            <div className="space-y-6">
              <div className="flex flex-col gap-1">
                <h2 className="text-2xl font-bold text-cyan-950">Sensory Simulator</h2>
                <p className="text-sm text-slate-500">Inject event-level observations to test the consent engine, noise filters, and rule thresholds.</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left panel Control deck */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Select Resident */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
                    <h3 className="font-bold text-slate-800 text-sm">1. Select Resident</h3>
                    <div className="flex gap-2">
                      {residents.map(r => (
                        <button
                          key={r.id}
                          onClick={() => setSimSelectedResId(r.id)}
                          className={`flex-1 p-3 rounded-lg border font-bold text-xs transition-all ${
                            simSelectedResId === r.id
                              ? 'bg-cyan-700 text-white border-cyan-800 shadow-sm'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {r.name} ({r.id})
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Actions Grid */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-5">
                    <h3 className="font-bold text-slate-800 text-sm">2. Inject Simulated Observations</h3>
                    
                    {/* Normal Events */}
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Normal Activities (Consented)</p>
                      <div className="flex flex-wrap gap-2.5">
                        <button onClick={() => postSimulatorEvent("movement_detected")} className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3 py-2 rounded-lg">🏃 Movement Detected</button>
                        <button onClick={() => postSimulatorEvent("door_open")} className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3 py-2 rounded-lg">🚪 Door Open</button>
                        <button onClick={() => postSimulatorEvent("door_close")} className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3 py-2 rounded-lg">🚪 Door Close</button>
                        <button onClick={() => postSimulatorEvent("resident_response")} className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3 py-2 rounded-lg">💬 Resident Response</button>
                        <button onClick={() => postSimulatorEvent("staff_check")} className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3 py-2 rounded-lg">👨‍⚕️ Staff Check</button>
                      </div>
                    </div>

                    {/* Safety Warnings */}
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold text-rose-500 uppercase tracking-wider">Safety Events (Urgent)</p>
                      <div className="flex flex-wrap gap-2.5">
                        <button onClick={() => postSimulatorEvent("emergency_call")} className="bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold px-4 py-2.5 rounded-lg shadow-sm">🚨 Emergency Call</button>
                        <button onClick={() => postSimulatorEvent("no_movement")} className="bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold px-4 py-2.5 rounded-lg shadow-sm">⏳ No Movement</button>
                      </div>
                    </div>

                    {/* Failure Scenarios */}
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">System Failures (Metadata)</p>
                      <div className="flex flex-wrap gap-2.5">
                        <button onClick={() => postSimulatorEvent("sensor_missing")} className="bg-amber-100 hover:bg-amber-250 text-amber-800 text-xs font-bold px-3 py-2 rounded-lg border border-amber-200">🔋 Sensor Missing</button>
                        <button onClick={() => postSimulatorEvent("sensor_noisy")} className="bg-amber-100 hover:bg-amber-250 text-amber-800 text-xs font-bold px-3 py-2 rounded-lg border border-amber-200">🔌 Noisy Sensor (Toggling)</button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right panel: Simulation log console */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col h-[500px]">
                  <h3 className="font-bold text-slate-800 text-sm mb-3">Live Simulation Console</h3>
                  <div className="flex-1 bg-slate-900 text-cyan-400 p-4 font-mono text-[11px] rounded-xl overflow-y-auto space-y-2.5">
                    {simLog.length === 0 ? (
                      <p className="text-slate-500 italic">No events generated this session. Trigger buttons on the left.</p>
                    ) : (
                      simLog.map((log, index) => (
                        <p key={index} className="leading-relaxed border-b border-slate-800 pb-1.5">{log}</p>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: Experiment Dashboard */}
          {activeTab === 'experiment' && (
            <div className="space-y-6">
              <div className="flex flex-col gap-1">
                <h2 className="text-2xl font-bold text-cyan-950">Baseline vs DigniSafe Comparison</h2>
                <p className="text-sm text-slate-500">Evaluation suite matching both algorithms over the 500+ event synthetic validation dataset.</p>
              </div>

              {experimentData ? (
                <>
                  {/* Summary Bar Charts */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Performance metrics charts */}
                    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 flex flex-col gap-4">
                      <h3 className="font-bold text-slate-800 text-sm">Algorithmic Recall & Precision</h3>
                      
                      <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={[
                              { name: 'Precision', Baseline: experimentData.baseline.precision * 100, DigniSafe: experimentData.dignisafe.precision * 100 },
                              { name: 'Recall', Baseline: experimentData.baseline.recall * 100, DigniSafe: experimentData.dignisafe.recall * 100 }
                            ]}
                            margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis unit="%" />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="Baseline" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="DigniSafe" fill="#0891b2" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Intrusiveness & alerts count */}
                    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 flex flex-col gap-4">
                      <h3 className="font-bold text-slate-800 text-sm">Caregiver Alert Fatigue & Intrusiveness</h3>
                      
                      <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={[
                              { name: 'Alerts Generated', Baseline: experimentData.baseline.alert_count, DigniSafe: experimentData.dignisafe.alert_count },
                              { name: 'Intrusiveness Score', Baseline: experimentData.intrusiveness_baseline * 100, DigniSafe: experimentData.intrusiveness_dignisafe * 100 }
                            ]}
                            margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="Baseline" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="DigniSafe" fill="#155e75" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  {/* Summary evaluation grid table */}
                  <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
                    <h3 className="font-bold text-slate-800 text-base mb-4">Complete Experiment Grid</h3>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm text-left border border-slate-100 rounded-xl">
                        <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
                          <tr>
                            <th className="p-4">Metric</th>
                            <th className="p-4">Baseline Algorithm</th>
                            <th className="p-4">DigniSafe System</th>
                            <th className="p-4">Evaluation Impact</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-slate-100">
                            <td className="p-4 font-bold text-slate-700">True Positives</td>
                            <td className="p-4 font-semibold text-slate-500">{experimentData.baseline.true_positives}</td>
                            <td className="p-4 font-bold text-emerald-800">{experimentData.dignisafe.true_positives}</td>
                            <td className="p-4 text-emerald-600 font-semibold">Identifies fall profiles</td>
                          </tr>
                          <tr className="border-b border-slate-100">
                            <td className="p-4 font-bold text-slate-700">False Positives (Alarms)</td>
                            <td className="p-4 font-semibold text-slate-500">{experimentData.baseline.false_positives}</td>
                            <td className="p-4 font-bold text-emerald-800">{experimentData.dignisafe.false_positives}</td>
                            <td className="p-4 text-emerald-600 font-semibold">Significantly reduces alert fatigue</td>
                          </tr>
                          <tr className="border-b border-slate-100">
                            <td className="p-4 font-bold text-slate-700">Missed Incidents (FN)</td>
                            <td className="p-4 font-semibold text-slate-500">{experimentData.baseline.false_negatives}</td>
                            <td className="p-4 font-bold text-emerald-800">{experimentData.dignisafe.false_negatives}</td>
                            <td className="p-4 text-emerald-600 font-semibold">Mitigates safety risks</td>
                          </tr>
                          <tr className="border-b border-slate-100">
                            <td className="p-4 font-bold text-slate-700">Precision Rate</td>
                            <td className="p-4 font-semibold text-slate-500">{(experimentData.baseline.precision * 100).toFixed(1)}%</td>
                            <td className="p-4 font-bold text-cyan-900">{(experimentData.dignisafe.precision * 100).toFixed(1)}%</td>
                            <td className="p-4 text-slate-600 font-medium">Reliable alerts for staff</td>
                          </tr>
                          <tr className="border-b border-slate-100">
                            <td className="p-4 font-bold text-slate-700">Recall Rate</td>
                            <td className="p-4 font-semibold text-slate-500">{(experimentData.baseline.recall * 100).toFixed(1)}%</td>
                            <td className="p-4 font-bold text-cyan-900">{(experimentData.dignisafe.recall * 100).toFixed(1)}%</td>
                            <td className="p-4 text-slate-600 font-medium">Higher sensitivity matching</td>
                          </tr>
                          <tr>
                            <td className="p-4 font-bold text-slate-700">Intrusiveness Index</td>
                            <td className="p-4 font-semibold text-slate-500">{(experimentData.intrusiveness_baseline * 100).toFixed(0)}%</td>
                            <td className="p-4 font-bold text-emerald-700">{(experimentData.intrusiveness_dignisafe * 100).toFixed(0)}%</td>
                            <td className="p-4 text-emerald-600 font-bold">100% Dignity Protection</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : (
                <div className="h-32 flex items-center justify-center text-slate-400">
                  <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                  Generating experiment statistics...
                </div>
              )}
            </div>
          )}

          {/* TAB 6: Error Analysis */}
          {activeTab === 'errors' && (
            <div className="space-y-6">
              <div className="flex flex-col gap-1">
                <h2 className="text-2xl font-bold text-cyan-950">Error Analysis & Mitigations</h2>
                <p className="text-sm text-slate-500">Detailed breakdown of algorithmic false positives, missed incidents, sensor noise, and consent blocks.</p>
              </div>

              {/* Error Categories grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {errorAnalysis.map(err => (
                  <div key={err.category} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col gap-3">
                    <div className="flex justify-between items-start">
                      <h3 className="font-bold text-slate-800 text-sm leading-tight">{err.category}</h3>
                      <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
                        {err.count} ({err.percentage}%)
                      </span>
                    </div>
                    
                    <div className="text-xs space-y-2 leading-relaxed flex-1">
                      <p className="text-slate-400 font-bold uppercase text-[9px] tracking-wider mt-1">Example scenario</p>
                      <p className="text-slate-600 font-medium italic">"{err.example_event}"</p>
                      
                      <p className="text-slate-400 font-bold uppercase text-[9px] tracking-wider mt-2">DigniSafe Mitigation</p>
                      <p className="text-slate-700 font-medium">{err.mitigation}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
