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
