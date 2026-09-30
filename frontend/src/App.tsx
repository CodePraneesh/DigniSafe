import { useState, useEffect, useRef } from 'react';
import { 
  Shield, Users, Bell, Play, FileText, AlertTriangle, 
  Activity, Radio, Wifi, WifiOff, RefreshCw, EyeOff,
  User, CheckCircle, ChevronRight, Cpu, TrendingUp,
  Download, Battery, BatteryWarning, Signal, Copy
} from 'lucide-react';
import { 
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, 
  ResponsiveContainer
} from 'recharts';
import { 
  api, Resident, EventLog, Alert, Metrics, ExperimentData, ErrorItem, 
  AuthUser, MLAnalytics, SensorStatusItem, NotificationLog,
  getQueuedEvents, initWebSocket, subscribeAlerts, subscribeWsStatus 
} from './api';
import { ErrorBoundary } from './components/ErrorBoundary';


export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'residents' | 'alerts' | 'ml-analytics' | 'iot-fleet' | 'simulator' | 'experiment' | 'errors'>('dashboard');
  const [residents, setResidents] = useState<Resident[]>([]);
  const [selectedResident, setSelectedResident] = useState<Resident | null>(null);
  const [residentDetail, setResidentDetail] = useState<any>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [experimentData, setExperimentData] = useState<ExperimentData | null>(null);
  const [errorAnalysis, setErrorAnalysis] = useState<ErrorItem[]>([]);
  
  // Auth & RBAC
  const [currentUser, setCurrentUser] = useState<AuthUser>({
    id: 1,
    username: 'caregiver1',
    full_name: 'Sarah Jenkins, RN',
    role: 'CAREGIVER'
  });
  const [demoUsers, setDemoUsers] = useState<AuthUser[]>([]);

  // WebSocket Live Push
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [liveWsAlert, setLiveWsAlert] = useState<any | null>(null);

  // Phase 2 / Phase 3 States
  const [selectedMlResidentId, setSelectedMlResidentId] = useState<string>('R001');
  const [mlAnalytics, setMlAnalytics] = useState<MLAnalytics | null>(null);
  const [fleetStatus, setFleetStatus] = useState<SensorStatusItem[]>([]);
  const [gatewayHealthy, setGatewayHealthy] = useState<boolean>(true);
  const [notifications, setNotifications] = useState<NotificationLog[]>([]);
  const [fhirModalData, setFhirModalData] = useState<any | null>(null);

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

  // Switch Active User / Role
  const handleRoleChange = async (username: string) => {
    try {
      const loginRes = await api.login(username, "password123");
      setCurrentUser(loginRes.user);
      showToast(`Switched persona to: ${loginRes.user.full_name} (${loginRes.user.role})`, "success");
      fetchData();
    } catch (e) {
      console.error("Login failed, setting state locally", e);
      const matched = demoUsers.find(u => u.username === username);
      if (matched) {
        setCurrentUser(matched);
        api.setSavedRole(matched.role);
        showToast(`Persona switched to: ${matched.full_name}`, "info");
      }
    }
  };

  // Fetch all core data
  const fetchData = async () => {
    try {
      const isOnline = await api.getNetworkStatus();
      setIsOffline(!isOnline);
      setQueuedCount(getQueuedEvents().length);

      const resList = await api.getResidents();
      setResidents(resList);
      
      const alertList = await api.getAlerts();
      setAlerts(alertList);

      const stats = await api.getMetrics();
      setMetrics(stats);

      const exp = await api.getExperiment();
      setExperimentData(exp);

      const errs = await api.getErrors();
      setErrorAnalysis(errs.errors);

      // Phase 2 / 3 data
      try {
        const fleet = await api.getGatewayFleet();
        setFleetStatus(fleet.fleet);
        setGatewayHealthy(fleet.gateway_healthy);
      } catch (err) {
        console.warn("Fleet load skipped", err);
      }

      try {
        const notifs = await api.getNotificationHistory();
        setNotifications(notifs);
      } catch (err) {
        console.warn("Notification load skipped", err);
      }

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

  // Load ML Analytics for selected resident
  const fetchML = async (resId: string) => {
    try {
      const ml = await api.getMLAnalytics(resId);
      setMlAnalytics(ml);
    } catch (e) {
      console.error("Failed to load ML analytics", e);
    }
  };

  useEffect(() => {
    // Initial fetch of demo users
    api.getDemoUsers().then(users => {
      setDemoUsers(users);
      const savedRole = api.getSavedRole();
      const match = users.find(u => u.role === savedRole) || users[0];
      if (match) {
        setCurrentUser(match);
      }
    }).catch(e => console.warn("Demo users fallback", e));

    fetchData();
    pollTimer.current = setInterval(fetchData, 4000);

    // Initialize WebSocket
    initWebSocket();
    const unsubStatus = subscribeWsStatus((status) => {
      setWsConnected(status);
    });

    const unsubAlerts = subscribeAlerts((msg) => {
      if (msg.event === 'ALERT_GENERATED') {
        setLiveWsAlert(msg.data);
        showToast(`⚡ Live Alert Push: Resident ${msg.data.resident_id} (${msg.data.priority})`, "error");
        fetchData();
      } else if (msg.event === 'ALERT_REVIEWED') {
        showToast(`✓ Live Update: Alert #${msg.data.alert_id} ${msg.data.status}`, "info");
        fetchData();
      }
    });

    return () => {
      clearInterval(pollTimer.current);
      unsubStatus();
      unsubAlerts();
    };
  }, []);

  useEffect(() => {
    if (activeTab === 'ml-analytics') {
      fetchML(selectedMlResidentId);
    }
  }, [activeTab, selectedMlResidentId]);

  // Handle network toggle
  const handleNetworkToggle = async () => {
    const nextState = isOffline;
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

  // FHIR Bundle exporter
  const handleOpenFhirModal = async (residentId: string) => {
    try {
      const bundle = await api.getFhirBundle(residentId);
      setFhirModalData(bundle);
    } catch (e) {
      showToast("Failed to generate HL7 FHIR R4 Bundle", "error");
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

    const timestamp = new Date().toISOString();
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

  // Pre-configured Demonstration Scenarios
  const handleRunScenario = async (id: 'low-urgency' | 'high-urgency') => {
    try {
      setSimLog(prev => [`[${new Date().toLocaleTimeString()}] Executing ${id} preset scenario...`, ...prev]);
      const result = await api.runScenario(id);
      setSimLog(prev => [`↳ ${result.summary}`, ...prev]);
      if (id === 'low-urgency') {
        showToast("Low Urgency Journey: Normal movement, 0 risk score, no alert generated.", "success");
      } else {
        showToast(`High Urgency Journey: Emergency alert #${result.alert_id} generated! Review in Alerts tab.`, "error");
      }
      fetchData();
    } catch (e) {
      showToast("Failed to run scenario", "error");
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

  // Filter residents if Family role is active
  const displayedResidents = currentUser.role === 'RESIDENT_FAMILY'
    ? residents.filter(r => r.id === (currentUser.resident_access_id || 'R001'))
    : residents;

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

      {/* Live WebSocket Toast Banner */}
      {liveWsAlert && (
        <div className="bg-rose-600 text-white px-6 py-2.5 flex items-center justify-between text-xs font-semibold shadow-md animate-pulse">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            <span>CRITICAL REAL-TIME ALERT: Resident {liveWsAlert.resident_id} triggered {liveWsAlert.priority} priority alert (#{liveWsAlert.alert_id || liveWsAlert.id})</span>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => {
                setActiveTab('alerts');
                setLiveWsAlert(null);
              }}
              className="bg-white text-rose-700 px-2.5 py-1 rounded text-[11px] font-bold hover:bg-rose-50"
            >
              View in Triage
            </button>
            <button onClick={() => setLiveWsAlert(null)} className="text-white hover:text-rose-200">✕</button>
          </div>
        </div>
      )}

      {/* Top Header Navigation */}
      <header className="sticky top-0 bg-white border-b border-slate-200 z-40 px-6 py-3 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-cyan-700 text-white rounded-xl shadow-md">
            <Shield className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-cyan-950">DIGNISAFE</h1>
              <span className="bg-cyan-100 text-cyan-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                Full Production v2.0
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">A Dignity-Preserving Safety Monitor for Assisted-Living</p>
          </div>
        </div>

        {/* Global Toolbar */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* WebSocket Status Indicator */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-semibold">
            <span className={`h-2.5 w-2.5 rounded-full ${wsConnected ? 'bg-emerald-500 animate-ping' : 'bg-amber-400'}`}></span>
            <span className={wsConnected ? 'text-emerald-700 font-bold' : 'text-slate-500'}>
              {wsConnected ? 'WS Live Stream' : 'WS Reconnecting'}
            </span>
          </div>

          {/* Role / Persona Switcher */}
          <div className="flex items-center gap-2 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-lg">
            <User className="h-3.5 w-3.5 text-slate-500" />
            <span className="text-[11px] font-bold text-slate-500 uppercase">Role:</span>
            <select
              value={currentUser.username}
              onChange={(e) => handleRoleChange(e.target.value)}
              aria-label="Active Persona Role Switcher"
              className="bg-transparent text-xs font-bold text-slate-800 cursor-pointer focus:outline-none"
            >
              <option value="caregiver1">Caregiver (Sarah Jenkins, RN)</option>
              <option value="director1">Clinical Director (Dr. Angela Miller)</option>
              <option value="family1">Resident Family (David Chen)</option>
              <option value="admin1">System Admin (Marcus Ray)</option>
            </select>
          </div>

          {/* Reset database button (Disabled for family) */}
          {currentUser.role !== 'RESIDENT_FAMILY' && (
            <button 
              onClick={handleResetSimulator}
              className="flex items-center gap-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg transition-colors border border-slate-200"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reset DB
            </button>
          )}

          {/* Store and Forward Queue indicator */}
          {queuedCount > 0 && (
            <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-1.5 rounded-lg font-semibold animate-pulse">
              <Radio className="h-3.5 w-3.5 text-amber-600" />
              Store-and-Forward: {queuedCount} queued
            </div>
          )}

          {/* Network Simulator Toggle (Admin & Caregiver only) */}
          {currentUser.role !== 'RESIDENT_FAMILY' && (
            <button
              onClick={handleNetworkToggle}
              className={`flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm border transition-all duration-200 ${
                isOffline 
                  ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
              }`}
            >
              {isOffline ? (
                <>
                  <WifiOff className="h-3.5 w-3.5 text-rose-600" />
                  Network: OFFLINE
                </>
              ) : (
                <>
                  <Wifi className="h-3.5 w-3.5 text-emerald-600" />
                  Network: ONLINE
                </>
              )}
            </button>
          )}
        </div>
      </header>

      {/* Family Access Notice */}
      {currentUser.role === 'RESIDENT_FAMILY' && (
        <div className="bg-sky-50 border-b border-sky-200 px-6 py-2.5 text-xs font-medium text-sky-800 flex items-center gap-2">
          <Shield className="h-4 w-4 text-sky-600" />
          <span>You are viewing DigniSafe in <strong>Family Member Portal</strong> mode. Privacy settings and non-invasive comfort metrics for Margaret Chen are displayed. Internal triage logs and raw simulator controls are restricted.</span>
        </div>
      )}

      {/* Main Body Layout */}
      <div className="flex-1 flex flex-col md:flex-row">
        {/* Sidebar Controls */}
        <nav className="w-full md:w-64 bg-white border-r border-slate-200 flex flex-col p-4 gap-1.5">
          <p className="text-[10px] font-bold text-slate-400 tracking-wider px-3 uppercase mb-2">Facility Dashboard</p>
          
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'dashboard' ? 'bg-cyan-50 text-cyan-800 shadow-sm font-bold' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Activity className="h-4.5 w-4.5" />
            Staff Dashboard
          </button>

          <button 
            onClick={() => setActiveTab('residents')}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'residents' ? 'bg-cyan-50 text-cyan-800 shadow-sm font-bold' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Users className="h-4.5 w-4.5" />
            Resident Profiles
          </button>

          {/* Caregiver & Director only: Alert Review */}
          {currentUser.role !== 'RESIDENT_FAMILY' && (
            <button 
              onClick={() => setActiveTab('alerts')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                activeTab === 'alerts' ? 'bg-cyan-50 text-cyan-800 shadow-sm font-bold' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
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
          )}

          {/* Advanced Analytics Modules */}
          <div className="h-px bg-slate-100 my-3"></div>
          <p className="text-[10px] font-bold text-slate-400 tracking-wider px-3 uppercase mb-1">Intelligence & IoT</p>

          <button 
            onClick={() => setActiveTab('ml-analytics')}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'ml-analytics' ? 'bg-cyan-50 text-cyan-800 shadow-sm font-bold' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <TrendingUp className="h-4.5 w-4.5 text-purple-600" />
            Circadian ML Drift
          </button>

          {currentUser.role !== 'RESIDENT_FAMILY' && (
            <button 
              onClick={() => setActiveTab('iot-fleet')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                activeTab === 'iot-fleet' ? 'bg-cyan-50 text-cyan-800 shadow-sm font-bold' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Cpu className="h-4.5 w-4.5 text-emerald-600" />
              IoT Gateway Fleet
            </button>
          )}

          {/* Validation Suite */}
          {currentUser.role !== 'RESIDENT_FAMILY' && (
            <>
              <div className="h-px bg-slate-100 my-3"></div>
              <p className="text-[10px] font-bold text-slate-400 tracking-wider px-3 uppercase mb-1">Validation Suite</p>

              <button 
                onClick={() => setActiveTab('simulator')}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  activeTab === 'simulator' ? 'bg-cyan-50 text-cyan-800 shadow-sm font-bold' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Play className="h-4.5 w-4.5 text-cyan-700" />
                Event Simulator
              </button>

              <button 
                onClick={() => setActiveTab('experiment')}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  activeTab === 'experiment' ? 'bg-cyan-50 text-cyan-800 shadow-sm font-bold' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <FileText className="h-4.5 w-4.5" />
                500-Event Benchmark
              </button>

              <button 
                onClick={() => setActiveTab('errors')}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  activeTab === 'errors' ? 'bg-cyan-50 text-cyan-800 shadow-sm font-bold' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <AlertTriangle className="h-4.5 w-4.5" />
                Error Analysis
              </button>
            </>
          )}

          <div className="mt-auto p-4 bg-slate-50 border border-slate-100 rounded-xl mt-6">
            <h4 className="text-[10px] font-bold text-slate-400 tracking-wider mb-2">PHILOSOPHY</h4>
            <blockquote className="text-xs text-slate-600 font-medium italic">
              "Monitor events, not people. Safety, dignity, and autonomy."
            </blockquote>
          </div>
        </nav>

        {/* Content Viewer Grid */}
        <main className="flex-1 p-6 md:p-8 overflow-y-auto">
          <ErrorBoundary
            isolate
            sectionName={`Module: ${activeTab.toUpperCase()}`}
            fallbackTitle="Subsystem Fault Contained"
            fallbackMessage="An unexpected rendering exception was caught in this section. Background ambient telemetry and emergency alerts remain active."
          >
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
                    {displayedResidents.map(res => (
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
                        <p className="text-xl font-extrabold text-cyan-800">{(metrics?.precision !== undefined ? metrics.precision * 100 : 0).toFixed(1)}%</p>
                        <p className="text-[10px] font-bold text-slate-500 uppercase mt-1">Precision</p>
                      </div>
                      <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                        <p className="text-xl font-extrabold text-cyan-800">{(metrics?.recall !== undefined ? metrics.recall * 100 : 0).toFixed(1)}%</p>
                        <p className="text-[10px] font-bold text-slate-500 uppercase mt-1">Recall</p>
                      </div>
                      <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                        <p className="text-xl font-extrabold text-cyan-800">{(metrics?.false_positive_rate !== undefined ? metrics.false_positive_rate * 100 : 0).toFixed(1)}%</p>
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
                <p className="text-sm text-slate-500">Configure passive sensory channels, audit privacy settings, and export HL7 FHIR R4 clinical records.</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Side: Resident Selector */}
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 flex flex-col gap-3">
                  <h3 className="font-bold text-slate-800 text-sm px-2 mb-2">Resident Roster</h3>
                  {displayedResidents.map(r => (
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

                        <div className="flex flex-col md:items-end gap-2">
                          <div className="text-right flex items-center md:flex-col gap-3 md:gap-1">
                            <p className="text-xs font-semibold text-slate-400 uppercase">Live Risk State</p>
                            <span className={`text-xs font-bold px-3 py-1 rounded-md border ${getStatusColor(selectedResident.current_status)}`}>
                              {selectedResident.current_status} ({selectedResident.current_risk_score}/100)
                            </span>
                          </div>

                          {/* FHIR Export Button */}
                          <button
                            onClick={() => handleOpenFhirModal(selectedResident.id)}
                            className="flex items-center gap-1.5 text-xs font-bold bg-cyan-50 hover:bg-cyan-100 text-cyan-800 border border-cyan-200 px-3 py-1.5 rounded-lg shadow-sm transition-colors mt-1"
                          >
                            <Download className="h-3.5 w-3.5" />
                            Export HL7 FHIR Bundle
                          </button>
                        </div>
                      </div>

                      {/* Consent & Privacy Section */}
                      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-6">
                        <div>
                          <h3 className="font-bold text-slate-800 text-base">Resident-Controlled Consent Settings</h3>
                          <p className="text-xs text-slate-400 mt-1">Only enabled sensory metrics contribute to risk scores. Revoked categories are blocked and audited.</p>
                        </div>

                        {/* Interactive setting boxes */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {selectedResident.consent_settings && (
                            <>
                              <div className="p-4 border border-slate-100 rounded-xl flex items-center justify-between">
                                <div>
                                  <h4 className="text-sm font-bold text-slate-700">Movement Sensor</h4>
                                  <p className="text-xs text-slate-400 mt-0.5">Passive PIR movement logs</p>
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
                          <p className="text-xs font-bold text-slate-500 uppercase">🛡️ Permanently Blocked Privacy Channels</p>
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
                                <p className="font-bold text-slate-700">Continuous GPS</p>
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
                    <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400 flex flex-col items-center justify-center">
                      <User className="h-10 w-10 mb-2 opacity-50" />
                      <p className="font-semibold text-sm">Select a resident from the roster to view their profile, sensory consent, and HL7 FHIR bundle.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Alerts & Human Review View */}
          {activeTab === 'alerts' && (
            <div className="space-y-6">
              <div className="flex flex-col gap-1">
                <h2 className="text-2xl font-bold text-cyan-950">Safety Alerts & Human Triage</h2>
                <p className="text-sm text-slate-500">Explainable AI multi-factor breakdown, human-in-the-loop decision capture, and dispatch history.</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Side: Alert List */}
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between px-2 mb-2">
                    <h3 className="font-bold text-slate-800 text-sm">Alert Feed</h3>
                    <span className="text-xs text-slate-400">{alerts.length} Total</span>
                  </div>

                  <div className="flex flex-col gap-2 max-h-[600px] overflow-y-auto">
                    {alerts.map(a => (
                      <div
                        key={a.id}
                        onClick={() => setSelectedAlert(a)}
                        className={`p-3 rounded-xl border cursor-pointer transition-all ${
                          selectedAlert?.id === a.id 
                            ? 'bg-cyan-50 border-cyan-300 text-cyan-950'
                            : 'border-slate-100 hover:border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-xs">{residents.find(r => r.id === a.resident_id)?.name || a.resident_id}</span>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${getStatusColor(a.priority)}`}>{a.priority}</span>
                        </div>
                        <p className="text-xs text-slate-500">Alert #{a.id} • {new Date(a.timestamp).toLocaleTimeString()}</p>
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-[10px]">
                          <span className="font-semibold text-slate-400">Risk: {a.risk_score}/100</span>
                          <span className={`font-bold px-1.5 py-0.5 rounded ${getAlertStatusBadge(a.status)}`}>{a.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right Side: Selected Alert Deep Dive & Actions */}
                <div className="lg:col-span-2 space-y-6">
                  {selectedAlert ? (
                    <>
                      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-xl font-bold text-slate-800">Alert #{selectedAlert.id}</h3>
                              <span className={`text-xs font-bold px-2.5 py-1 rounded border ${getStatusColor(selectedAlert.priority)}`}>
                                {selectedAlert.priority} PRIORITY
                              </span>
                              <span className={`text-xs font-bold px-2.5 py-1 rounded border ${getAlertStatusBadge(selectedAlert.status)}`}>
                                {selectedAlert.status}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-1">
                              Subject: <strong>{residents.find(r => r.id === selectedAlert.resident_id)?.name}</strong> ({selectedAlert.resident_id}) • Triggered: {new Date(selectedAlert.timestamp).toLocaleString()}
                            </p>
                          </div>

                          <div className="text-right">
                            <p className="text-xs font-semibold text-slate-400 uppercase">Composite Risk Score</p>
                            <p className="text-3xl font-extrabold text-cyan-900">{selectedAlert.risk_score}<span className="text-base text-slate-400">/100</span></p>
                          </div>
                        </div>

                        {/* Explainable Factor Breakdown */}
                        <div>
                          <h4 className="font-bold text-slate-700 text-sm mb-3">Explainable AI Contribution Breakdown</h4>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {Object.entries(selectedAlert.explanation || {}).map(([factor, pts]) => (
                              <div key={factor} className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-center">
                                <p className="text-lg font-bold text-slate-800">+{pts}</p>
                                <p className="text-[10px] font-semibold text-slate-500 uppercase mt-1 tracking-tight">{factor.replace(/_/g, ' ')}</p>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Human in the Loop Decision Center */}
                        <div className="pt-4 border-t border-slate-100">
                          <h4 className="font-bold text-slate-800 text-sm mb-2">Caregiver Verification & Action (Human-in-the-Loop)</h4>
                          <p className="text-xs text-slate-400 mb-4">Select the resolution. All actions are cryptographically logged for clinical compliance.</p>
                          
                          <div className="flex flex-wrap gap-3">
                            <button
                              onClick={() => handleReviewAction(selectedAlert.id, 'VERIFIED_INCIDENT', 'Assistance dispatched immediately.')}
                              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors"
                            >
                              ✓ Verify Incident (Dispatch Aid)
                            </button>
                            <button
                              onClick={() => handleReviewAction(selectedAlert.id, 'FALSE_ALARM', 'Resident confirmed safe in living area.')}
                              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg border border-slate-300 transition-colors"
                            >
                              ✕ Mark False Alarm
                            </button>
                            <button
                              onClick={() => handleReviewAction(selectedAlert.id, 'DISMISSED', 'Routine movement acknowledged.')}
                              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-lg border border-slate-300 transition-colors"
                            >
                              Dismiss Alert
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Multi-channel Emergency Routing Logs */}
                      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
                        <h4 className="font-bold text-slate-800 text-sm mb-3">Multi-Channel Emergency Dispatch Log</h4>
                        <div className="space-y-2 max-h-[220px] overflow-y-auto">
                          {notifications.filter(n => n.alert_id === selectedAlert.id).length === 0 ? (
                            <p className="text-xs text-slate-400 italic">No emergency dispatch records for this specific alert ID.</p>
                          ) : (
                            notifications.filter(n => n.alert_id === selectedAlert.id).map(n => (
                              <div key={n.id} className="p-3 bg-slate-50 border border-slate-100 rounded-lg text-xs flex items-center justify-between">
                                <div>
                                  <p className="font-bold text-slate-700">{n.message}</p>
                                  <p className="text-slate-400 text-[10px] mt-0.5">Channels: {n.channels.join(', ')} • {new Date(n.timestamp).toLocaleTimeString()}</p>
                                </div>
                                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded">
                                  DISPATCHED
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400">
                      <Bell className="h-10 w-10 mx-auto mb-2 opacity-50" />
                      <p className="font-semibold text-sm">Select an alert from the list to review risk factors and record clinical decisions.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: ML Circadian Sequence Anomaly Tab */}
          {activeTab === 'ml-analytics' && (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-cyan-950">Circadian ML & Temporal Sequence Drift</h2>
                  <p className="text-sm text-slate-500">24-hour activity density modeling, sequence divergence entropy, and proactive clinical advisories.</p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500">Resident:</span>
                  <select
                    value={selectedMlResidentId}
                    onChange={(e) => setSelectedMlResidentId(e.target.value)}
                    aria-label="Select resident for circadian ML analysis"
                    className="bg-white border border-slate-200 text-xs font-bold px-3 py-2 rounded-lg shadow-sm focus:outline-none"
                  >
                    {residents.map(r => (
                      <option key={r.id} value={r.id}>{r.name} ({r.id})</option>
                    ))}
                  </select>
                </div>
              </div>

              {mlAnalytics ? (
                <>
                  {/* Top Anomaly Summary Badges */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase">Anomaly Score</p>
                        <p className="text-3xl font-extrabold text-cyan-900">{mlAnalytics.anomaly_score}<span className="text-base text-slate-400">/100</span></p>
                      </div>
                      <div className={`p-3 rounded-xl ${mlAnalytics.drift_detected ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                        <TrendingUp className="h-6 w-6" />
                      </div>
                    </div>

                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase">Sequence Drift Classification</p>
                        <p className="text-sm font-bold text-slate-800 mt-1">{mlAnalytics.drift_category.replace(/_/g, ' ')}</p>
                      </div>
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                        mlAnalytics.drift_detected ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {mlAnalytics.drift_detected ? 'DRIFT DETECTED' : 'NORMAL'}
                      </span>
                    </div>

                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase">Divergence Metric (KL-Sim)</p>
                        <p className="text-3xl font-extrabold text-slate-800">{mlAnalytics.divergence_metric.toFixed(3)}</p>
                      </div>
                      <span className="text-xs font-semibold text-slate-400">Confidence: {(mlAnalytics.confidence_rating * 100).toFixed(0)}%</span>
                    </div>
                  </div>

                  {/* 24-Hour Circadian Profile Comparison Chart */}
                  <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-bold text-slate-800 text-base">24-Hour Circadian Activity Profile</h3>
                        <p className="text-xs text-slate-400">Comparing resident's established 14-day baseline against recent 24-hour sensory sequence.</p>
                      </div>
                      <div className="flex items-center gap-4 text-xs font-semibold">
                        <span className="flex items-center gap-1 text-slate-500"><span className="h-3 w-3 bg-slate-400 rounded"></span> Baseline</span>
                        <span className="flex items-center gap-1 text-purple-700"><span className="h-3 w-3 bg-purple-600 rounded"></span> Recent Activity</span>
                      </div>
                    </div>

                    <div className="h-72 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={Array.from({ length: 24 }).map((_, hour) => ({
                            hour: `${hour}:00`,
                            Baseline: (mlAnalytics.circadian_profile.baseline_24h_density[hour] || 0) * 100,
                            Recent: (mlAnalytics.circadian_profile.recent_24h_density[hour] || 0) * 100
                          }))}
                          margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="hour" />
                          <YAxis unit="%" />
                          <Tooltip />
                          <Area type="monotone" dataKey="Baseline" stroke="#94a3b8" fill="#cbd5e1" fillOpacity={0.4} />
                          <Area type="monotone" dataKey="Recent" stroke="#9333ea" fill="#d8b4fe" fillOpacity={0.5} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Clinical Recommendations & Proactive Advisories */}
                  <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
                    <h3 className="font-bold text-slate-800 text-base mb-3">Algorithmic Clinical Advisories</h3>
                    <div className="space-y-3">
                      {mlAnalytics.clinical_advisories.map((advisory, idx) => (
                        <div key={idx} className="p-4 bg-purple-50 border border-purple-100 rounded-xl flex items-start gap-3">
                          <Shield className="h-5 w-5 text-purple-700 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-xs font-bold text-purple-950 leading-relaxed">{advisory}</p>
                            <p className="text-[10px] text-purple-700 font-medium mt-1">Generated via temporal sequence entropy analysis • DigniSafe Clinical AI</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="h-48 flex items-center justify-center text-slate-400 bg-white rounded-xl border border-slate-200">
                  <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                  Loading Circadian Model...
                </div>
              )}
            </div>
          )}

          {/* TAB 5: IoT Device Fleet & Hardware Gateway Tab */}
          {activeTab === 'iot-fleet' && (
            <div className="space-y-6">
              <div className="flex flex-col gap-1">
                <h2 className="text-2xl font-bold text-cyan-950">IoT Edge Hardware & Gateway Fleet</h2>
                <p className="text-sm text-slate-500">Live hardware telemetry: sensor battery gauges, wireless RSSI signal, firmware version, and edge packet injection.</p>
              </div>

              {/* Edge Gateway Status Header Card */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="p-3.5 bg-emerald-50 text-emerald-700 rounded-xl">
                    <Cpu className="h-7 w-7" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-800 text-base">Edge Gateway: GW-NORTH-01</h3>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${gatewayHealthy ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                        {gatewayHealthy ? 'ONLINE & HEALTHY' : 'DEGRADED'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">Firmware: v2.4.1-edge • Local SQLite Storage Buffer • MQTT Ingestion Engine</p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Active Fleet</p>
                    <p className="text-xl font-bold text-slate-800">{fleetStatus.length} Sensors Online</p>
                  </div>
                </div>
              </div>

              {/* Sensor Fleet Table */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <div className="p-5 border-b border-slate-100">
                  <h3 className="font-bold text-slate-800 text-base">Deployed Sensor Fleet Inventory</h3>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-500 font-bold uppercase border-b border-slate-100">
                      <tr>
                        <th className="p-4">Sensor ID</th>
                        <th className="p-4">Type</th>
                        <th className="p-4">Status</th>
                        <th className="p-4">Battery Level</th>
                        <th className="p-4">Wireless RSSI</th>
                        <th className="p-4">Firmware</th>
                        <th className="p-4">Last Heartbeat</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {fleetStatus.map(sensor => (
                        <tr key={sensor.sensor_id} className="hover:bg-slate-50">
                          <td className="p-4 font-bold text-slate-800">{sensor.sensor_id}</td>
                          <td className="p-4 font-semibold text-slate-600">{sensor.sensor_type}</td>
                          <td className="p-4">
                            <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded">
                              {sensor.status}
                            </span>
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              {sensor.battery_level < 20 ? (
                                <BatteryWarning className="h-4 w-4 text-rose-600" />
                              ) : (
                                <Battery className="h-4 w-4 text-emerald-600" />
                              )}
                              <span className={`font-bold ${sensor.battery_level < 20 ? 'text-rose-600 font-extrabold' : 'text-slate-700'}`}>
                                {sensor.battery_level}%
                              </span>
                            </div>
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-1 font-semibold text-slate-600">
                              <Signal className="h-3.5 w-3.5 text-slate-400" />
                              <span>{sensor.signal_rssi} dBm</span>
                            </div>
                          </td>
                          <td className="p-4 font-mono text-slate-500">{sensor.firmware_version}</td>
                          <td className="p-4 text-slate-400">{new Date(sensor.last_heartbeat).toLocaleTimeString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Hardware Telemetry Packet Injection Simulator */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-4">
                <h3 className="font-bold text-slate-800 text-base">Simulate IoT Hardware Telemetry Packet</h3>
                <p className="text-xs text-slate-500">Inject edge packets to verify low battery warning triggers and gateway heartbeat updates.</p>

                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={async () => {
                      await api.postGatewayTelemetry({
                        gateway_id: "GW-NORTH-01",
                        sensor_id: "MVMT-R001",
                        sensor_type: "passive_infrared",
                        resident_id: "R001",
                        battery_level: 12, // Critically low!
                        signal_rssi: -72
                      });
                      showToast("Injected LOW BATTERY (12%) packet for MVMT-R001. Check alerts/fleet!", "error");
                      fetchData();
                    }}
                    className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 text-xs font-bold rounded-lg transition-colors"
                  >
                    Simulate Critical Low Battery (12%)
                  </button>

                  <button
                    onClick={async () => {
                      await api.postGatewayTelemetry({
                        gateway_id: "GW-NORTH-01",
                        sensor_id: "MVMT-R001",
                        sensor_type: "passive_infrared",
                        resident_id: "R001",
                        battery_level: 95,
                        signal_rssi: -55
                      });
                      showToast("Injected Normal Battery (95%) heartbeat for MVMT-R001", "success");
                      fetchData();
                    }}
                    className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold rounded-lg transition-colors"
                  >
                    Simulate Healthy Telemetry (95%)
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: Event Simulator View */}
          {activeTab === 'simulator' && (
            <div className="space-y-6">
              <div className="flex flex-col gap-1">
                <h2 className="text-2xl font-bold text-cyan-950">Interactive Event Simulator</h2>
                <p className="text-sm text-slate-500">Manually trigger passive events or pre-packaged test journeys to validate risk scoring and store-and-forward.</p>
              </div>

              {/* Resident selector for simulation */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">Target Resident For Simulation</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Select which resident receives simulated sensor pulses.</p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={simSelectedResId}
                    onChange={(e) => setSimSelectedResId(e.target.value)}
                    aria-label="Select target resident for event simulation"
                    className="bg-slate-50 border border-slate-200 text-xs font-bold px-4 py-2.5 rounded-lg shadow-sm focus:outline-none"
                  >
                    {residents.map(r => (
                      <option key={r.id} value={r.id}>{r.name} ({r.id}) - Risk: {r.current_risk_score}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Preset Journeys */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="p-2 bg-emerald-50 text-emerald-700 rounded-lg"><CheckCircle className="h-5 w-5" /></span>
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm">Low-Urgency Journey</h4>
                      <p className="text-xs text-slate-400">Normal movement followed by quick resident confirmation</p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Triggers daytime movement, waits, receives response. Demonstrates that normal routine does NOT create false alarms.
                  </p>
                  <button
                    onClick={() => handleRunScenario('low-urgency')}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-sm transition-colors"
                  >
                    Execute Low-Urgency Journey
                  </button>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="p-2 bg-rose-50 text-rose-700 rounded-lg"><AlertTriangle className="h-5 w-5" /></span>
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm">High-Urgency Journey</h4>
                      <p className="text-xs text-slate-400">Night door transition, prolonged lack of response, manual call</p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Triggers sequence of high-risk indicators culminating in verified high-priority alert ready for review.
                  </p>
                  <button
                    onClick={() => handleRunScenario('high-urgency')}
                    className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg shadow-sm transition-colors"
                  >
                    Execute High-Urgency Journey
                  </button>
                </div>
              </div>

              {/* Single Event Injectors */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
                <h4 className="font-bold text-slate-800 text-sm">Inject Individual Event Pulses</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <button
                    onClick={() => postSimulatorEvent("normal_movement")}
                    className="p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 text-left transition-colors"
                  >
                    + Normal Movement
                  </button>
                  <button
                    onClick={() => postSimulatorEvent("door_open")}
                    className="p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 text-left transition-colors"
                  >
                    + Door Open
                  </button>
                  <button
                    onClick={() => postSimulatorEvent("emergency_call")}
                    className="p-3 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl text-xs font-bold text-rose-800 text-left transition-colors"
                  >
                    + Emergency Call
                  </button>
                  <button
                    onClick={() => postSimulatorEvent("staff_check")}
                    className="p-3 bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 rounded-xl text-xs font-bold text-cyan-800 text-left transition-colors"
                  >
                    + Staff Check-in
                  </button>
                  <button
                    onClick={() => postSimulatorEvent("resident_response")}
                    className="p-3 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-800 text-left transition-colors"
                  >
                    + Resident Response
                  </button>
                  <button
                    onClick={() => postSimulatorEvent("sensor_noisy")}
                    className="p-3 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl text-xs font-bold text-amber-800 text-left transition-colors"
                  >
                    + Rapid Chatter (Debounce)
                  </button>
                  <button
                    onClick={() => postSimulatorEvent("camera_motion")}
                    className="p-3 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl text-xs font-bold text-slate-500 text-left transition-colors"
                  >
                    + Camera Motion (Blocked)
                  </button>
                  <button
                    onClick={() => postSimulatorEvent("audio_threshold")}
                    className="p-3 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl text-xs font-bold text-slate-500 text-left transition-colors"
                  >
                    + Audio Noise (Blocked)
                  </button>
                </div>
              </div>

              {/* Event Simulator Log Box */}
              <div className="bg-slate-900 text-slate-200 p-5 rounded-xl font-mono text-xs shadow-inner space-y-2 max-h-[220px] overflow-y-auto">
                <div className="flex items-center justify-between text-slate-400 pb-2 border-b border-slate-800">
                  <span>Simulator Execution Output</span>
                  <button onClick={() => setSimLog([])} className="hover:text-white">Clear</button>
                </div>
                {simLog.length === 0 ? (
                  <p className="text-slate-600 italic">No simulator events executed yet in this session.</p>
                ) : (
                  simLog.map((log, index) => (
                    <p key={index} className="leading-relaxed">{log}</p>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 7: 500-Event Benchmark View */}
          {activeTab === 'experiment' && (
            <div className="space-y-6">
              <div className="flex flex-col gap-1">
                <h2 className="text-2xl font-bold text-cyan-950">500-Event Benchmark Evaluation</h2>
                <p className="text-sm text-slate-500">Rigorous comparison: Baseline threshold algorithm vs DigniSafe multi-factor engine with privacy constraints.</p>
              </div>

              {experimentData ? (
                <>
                  {/* Visual charts comparing DigniSafe to Baseline */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 flex flex-col gap-4">
                      <h3 className="font-bold text-slate-800 text-sm">Algorithmic Precision & Recall Comparison</h3>
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
                            <td className="p-4 font-bold text-slate-700">True Positives (TP)</td>
                            <td className="p-4 font-semibold text-slate-500">{experimentData.baseline.true_positives}</td>
                            <td className="p-4 font-bold text-emerald-800">{experimentData.dignisafe.true_positives}</td>
                            <td className="p-4 text-emerald-600 font-semibold">Correctly identified genuine incidents</td>
                          </tr>
                          <tr className="border-b border-slate-100">
                            <td className="p-4 font-bold text-slate-700">True Negatives (TN)</td>
                            <td className="p-4 font-semibold text-slate-500">{experimentData.baseline.true_negatives}</td>
                            <td className="p-4 font-bold text-emerald-800">{experimentData.dignisafe.true_negatives}</td>
                            <td className="p-4 text-emerald-600 font-semibold">Correctly recognized normal routine</td>
                          </tr>
                          <tr className="border-b border-slate-100">
                            <td className="p-4 font-bold text-slate-700">False Positives (FP - False Alarms)</td>
                            <td className="p-4 font-semibold text-slate-500">{experimentData.baseline.false_positives}</td>
                            <td className="p-4 font-bold text-emerald-800">{experimentData.dignisafe.false_positives}</td>
                            <td className="p-4 text-emerald-600 font-semibold">Significantly reduces caregiver alert fatigue</td>
                          </tr>
                          <tr className="border-b border-slate-100">
                            <td className="p-4 font-bold text-slate-700">False Negatives (FN - Missed Incidents)</td>
                            <td className="p-4 font-semibold text-slate-500">{experimentData.baseline.false_negatives}</td>
                            <td className="p-4 font-bold text-emerald-800">{experimentData.dignisafe.false_negatives}</td>
                            <td className="p-4 text-emerald-600 font-semibold">Minimizes critical safety risks</td>
                          </tr>
                          <tr className="border-b border-slate-100">
                            <td className="p-4 font-bold text-slate-700">Precision [TP / (TP + FP)]</td>
                            <td className="p-4 font-semibold text-slate-500">{(experimentData.baseline.precision * 100).toFixed(1)}%</td>
                            <td className="p-4 font-bold text-cyan-900">{(experimentData.dignisafe.precision * 100).toFixed(1)}%</td>
                            <td className="p-4 text-slate-600 font-medium">Reliable alert actionable quality</td>
                          </tr>
                          <tr className="border-b border-slate-100">
                            <td className="p-4 font-bold text-slate-700">Recall [TP / (TP + FN)]</td>
                            <td className="p-4 font-semibold text-slate-500">{(experimentData.baseline.recall * 100).toFixed(1)}%</td>
                            <td className="p-4 font-bold text-cyan-900">{(experimentData.dignisafe.recall * 100).toFixed(1)}%</td>
                            <td className="p-4 text-slate-600 font-medium">Sensitivity to true hazards</td>
                          </tr>
                          <tr className="border-b border-slate-100">
                            <td className="p-4 font-bold text-slate-700">False-Positive Rate [FP / (FP + TN)]</td>
                            <td className="p-4 font-semibold text-slate-500">{(experimentData.baseline.false_positive_rate * 100).toFixed(1)}%</td>
                            <td className="p-4 font-bold text-emerald-800">{(experimentData.dignisafe.false_positive_rate * 100).toFixed(1)}%</td>
                            <td className="p-4 text-emerald-600 font-semibold">Probability of spurious alarms</td>
                          </tr>
                          <tr className="border-b border-slate-100">
                            <td className="p-4 font-bold text-slate-700">Missed Incident Rate [FN / Actual]</td>
                            <td className="p-4 font-semibold text-slate-500">{(experimentData.baseline.missed_incident_rate * 100).toFixed(1)}%</td>
                            <td className="p-4 font-bold text-emerald-800">{(experimentData.dignisafe.missed_incident_rate * 100).toFixed(1)}%</td>
                            <td className="p-4 text-emerald-600 font-semibold">Uncaptured hazard proportion</td>
                          </tr>
                          <tr className="border-b border-slate-100">
                            <td className="p-4 font-bold text-slate-700">Total Alerts Dispatched</td>
                            <td className="p-4 font-semibold text-slate-500">{experimentData.baseline.alert_count}</td>
                            <td className="p-4 font-bold text-cyan-900">{experimentData.dignisafe.alert_count}</td>
                            <td className="p-4 text-slate-600 font-medium">Care staff interruption load</td>
                          </tr>
                          <tr>
                            <td className="p-4 font-bold text-slate-700">Intrusiveness Index (Active Channels / 6)</td>
                            <td className="p-4 font-semibold text-slate-500">{(experimentData.intrusiveness_baseline * 100).toFixed(1)}%</td>
                            <td className="p-4 font-bold text-emerald-700">{(experimentData.intrusiveness_dignisafe * 100).toFixed(1)}%</td>
                            <td className="p-4 text-emerald-600 font-bold">Privacy preservation via consent</td>
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

          {/* TAB 8: Error Analysis View */}
          {activeTab === 'errors' && (
            <div className="space-y-6">
              <div className="flex flex-col gap-1">
                <h2 className="text-2xl font-bold text-cyan-950">Error Analysis & Mitigations</h2>
                <p className="text-sm text-slate-500">Detailed breakdown of algorithmic false positives, missed incidents, sensor noise, and consent blocks.</p>
              </div>

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
          </ErrorBoundary>
        </main>
      </div>


      {/* HL7 FHIR R4 Bundle Modal */}
      {fhirModalData && (
        <div className="fixed inset-0 bg-slate-900 bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-800 text-base">HL7 FHIR R4 Collection Bundle</h3>
                <p className="text-xs text-slate-500">Interoperable healthcare exchange record (Patient, Observation, DetectedIssue, Encounter)</p>
              </div>
              <button 
                onClick={() => setFhirModalData(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 p-6 overflow-y-auto bg-slate-900 text-slate-100 font-mono text-xs">
              <pre>{JSON.stringify(fhirModalData, null, 2)}</pre>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <span className="text-xs text-slate-500 font-medium">Standard: HL7 FHIR Release 4</span>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(fhirModalData, null, 2));
                    showToast("HL7 FHIR JSON copied to clipboard", "success");
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy JSON
                </button>
                <button
                  onClick={() => {
                    const blob = new Blob([JSON.stringify(fhirModalData, null, 2)], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `fhir-bundle-${fhirModalData.entry?.[0]?.resource?.id || 'export'}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                    showToast("FHIR JSON downloaded", "success");
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-700 text-white rounded-lg text-xs font-semibold hover:bg-cyan-800 shadow-sm"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download .json
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
