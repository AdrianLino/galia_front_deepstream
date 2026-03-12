// Models for the Graph Query Microservice (port 8003)

export interface ActiveSession {
  persona: string;
  camara: string;
  rtsp_url: string;
  track_id: number;
  inicio: number;       // Unix timestamp
  duracion_s: number;
  enrollado: boolean;
}

export interface RouteEntry {
  camara: string;
  rtsp_url: string;
  inicio: number;       // Unix timestamp
  fin: number | null;
  confianza: number;
  duracion_s: number | null;
  enrollado: boolean;
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
