export interface PersonInfo {
  id: string;
  name: string;
  embedding_count: number;
  created_at?: string;
}

export interface AddPersonResponse {
  success: boolean;
  person?: PersonInfo;
  message?: string;
  detail?: string;
}

export interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface FaceDetection {
  person_info?: PersonInfo;
  confidence: number;
  similarity?: number;
  bounding_box?: number[];
}

export interface IdentifyResponse {
  success: boolean;
  detections: FaceDetection[];
  message?: string;
}
