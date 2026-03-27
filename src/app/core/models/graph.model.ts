// Models for the Graph Query Microservice (port 8003)

export type SessionTier = 'green' | 'yellow' | 'red';

export interface ActiveSession {
  persona: string;
  camara: string;
  rtsp_url: string;
  track_id: number;
  inicio: number;       // Unix timestamp
  confianza: number;
  duracion_s: number;
  enrollado: boolean;
  tier?: SessionTier;
}

export interface RouteEntry {
  camara: string;
  rtsp_url: string;
  inicio: number;       // Unix timestamp
  fin: number | null;
  confianza: number;
  duracion_s: number | null;
  enrollado: boolean;
  tier?: SessionTier;
}

export interface Cooccurrence {
  persona: string;
  camara: string;
  tu_llegada: number;   // Unix timestamp
  su_llegada: number;
  diferencia_s: number;
  enrollado: boolean;
}

export interface GraphHealth {
  status: string;
  memgraph: boolean;
}

export interface RouteEntryWithAnomaly extends RouteEntry {
  is_anomaly: boolean;
  prev_camara: string | null;
  gap_seconds: number | null;
}

export interface TrackingCamera {
  camara: string;
  rtsp_url: string;
  track_id?: number;
  inicio: number;
  fin?: number | null;
  duracion_s: number | null;
  confianza: number;
  tier?: SessionTier;
}

export interface TrackingResult {
  persona: string;
  live: TrackingCamera[];
  recent: TrackingCamera[];
}

export type HuntReason = 'live' | 'adjacent_live' | 'recent' | 'adjacent_recent';

export interface HuntCamera {
  camara: string;
  rtsp_url: string;
  reason: HuntReason;
  confianza: number;
  tier: SessionTier;
}

export interface HuntResult {
  persona: string;
  cameras: HuntCamera[];
  live_count: number;
}
