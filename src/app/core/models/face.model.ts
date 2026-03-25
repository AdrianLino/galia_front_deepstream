export interface Person {
  id: string;
  name: string;
  image_path?: string;
  embedding_count: number;
  alert_level: 'normal' | 'watch' | 'critical';
  folder_id?: number | null;
  created_at: string;
  updated_at?: string;
}

export interface PersonFolder {
  id: number;
  name: string;
  created_at: string;
}

export interface FoldersListResponse {
  total: number;
  folders: PersonFolder[];
}

export interface PersonsListResponse {
  total: number;
  persons: Person[];
}

export interface RegisterResponse {
  success: boolean;
  id: string;
  name: string;
  image_path?: string;
  detection_score: number;
  embedding_dim: number;
  message: string;
  // Duplicate face warning fields
  duplicate_warning?: boolean;
  existing_name?: string;
  existing_id?: string;
  similarity?: number;
  existing_alert_level?: string;
  existing_registered_at?: string;
  new_photo_date?: string;
}

export interface RenameResponse {
  success: boolean;
  old_name: string;
  new_name: string;
  id: string;
  image_path?: string;
}

export interface DeleteResponse {
  success: boolean;
  deleted_id: string;
  name: string;
  files_removed: number;
}

export interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface FaceResult {
  identified: boolean;
  name: string;
  bbox: BoundingBox;
  detection_score: number;
  similarity?: number;
  reason?: string;
  closest_match?: { name: string; similarity: number };
}

export interface IdentifyResponse {
  total_faces: number;
  faces: FaceResult[];
}
