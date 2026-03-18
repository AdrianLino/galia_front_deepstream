export type AlertLevel = 'normal' | 'watch' | 'critical';

export interface AlertEvent {
  id: number;
  person_id: string | null;
  person_name: string;
  alert_level: AlertLevel;
  camera_name: string | null;
  camera_url: string | null;
  confidence: number;
  thumbnail_path: string | null;
  clip_path: string | null;
  acknowledged: boolean;
  created_at: string;
}

export interface AlertEventList {
  total: number;
  alerts: AlertEvent[];
}

export interface AlertSSEPayload {
  event_type: 'person_alert';
  alert_id: number;
  person_id: string | null;
  person_name: string;
  alert_level: AlertLevel;
  camera_name: string | null;
  confidence: number;
  thumbnail_path: string | null;
  timestamp: string;
}

export interface WatchlistResponse {
  total: number;
  persons: WatchlistPerson[];
}

export interface WatchlistPerson {
  id: string;
  name: string;
  image_path: string | null;
  embedding_count: number;
  alert_level: AlertLevel;
  created_at: string;
  updated_at: string;
}
