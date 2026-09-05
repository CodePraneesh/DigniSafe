export interface Resident {
  id: string;
  name: string;
  independence_level: string;
  expected_activity: string;
  alert_sensitivity: string;
  current_risk_score: number;
  current_status: string;
  anomaly_score?: number;
  drift_category?: string;
  circadian_drift_detected?: boolean;
  consent_settings?: ConsentSettings;
}

export interface ConsentSettings {
  resident_id: string;
  movement_enabled: boolean;
  door_enabled: boolean;
  emergency_enabled: boolean;
  staff_interaction_enabled: boolean;
  camera_enabled: boolean;
  audio_enabled: boolean;
  location_enabled: boolean;
  updated_at: string;
}

export interface EventLog {
  id: number;
  resident_id: string;
  event_type: string;
  timestamp: string;
  sensor_id: string;
  processed: boolean;
  blocked_by_consent: boolean;
  network_delayed: boolean;
}

export interface Alert {
  id: number;
  resident_id: string;
  timestamp: string;
  risk_score: number;
  priority: string;
  trigger_events: string[];
  explanation: Record<string, number>;
  status: string;
  human_reviews: HumanReview[];
}

export interface HumanReview {
  id: number;
  alert_id: number;
  action_taken: string;
  timestamp: string;
  notes?: string;
}

export interface Metrics {
  total_residents: number;
  residents_normal: number;
  residents_monitor: number;
  residents_review: number;
  residents_high_priority: number;
  open_alerts: number;
  verified_incidents: number;
  false_alarms: number;
  dismissed_alerts: number;
  detection_rate: number;
  recall: number;
  precision: number;
  false_positive_rate: number;
  missed_incidents: number;
  intrusiveness_score: number;
}

export interface ExperimentMetrics {
  true_positives: number;
  true_negatives: number;
  false_positives: number;
  false_negatives: number;
  precision: number;
  recall: number;
  false_positive_rate: number;
  missed_incident_rate: number;
  alert_count: number;
}

export interface ExperimentData {
  baseline: ExperimentMetrics;
  dignisafe: ExperimentMetrics;
  intrusiveness_baseline: number;
  intrusiveness_dignisafe: number;
}

export interface ErrorItem {
  category: string;
  count: number;
  percentage: number;
  example_event: string;
  mitigation: string;
}

// Phase 2 / Phase 3 Types
export type UserRole = "CAREGIVER" | "CLINICAL_DIRECTOR" | "RESIDENT_FAMILY" | "SYSTEM_ADMIN";

export interface AuthUser {
  id: number;
  username: string;
  full_name: string;
  role: UserRole;
  resident_access_id?: string | null;
}

export interface MLAnalytics {
  resident_id: string;
  resident_name: string;
  anomaly_score: number;
  drift_category: string;
  drift_detected: boolean;
  divergence_metric: number;
  circadian_profile: {
    baseline_24h_density: number[];
    recent_24h_density: number[];
  };
  clinical_advisories: string[];
  confidence_rating: number;
  analysis_timestamp: string;
}

export interface SensorStatusItem {
  id: number;
  sensor_id: string;
  sensor_type: string;
  status: string;
  battery_level: number;
  signal_rssi: number;
  firmware_version: string;
  last_heartbeat: string;
}

export interface IoTTelemetryPacket {
  gateway_id: string;
  sensor_id: string;
  sensor_type: string;
  resident_id: string;
  event_type?: string;
  battery_level: number;
  signal_rssi: number;
  tamper_detected?: boolean;
}

export interface NotificationLog {
  id: string;
  timestamp: string;
  alert_id: number;
  priority: string;
  message: string;
  channels: string[];
  dispatched: boolean;
}

// Queue Helper
const QUEUE_KEY = "dignisafe_offline_queue";
const TOKEN_KEY = "dignisafe_jwt_token";
const ROLE_KEY = "dignisafe_current_role";

