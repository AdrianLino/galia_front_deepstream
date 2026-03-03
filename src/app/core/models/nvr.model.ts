export interface CameraInfo {
  channel_id: number;
  rtsp_url: string;
  status: string;
  name?: string;
  location?: string;
  model?: string;
  ip?: string;
}

export interface NVRScanRequest {
  ip?: string;
  port?: number;
  username?: string;
  password?: string;
}

export interface NVRScanResponse {
  success: boolean;
  cameras: CameraInfo[];
  rtsp_list?: string;
  rtsp_sources?: string[];
}
