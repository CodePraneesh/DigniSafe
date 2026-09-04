export interface Resident {
  id: string;
  name: string;
  independence_level: string;
  expected_activity: string;
  alert_sensitivity: string;
  current_risk_score: number;
  current_status: string;
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

// Queue Helper
const QUEUE_KEY = "dignisafe_offline_queue";

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

export const api = {
  isOffline: () => isNetworkOfflineGlobal,

  async toggleNetwork(online: boolean): Promise<boolean> {
    const endpoint = online ? "/api/network/online" : "/api/network/offline";
    try {
      const res = await fetch(endpoint, { method: "POST" });
      if (res.ok) {
        isNetworkOfflineGlobal = !online;
        if (online) {
          // Trigger automatic synchronization
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
      // If server is unreachable, assume offline
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

  async getResidents(): Promise<Resident[]> {
    const res = await fetch("/api/residents");
    if (!res.ok) throw new Error("Failed to fetch residents");
    return res.json();
  },

  async getResident(id: string): Promise<any> {
    const res = await fetch(`/api/residents/${id}`);
    if (!res.ok) throw new Error(`Failed to fetch resident ${id}`);
    return res.json();
  },

  async getEvents(): Promise<EventLog[]> {
    const res = await fetch("/api/events");
    if (!res.ok) throw new Error("Failed to fetch events");
    return res.json();
  },

  async postEvent(event: { resident_id: string; event_type: string; sensor_id?: string; timestamp?: string }): Promise<{ queued: boolean; event?: EventLog }> {
    if (isNetworkOfflineGlobal) {
      // Queue it locally
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event)
      });

      if (res.status === 503) {
        // Backend says offline: queue it
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
      // Connection failure: queue it
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
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(event)
        });
        if (res.ok) {
          syncedCount++;
        }
      } catch (e) {
        console.error("Failing syncing event, keeping in queue", e);
        // Stop synchronizing if connection failed again
        break;
      }
    }

    // Slice out the successfully synced events
    const remaining = queue.slice(syncedCount);
    saveQueuedEvents(remaining);
    return syncedCount;
  },

  async getConsent(residentId: string): Promise<ConsentSettings> {
    const res = await fetch(`/api/consent/${residentId}`);
    if (!res.ok) throw new Error("Failed to fetch consent");
    return res.json();
  },

  async updateConsent(residentId: string, consent: Partial<ConsentSettings>): Promise<ConsentSettings> {
    const res = await fetch(`/api/consent?resident_id=${residentId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(consent)
    });
    if (!res.ok) throw new Error("Failed to update consent");
    return res.json();
  },

  async getAlerts(): Promise<Alert[]> {
    const res = await fetch("/api/alerts");
    if (!res.ok) throw new Error("Failed to fetch alerts");
    return res.json();
  },

  async getAlert(id: number): Promise<Alert> {
    const res = await fetch(`/api/alerts/${id}`);
    if (!res.ok) throw new Error("Failed to fetch alert");
    return res.json();
  },

  async reviewAlert(id: number, action: string, notes?: string): Promise<Alert> {
    const res = await fetch(`/api/alerts/${id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action_taken: action, notes })
    });
    if (!res.ok) throw new Error("Failed to review alert");
    return res.json();
  },

  async getMetrics(): Promise<Metrics> {
    const res = await fetch("/api/metrics");
    if (!res.ok) throw new Error("Failed to fetch metrics");
    return res.json();
  },

  async getExperiment(): Promise<ExperimentData> {
    const res = await fetch("/api/experiment");
    if (!res.ok) throw new Error("Failed to fetch experiment data");
    return res.json();
  },

  async getErrors(): Promise<{ errors: ErrorItem[] }> {
    const res = await fetch("/api/errors");
    if (!res.ok) throw new Error("Failed to fetch error analysis data");
    return res.json();
  }
};
