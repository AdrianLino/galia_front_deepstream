export interface PipelineComponent {
  status: string;
  recognition_queue_depth?: number;
  active_tracks?: number;
  detail?: string;
}

export interface MilvusComponent {
  status: string;
  collection?: string;
  entities?: number;
  detail?: string;
}

export interface FaceDbComponent {
  status: string;
  persons?: number;
  total_embeddings?: number;
  detail?: string;
}

export interface HealthComponents {
  pipeline: PipelineComponent;
  milvus: MilvusComponent;
  face_db: FaceDbComponent;
}

export interface HealthResponse {
  status: string;
  components: HealthComponents;
}
