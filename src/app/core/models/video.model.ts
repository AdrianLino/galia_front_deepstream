export interface ProcessVideoResponse {
  video_id: number;
  original_filename: string;
  status: string;
  message: string;
  status_url: string;
  download_url: string;
  events_url: string;
}

export interface VideoStatus {
  video_id: number;
  status: 'processing' | 'done' | 'error';
  original_filename: string;
  duration_seconds?: number;
  segments_analyzed: number;
  persons_detected: string[];
  error_message?: string;
  download_url?: string;
  events_url?: string;
  phase?: string;
  progress_pct?: number;
}

export interface ForensicEvent {
  id: number;
  video_id: number;
  segment_index: number;
  timestamp_start: number;
  timestamp_end: number;
  scene_description: string;
  persons_detected: string[];
  frame_snapshot_path?: string;
  created_at: string;
}

export interface VideoEventsResponse {
  video_id: number;
  total: number;
  events: ForensicEvent[];
}

export interface VideoListItem {
  id: number;
  original_filename: string;
  status: string;
  processed_video_path?: string;
  processed_at: string;
  duration_seconds?: number;
  frame_count?: number;
  width?: number;
  height?: number;
  fps?: number;
  error_message?: string;
}

export interface VideoListResponse {
  total: number;
  videos: VideoListItem[];
}

export interface AskResponse {
  video_id: number;
  question: string;
  answer: string;
  context_segments: number;
}

export interface VlmModel {
  id: string;
  label: string;
  description: string;
  path: string;
  type: string;
  vram_gb: number;
  active: boolean;
  selected?: boolean;
}

export interface VlmModelsResponse {
  models: VlmModel[];
  active_model: VlmModel | null;
  selected_model_id?: string | null;
}

export interface VlmSwitchResponse {
  ok: boolean;
  message: string;
  model: VlmModel | null;
}