export function getQueuedEvents(): any[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveQueuedEvents(queue: any[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

// Global network simulated status
let isNetworkOfflineGlobal = false;

// WebSocket Alert Manager
let alertWs: WebSocket | null = null;
let wsListeners: Array<(event: any) => void> = [];
let wsStatusListeners: Array<(connected: boolean) => void> = [];

export function subscribeAlerts(listener: (event: any) => void) {
  wsListeners.push(listener);
  return () => {
    wsListeners = wsListeners.filter(l => l !== listener);
  };
}

export function subscribeWsStatus(listener: (connected: boolean) => void) {
  wsStatusListeners.push(listener);
  if (alertWs) {
    listener(alertWs.readyState === WebSocket.OPEN);
  }
  return () => {
    wsStatusListeners = wsStatusListeners.filter(l => l !== listener);
  };
}

export function initWebSocket() {
  if (alertWs && (alertWs.readyState === WebSocket.OPEN || alertWs.readyState === WebSocket.CONNECTING)) {
    return;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  const wsUrl = `${protocol}//${host}/ws/alerts`;

  try {
    alertWs = new WebSocket(wsUrl);

    alertWs.onopen = () => {
      wsStatusListeners.forEach(l => l(true));
    };

    alertWs.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        wsListeners.forEach(l => l(parsed));
      } catch (e) {
        console.error("WS message parse err", e);
      }
    };

    alertWs.onclose = () => {
      wsStatusListeners.forEach(l => l(false));
      setTimeout(() => initWebSocket(), 4000);
    };

    alertWs.onerror = () => {
      wsStatusListeners.forEach(l => l(false));
    };
  } catch (err) {
    console.warn("WebSocket connection init failed, will retry", err);
    setTimeout(() => initWebSocket(), 5000);
  }
}

export const api = {
  isOffline: () => isNetworkOfflineGlobal,

  // Auth & RBAC
  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },

  setToken(token: string) {
    localStorage.setItem(TOKEN_KEY, token);
  },

  getSavedRole(): UserRole {
    return (localStorage.getItem(ROLE_KEY) as UserRole) || "CAREGIVER";
  },

  setSavedRole(role: UserRole) {
    localStorage.setItem(ROLE_KEY, role);
  },

  getAuthHeaders(): HeadersInit {
    const token = this.getToken();
    return token ? { "Authorization": `Bearer ${token}` } : {};
  },

  async login(username: string, password = "password123"): Promise<{ access_token: string; user: AuthUser }> {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    if (!res.ok) throw new Error("Login failed");
    const data = await res.json();
    this.setToken(data.access_token);
    this.setSavedRole(data.user.role);
    return data;
  },

  async getMe(): Promise<AuthUser> {
    const res = await fetch("/api/auth/me", {
      headers: { ...this.getAuthHeaders() }
    });
    if (!res.ok) throw new Error("Auth token invalid");
    return res.json();
  },

  async getDemoUsers(): Promise<AuthUser[]> {
    const res = await fetch("/api/auth/demo-users");
    if (!res.ok) throw new Error("Failed to fetch demo users");
    return res.json();
  },

  logout() {
    localStorage.removeItem(TOKEN_KEY);
  },

  // Network & Simulator
  async toggleNetwork(online: boolean): Promise<boolean> {
    const endpoint = online ? "/api/network/online" : "/api/network/offline";
    try {
      const res = await fetch(endpoint, { method: "POST" });
      if (res.ok) {
        isNetworkOfflineGlobal = !online;
        if (online) {
          await this.syncQueuedEvents();
        }
        return true;
      }
    } catch (e) {
      console.error("Network error toggling state", e);
    }
    return false;
  },

  async getNetworkStatus(): Promise<boolean> {
    try {
      const res = await fetch("/api/network/status");
      if (res.ok) {
        const data = await res.json();
        isNetworkOfflineGlobal = !data.online;
        return data.online;
      }
    } catch {
      isNetworkOfflineGlobal = true;
    }
    return !isNetworkOfflineGlobal;
  },

  async resetSimulator(): Promise<boolean> {
    try {
      const res = await fetch("/api/simulator/reset", { method: "POST" });
      if (res.ok) {
        localStorage.removeItem(QUEUE_KEY);
        return true;
      }
    } catch (e) {
      console.error("Reset failed", e);
    }
    return false;
  },

  // Residents & Consent
  async getResidents(): Promise<Resident[]> {
    const res = await fetch("/api/residents", {
      headers: { ...this.getAuthHeaders() }
    });
    if (!res.ok) throw new Error("Failed to fetch residents");
    return res.json();
  },

  async getResident(id: string): Promise<any> {
    const res = await fetch(`/api/residents/${id}`, {
      headers: { ...this.getAuthHeaders() }
    });
    if (!res.ok) throw new Error(`Failed to fetch resident ${id}`);
    return res.json();
  },

  async getEvents(): Promise<EventLog[]> {
    const res = await fetch("/api/events", {
      headers: { ...this.getAuthHeaders() }
    });
    if (!res.ok) throw new Error("Failed to fetch events");
    return res.json();
  },

  async postEvent(event: { resident_id: string; event_type: string; sensor_id?: string; timestamp?: string }): Promise<{ queued: boolean; event?: EventLog }> {
    if (isNetworkOfflineGlobal) {
      const queue = getQueuedEvents();
      const newEvent = {
        ...event,
        timestamp: event.timestamp || new Date().toISOString(),
        network_delayed: true
      };
      queue.push(newEvent);
      saveQueuedEvents(queue);
      return { queued: true };
    }

    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...this.getAuthHeaders() },
        body: JSON.stringify(event)
      });

      if (res.status === 503) {
        isNetworkOfflineGlobal = true;
        const queue = getQueuedEvents();
        const newEvent = {
          ...event,
          timestamp: event.timestamp || new Date().toISOString(),
          network_delayed: true
        };
        queue.push(newEvent);
        saveQueuedEvents(queue);
        return { queued: true };
      }

      if (!res.ok) throw new Error("Failed to send event");
      const data = await res.json();
      return { queued: false, event: data };
    } catch (e) {
      isNetworkOfflineGlobal = true;
      const queue = getQueuedEvents();
      const newEvent = {
        ...event,
        timestamp: event.timestamp || new Date().toISOString(),
        network_delayed: true
      };
      queue.push(newEvent);
      saveQueuedEvents(queue);
      return { queued: true };
    }
  },

  async syncQueuedEvents(): Promise<number> {
    const queue = getQueuedEvents();
    if (queue.length === 0) return 0;

    let syncedCount = 0;
    for (const event of queue) {
      try {
        const res = await fetch("/api/events", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...this.getAuthHeaders() },
          body: JSON.stringify(event)
        });
        if (res.ok) {
          syncedCount++;
        }
      } catch (e) {
        console.error("Failing syncing event, keeping in queue", e);
        break;
      }
    }

    const remaining = queue.slice(syncedCount);
    saveQueuedEvents(remaining);
    return syncedCount;
  },

  async getConsent(residentId: string): Promise<ConsentSettings> {
    const res = await fetch(`/api/consent/${residentId}`, {
      headers: { ...this.getAuthHeaders() }
    });
    if (!res.ok) throw new Error("Failed to fetch consent");
    return res.json();
  },

  async updateConsent(residentId: string, consent: Partial<ConsentSettings>): Promise<ConsentSettings> {
    const res = await fetch(`/api/consent?resident_id=${residentId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this.getAuthHeaders() },
      body: JSON.stringify(consent)
    });
    if (!res.ok) throw new Error("Failed to update consent");
    return res.json();
  },

  // Alerts & Triage
  async getAlerts(): Promise<Alert[]> {
    const res = await fetch("/api/alerts", {
      headers: { ...this.getAuthHeaders() }
    });
    if (!res.ok) throw new Error("Failed to fetch alerts");
    return res.json();
  },

  async getAlert(id: number): Promise<Alert> {
    const res = await fetch(`/api/alerts/${id}`, {
      headers: { ...this.getAuthHeaders() }
    });
    if (!res.ok) throw new Error("Failed to fetch alert");
    return res.json();
  },

  async reviewAlert(id: number, action: string, notes?: string): Promise<Alert> {
    const res = await fetch(`/api/alerts/${id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this.getAuthHeaders() },
      body: JSON.stringify({ action_taken: action, notes })
    });
    if (!res.ok) throw new Error("Failed to review alert");
    return res.json();
  },

  // Metrics & Experiment
  async getMetrics(): Promise<Metrics> {
    const res = await fetch("/api/metrics", {
      headers: { ...this.getAuthHeaders() }
    });
    if (!res.ok) throw new Error("Failed to fetch metrics");
    return res.json();
  },

  async getExperiment(): Promise<ExperimentData> {
    const res = await fetch("/api/experiment", {
      headers: { ...this.getAuthHeaders() }
    });
    if (!res.ok) throw new Error("Failed to fetch experiment data");
    return res.json();
  },

  async getErrors(): Promise<{ errors: ErrorItem[] }> {
    const res = await fetch("/api/errors", {
      headers: { ...this.getAuthHeaders() }
    });
    if (!res.ok) throw new Error("Failed to fetch error analysis data");
    return res.json();
  },

  async runScenario(id: 'low-urgency' | 'high-urgency'): Promise<any> {
    const res = await fetch(`/api/simulator/scenario/${id}`, {
      method: "POST",
      headers: { ...this.getAuthHeaders() }
    });
    if (!res.ok) throw new Error(`Failed to run scenario ${id}`);
    return res.json();
  },

  // Phase 2 / 3 Additions
  async getMLAnalytics(residentId: string): Promise<MLAnalytics> {
    const res = await fetch(`/api/ml/analytics/${residentId}`, {
      headers: { ...this.getAuthHeaders() }
    });
    if (!res.ok) throw new Error(`Failed to fetch ML analytics for ${residentId}`);
    return res.json();
  },

  async getGatewayFleet(): Promise<{ fleet: SensorStatusItem[]; gateway_healthy: boolean }> {
    const res = await fetch("/api/gateway/status", {
      headers: { ...this.getAuthHeaders() }
    });
    if (!res.ok) throw new Error("Failed to fetch IoT gateway fleet status");
    return res.json();
  },

  async postGatewayTelemetry(packet: IoTTelemetryPacket): Promise<any> {
    const res = await fetch("/api/gateway/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this.getAuthHeaders() },
      body: JSON.stringify(packet)
    });
    if (!res.ok) throw new Error("Failed to post IoT gateway telemetry");
    return res.json();
  },

  async getFhirBundle(residentId: string): Promise<any> {
    const res = await fetch(`/api/residents/${residentId}/fhir-bundle`, {
      headers: { ...this.getAuthHeaders() }
    });
    if (!res.ok) throw new Error(`Failed to fetch HL7 FHIR bundle for ${residentId}`);
    return res.json();
  },

  async getNotificationHistory(): Promise<NotificationLog[]> {
    const res = await fetch("/api/notifications/history", {
      headers: { ...this.getAuthHeaders() }
    });
    if (!res.ok) throw new Error("Failed to fetch notification history");
    return res.json();
  }
};
