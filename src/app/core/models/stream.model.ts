export type StreamStatus = 'stopped' | 'starting' | 'running' | 'error';
export type OutputMode = 'display' | 'rtsp' | 'mjpeg';

export interface MosaicConfig {
  width?: number;
  height?: number;
  output_mode?: OutputMode;
  rtsp_port?: number;
  save_faces?: boolean;
}

export interface StreamStartRequest {
  rtsp_sources?: string[];
  config?: MosaicConfig;
}

export interface StreamStartResponse {
  success: boolean;
  message: string;
  status: StreamStatus;
  sources_count: number;
  grid_layout: string;
  output_mode: OutputMode;
  stream_url?: string;
}

export interface StreamStatusResponse {
  status: StreamStatus;
  sources_count: number;
  sources: string[];
  grid_layout?: string;
  uptime_seconds?: number;
  output_mode?: OutputMode;
  stream_url?: string;
}

export interface StreamStopResponse {
  success: boolean;
  message: string;
}

// ── RTSP Source management ─────────────────────────────────────────────────

export interface RtspSource {
  id: string;
  name: string;
  rtsp_url: string;
  observation?: string;
  group_name?: string;
  // Spatial positioning (Fase 1)
  latitud?: number;
  longitud?: number;
  posicion_x?: number;
  posicion_y?: number;
  azimuth?: number;
  inclinacion_angulo?: number;
  fov_angulo?: number;
  piso?: number;
  altura_m?: number;
  created_at: string;
  updated_at: string;
}

export interface RtspSourceCreate {
  name: string;
  rtsp_url: string;
  observation?: string;
  group_name?: string;
  latitud?: number;
  longitud?: number;
  posicion_x?: number;
  posicion_y?: number;
  azimuth?: number;
  inclinacion_angulo?: number;
  fov_angulo?: number;
  piso?: number;
  altura_m?: number;
}

export interface RtspSourceUpdate {
  name?: string;
  rtsp_url?: string;
  observation?: string;
  group_name?: string;
  latitud?: number;
  longitud?: number;
  posicion_x?: number;
  posicion_y?: number;
  azimuth?: number;
  inclinacion_angulo?: number;
  fov_angulo?: number;
  piso?: number;
  altura_m?: number;
}
